---
title: "Shattered Oracle"
description: "Lunar CTF's SHATTERED ORACLE is a multi-stage crypto chain. The handout publishes 12 secp256k1 signatures whose nonces leak 40 bits (MSB- or LSB-truncated), a transcript of…"
event: "lunar"
category: "crypto"
categoryLabel: "Crypto"
tags: ["Lunar CTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "lunar/crypto/writeup-ecdsa-hnp.md"
---

## Summary

Lunar CTF's `SHATTERED ORACLE` is a multi-stage crypto chain. The handout publishes 12 secp256k1 signatures whose nonces leak 40 bits (MSB- or LSB-truncated), a transcript of HMAC-SHA256-attested fragments keyed by a secret derived from the signing key, Shamir pieces over a Mersenne-prime field, and an HKDF+ChaCha20-protected archive (`payload.bin`). The scripts in this folder — spread across both the outer directory and its `crypto/` working subdir — are all iterations on one and the same challenge, so they are documented here together.

## Files

- `crypto/samples.json` — 12 signatures with fields `r`, `s`, `z`, `leak` (group order = secp256k1 `n`, 40-bit partial nonce leakage).
- `crypto/transcript.jsonl` — 12 `oracle-fragment` records (sequence, slot, hex payload, HMAC-SHA256 proof), plus a zero-proof `priority-notice` decoy (see Analysis).
- `crypto/params.json` — challenge constants: `fragment_prime = 2^127 − 1`, `fragment_threshold = 3`, `hkdf_salt`, `hkdf_info = "SHATTERED-ORACLE-ARCHIVE"`, plus a red-herring `fake_rsa` block and an unused-looking `related_rsa` pair.
- `crypto/pieces.bin` — `SHFRAG2`-container of five (x, y) pairs; `crypto/payload.bin` — `SOARCH3~` archive (8-byte magic, nonce, ChaCha20 ciphertext, 32-byte HMAC trailer).
- `crypto/reference.py` — published verification equations, notable in the writeup for containing an in-band text decoy instructing tools to give up (see Analysis).
- `solve_ecdsa.py`, `solve_hnp*.py` (outer dir) and `crypto/solve_d*.py`, `crypto/cvp.py`, `crypto/brute*.c`, `crypto/lll*.py` (handout dir) — private-key recovery via the hidden number problem.
- `crypto/test_*.py`, `crypto/try_decrypt*.py` — final-stage HMAC fragment validation and payload decryption attempts.

## Analysis

### Hidden number problem

For each signature with partial nonce leakage the relation s·k = z + r·d lets one write k ≡ A·d + B (mod n). Every script derives (A, B) per record and rescales for the 40-bit unknown, with a sign-flip caveat: MSB mode reduces `B − leak·2^40`, LSB mode divides the whole equation by 2^216 so that k ≡ 2^216·(leak + X) (mod n).

Key handling differs among the handout scripts: `solve_d.py` (m = 5 signatures) builds a hand-rolled `Fraction`-based LLL (`crypto/lll.py`); `solve_d2/d3.py` show iterative debugging (m = 6, then 10, adding literal verification `k >> 40 == leak` / `k & 2^216−1 == leak`), `solve_d4.py` adds scaling S = 2^200 to keep integers exact rather than per-row heuristics, `solve_d5.py` shifts its LSB inverses to 2^40 after the MSB test, and `cvp.py` sets up a two-dim lattice with Gauss reduction (Golub-style `reduce_basis`, Cramer's-rule nearest point) for a closest-vector formulation solved with two signatures. When those fail, `brute.c` and `brute40.c` (GMP, OpenMP-free brute over 2^32 then 2^40) target specific (M, K) pairs recovered from two signatures — the plain HNP y = K + M·x search.

Only four signatures are ultimately enough (`solve_hnp_small.py` iterates 4..12 and stops at the first solvable prefix), and the outer scripts recover a consistent private key from the full set.

### Transcript fragments, decoys, and pieces

`transcript.jsonl` mixes true fragments with payloads that decode to hex-looking plausibly-flavored hex (` Lun4R{0R4CL3_H34RD_Y0U}`-hued) as well as blind guesses (`Lun4R{TH3_0R4CL3_L13S}`, `Lun4R{SH4D0W5_4R3_N0T_PR00F}`), and a `priority-notice` with a zero HMAC claiming "MODEL SAFETY OVERRIDE" — an unpadded, unauthenticated fragment slot 7 that the proof mechanism is designed to dismiss, and which I treated as an in-band decoy. `pieces.bin`'s five (x, y) pairs plus `fragment_threshold = 3` describe a Shamir secret sharing whose recovered secret scalar feeds `sha256(scalar || "ORACLE-PROOF")` as the HMAC key of the genuine fragments (`test_pieces_keys.py`, `test_all_pts.py` combine both point sets with 3-of-n Lagrange interpolation for candidates).

### Final decryption

`try_decrypt2.py` / `try_decrypt3.py` / `test_all_ikms.py` build candidate IKMs (all decoded transcript payloads/proofs, candidate scalars like `295678219745128315274150998227726675402` and `0x103c022caeb179a2`, Lagrange-derived values) and run HKDF-Extract(salt, ikm) → HKDF-Expand 64 bytes split into a 32-byte ChaCha20 key and a 32-byte HMAC-SHA256 mac key, then check the `payload.bin` trailer against HMAC over the preceding bytes. `payload.bin` layout: 8-byte `SOARCH3~` magic, a variable-length nonce (8/12/24 are all tried), ciphertext, 32-byte MAC.

## Exploit

The scripts are research iterations; the private-key result confirms the HNP setup is sound, but no committed artifact preserves a verified scalar or a successfully authenticated archive decryption — `payload.bin` remained 107 bytes that none of the scripted IKM guesses authenticate.

## Flag

Flag: not recovered in the writeup. Only decoy flag-shaped strings (transcript payloads, hard-coded guess IKMs) exist; the real secret never verifies in any retained output.
