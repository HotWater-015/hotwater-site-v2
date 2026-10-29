---
title: "Common Modulus"
description: "The same plaintext encrypted twice under one RSA modulus with two different public exponents, e₁ = 65537 and e₂ = 65539. Since gcd(e₁, e₂) = 1, Bézout coefficients give the plaintext by…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-5/crypto/common-modulus/writeup.md"
---

The same plaintext encrypted twice under one RSA modulus with two different public exponents, `e₁ = 65537` and `e₂ = 65539`. Since `gcd(e₁, e₂) = 1`, Bézout coefficients give the plaintext by combining the two ciphertexts — no factorisation needed.

## Files

- `public.txt` — `N`, `e₁`, `ct₁`, `e₂`, `ct₂`
- `README.md`, `solve.py`

## Analysis

With `a·e₁ + b·e₂ = 1`, we have

```
m = m^(a·e₁ + b·e₂) = (ct₁)^a · (ct₂)^b  (mod N)
```

The extended Euclidean algorithm produces `(a, b)`, one of which is negative; negative exponents become modular inverses.

```python
gcd, a, b = extended_gcd(e1, e2)   # gcd == 1

if b < 0:
    ct2 = mod_inverse(ct2, N)
    b = -b
if a < 0:
    ct1 = mod_inverse(ct1, N)
    a = -a

pt = (pow(ct1, a, N) * pow(ct2, b, N)) % N
print(long_to_bytes(pt))
```

`gcd(e₁, e₂)` must be 1 — with `65537` and `65539` (both prime, and 2 apart) it is, so the combination is exact and the plaintext falls out after one modular inverse and two exponentiations.

## Takeaway

Never reuse a modulus across keys. Related-message and common-modulus attacks all exploit the algebraic relation between ciphertexts; using distinct, independently generated `N` per key removes the shared structure entirely.

## Flag

Flag: not recovered in the writeup.
