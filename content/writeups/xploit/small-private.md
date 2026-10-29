---
title: "Small Private"
description: "An RSA key with a deliberately tiny private exponent d — small enough that Wiener's attack recovers it from the public key alone. The modulus, exponent and ciphertext are all that's needed."
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/crypto/small-private/writeup.md"
---

An RSA key with a deliberately tiny private exponent `d` — small enough that **Wiener's attack** recovers it from the public key alone. The modulus, exponent and ciphertext are all that's needed.

## Files

- `public.txt` — `N`, `e`, `c`
- `solve.py`, `solve.sage`
- `README.md`

## Analysis

Wiener's theorem: if `d < N^0.25 / 3`, then `d` appears as a **convergent** of the continued fraction expansion of `e/N`. Because

```
e·d - k·φ(N) = 1   ⇒   e/φ(N) ≈ k/d
```

and `φ(N) ≈ N`, the fraction `k/d` is a good rational approximation to `e/N`, so it shows up among the convergents.

The script uses the `owiener` package:

```python
import owiener
d = owiener.attack(e, n)
m = pow(c, d, n)
print(long_to_bytes(m))
```

The Sage version implements the same search from scratch: expand `e/N` into continued fractions, walk the convergents `(k, d)`, and for each candidate check whether `φ = (e·d − 1)/k` yields a valid factorisation — solving `x² − (N − φ + 1)x + N = 0` and testing the discriminant for a perfect square.

## Why it's broken

`d` is security-critical and must be roughly the size of `N`. Generating `d` small (or picking a small `d` and deriving `e = d⁻¹ mod φ(N)`) leaves only `O(N^0.25)` candidates, and continued fractions enumerate them in `O(log N)` steps.

## Takeaway

Wiener's bound is `d < N^0.25/3`. Beyond that, Boneh-Durfee extends the attack to roughly `N^0.292` — still far below a safe `d` size. Standard RSA key generation avoids this entirely because `d` ends up full-size; the vulnerability only appears when someone shortcuts key generation.

## Flag

Flag: not recovered in the writeup.
