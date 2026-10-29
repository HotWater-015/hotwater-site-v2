---
title: "Related Messages"
description: "Franklin-Reiter related-message attack: two plaintexts encrypted with the same RSA key (N, e = 3), where m₂ = m₁ + α for a known constant α. Two polynomial relations mod N with a known…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/crypto/related/writeup.md"
---

Franklin-Reiter related-message attack: two plaintexts encrypted with the same RSA key (`N, e = 3`), where `m₂ = m₁ + α` for a known constant `α`. Two polynomial relations mod `N` with a known difference have a common root, and a polynomial GCD recovers it.

## Files

- `public.txt` — `N`, `e`, `c₁`, `c₂`, `alpha`
- `solve.py` (pure Python), `solve.sage`
- `README.md`

## Analysis

We know:

```
f₁(x) = x^e - c₁  ≡ 0  (mod N)
f₂(x) = (x + α)^e - c₂ ≡ 0  (mod N)
```

Both vanish at `x = m₁`. Their **monic GCD** over `Z/NZ[x]` is then the linear factor `x - m₁`, provided `e` is small (here 3) and the polynomials share exactly one root. The Sage one-liner:

```python
R.<x> = PolynomialRing(Zmod(N))
g1 = x^e - c1
g2 = (x + alpha)^e - c2

g = gcd(g1, g2)          # degree 1
m1 = int(-g[0] / g[1])
```

The pure-Python version implements the same Euclidean algorithm with coefficient lists, including modular inverses of leading coefficients and normalisation mod `N`.

## Details that matter

- The GCD must be computed **monic**: dividing through by the leading coefficient is what makes the result comparable.
- `e = 3` keeps the polynomials tiny; the attack still works for modest `e` but the GCD degree blows up.
- If the coefficient ring isn't a field (`N` composite), the inversion can fail — retry with a different relation or use the Sage implementation, which handles it more gracefully.

## Takeaway

RSA without randomised padding is **deterministic and algebraic**: any known relation between plaintexts becomes a polynomial relation between ciphertexts. OAEP's randomisation kills this attack because two encryptions of related messages no longer share a root mod `N`.

## Flag

Flag: not recovered in the writeup.
