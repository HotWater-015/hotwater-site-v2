---
title: "Half-Truths"
description: "chall (1).py — the challenge generator, including the polynomial construction and encryption scheme. output (1).json — 512 shuffled shares, finite-field parameters, and the AES-GCM…"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/half-truths.md"
---

**Category:** Cryptography  
**Flag format:** `isfcr{...}`  
**Challenge:** “327 of my 512 friends lied to me. Reconstruct the secret anyway.”

## Challenge files

- `chall (1).py` — the challenge generator, including the polynomial construction and encryption scheme.
- `output (1).json` — 512 shuffled shares, finite-field parameters, and the AES-GCM ciphertext, nonce, and tag.

## 1. Understanding the scheme

The generator samples a polynomial of degree 39 over the prime field

\[
\mathbb F_p,\qquad p=2^{31}-1=2147483647.
\]

Its 40 coefficients are stored in **low-to-high order**:

\[
f(X)=a_0+a_1X+\cdots+a_{39}X^{39}\pmod p.
\]

The program publishes 512 shares `(x, y)`, but only **185** were computed as `y = f(x)`. The other **327** were intentionally replaced with unrelated values. We do not know which shares are honest.

The flag is encrypted using the polynomial's coefficients:

```python
key = sha256((",".join(map(str, coeffs))).encode()).digest()
cipher = AES.new(key, AES.MODE_GCM, nonce=NONCE)
ct, tag = cipher.encrypt_and_digest(FLAG)
```

Therefore, recovering just the Shamir secret `f(0)` is **not sufficient**: the AES key depends on *all 40 coefficients*.

## 2. Why ordinary Reed–Solomon decoding fails

A degree-39 polynomial is determined by 40 correct points. Unfortunately, we cannot identify 40 correct points from the 512 mixed shares.

The usual unique-decoding bound is

\[
e\leq\left\lfloor\frac{n-k}{2}\right\rfloor
=\frac{512-40}{2}=236.
\]

Our data contains **327 errors**, exceeding that bound. Equivalently, unique decoding would require at least

\[
\frac{n+k}{2}=276
\]

honest points, but we have only 185. Trying ordinary Berlekamp–Welch decoding or choosing random subsets of 40 shares is not a practical solution.

The intended route is **Reed–Solomon list decoding**, specifically the Guruswami–Sudan interpolation approach.

## 3. Construct a bivariate interpolation polynomial

Instead of directly finding `f(X)`, look for a nonzero bivariate polynomial

\[
Q(X,Y)=\sum_{i+39j\leq D}q_{ij}X^iY^j
\]

such that

\[
Q(x_r,y_r)=0
\]

for **every one** of the 512 supplied shares.

Give `X` weight 1 and `Y` weight 39. Choosing `D = 180` produces **515 unknown coefficients** `q_ij`, but only 512 linear constraints. Thus a nonzero solution exists and can be found by computing a nullspace over `GF(p)`.

Now evaluate the interpolation polynomial at the true polynomial:

\[
H(X)=Q(X,f(X)).
\]

Because `deg(f) = 39`, the weighted-degree restriction ensures `deg(H) <= 180`. For each of the 185 honest shares, `H(x_r) = 0`. A nonzero polynomial of degree at most 180 cannot have 185 distinct roots, so

\[
\boxed{Q(X,f(X))\equiv0}.
\]

This means **`Y - f(X)` is a factor of `Q(X,Y)`** over the rational-function field `GF(p)(X)`. Factor `Q` and inspect its linear-in-`Y` factors to recover the candidate polynomials.

## 4. Recovery script

The following SageMath script implements that interpolation and candidate-checking procedure. Save it as `solve.sage` alongside the supplied JSON file, and execute `sage solve.sage`.

