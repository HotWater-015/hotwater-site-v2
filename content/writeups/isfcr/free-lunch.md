---
title: "Free-lunch"
description: "We are given chall.py and output.json. A permutation P acts on GF(p)^2 with p = 4611686018427387761 (a 62-bit prime, p % 3 == 2) over R = 20 rounds:"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/free-lunch.md"
---

**Category:** Crypto
**Flag:** `isfcr{b4ckw4rds_1s_h4lf_th3_d3gr33}`

## Challenge

We are given `chall.py` and `output.json`. A permutation `P` acts on `GF(p)^2`
with `p = 4611686018427387761` (a 62-bit prime, `p % 3 == 2`) over `R = 20`
rounds:

```
(x, y) <- (cbrt(x + y + c_i), x)      i = 0 .. R-1
```

where `cbrt(v) = v^(1/3) = v^E` with `3E = 1 mod (p-1)`. Since `p = 2 mod 3`,
cubing is a bijection on `GF(p)`, so the cube root is well defined.

**Goal (CICO — constrained input, constrained output):** find `x` such that
`P(x, 0)` has its second output coordinate equal to `0`.

The flag is AES-GCM encrypted under
`key = SHA256(str(x_smallest))`, where `x_smallest` is the smallest valid input.

## Constraints from the data

`output.json` provides `p`, `r`, the 20 round constants `c`, and the encrypted
flag (`flag_ct`, `flag_tag`, `flag_nonce`). We must recover the input `x`.

## Analysis

Write the state after `i` rounds as `(x_i, y_i)`. Then

```
x_{i+1} = cbrt(x_i + y_i + c_i)   =>   x_{i+1}^3 = x_i + y_i + c_i
y_{i+1} = x_i                     =>   y_i = x_{i-1}
```

Starting from `(x_0, y_0) = (x, 0)`, so `x_{-1} = 0`, the recurrence becomes

```
x_{i+1}^3 = x_i + x_{i-1} + c_i
```

After `R` rounds the output is `(x_R, y_R) = (x_R, x_{R-1})`. The CICO condition
`P(x,0)[1] == 0` therefore means:

```
x_{R-1} = 0
```

### The naive direction is hopeless

Forward, `x_{R-1}` has algebraic degree `3^(R-1) = 3^19 ≈ 1.16e9` in `x_0`.
Root-finding at that degree is infeasible.

### The key trick: go backwards

The recurrence is symmetric (`x_{i-1} = x_{i+1}^3 - x_i - c_i`). Instead of
expressing the tail in terms of the head, express everything in terms of the
**last** coordinate `t = x_R`, and fix the known boundary `x_{R-1} = 0`:

```
P_R(t)     = t                        (degree 1)
P_{R-1}(t) = 0                        (the constraint x_{R-1} = 0)
P_{i-1}(t) = P_{i+1}(t)^3 - P_i(t) - c_i
```

`F(t) = P_{-1}(t)` is the polynomial whose roots are exactly the values `x_R`
consistent with `x_{-1} = 0`.

Its degree is tiny compared with the forward map. With
`d_R = 1`, `d_{R-1} = 0` and `d_{i-1} = 3·d_{i+1}`, the degree grows by a factor
`3` every **two** backward steps, giving

```
deg F = 3^10 = 59049
```

about `20000x` smaller than the forward degree.

## Solving

Replicate the author's attack with `python-flint` (`nmod_poly`):

1. Build `F` backwards as above.
2. Keep only the roots in `GF(p)`: `G = gcd(F, X^p - X)`.
3. For each root `t = x_R`, walk the recurrence back down to recover the full
   chain `x_{R-1}, ..., x_0`, and keep the chains with `x_{-1} = 0` and
   `P(x_0, 0)[1] == 0`.
4. The smallest valid `x_0` is the answer.

```python
P = {R: nmod_poly([0, 1], p), R - 1: nmod_poly([0], p)}
for i in range(R - 1, -1, -1):
    P[i - 1] = P[i + 1] ** 3 - P[i] - nmod_poly([c[i] % p], p)
F = P[-1]
Xp = nmod_poly([0, 1], p)
G = F.gcd(Xp.pow_mod(p, F) - Xp)
```

This found `deg F = 59049`, `deg G = 2`, and **2** valid CICO solutions. The
smallest is:

```
x = 1093395384440720767
```

Then decrypt:

```python
key = sha256(str(x).encode()).digest()
AES.new(key, AES.MODE_GCM, nonce=bytes.fromhex(flag_nonce)).decrypt_and_verify(ct, tag)
```

The GCM tag verified, yielding the flag.

## Flag

```
isfcr{b4ckw4rds_1s_h4lf_th3_d3gr33}
```

## Takeaway

The round map `x -> cbrt(x + ...)` is cheap to *evaluate* but has enormous
algebraic degree *forward*. The same recurrence read **backwards** from the
constrained output end keeps the degree exponentially smaller
(`3^10` vs `3^19`). "Backwards is half the degree" — hence the flag text.

## Reproduce

```bash
cd /tmp/opencode && python3.12 -m venv flintenv
./flintenv/bin/pip install python-flint pycryptodome
./flintenv/bin/python /home/s31zur3/Downloads/IFSCR/free-lunch/solve.py
```
