---
title: "Sparse-change"
description: "Files provided:** chall (3).py, output (3).json"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/sparse-change.md"
---

**Category:** Cryptography  
**Points:** 50  
**Author:** NotKnox

## Challenge Description

> The machine went to scrap. All we recovered was 48 numbers off its sweep log.

**Files provided:** `chall (3).py`, `output (3).json`

## Flag

```text
isfcr{pr0ny_kn3w_1t_1n_1795}
```

## Analysis

The supplied Python generator defines a *sparse polynomial* over the finite field \(\mathbb{F}_p\):

\[
F(X)=\sum_{i=1}^{24}c_i X^{e_i}\pmod p.
\]

The exponents \(e_i\) are distinct integers in \([1,p-2]\), and the coefficients \(c_i\) are nonzero. The output file contains the prime `p`, a multiplicative generator `g`, and exactly 48 consecutive evaluations:

\[
y_j=F(g^j)=\sum_{i=1}^{24}c_i(g^{e_i})^j\pmod p,
\quad j=0,\ldots,47.
\]

Here:

```text
p = 1156049558832869843
g = 997362964048648438
t = 24
```

Although the degree can be nearly \(p-1\), this is a sum of only 24 exponentials. Writing \(r_i=g^{e_i}\bmod p\) converts the recorded values into

\[
y_j=\sum_{i=1}^{24}c_i r_i^j\pmod p.
\]

This is a classic **Prony / sparse interpolation** problem: 2t samples suffice to reconstruct t distinct bases and their nonzero weights.

## Solution

### 1. Find the linear recurrence

The sequence satisfies a degree-24 linear recurrence. Define

\[
Q(Z)=\prod_{i=1}^{24}(Z-r_i)
    =Z^{24}+a_{23}Z^{23}+\cdots+a_0.
\]

Since every \(r_i\) is a root of \(Q\),

\[
y_{j+24}+\sum_{k=0}^{23}a_k y_{j+k}=0\pmod p.
\]

Substitute \(j=0,\ldots,23\). This produces 24 linear equations for the 24 unknown coefficients \(a_0,\ldots,a_{23}\). Solve them over \(\mathbb F_p\) (equivalently, use Berlekamp–Massey on the log).

### 2. Recover the hidden bases and exponents

Factor \(Q(Z)\) over \(\mathbb{F}_p\). Its 24 distinct roots are precisely

\[
r_i=g^{e_i}\pmod p.
\]

The generator intentionally chooses a prime for which \(p-1\) factors into small primes. Consequently, discrete logarithms in the multiplicative group can be efficiently computed using **Pohlig–Hellman**:

\[
e_i=\log_g(r_i)\pmod{p-1}.
\]

### 3. Recover the coefficients

With the bases \(r_i\) known, use the first 24 samples to solve a Vandermonde system:

\[
\begin{bmatrix}
1&1&\cdots&1\\
r_1&r_2&\cdots&r_{24}\\
\vdots&\vdots&&\vdots\\
r_1^{23}&r_2^{23}&\cdots&r_{24}^{23}
\end{bmatrix}
\begin{bmatrix}c_1\\c_2\\\vdots\\c_{24}\end{bmatrix}
=
\begin{bmatrix}y_0\\y_1\\\vdots\\y_{23}\end{bmatrix}
\pmod p.
\]

Then check all 48 recovered evaluations to confirm the reconstruction.

### 4. Derive the key and decrypt

The generator sorts the pairs `(exponent, coefficient)` by exponent, then derives the AES key exactly as follows:

```python
key = sha256((";".join(f"{e}:{c}" for e, c in terms)).encode()).digest()
```

The ciphertext is protected with AES-GCM. Use `flag_nonce`, `flag_ct`, and `flag_tag` from the JSON and call `decrypt_and_verify` so an incorrect reconstruction is rejected.

## Reproducible Solver

Save this as `solve.py` beside `output (3).json`. It uses **SageMath** for finite-field linear algebra, factorization, and discrete logarithms, plus **PyCryptodome** for AES-GCM.

```python
#!/usr/bin/env sage -python
import json
from hashlib import sha256
from pathlib import Path

from sage.all import GF, PolynomialRing, matrix, vector, discrete_log
from Crypto.Cipher import AES

D = json.loads(Path('output (3).json').read_text())
p, g, t = D['p'], D['g'], D['t']
K = GF(p)
y = [K(v) for v in D['log']]

assert len(y) == 2 * t

# Q(z) = z^t + a[t-1] z^(t-1) + ... + a[0].
# Each row encodes y[j+t] + sum(a[k] * y[j+k]) = 0.
H = matrix(K, t, t, lambda j, k: y[j + k])
b = vector(K, [-y[j + t] for j in range(t)])
a = H.solve_right(b)

R = PolynomialRing(K, 'z')
z = R.gen()
Q = z**t + sum(a[k] * z**k for k in range(t))
roots = Q.roots()
assert len(roots) == t and all(multiplicity == 1 for _, multiplicity in roots)
bases = [root for root, _ in roots]

# Each base is g^e mod p; p-1 is deliberately smooth.
exponents = [int(discrete_log(base, K(g), ord=p - 1)) for base in bases]

# Solve y[j] = sum_i c[i] * bases[i]^j for j = 0..t-1.
V = matrix(K, t, t, lambda j, i: bases[i] ** j)
coefficients = V.solve_right(vector(K, y[:t]))
terms = sorted(zip(exponents, map(int, coefficients)))

# Verify against every published evaluation.
for j, expected in enumerate(y):
    actual = sum(K(c) * K(g) ** (e * j) for e, c in terms)
    assert actual == expected, f'mismatch at sample {j}'

serialized = ';'.join(f'{e}:{c}' for e, c in terms).encode()
key = sha256(serialized).digest()
nonce = bytes.fromhex(D['flag_nonce'])
ciphertext = bytes.fromhex(D['flag_ct'])
tag = bytes.fromhex(D['flag_tag'])

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
flag = cipher.decrypt_and_verify(ciphertext, tag)
print(flag.decode())
```

Run with:

```bash
sage -python solve.py
```

Expected output:

```text
isfcr{pr0ny_kn3w_1t_1n_1795}
```

## Takeaway

The polynomial has an astronomically large possible degree, but it contains only 24 nonzero monomials. Consecutive evaluations at powers of a generator turn the problem into recovering a 24-term exponential sequence. Linear recurrences, polynomial factorization, smooth-order discrete logarithms, and a Vandermonde solve recover the original terms without brute-forcing exponents or interpolating a dense polynomial.