```python
import json
from hashlib import sha256
from Crypto.Cipher import AES

with open("output (1).json") as file:
    data = json.load(file)

p = data["p"]
k = data["k"]
shares = data["shares"]
target = data["t"]
F = GF(p)

# Weighted degree: wt(X)=1, wt(Y)=k-1=39.
D = 180
monomials = [(i, j)
             for j in range(D // (k - 1) + 1)
             for i in range(D - (k - 1) * j + 1)]
assert len(monomials) == 515

# Solve Q(x_r, y_r)=0 for all 512 shares.
M = matrix(F, len(shares), len(monomials))
for r, (x, y) in enumerate(shares):
    x, y = F(x), F(y)
    for c, (i, j) in enumerate(monomials):
        M[r, c] = x**i * y**j

nullspace = M.right_kernel()
assert nullspace.dimension() > 0
v = nullspace.basis()[0]

# Factor Q as a polynomial in Y over GF(p)(X).
RX = PolynomialRing(F, 'X')
X = RX.gen()
FX = RX.fraction_field()
RY = PolynomialRing(FX, 'Y')
Y = RY.gen()

Q = RY.zero()
for coeff, (i, j) in zip(v, monomials):
    Q += FX(coeff * X**i) * Y**j

ciphertext = bytes.fromhex(data['flag_ct'])
nonce = bytes.fromhex(data['flag_nonce'])
tag = bytes.fromhex(data['flag_tag'])

for factor, multiplicity in Q.factor():
    if factor.degree() != 1:
        continue

    # If factor = b(X)*Y + a(X), its root is -a(X)/b(X).
    candidate = -factor[0] / factor[1]
    if candidate.denominator().degree() != 0:
        continue
    f = RX(candidate)
    if f.degree() != k - 1:
        continue

    agreements = sum(F(y) == f(F(x)) for x, y in shares)
    if agreements != target:
        continue

    coeffs = [int(f[i]) for i in range(k)]
    key = sha256(','.join(map(str, coeffs)).encode()).digest()

    try:
        flag = AES.new(key, AES.MODE_GCM, nonce=nonce).decrypt_and_verify(
            ciphertext, tag
        )
    except ValueError:
        continue

    print('Honest shares:', agreements)
    print('Constant coefficient:', coeffs[0])
    print('Flag:', flag.decode())
    break
else:
    raise RuntimeError('No candidate passed agreement and AES-GCM checks')
```

**Note:** Factoring a polynomial over a rational-function field can be computationally expensive. The essential technique is the interpolation and subsequent recovery of polynomial factors `Y - f(X)`; more optimized list-decoding implementations can perform the root-finding step.

## 5. Verify and decrypt

For each candidate degree-39 polynomial, evaluate it at all 512 `x` coordinates and count agreements:

```python
agreements = sum(F(y) == f(F(x)) for x, y in shares)
assert agreements == 185
```

Then serialize all coefficients in precisely the order used by the generator:

```python
coeffs = [int(f[i]) for i in range(40)]  # a_0, a_1, ..., a_39
key = sha256(','.join(map(str, coeffs)).encode()).digest()
```

Finally, decrypt **and verify the authentication tag** with AES-GCM. A successful `decrypt_and_verify` is stronger evidence than a plaintext that merely resembles a flag: an incorrect polynomial should produce an incorrect key and fail authentication.

The recovered polynomial was reported to have constant coefficient `68199953` and to agree with 185 shares. The result reported from the recovery was:

```text
isfcr{l1st_d3c0d1ng_p4st_th3_r4d1us}
```

## 6. Takeaway

The trap is confusing the **unique-decoding radius** with the fundamental limit of recovery. Although 327 errors prevent classical unique decoding, 185 valid points are sufficient for a Guruswami–Sudan interpolation at weighted degree 180. The true polynomial appears as a factor of the constructed bivariate polynomial, and the AES-GCM authentication tag determines which recovered candidate is correct.

**Flag:** `isfcr{l1st_d3c0d1ng_p4st_th3_r4d1us}`
