---
title: "auth-gw Biased-Nonce ECDSA"
description: "The captured_tokens.json artifact contains ECDSA session-attestation signatures intercepted from \"auth-gw\" (VLAN 12) on secp256k1 with SHA-256. A leaked commit note in gen_notes.txt…"
event: "luna1"
category: "crypto"
categoryLabel: "Crypto"
tags: ["Luna CTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "luna1/crypto/writeup.md"
---

## Summary

The `captured_tokens.json` artifact contains ECDSA session-attestation signatures intercepted from "auth-gw" (VLAN 12) on secp256k1 with SHA-256. A leaked commit note in `gen_notes.txt` shows the signing service truncated its nonces with `randbelow(2**250)`, so every nonce k has zeroed top bits. That bias turns the key equations into a hidden number problem (HNP) solvable with LLL on fpylll, and the recovered private key unlocks the `sealed_note.bin` AES-256-GCM dropper.

## Files

- `captured_tokens.json` — intercepted signatures (message, `r`, `s`, hex) plus the server public key.
- `gen_notes.txt` — commit log revealing the nonce truncation.
- `analyse.py`, `aibi.py` — preliminary statistics and HNP coefficient computation.
- `recover-d.py` — the lattice attack that recovers `d`.
- `solve.py` — final decryption of `sealed_note.bin`.
- `sealed_note.bin` — 74-byte encrypted payload.

## Analysis

For each signature, s = k⁻¹(z + r·d) mod n. Multiplying by s⁻¹ and dividing by r gives

```text
k ≡ A⁻¹·z + A⁻¹·r·d  (mod n),  where A = r·s⁻¹
```

so k = a·d + b with `a = r·s⁻¹ mod n` and `b = z·s⁻¹ mod n`. With k < X = 2^250 (about 6 bits of bias in a 256-bit group), many equations of the form a·d + b − n·(something) are small. `aibi.py` builds the a/b lists and `analyse.py` confirms the bound.

`recover-d.py` builds a (m+2)×(m+2) matrix for the m captured signatures:

```python
M[i, i]     = n * n          # multiples of n keep things integral
M[m, i]     = n * a[i]
M[m + 1, i] = n * (b[i] - X // 2)
M[m, m]     = X              # target column for k's unknown low part
M[m + 1, m + 1] = n * X      # column scaling the candidate d
```

LLL reduction with `delta=0.999` is tried first; a candidate d is read off as `(row[m] // X) % n` for rows where `row[m] % X == 0`, then validated against every signature via `((z + r*d)·s⁻¹ mod n) < X`. If plain LLL fails, the script escalates to BKZ with block sizes 20/30/40.

## Exploit

The recovered key is hard-coded into the final step:

```python
d = 0x50f7cd8bfa44175494a9dffd55cd4e780808958f106d4816d20f1f2e34f4c89b
key = sha256(d.to_bytes(32, "big")).digest()      # AES-256-GCM
nonce, tag, ct = blob[:16], blob[16:32], blob[32:]
pt = AESGCM(key).decrypt(nonce, ct + tag, None)
```

`sealed_note.bin` follows a 16-byte nonce | 16-byte tag | ciphertext layout, so no padding guessing is needed and GCM fails loudly on wrong keys.

## Flag

Flag: not recovered in the writeup. The decrypted note plaintext is not present in any script or artifact text, only the ciphertext exists.
