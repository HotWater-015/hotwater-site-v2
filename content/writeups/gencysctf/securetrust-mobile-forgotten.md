---
title: "SecureTrust Mobile — Forgotten"
description: "The challenge presents a \"QA\" build of a mobile app. Solving it requires:"
event: "gencysctf"
category: "mobile"
categoryLabel: "Mobile"
tags: ["GenCyS CTF 2026","mobile"]
date: "2026-08-15"
teammate: false
source: "gencysctf/mobile/1/writeup.md"
---

**Category:** Mobile / Reverse Engineering
**Target:** `https://mobile.api.thesecuretrust.com`
**Final Flag:** `UST_GenCyS_CTF{f9795057e85bee3b0a3b3857951270e1c043eb7b047c318c7d08b2411b4804e6}`

## Summary

The challenge presents a "QA" build of a mobile app. Solving it requires:

1. Reconnaissance of the API surface (including a forgotten debug endpoint).
2. Recovering a hardcoded QA token from the mobile app's configuration.
3. Redeeming the proof flag through a secondary claim endpoint to obtain the real flag.

## Flag format confusion

The first flag received looks like the final one but is only a proof:
`GenCyS_PROOF{mobile-forgotten-7aeb1c3c01fd8da2108c8f06}`

The real competition flag uses the `UST_GenCyS_CTF{...}` format and is only issued by the claim endpoint.

## Step 1 — Enumeration

Discovering endpoints reveals several paths:

```bash
ffuf -u https://mobile.api.thesecuretrust.com/FUZZ -w common.txt
ffuf -u https://mobile.api.thesecuretrust.com/mobile/FUZZ -w common.txt
```

| Endpoint | Result |
|----------|--------|
| `/api/v1/debug` | Leaks environment configuration |
| `/mobile/challenge` | Requires `X-QA-Token` |
| `/mobile/claim` | Requires `X-Proof-Token` |
| `/mobile/profile` | Decoy account data |
| `/mobile/version` | QA build metadata |

The root page also exposes an internal-looking Swagger UI confirming internal/QA endpoints.

## Step 2 — The forgotten debug endpoint

`GET /api/v1/debug` returns environment metadata and leaks the names of internal variables, including a flag host:

```json
{
  "build": "4.2.1-qa",
  "debug": true,
  "env": "qa",
  "vars": ["DB_HOST", "REDIS_HOST", "FLAG_HOST"]
}
```

This confirms there is more to the API than the public surface, and points toward an internal flag/host mechanism.

## Step 3 — Recovering the QA token from the mobile app

The token is not exposed by the API; it lives inside the mobile app itself. The "QA" debug APK contains a `BuildConfig` class with several decoy secrets, but also a set of AES configuration values that actually matter:

```java
public static final String QA_CONFIG_IV  = "63f2ce766224cb2915be03efac744504";
public static final String QA_CONFIG_KEY = "90ff58e849a16c8ab121cf76be4e4472";
```

The app embeds an encrypted config file (`config.enc`). It is decrypted with **AES-128-CBC** using the key/IV extracted above:

```bash
openssl enc -d -aes-128-cbc \
  -K 90ff58e849a16c8ab121cf76be4e4472 \
  -iv 63f2ce766224cb2915be03efac744504 \
  -in config.enc -out config.json
```

The decrypted config reveals the QA token and API base:

```json
{
  "qa_token": "qa-8764f96756740c4bd179581d2e324357",
  "api_base": "https://mobile.api.thesecuretrust.com",
  "endpoints": ["/mobile/profile", "/mobile/version", "/mobile/challenge"]
}
```

## Step 4 — Getting the proof flag

`/mobile/challenge` validates the QA token via the `X-QA-Token` header:

```bash
curl -H "X-QA-Token: qa-8764f96756740c4bd179581d2e324357" \
     https://mobile.api.thesecuretrust.com/mobile/challenge
```

Response:

```json
{"flag": "GenCyS_PROOF{mobile-forgotten-7aeb1c3c01fd8da2108c8f06}"}
```

This `GenCyS_PROOF{...}` value is **not** the final flag — it is a proof of completion used to redeem the real flag.

## Step 5 — Redeeming the real flag

`/mobile/claim` expects the proof token plus a CTFd user identity:

| Header | Value |
|--------|-------|
| `X-Proof-Token` | the `GenCyS_PROOF{...}` value |
| `X-CTFd-User` | your CTFd username (`HotWater`) |

```bash
curl -H "X-Proof-Token: GenCyS_PROOF{mobile-forgotten-7aeb1c3c01fd8da2108c8f06}" \
     -H "X-CTFd-User: HotWater" \
     https://mobile.api.thesecuretrust.com/mobile/claim
```

Response:

```json
{
  "flag": "UST_GenCyS_CTF{f9795057e85bee3b0a3b3857951270e1c043eb7b047c318c7d08b2411b4804e6}",
  "user": "HotWater"
}
```

## Final Flag

```
UST_GenCyS_CTF{f9795057e85bee3b0a3b3857951270e1c043eb7b047c318c7d08b2411b4804e6}
```

## Lessons / Key Takeaways

- **Don't trust endpoint docs as complete** — internal/QA debug endpoints often expose info beyond the public Swagger.
- **Decoys in QA builds** — `BuildConfig` is full of fake credentials; focus on the config-related values that actually decrypt something.
- **Two-stage proof flow** — a proof flag from one endpoint is redeemed for the real flag on another; recognize the different flag formats.
- **Header-based auth** — the API uses simple custom headers (`X-QA-Token`, `X-Proof-Token`, `X-CTFd-User`) rather than centralized auth.
