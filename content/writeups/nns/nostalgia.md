---
title: "Nostalgia"
description: "crypto_nostalgia is a brute-force-the-seed crypto challenge. The handout chall.py generates the AES-256 key from an LCG run 1337 times over a \"nanosecond precision\" time seed — but since…"
event: "nns"
category: "crypto"
categoryLabel: "Crypto"
tags: ["NNS CTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "NNS/crypto/nostalgia/writeup.md"
---

## Summary

`crypto_nostalgia` is a brute-force-the-seed crypto challenge. The handout `chall.py` generates the AES-256 key from an LCG run 1337 times over a "nanosecond precision" time seed — but since Python's `time.time()` returns whole seconds as a float, the effective seed space collapses enough to enumerate. Two independent solvers exist: a Python window search (`solve.py`) around the current time, and an OpenMP C program (`solve.c`) that reduces the whole 1337-iteration loop to a single affine map and sweeps all 2^32 seeds.

## Files

- `crypto_nostalgia/chall.py` — challenge source (cited for the constants and ciphertext).
- `solve.py` — Python window brute force.
- `crypto_nostalgia/solve.c` — full-space C brute force with OpenSSL EVP and OpenMP.
- `crypto_nostalgia/solve` — compiled binary of the above.

## Analysis

### The challenge

`chall.py` encrypts a 35-character `NNS{…}` flag with AES-256-ECB and PKCS#7 padding and prints the resulting 48-byte ciphertext hex:

```python
def lcg(s):
    return (16843009*int(s)+826366247)%(2**32)

seed = time.time() # nanosecond precision, you will never find the seed
for _ in range(1337):
    seed = lcg(seed)
key = sha256(str(seed).encode()).digest()
```

The multiplier `16843009 = 0x01010101` and increment `826366247` are stored mod 2^32. Because every multiplier/increment application truncates with `int(s)` immediately, one 64-bit float seed turns into an arbitrary uint32 after the first step — and from there the key depends only on `str(x)` of the final uint32.

### Composing the LCG

`solve.c`'s `calculate_transform()` performs square-and-multiply on affine forms so `LCG^1337(x) = P·x + Q (mod 2^32)` in 11 compositions instead of 1337:

```text
compose((a, c), (b, d)) = (b·a, b·c + d)
```

Then `check_seed` computes the final seed with one multiplication, formats it as decimal (matching Python's `str()`), SHA-256s it, AES-256-ECB-decrypts the 48-byte ciphertext with padding enabled, and accepts a plaintext starting with `NNS{`, ending with `}`.

## Exploit

`solve.py` fixes the ciphertext and iterates `seed` over `center ± window` (defaults: current `time.time()`, ±86400 seconds) checking for the same plaintext signature — viable because the challenge's "nanosecond precision" claim does not hold.

`solve.c` goes further: with `argc == 3` it sweeps `[start, end)` (default all 2^32 uint32 initial seeds), parallelized with `#pragma omp for schedule(static)`, and reports on first match. The parallel `for` loop uses a thread-local `unsigned char flag[64]` buffer and a `#pragma omp critical` handshake when publishing `found_seed`/`found_flag`.

Both approaches need only ~48 AES block decryptions (one per candidate when padded correctly — PKCS#7 rejects most wrong keys via `EVP_DecryptFinal_ex`), so the C version finishes in minutes over the whole domain.

## Flag

Flag: not recovered in the writeup. Neither script retains the matching plaintext output.
