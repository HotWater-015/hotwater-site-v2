---
title: "Truncated Oracle"
description: "A stream cipher built on an LCG, leaking only the high 16 bits of each 64-bit state. The flag is XORed with the low bytes of the state sequence — so recovering the hidden low bits…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/crypto/truncated-oracle/writeup.md"
---

A stream cipher built on an LCG, leaking only the **high 16 bits of each 64-bit state**. The flag is XORed with the low bytes of the state sequence — so recovering the hidden low bits recovers the keystream.

## Files

- `output.txt` — `a`, `c`, `bits = 64`, `leak_bits = 16`, a list of leaked high bits, ciphertext
- `solve.py`
- `README.md`

## Analysis

Each leaked value is `hᵢ = ⌊sᵢ / 2^48⌋`; the unknown part is `tᵢ = sᵢ mod 2^48`. The recurrence

```
s_{i+1} = a·sᵢ + c mod 2^64
```

and the known high bits give a system of linear relations in the unknown `t₀`, all modulo `M = 2^64`. Divide by the scale `X = 2^48` and it becomes a **Closest Vector Problem**: find the small error vector that makes the leakage consistent.

## Lattice

Build `(n−1)×(n−1)` matrices from the LCG coefficients (`A₀,ᵢ = a^i`, diagonal `M`), LLL-reduce, then solve CVP against the derived difference vector:

```python
A[0, 0] = 1
for j in range(1, m):
    A[0, j] = pow(a, j, M)
for i in range(1, m):
    A[i, i] = M

LLL.reduction(A)
p = CVP.closest_vector(A, list(D))
```

With `t₀` recovered:

```python
s = H[0] + t0
for _ in range(len(ct)):
    ks.append(s & 0xff)
    s = (a * s + c) % M
```

and the ciphertext XORs back to the flag.

## Takeaway

Truncating an LCG's output is not a security boundary: the recurrence is linear, so partial leakage turns into a lattice problem whose dimension grows with the number of leaks. A handful of 16-bit leaks out of 64 is plenty. Never use an LCG for cryptography, regardless of output truncation.

## Flag

Flag: not recovered in the writeup.
