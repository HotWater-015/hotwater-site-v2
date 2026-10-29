---
title: "Partial Exposure"
description: "RSA where the most significant bits of one prime are leaked — enough that p splits into a known high part and an unknown low part of manageable size. Coppersmith / Howgrave-Graham…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/crypto/Partial-exposure/writeup.md"
---

RSA where the **most significant bits of one prime** are leaked — enough that `p` splits into a known high part and an unknown low part of manageable size. Coppersmith / Howgrave-Graham (univariate) recovers the rest and the modulus factors.

## Files

- `public.txt` — `N`, `e`, `c`, `p_high`, `known_bits`
- `solve.sage`
- `README.md`

## Analysis

Write `p = p₀ + x`, where `p₀ = p_high · 2^shift` is the known part and `x < X = 2^shift` is unknown. Since `p | N`, the polynomial

```
f(x) = p₀ + x
```

has a small root modulo the unknown divisor `p ≥ N^β` (here `β = 0.5`). Howgrave-Graham's formulation builds a lattice over `N` that finds that root when `X < N^(β²/δ)` with `δ = 1`, i.e. `X ≲ N^0.25`.

## Construction

```python
shift = N.bit_length() // 2 - known
p0 = p_high << shift
X = 1 << shift
beta = 0.5
t = max(1, int(m * (1/beta - 1)))
dim = m + t

B = Matrix(ZZ, dim, dim)
xp = [X**k for k in range(dim)]
for i in range(m):
    for k in range(i + 1):
        B[i, k] = comb(i, k) * p0**(i - k) * N**(m - i) * xp[k]
for j in range(t):
    for l in range(m + 1):
        B[m + j, l + j] = comb(m, l) * p0**(m - l) * xp[l + j]
```

Each row is the `x^k`-shifted evaluation of `(p₀ + x)^i · N^(m-i)` (the `N` factor makes the polynomial vanish mod `p^m`), scaled by `X^k` so the root becomes a short lattice vector. LLL finds it, the recovered polynomial's integer root gives `p`, and

```python
q = N // p
d = pow(e, -1, (p-1)*(q-1))
m_int = pow(c, d, N)
```

## Parameter notes

The script defaults to `m = 25` (theoretical requirement ≈ 43) and exposes `m` on the command line. The known-bit window here is just small enough that a moderate lattice suffices; bumping `m` is the lever when the first reduction doesn't yield a root.

## Takeaway

Leaking ~half of a prime's bits is fatal for RSA: Coppersmith recovers the remainder in polynomial time once the unknown part is below `N^0.25` (and with better exponents/Boneh-Durfee-style variants, even more). Prime generation must never expose partial key material.

## Flag

Flag: not recovered in the writeup.
