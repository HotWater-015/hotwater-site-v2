---
title: "Biased Nonce"
description: "We are given a set of ECDSA-style signatures over the secp256k1 curve whose nonces were generated with a bias: the top 8 bits of each nonce are zero, i.e. every nonce k satisfies"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit-2/crypto/biased-nonce/writeup.md"
---

**Category:** Cryptography
**Points:** 500
**Difficulty:** Insane
**File:** `public.json`

---

## Challenge Overview

We are given a set of ECDSA-style signatures over the **secp256k1** curve whose
nonces were generated with a **bias**: the top 8 bits of each nonce are zero,
i.e. every nonce `k` satisfies

```
0 ≤ k < 2^248
```

(For comparison, the curve order `n` is a 256-bit number, so an unbiased nonce
would be uniformly distributed in `[0, n)`.)

Our goal is to recover the private key `d`.

---

## ECDSA Recap

For each signature `(r, s)` over a message with hash `h`:

```
s = k⁻¹ (h + r·d)   mod n
```

Rearranging:

```
k = s⁻¹ (h + r·d)   mod n
k = (s⁻¹·h) + (s⁻¹·r)·d   mod n
```

Defining

```
t = r · s⁻¹   mod n
u = h · s⁻¹   mod n
```

each signature gives us a linear equation

```
k = t·d + u   mod n          (1)
```

where `d` is the (unknown) private key and `k` is a small unknown integer
(`k < 2^248`). This is precisely an instance of the **Hidden Number Problem
(HNP)**.

---

## The Hidden Number Problem

We know `t`, `u`, and `n`, and we know that `k` is "small". Equation (1) can be
rewritten with an integer multiple of `n`:

```
t·d + u − k = a·n      ⟹      t·d − a·n = k − u
```

We want to recover `d` and the small `kᵢ` simultaneously. This is a lattice
problem: we construct a lattice that contains a **short vector** whose entries
encode the unknown quantities `d` and `kᵢ`.

---

## Lattice Construction

Let `m` be the number of signatures (here `m = 40`). Build the following
`(m+2) × (m+2)` integer matrix:

```
        │  col 0 … col m−1   col m   col m+1
────────┼─────────────────────────────────────
 row 0  │  n·S
  ⋮     │        ⋱
 row m−1│            n·S
 row m  │  t₀S … tₘ₋₁S        1
 row m+1│  u₀S … uₘ₋₁S                B
```

where

* `B = 2^248` is the nonce bound,
* `S = 2^8` is a column scaling factor used to balance the lattice.

### Why this works

Consider the integer combination

```
v = d·(row m) + 1·(row m+1) − Σ aᵢ·(row i)
```

Its entries are:

```
v = ( S·(t₀d + u₀ − a₀n), …, S·(tₘ₋₁d + uₘ₋₁ − aₘ₋₁n), d, B )
  = ( S·k₀, …, S·kₘ₋₁, d, B )
```

Since `kᵢ < 2^248` and `d < n ≈ 2^256`, every entry of `v` is "small":

```
‖v‖ ≈ 2^256 · √(m+1) ≈ 2^257.7
```

The determinant of this lattice is

```
det = (n·S)^m · 1 · B
```

and the Gaussian heuristic predicts the shortest vector length to be roughly

```
√( (m+2)/(2πe) ) · det^(1/(m+2)) ≈ 2^258
```

Since our target vector `v` is *shorter* than the expected shortest random
vector, running **LLL** will (with high probability) return `v` (up to sign),
revealing `d` in column `m`.

The scaling `S = 2^8` matters: without it, the `k`-columns would be unbalanced
relative to the `d` column, and LLL would not reliably recover the vector.

---

## Recovering `d`

After LLL reduction, we scan the rows of the reduced basis. The second-to-last
column (`col m`) holds `d`, and the last column (`col m+1`) holds `B` for the
true solution. We verify each candidate `d` by checking that every nonce

```
kᵢ = (tᵢ·d + uᵢ) mod n
```

satisfies `kᵢ < 2^248`.

---

## Solution Script

```python
import json

data = json.load(open('public.json'))
n = int(data['n'], 16)
sigs = data['signatures']
m = len(sigs)

t, u = [], []
for sig in sigs:
    r = int(sig['r'], 16); s = int(sig['s'], 16); h = int(sig['h'], 16)
    sinv = inverse_mod(s, n)
    t.append((r * sinv) % n)
    u.append((h * sinv) % n)

B = 2**248   # top 8 bits zero
S = 2**8     # column scaling

M = matrix(ZZ, m + 2, m + 2)
for i in range(m):
    M[i, i] = n * S
for i in range(m):
    M[m, i]     = t[i] * S
    M[m + 1, i] = u[i] * S
M[m, m]         = 1
M[m + 1, m + 1] = B

L = M.LLL()

def verify(d):
    d %= n
    if d == 0:
        return None
    for i in range(m):
        if (t[i] * d + u[i]) % n >= B:
            return None
    return d

best = None
for row in L:
    d = verify(abs(int(row[m])))
    if d is not None:
        best = d
        break

print('d =', hex(best))
print('XploitXβ{' + hex(best)[2:] + '}')
```

---

## Output

```
d = 0x274e3b9837e37cc97445a4183599ef7ed511773680becc70bf629494f16522dc
```

Verifying all 40 signatures, every recovered nonce `kᵢ` satisfies
`kᵢ < 2^248` (max bit length 248), confirming the key.

---

## Flag

```
XploitXβ{274e3b9837e37cc97445a4183599ef7ed511773680becc70bf629494f16522dc}
```

---

## References

* Boneh, D. & Venkatesan, R. — *Hardness of Computing the Most Significant Bits
  of Secret Keys in Diffie–Hellman and Related Schemes* (Hidden Number Problem).
* Howgrave-Graham, N. & Smart, N. — *Lattice Attacks on Digital Signature Schemes*.
* Nguyen, P. & Shparlinski, I. — *The Insecurity of the Digital Signature
  Algorithm with Partially Known Nonces*.
