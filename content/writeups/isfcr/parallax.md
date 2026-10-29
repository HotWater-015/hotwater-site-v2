---
title: "Parallax"
description: "The challenge provides model (1).py and observations (1).json. The forty silhouettes are modular subset sums of fourteen hidden atoms. Recovering the binary subset mask reveals the…"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-11"
teammate: false
source: "isfcr/writeups/parallax.md"
---

**Flag:** `isfcr{sh0rt_sh4d0ws_r3v34l_d3pth42}`

The challenge provides `model (1).py` and `observations (1).json`. The forty silhouettes are modular subset sums of fourteen hidden atoms. Recovering the binary subset mask reveals the atoms; short relations between the public quadratic coefficients then turn the nonlinear problem into a noisy linear system.

## 1. Understand the model

Let `p` be the public prime, `M` the unknown 40-by-14 binary mask, and `a` the fourteen atoms. The observations satisfy

```text
y = M a (mod p).
```

Each atom has the form

```text
a[j] = constant[j]
     + sum(linear[j][i] * x[i])
     + sum(quad[j][k] * x[u[k]] * x[v[k]])
     + e[j]                       (mod p).
```

There are four hidden limbs `x[i]`, each below `2^56`, and ten quadratic monomials. The centered errors are nonzero and bounded by `error_limit`, approximately `2^184`; the prime is approximately 224 bits.

The mask column weights are distinct: 12 through 25. This gives a way to order the recovered columns and associate each atom with its public polynomial.

## 2. Recover short relations between the observations

If an integer vector `r` satisfies `r M = 0`, then `r y = 0 (mod p)`. Because the mask entries are small, its left kernel contains short integer vectors.

Build a 41-dimensional lattice using the row basis

```text
[ I_40    C*y ]
[  0      C*p ]
```

with `C = 2^20`. A lattice vector has the form

```text
(r, C * (r·y + k*p)).
```

LLL finds vectors whose final coordinate vanishes. The first 26 reduced rows are very short, with squared norms between 6 and 12. The remaining rows have squared norms around hundreds of millions. This gap identifies the 26 short relations corresponding to the left kernel of the rank-14 mask.

These relations are candidate mask relations, rather than a proof from the subset-sum equation alone. The subsequent binary reconstruction and successful authenticated decryption validate them for this instance.

## 3. Recover the binary mask and atoms

For each possible mask column `b`, solve the following constraints with Z3:

```text
b[i] in {0, 1}
r·b = 0 for each of the 26 short relations
sum(b) > 0.
```

After each solution, add a blocking clause to enumerate the next one. This produces exactly fourteen nonzero binary vectors. Their weights are exactly 12, 13, ..., 25, matching the public data.

Sort these vectors by weight and use them as the columns of `M`. Modular Gaussian elimination on

```text
M a = y (mod p)
```

then recovers the fourteen atom values.

## 4. Cancel the quadratic terms

Let `Q` be the public 14-by-10 quadratic coefficient matrix. Its rank over the field modulo `p` is only six, leaving eight independent left relations.

Rank deficiency alone is insufficient: arbitrary modular relations could multiply the errors by enormous coefficients. We need relations with small integer entries so the resulting errors remain small.

Use another lattice, this time with 24 coordinates:

```text
[ I_14    C*Q ]
[  0      C*p*I_10 ]
```

Here `C = 2^50`. Its vectors have the form

```text
(r, C * (r Q + p*k)).
```

LLL recovers eight vectors with all ten trailing coordinates zero. Their squared norms are

```text
15, 23, 24, 24, 26, 29, 25, 33.
```

Collect their first fourteen coordinates as the rows of `R`. Since `R Q = 0 (mod p)`, multiplying the atom equations by `R` eliminates every quadratic monomial:

```text
t = A x + R e (mod p),
A = R * linear (mod p),
t = R * (a - constant) (mod p).
```

This leaves eight noisy linear equations in four small unknowns. The small entries of `R` preserve the useful error bound.

## 5. Recover the limbs with a closest-vector problem

Construct a 12-dimensional lattice with row basis

```text
[ S*I_4    A^T ]
[   0      p*I_8 ]
```

where `S = 2^130`. Every lattice vector has the form

```text
(S*x, A*x + p*k).
```

The desired vector is close to the target

```text
(0, 0, 0, 0, t[0], ..., t[7]).
```

Its first four differences are the scaled limbs; its last eight differences are the combined errors, up to sign. The scale keeps both parts on comparable magnitudes: `S*x[i]` is below `2^186`.

Reduce the basis with LLL, then call `fpylll.CVP.closest_vector`. Dividing the first four coordinates by `S` gives

```text
x = [60105350756610789,
     61421589799867715,
     21284417162619763,
     36856093732836820].
```

Evaluating all fourteen original polynomials with these limbs gives nonzero centered errors within the published bound.

## 6. Decode and authenticate the message

Each limb is an affine transformation of a seven-byte little-endian payload chunk:

```text
x[i] = multiplier[i] * chunk[i] + offset[i] (mod 2^56).
```

The multipliers are odd, so each has an inverse modulo `2^56`. Recover each chunk using

```text
chunk[i] = (x[i] - offset[i]) * inverse(multiplier[i]) (mod 2^56).
```

Concatenating their seven-byte little-endian encodings yields the 28-byte payload:

```text
sh0rt_sh4d0ws_r3v34l_d3pth42
```

For independent verification, the supplied `open_seal` function derives a key as

```python
encoded = b"".join(v.to_bytes(7, "little") for v in x)
key = hashlib.sha256(b"parallax-v1\x00" + encoded).digest()
```

ChaCha20-Poly1305 decryption with the public nonce and associated data `b"parallax-v1"` succeeds and returns

```text
isfcr{sh0rt_sh4d0ws_r3v34l_d3pth42}
```

## Reproduce the solution

The accompanying scripts implement the steps above. `solve.py` recovers the mask columns and writes `cols.json`; `recover.py` reads those columns, recovers the atoms and limbs, and decrypts the flag.

With Python packages `fpylll`, `cysignals`, `sympy`, `z3-solver`, and `cryptography` installed, run from this directory:

```bash
python solve.py
python recover.py
```

The scripts also save `relations.json`, `atoms.json`, and `qrels.json` as intermediate artifacts. The decisive weakness is the combination of short mask relations and short quadratic cancellation relations: both layers preserve enough structure for lattice recovery.
