---
title: "Hidden Weights -"
description: "The challenge chooses ten secret weights a_1, ..., a_10 modulo a 200-bit prime M, then publishes 50 totals:"
event: "isfcr"
category: "ml"
categoryLabel: "ML"
tags: ["ISFCR CTF 2026","ml"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/hidden-weights-writeup.md"
---

## Challenge summary

The challenge chooses ten secret weights `a_1, ..., a_10` modulo a
200-bit prime `M`, then publishes 50 totals:

`h_j = sum(a_i * x[i,j]) mod M`, where every `x[i,j]` is either 0 or 1.

The weights and subset-selection bits are both secret. The output also
contains an AES-GCM-encrypted flag. The key is:

``` python
SHA256(",".join(map(str, sorted(weights))).encode()).digest()
```

## Attack idea

Each published value is a subset sum of the same ten weights.
Consequently, the 50 totals are not independent random values: they are
points drawn from a ten-dimensional subset-sum cube.

Short additive collisions are useful. For example, if

`h_a + h_b + h_c == h_d + h_e + h_f (mod M)`

then, absent an accidental modular relation, the corresponding hidden
bit-vectors satisfy the same equality over the integers. Finding enough
such relations can expose the hidden subset matrix `X`.

Once the bit-vectors are reconstructed, the equations can be written as

`h = X^T * a (mod M)`.

Choose ten independent columns, solve the resulting linear system modulo
`M`, and recover the weights. Sort the recovered weights exactly as the
generator does, join their decimal representations with commas, and hash
the resulting string with SHA-256.

## AES-GCM verification

With the recovered weights, decrypt and authenticate the ciphertext:

``` python
from hashlib import sha256
from Crypto.Cipher import AES
import json

out = json.load(open("output.json"))

# `weights` must contain the ten recovered integer weights.
key = sha256(",".join(map(str, sorted(weights))).encode()).digest()
cipher = AES.new(key, AES.MODE_GCM, nonce=bytes.fromhex(out["flag_nonce"]))
plaintext = cipher.decrypt_and_verify(
    bytes.fromhex(out["flag_ct"]),
    bytes.fromhex(out["flag_tag"]),
)
print(plaintext.decode())
```

`decrypt_and_verify` checks the GCM authentication tag. A successful
check is the confirmation that the key and plaintext are correct.

## Verification status

The previous conversation asserted a flag, but the saved work does not
include the recovered weights, subset matrix, or a runnable
reconstruction script. Therefore that flag is **not independently
verified** and should not be presented as confirmed without a successful
authentication-tag check.

The missing part for a fully reproducible solve is the reconstruction
routine that derives the hidden subset matrix (or the ten weights) from
the 50 published totals.
