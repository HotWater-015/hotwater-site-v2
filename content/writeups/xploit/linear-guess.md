---
title: "Linear Guess"
description: "An LCG with unknown a, c and known modulus m = 2³² leaks consecutive outputs, then uses the same generator as a keystream to XOR the flag. Recover a and c from three outputs, then…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-4/crypto/linear/writeup.md"
---

An LCG with unknown `a`, `c` and known modulus `m = 2³²` leaks consecutive outputs, then uses the same generator as a keystream to XOR the flag. Recover `a` and `c` from three outputs, then predict forward and decrypt.

## Files

- `outputs.txt` — six consecutive state outputs
- `public_info.txt`, `README.md`
- `flag.enc`
- `solve.py`

## Analysis

With three consecutive outputs `X₀, X₁, X₂`:

```
X₁ = a·X₀ + c  (mod m)
X₂ = a·X₁ + c  (mod m)
```

Subtracting eliminates `c`:

```
X₂ - X₁ = a·(X₁ - X₀)  (mod m)
a = (X₂ - X₁) · (X₁ - X₀)⁻¹ mod m
c = X₁ - a·X₀ mod m
```

The only trap: `(X₁ - X₀)` must be invertible mod `2³²`, i.e. odd. If it isn't, pick a different adjacent pair — the script notes this explicitly.

## Decryption

The generator's *next* states are the keystream, packed little-endian in 4-byte words and XORed with `flag.enc`:

```python
state = X[-1]
keystream = b""
for _ in range((len(ciphertext) + 3) // 4):
    state = (a * state + c) % m
    keystream += state.to_bytes(4, byteorder="little")

flag = bytes(c ^ k for c, k in zip(ciphertext, keystream))
print(flag.decode())
```

The recovered outputs were `a = 2891336453`, `c = 1`-style small constants in testing, but the value that matters is structural: the LCG is fully determined by three outputs, so the keystream is public data.

## Takeaway

An LCG is not a stream cipher. Knowing any three consecutive outputs (and the modulus) reveals the whole parameter set, so predicting every future byte is trivial. Even a 32-bit state is recovered instantly — the effective key length here is zero.

## Flag

Flag: not recovered in the writeup.
