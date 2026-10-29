---
title: "Smooth DH"
description: "A Diffie-Hellman instance with p = 1870283325551092163712001 — suspiciously small, and, as it turns out, with a fully smooth p - 1. The private exponent is recovered from the public key…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-5/crypto/smooth-dh/writeup.md"
---

A Diffie-Hellman instance with `p = 1870283325551092163712001` — suspiciously small, and, as it turns out, with a fully smooth `p - 1`. The private exponent is recovered from the public key by a plain discrete log in a group whose order factors into small primes.

## Files

- `public.txt` — `p`, `g = 2048`, `A = g^d mod p`
- `README.md`, `solve.py`

## Analysis

`p` is only ~81 bits. Even without smoothness, Pollard rho would finish quickly at that size, but `p - 1` factoring into small primes makes **Pohlig-Hellman** essentially instant. The script leans on sympy:

```python
from sympy.ntheory.residue_ntheory import discrete_log

d = discrete_log(p, A, g)
assert pow(g, d, p) == A
```

`sympy` internally reduces the log modulo each prime factor of the group order and CRT-combines the residues, which is exactly Pohlig-Hellman. The assertion verifies the recovered `d`.

## Recovery path

1. Verify `p` is prime and `g` generates a large-enough subgroup — here it doesn't; `p - 1` factors into small primes.
2. Solve `d = log_g(A) mod p-1` with Pohlig-Hellman.
3. Recompute the shared secret / decrypt whatever is keyed by `d`.

## Takeaway

Diffie-Hellman security depends on a large prime factor in the subgroup order. A smooth `p - 1` (or a small `p`) collapses the discrete log into a handful of small problems. Use a safe prime with a large prime-order subgroup, or better, X25519/Curve25519 with its fixed, audited parameters.

## Flag

Flag: not recovered in the writeup.
