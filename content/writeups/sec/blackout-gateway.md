---
title: "Blackout Gateway"
description: "The Blackout Gateway is a simulated API security console with a server-side fetch simulator, JWT token workbench, and an admin console. The goal is to bypass an SSRF filter, forge a JWT,…"
event: "sec"
category: "web"
categoryLabel: "Web"
tags: ["SEC CTF 2026","web"]
date: "2026-09-11"
teammate: false
source: "sec/web/hard/blackout-gateway/writeup.md"
---

**Category:** Web  
**Difficulty:** Hard  
**Points:** 500  
**Source:** https://ct-fforme.vercel.app/cha4.html

---

## Challenge Overview

The Blackout Gateway is a simulated API security console with a server-side fetch simulator, JWT token workbench, and an admin console. The goal is to bypass an SSRF filter, forge a JWT, and exfiltrate data from an internal service.

---

## Step 1: SSRF Bypass — Decimal IP Address

The "Remote Resource Inspector" simulates a server-side fetch with a filter that blocks internal addresses:

```
localhost, 127.0.0.1, 0.0.0.0, 0177.0.0.1, ::1, [::1]
```

**Bypass:** Use the decimal (integer) representation of `127.0.0.1`:

```
2130706433
```

Calculation: `127 × 256³ + 0 × 256² + 0 × 256 + 1 = 2130706433`

The gateway's regex only matches literal IP formats — it doesn't normalize the host before checking, so a numeric IP slips through.

**Enter:**
```
http://2130706433/
```

**Response:** The internal API reveals its routes:

```json
{
  "service": "Blackout Internal API",
  "version": "2.4.1",
  "routes": ["/health", "/debug", "/admin"]
}
```

---

## Step 2: Reconnaissance — The /debug Endpoint

Access `http://2130706433/debug` to discover the authentication internals:

```json
{
  "authentication": "JWT",
  "algorithm": "RS256",
  "public_key": "BLACKOUT_PUBLIC_KEY_7F3A9C"
}
```

The service uses JWT with RS256 (RSA + SHA-256) and exposes its public key. This is the key insight for the next step.

---

## Step 3: JWT Algorithm Confusion Attack

The gateway's token verification has a critical flaw — it **trusts the client-chosen algorithm** in the JWT header:

```javascript
// From the source code:
sign(alg, headerB64, payloadB64){
  if (alg === "RS256") return simHash(headerB64 + "." + payloadB64 + PRIVATE_KEY);
  if (alg === "HS256") return simHash(headerB64 + "." + payloadB64 + PUBLIC_KEY);
  // ...
}
```

When `alg = HS256`, it signs using the **public key** as the HMAC secret — not the private key. This is the classic **algorithm confusion** (aka "RSA vs HMAC key confusion") attack.

**Forging the token:**

1. Open the **Token Workbench**
2. Click **Decode** on the preloaded operator token
3. Edit the **Header** JSON — change `"alg": "RS256"` to `"alg": "HS256"`
4. Edit the **Payload** JSON — change `"role": "guest"` to `"role": "admin"`
5. Click **Recompute Signature** — this signs the modified header+payload using the public key with HS256
6. Click **Authenticate** — the gateway accepts the forged admin token

The gateway "checks who's real" by verifying a JWT signature, but it lets the attacker choose the weaker algorithm, making the signature trivially forgeable.

---

## Step 4: Admin Console — Internal Debug Header

After authenticating as admin, the **Blackout Admin Console** unlocks. Send a request to `/admin/debug` with the header:

```
X-Internal-Debug: true
```

**Response:**

```json
{
  "debug": true,
  "next_service": "flag-service",
  "endpoint": "/flag"
}
```

This reveals the final service endpoint.

---

## Step 5: Exfiltrate the Flag

Click **Access flag-service** to retrieve the flag.

**Flag:** `FLAG{blackout_gateway_breached}`

---

## Summary

| Step | Technique | Key Detail |
|------|-----------|------------|
| 1 | SSRF Bypass | Decimal IP `2130706433` = `127.0.0.1` |
| 2 | Reconnaissance | `/debug` leaks JWT config and public key |
| 3 | JWT Forgery | Algorithm confusion: RS256 → HS256 with public key |
| 4 | Auth Bypass | Forged admin token unlocks `/admin/debug` |
| 5 | Data Exfil | Internal debug header grants access to flag-service |

### Core Vulnerability

The gateway fails to enforce the signing algorithm server-side. By accepting the client's `alg` claim, an attacker can downgrade from asymmetric (RS256) to symmetric (HS256) authentication, using the publicly known RSA public key as the HMAC secret.
