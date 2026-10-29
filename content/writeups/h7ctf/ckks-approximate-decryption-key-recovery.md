---
title: "CKKS Approximate-Decryption Key Recovery"
description: "In H7CTF 2026's crypto track, a homomorphic-encryption analytics service leaks enough noise for full key recovery. The service is a minimal CKKS-style scheme over Z_q[x]/(x^N+1) with N =…"
event: "h7ctf"
category: "crypto"
categoryLabel: "Crypto"
tags: ["H7CTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "H7CTF/crypto/1/writeup.md"
---

In H7CTF 2026's crypto track, a homomorphic-encryption analytics service leaks enough noise for full key recovery. The service is a minimal CKKS-style scheme over `Z_q[x]/(x^N+1)` with `N = 8`, `Q = 2^40 - 87`, `DELTA = 2^25`. The flaw is not in the encoding; it is that the service returns the approximate (noisy) decryption of a ciphertext, and that noise is the secret key times the known randomness.

## Files

- `ckks.py` - the shipped scheme: `encode`/`decode` via the canonical embedding at primitive `2N`-th roots, `ring_mul`, `encrypt` (`b = -a*s + m + e`), and `decrypt` returning approximate slots.
- `solve.py` - the clean attack against the `/v1` endpoints.
- `solve_v2.py` - variant against `/v2`, where each `/v2/decrypt` answer is uniquely randomized, fixed by averaging repeated decryptions.

## Analysis

`decrypt` computes `d = b + a*s` and returns `decode(d)`, i.e. the noisy slots. The secret is ternary (`small(1)` in `keygen`), so there are only `3^8 = 6561` candidates for `s` - perfect for brute force. For any ciphertext with known plaintext `m` and known `a`:

```text
d - b - a*s = m + e - m - e'   (small residual)
```

so scoring each candidate by the squared, centered residual recovers the true key.

## The zero-slot trick

`solve.py` hits `/v1/encrypt` with the all-zero vector `[0,0,0,0]`, then immediately decrypts that ciphertext over `/v1/decrypt`. For this single ciphertext, `d - b - a*s` is **zero-ish non-noise aside from roundoff**, so the deterministic `/v1/decrypt` result recovers the ternary key exactly from the same ciphertext:

```python
best = None
for s in itertools.product((-1, 0, 1), repeat=N):
    pred = ring_mul(enc["a"], s)
    err = [((d[i] - enc["b"][i] - pred[i] + Q // 2) % Q) - Q // 2 for i in range(N)]
    score = sum(x * x for x in err)
    if best is None or score < best[0]:
        best = (score, s, err)
```

The centering by `Q // 2` mirrors `_center` in `ckks.py`: coefficients live in `(-Q/2, Q/2)` not `[0, Q)`, so the residual must be centered before scoring. The recovered `s` is submitted to `/v1/recover`:

```python
out = post("/v1/recover", {"s": list(best[1])})
```

## The randomized variant

In `/v2`, each decrypt call produces a distinct-but-consistent randomized answer, so a single sample no longer pins the key. `solve_v2.py` handles this by querying `/v2/decrypt` twelve times on the same encrypted ID, averaging the complex slots with `np.mean(samples, axis=0)`, then decoding the averaged vector and running the identical `3^8` sweep. Averaging kills the independent decryption noise, restoring the same low-residual signal `/v1` gave deterministically.

## Flag

Flag: not recovered in the writeup. The scripts only print the candidate key, the residual error, and the `/v1/recover` or `/v2/recover` response; no flag string exists in the solve scripts.
