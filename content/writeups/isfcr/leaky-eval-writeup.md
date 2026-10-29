---
title: "leaky-eval — HTB Crypto Challenge"
description: "The challenge provides chall.py and output.json. The service uses a polynomial ring"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/leaky-eval-writeup.md"
---

## Flag

```text
isfcr{n3g4cycl1c_n01s3_l34k}
```

## Challenge overview

The challenge provides `chall.py` and `output.json`. The service uses a polynomial ring

\[
R_Q = \mathbb{Z}_Q[X]/(X^N+1)
\]

with:

- \(N=64\)
- \(Q=2^{61}-1\), a prime
- secret coefficients \(s_i \in \{-1,0,1\}\)
- noise coefficients bounded by \(2^{20}\)
- 72 samples

For each sample, the plaintext is zero and the ciphertext is generated as

\[
b = a \cdot s + e \pmod Q.
\]

The output includes `a`, `b`, an index `idx`, and `leak`, where `leak` is the noise coefficient \(e_{\text{idx}}\) reduced modulo \(Q\). The same output also contains an AES-GCM encrypted flag.

The key weakness is that the service reveals one noise coefficient per sample. That is enough to turn each sample into an exact linear equation in the secret coefficients.

## 1. Recover the leaked noise value

Since the noise is small, its signed value can be recovered from its residue modulo \(Q\). Values greater than \(Q/2\) represent negative integers:

\[
e_i =
\begin{cases}
\text{leak}_i, & \text{leak}_i \le Q/2,\\
\text{leak}_i-Q, & \text{otherwise}.
\end{cases}
\]

Now the selected coefficient of the ciphertext equation gives

\[
b_{\text{idx}} - e_{\text{idx}}
= (a\cdot s)_{\text{idx}} \pmod Q.
\]

The right-hand side is linear in the 64 unknown secret coefficients.

## 2. Account for negacyclic polynomial multiplication

The ring relation \(X^N=-1\) means terms that wrap past degree \(N-1\) change sign.

For a sample with selected coefficient index \(k\), the coefficient equation is

\[
(a\cdot s)_k =
\sum_{j=0}^{k} a_{k-j}s_j
-
\sum_{j=k+1}^{N-1} a_{N+k-j}s_j
\pmod Q.
\]

Therefore, each sample supplies one row of a linear system \(As=y\) over the finite field \(\mathbb{Z}_Q\), with

\[
y = b_k-e_k \pmod Q.
\]

There are 72 equations and only 64 unknowns. Gaussian elimination modulo the prime \(Q\) recovers the secret uniquely; the extra equations also provide consistency checks.

## 3. Solve the linear system

Perform Gauss–Jordan elimination modulo \(Q\). Each pivot is normalized using its modular inverse, and the pivot column is eliminated from all other rows.

The recovered values should all be in

\[
\{0,1,Q-1\},
\]

which correspond to the original secret coefficients \(\{0,1,-1\}\). Convert \(Q-1\) back to \(-1\).

## 4. Derive the AES key and decrypt

The challenge derives the AES key as

```python
sha256(",".join(map(str, s)).encode()).digest()
```

The order and signed representation of the coefficients matter: use `-1`, not `Q-1`, when constructing the comma-separated string.

The ciphertext uses AES-GCM. Decrypt with the supplied nonce and verify the authentication tag. Successful tag verification confirms the recovered key.

## Solver

Save the following as `solve.py` beside `output.json`. It uses PyCryptodome, as does the challenge.

```python
#!/usr/bin/env python3
import json
from hashlib import sha256
from Crypto.Cipher import AES

with open("output.json", "r") as f:
    data = json.load(f)

N = data["N"]
Q = data["Q"]
samples = data["samples"]

# Build A*s = y (mod Q), using the leaked noise coefficient.
matrix = []
for sample in samples:
    a = sample["a"]
    b = sample["b"]
    k = sample["idx"]
    leak = sample["leak"]

    # Recover the small signed noise value from its residue.
    e = leak if leak <= Q // 2 else leak - Q

    # Coefficients for negacyclic multiplication in Z_Q[X]/(X^N + 1).
    row = []
    for j in range(N):
        i = k - j
        if i >= 0:
            row.append(a[i] % Q)
        else:
            row.append((-a[i + N]) % Q)

    rhs = (b[k] - e) % Q
    matrix.append(row + [rhs])

# Gauss-Jordan elimination over the finite field Z_Q.
pivot_row = 0
pivot_cols = []

for col in range(N):
    pivot = next(
        (r for r in range(pivot_row, len(matrix))
         if matrix[r][col] % Q != 0),
        None,
    )
    if pivot is None:
        continue

    matrix[pivot_row], matrix[pivot] = matrix[pivot], matrix[pivot_row]

    inv = pow(matrix[pivot_row][col], Q - 2, Q)
    matrix[pivot_row] = [(v * inv) % Q for v in matrix[pivot_row]]

    for r in range(len(matrix)):
        if r == pivot_row:
            continue
        factor = matrix[r][col] % Q
        if factor:
            matrix[r] = [
                (matrix[r][c] - factor * matrix[pivot_row][c]) % Q
                for c in range(N + 1)
            ]

    pivot_cols.append(col)
    pivot_row += 1
    if pivot_row == len(matrix):
        break

if len(pivot_cols) != N:
    raise RuntimeError(f"Expected {N} pivots, got {len(pivot_cols)}")

# Check that the remaining rows are consistent.
for row in matrix:
    if all(value % Q == 0 for value in row[:N]) and row[N] % Q:
        raise RuntimeError("Inconsistent linear system")

secret_mod = [0] * N
for r, col in enumerate(pivot_cols):
    secret_mod[col] = matrix[r][N] % Q

# The secret is ternary. Convert residues to signed coefficients.
secret = []
for value in secret_mod:
    if value == Q - 1:
        secret.append(-1)
    elif value in (0, 1):
        secret.append(value)
    else:
        raise RuntimeError(f"Unexpected secret coefficient: {value}")

print("[+] Recovered secret:", secret)

# Recreate the key exactly as the challenge does.
key_material = ",".join(map(str, secret)).encode()
key = sha256(key_material).digest()

nonce = bytes.fromhex(data["flag_nonce"])
ciphertext = bytes.fromhex(data["flag_ct"])
tag = bytes.fromhex(data["flag_tag"])

aes = AES.new(key, AES.MODE_GCM, nonce=nonce)
flag = aes.decrypt_and_verify(ciphertext, tag)
print("[+] Flag:", flag.decode())
```

Run it with:

```bash
python solve.py
```

If PyCryptodome is not installed, install it with `python -m pip install pycryptodome`.

## Root cause

The implementation exposes a supposedly hidden error term through the `leak` field. Because each disclosed noise value is paired with the corresponding ciphertext coefficient, subtracting the noise removes the uncertainty from that coefficient and yields an exact linear equation in the secret key.

**Lesson:** even a small partial disclosure of error terms can be catastrophic in lattice-based cryptography. Approximate decryption noise must not be exposed alongside ciphertext data in a way that lets an attacker eliminate it.
