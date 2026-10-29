---
title: "Broadcast Linear"
description: "Håstad's broadcast attack with a twist: the same message is RSA-encrypted under three moduli with e = 3, but the plaintext is first mapped through a known linear padding m' = a·m + b.…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-3/crypto/broadcast-linuer/writeup.md"
---

Håstad's broadcast attack with a twist: the same message is RSA-encrypted under three moduli with `e = 3`, but the plaintext is first mapped through a **known linear padding** `m' = a·m + b`. CRT plus an integer cube root recovers `m'`, and the linear transform inverts trivially.

## Files

- `README.md` — description with the padding formula
- `solve.py`

## Analysis

Each ciphertext is `c_i = (a·m + b)³ mod n_i`. Because the padded message is small (`(a·m + b)³ < n₁·n₂·n₃`), CRT gives the *integer* cube `(a·m + b)³` exactly, not just modulo `N`:

```python
m_pow_e, N = crt([c1, c2, c3], [n1, n2, n3])
m_padded, exact = integer_kth_root(m_pow_e, 3)
assert exact
```

Then undo the affine padding. If the challenge publishes `a, b`, the plaintext is `m = (m_padded - b) * a^-1 mod N`; if `a = 1`, it's just `m = m_padded - b`.

## Implementation details

- CRT with pairwise coprime moduli: `x = Σ rᵢ · Nᵢ · Nᵢ⁻¹ mod N`
- Integer cube root by binary search — exponentiation-based floating roots lose precision at 1024-bit scale, so an exact `lo/hi` search is used and `root³ == value` is asserted
- Decoding uses `long_to_bytes`-style conversion and falls back to a Latin-1 decode if the flag contains a non-UTF-8 separator

```python
def integer_kth_root(n, k):
    lo, hi = 0, 1
    while hi ** k <= n:
        hi <<= 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if mid ** k <= n:
            lo = mid
        else:
            hi = mid
    return lo, lo ** k == n
```

## Takeaway

Textbook RSA without randomised padding fails catastrophically for small `e` and multiple recipients. Linear padding is not padding: an affine map is invertible and doesn't randomise the message, so CRT + root still applies. Use OAEP.

## Flag

Flag: not recovered in the writeup.
