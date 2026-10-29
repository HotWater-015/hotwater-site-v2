---
title: "Onyx Locker 2.4.0 (mobile)"
description: "An Android password-manager APK (onyx-locker-2.4.0.apk, package com.onyx.locker) plus a live backend at https://web-f328e5c854ffc583.web.h7tex.com. The app's UI only ever prints bullet…"
event: "h7ctf"
category: "mobile"
categoryLabel: "Mobile"
tags: ["H7CTF 2026","mobile"]
date: "2026-09-26"
teammate: false
source: "H7CTF/mobile/3/writeup.md"
---

**Flag:** `H7CTF{7dc9e570-56c6-40bc-ab4f-2d8ab182e097}`

## Challenge

An Android password-manager APK (`onyx-locker-2.4.0.apk`, package `com.onyx.locker`) plus a live
backend at `https://web-f328e5c854ffc583.web.h7tex.com`. The app's UI only ever prints bullet
characters where secrets should be, so the goal is to replay the app's own API calls and read the
unmasked vault.

## Analysis

Unpack the APK (jadx / apktool / unzip — the DEX is un-obfuscated) to get four classes in
`sources/com/onyx/locker/`:

| File | Role |
| --- | --- |
| `MainActivity.java` | UI + the whole sync routine |
| `ApiClient.java` | thin `HttpURLConnection` POST/GET wrapper |
| `Session.java` | `SharedPreferences` store for `base_url`, `device_id`, `token` |
| `VaultCrypto.java` | hardcoded AES/CBC key + IV for the offline cache |

`AndroidManifest.xml` confirms `android:usesCleartextTraffic="true"` and `android:debuggable="true"`,
i.e. plain HTTP to an arbitrary user-supplied host. `Session.baseUrl()` defaults to
`http://10.0.2.2:8080` and is overridable from the "server" text field in the layout — so the app is
just a thin client pointed at whatever backend you tell it to talk to.

### The sync flow

`MainActivity.sync()` (MainActivity.java:40-82) does exactly two requests, and nothing else:

1. **Auth** — `POST {base}/api/v1/auth/device`
   - Header: `Content-Type: application/json`, `X-Onyx-Client: OnyxLocker-Android/2.4.0`
     (the constant `ApiClient.CLIENT_HEADER`, ApiClient.java:12)
   - Body: `{"device_id": "<random onx-<uuid> from SharedPreferences>"}`
   - Response: `{"name": ..., "token": <JWT>}`, stored via `Session.setToken()`
2. **Sync** — `GET {base}/api/v1/vault/sync` with `Authorization: Bearer <token>`, returning
   `{"items": [{"label", "username", "secret"}, ...]}`

The masking happens **only in the UI layer**: `MainActivity.mask()` (MainActivity.java:93-99) turns
each secret into a string of `•` (U+2022) for display. The plaintext is already sitting in
`resp.body` at that point. So the whole "protection" is cosmetic — replaying the two requests with
`curl` returns the real values.

`VaultCrypto`'s hardcoded key (`0nyxL0ck3r_v4ult_K3y_32bytes_ok!` / `0nyxLckrIV_16byt`,
VaultCrypto.java:9-10) only guards the local `vault.enc` cache and is a red herring for this stage.

## Solve

```bash
# 1. register a device and get a JWT
curl -s -X POST 'https://web-f328e5c854ffc583.web.h7tex.com/api/v1/auth/device' \
  -H 'Content-Type: application/json' \
  -H 'X-Onyx-Client: OnyxLocker-Android/2.4.0' \
  -d '{"device_id":"onx-test-0001"}'

# {"name":"Priya Nair","token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."}

# 2. pull the vault with the bearer token
curl -s 'https://web-f328e5c854ffc583.web.h7tex.com/api/v1/vault/sync' \
  -H 'Authorization: Bearer <token>'
```

Vault contents:

```json
{"items":[
  {"label":"Personal email",              "secret":"sunflower-canyon-7",             "username":"priya.nair@fastmail.example"},
  {"label":"Bank card PIN",               "secret":"4417",                           "username":""},
  {"label":"Router admin",                "secret":"Nair!home2025",                 "username":"admin"},
  {"label":"Onyx account recovery code",  "secret":"H7CTF{7dc9e570-56c6-40bc-ab4f-2d8ab182e097}", "username":""}
]}
```

The flag is the `secret` of the "Onyx account recovery code" item:

```
H7CTF{7dc9e570-56c6-40bc-ab4f-2d8ab182e097}
```

## Takeaways

* Client-side "masking" is not encryption — anything the UI receives, an attacker with the token
  also receives. Encrypt or, better, never send the plaintext to an untrusted client.
* Hardcoded symmetric keys in the APK (`VaultCrypto`) are extractable by anyone with the binary and
  protect nothing; use the platform keystore / Android Keystore.
* A bearer token minted from a self-chosen `device_id` with no proof-of-possession is trivially
  replayable: anyone can mint a token for any device string and read the vault. Device auth needs an
  attestation or a real credential, not a client-supplied identifier.
