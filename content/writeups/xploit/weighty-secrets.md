---
title: "Weighty Secrets"
description: "A hardened Merkle-Hellman knapsack: 96 public weights generated as a_i = r·b_i mod q from a tight superincreasing sequence, at density ≈ 0.91 — deliberately just under the 0.9408 CJLOS…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-3/crypto/weight/writeup.md"
---

A hardened Merkle-Hellman knapsack: 96 public weights generated as `a_i = r·b_i mod q` from a *tight* superincreasing sequence, at density ≈ 0.91 — deliberately just under the 0.9408 CJLOS bound. A 96-bit secret is the subset-sum solution; `SHA256(secret)` is the AES-256-GCM key for the flag.

## Files

- `public_instance.json` — `n`, `public_weights`, `ciphertext_sum`, AES nonce/ciphertext
- `README.md`, `solve.py`, `lll.py`

## Analysis

The subset-sum is `c = Σ xᵢ·aᵢ` with `xᵢ ∈ {0,1}`. The naive lattice

```
[ 1  0 ... 0  a_1 ]
[ 0  1 ... 0  a_2 ]
...
[ 0  0 ... 1  a_n ]
[ 0  0 ... 0  c   ]
```

only works at low density. At density 0.91 the target vector hides behind many equally short vectors, so the **CJLOS balanced construction** is required:

```
row_i   = (2·e_i | N·a_i)      i = 1..n
row_n+1 = (1,...,1 | N·c)
```

A shortest vector of the form `(±1, ..., ±1, 0)` encodes the solution as `x_i = (1 + s_i)/2`.

## Running it

`fpylll` is used when available, with BKZ at a real block size — increases up to 30–40 are needed before the `0/±1` vector surfaces. The pure-Python LLL fallback is only viable for tiny dimensions. Expect the BKZ tours to take tens of minutes at dimension 97; the script prints the recovered bits, rebuilds the 96-bit secret MSB-first, derives the AES key with SHA-256 and GCM-decrypts the flag.

```python
secret = int("".join(str(b) for b in bits), 2).to_bytes(12, "big")
key = hashlib.sha256(secret).digest()
flag = AESGCM(key).decrypt(nonce, ct, None)
```

## Takeaway

Merkle-Hellman dies to lattices, but the density bound is a real cliff: below ~0.94 plain LLL still recovers the secret, above it the balanced CJLOS lattice plus strong BKZ is required. "Hardened" here means "moved the difficulty from seconds to an hour of compute", not "safe".

## Flag

Flag: not recovered in the writeup.
