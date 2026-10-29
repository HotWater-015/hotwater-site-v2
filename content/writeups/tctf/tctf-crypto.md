---
title: "TCTF Crypto"
description: "This TCTF 2026 crypto service (\"Feed the BOX\") encrypts every supplied 16-byte block with a custom AES variant under a fixed secret key, handshakes a checksum cryptogram (the key…"
event: "tctf"
category: "crypto"
categoryLabel: "Crypto"
tags: ["TCTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "tctf/crypto/writeup.md"
---

This TCTF 2026 crypto service ("Feed the BOX") encrypts every supplied 16-byte block with a custom AES variant under a fixed secret key, handshakes a checksum cryptogram (the key encrypted with itself), and demands the key back after up to 5,000 queries. I recovered the key with a differential fault–style collision attack that pre-precomputes the MixColumns masking, then finished off the remaining ambiguity with a tiny C brute force.

## Summary

The service implements a heavily modified AES:

```python
key = os.urandom(16)
cipher = encrypt(key, key)
print(f"The whispers of secret: ", cipher.hex())
```

It then lets the client encrypt up to `MAX_QUERIES = 5000` chosen plaintexts under the same key, and finally asks for the Master Key in hex. The modifications, from `aes()`: a pre-whitening that applies a row-`i` rotation, a MixColumns **before** the AddRoundKey, then 16 rounds of SubBytes / ShiftRows / MixColumns / an odd ARK that adds `key[4i+j]` wordwise, XORs `state[i][i] ^= r ^ 0x33` only on the diagonal, and rotates the key by `r` each round. No real key schedule, no final round distinction. Classic differentials die because every byte passes SubBytes, but the custom ARK leaves a narrow crack in the first ARK-round, since both before-after pairs can be controlled separately.

## The Differential

The core attack idea: submit pairs `X1` and `X2` that differ in exactly one byte by `0xA5` (`x ^ 165`). If, for one candidate key byte, both make the final ciphertext identical (a collision), we narrow which key byte value fits — each `X1/X2` pair yields **two** candidates.

The trick that lets this work at all against a full 16-round cipher lives in `get_P`:

```python
def get_P(X):
    st = inv_mix_column(X)
    st = inv_shift_rows(st)
    return bytes([st[i][j] for i in range(4) for j in range(4)])
```

The service applies a forward ShiftRows + MixColumns before the first ARK, so I chose the plaintext to be the inverse of that affine layer to place a targeted one-byte difference directly on the ARK input, giving a clean single-byte differentially-tuned input to round 1.

## Candidate Harvest

The queries are fully pipelined — all 512 pairs (4×4 positions × 128 byte values) are written at once, and 1,024 ciphertext lines are read back with a custom sync parser `Conn.read_cts`, which discards everything up to the `[BOX Magic]` marker each time:

```python
for i in range(4):
    for j in range(4):
        for x in range(128):
            X1[i][j] = x
            X2[i][j] = x ^ 165
            queries.append((4 * i + j, x, get_P(X1).hex(), get_P(X2).hex()))
...
for k, (idx, x, p1, p2) in enumerate(queries):
    if k_cands[idx] is None and cts[2 * k] == cts[2 * k + 1]:
        i, j = divmod(idx, 4)
        d = 0x33 if i == j else 0
        k_cands[idx] = (x ^ d ^ 55, x ^ d ^ 146)
```

The post-processing is where the weak ARK pays off: the first ARK applies a fixed diagonal XOR of `r ^ 0x33 = 0x33` (round 0), so recovering which value of `x` collides determines a candidate for the key byte **with the diagonal offsets corrected** (`^55 = ^0x33` for the diagonal; `^146` = `^0x92 = 165 ^ 55` inverse-context for the off-diagonal byte pair).

## C Brute Force

Two candidates per key byte leaves 2^16 keys — small enough to enumerate in C. The solver generates `brute_gen.c` from the `brute_main.c` template with the candidates and a zero-plaintext reference ciphertext inlined, compiles it with `-O3`, and runs it:

```python
with open("brute_gen.c", "w") as f:
    ... src_template.replace("@@CANDS@@", cand_str).replace("@@TARGET@@", target_str)
subprocess.run(["gcc", "-O3", "brute_gen.c", "-o", "brute_gen"], check=True)
out = subprocess.run(["./brute_gen"], ...)
```

`brute_main.c` re-implements the exact modified AES (same S-box, same `cross` MixColumns, same rotated-key ARK) and iterates all 65,536 candidate keys against the `key XOR key` "whispers" target printing on a match.

## Running It

```bash
python exploit.py <host> <port>
```

The script sends the collision queries, collects ciphertexts, builds and compiles the brute forcer, sends `end`, and submits the recovered key when the service says "Master Key".

The reference ciphertext pipeline and the brute force reproduce the key recovered during the event; the compiled `brute_gen` in the folder still reproduces it standalone:

```text
$ ./brute_gen
bc84eaf236d92832fc7da0ca49043161
```

## Flag

Flag: not recovered in the writeup. The exploit submits the key to the service and prints the flag from the reply, but no captured flag string exists among the artifacts.
