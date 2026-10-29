---
title: "Phantom Eclipse"
description: "The phantom_eclipse forensics challenge ships an evidence bundle (evidence/): a .ECL container (artifact.dat) of fourteen sec_NNNN sections, a notes.jpg, a suspicious_image.png carrying…"
event: "lunar"
category: "forensics"
categoryLabel: "Forensics"
tags: ["Lunar CTF 2026","forensics"]
date: "2026-10-22"
teammate: false
source: "lunar/forensic/6/writeup.md"
---

## Summary

The `phantom_eclipse` forensics challenge ships an evidence bundle (`evidence/`): a `.ECL` container (`artifact.dat`) of fourteen `sec_NNNN` sections, a `notes.jpg`, a `suspicious_image.png` carrying steganographic payloads, a `capture.pcap`, `access.log`/`system.log`, a 4 MiB memory dump, and a 129-byte `ECLBAK01` encrypted backup. The recovered key is spread across five independently encoded pieces (Base32/Base85/hex literals plus a PNG-adjacent lane, and a sixth 64-byte piece embedded right after the backup header), and the scripts attempt both a raw XOR reconstruction and an AES-256-XTS decryption matrix. No script in the folder records a recovered flag string.

## Files

- `README.txt` — `Flag Format: Lun4R{...}`
- `evidence/` — the artifact set above; `sectors/` — `sec_0000..sec_0013` extracted in solved order; `scratch/` — intermediate writes (`ct.bin`, `out.bin`).
- `extract_artifact.py` — container parser. `get_chunks.py`, `get_dots.py` — PNG inspection. `solve.py`, `solve2.py`, `solve_final.py` — key reconstruction and decryption.

## Analysis

### Container format

`extract_artifact.py` reads the `artifact.dat` header — magic bytes `89 45 43 4C 0D 0A 1A 0A` (`.ECL\r\n\x1a\n`), version 1, 14 sections — and walks the directory table: each entry is an 8-byte ASCII name (`sec_0000`…), then `flags, off, sz, sz2` as little-endian `struct('<IIII')` fields, 24 bytes per entry. Sections land at non-uniform offsets.

### PNG lane

`get_chunks.py` walks PNG chunk headers, and `zsteg_out.txt` shows the usual stego layer inventory for `suspicious_image.png` (nothing obviously human-readable bit-depth 1, plenty of patterned noise deeper in). `get_dots.py` filters every non-background pixel `(2, 2, 8)`, coaxing `min/max x,y` extents — this appears to be the path that yielded the dot-matrix template ultimately written into `sectors/sec_0008` and `sec_0011` candidates in `solve_final.py`.

### Key reconstruction

The five 64-byte pieces that `solve.py`/`solve2.py`/`solve_final.py` hard-code:

| Piece | Encoding |
|---|---|
| `p1` | Base32 lowercase string from the workload, also visible in `b32.txt` |
| `p2` | Base32, distinct alphabet/digits |
| `p3` | Base85 (`base64.b85decode`) |
| `p4`, `p5` | 64-byte hex blobs |

`solve.py` XORs the five and XORs a hard-coded 117-byte ciphertext hex blob against the result, printing a key candidate. `solve2.py` restores the `evidence/backup.enc` role: the file is `ECLBAK01` + 4-byte header + a 64-byte key slot (`p6`, `data[12:76]`) + the flag ciphertext tail (`data[76:]`), so the real key is the XOR of all six pieces, then XORed against the ciphertext tail. `solve_final.py` generalizes: it keeps two `p6` candidates (the `sec_0008` and `sec_0011` sector bytes), tries both 32-byte halves swapped, and adds direct `hex1+hex2` / `hex2+hex1` key pairs of the 32-byte metadata checksums (from `hex1`/`hex2` fields of the container's metadata sector presumably).

### The decryption matrix

Whereas the XOR scripts assume a stream-cipher recovery, `solve_final.py` hypothesises AES-256-XTS:

```python
Cipher(algorithms.AES(key), modes.XTS(tw))
```

and runs 6 candidate tweaks (null, sector numbers 6958 and 8379 in `struct('<Q')` LE, payload prefix, payload suffix, `ECLBAK01` header padded) × 8 candidate keys × 3 ciphertext windows (full 12+ payload, skipping 16 bytes, trimming 16). Every print site checks `b'Lun4R{' in pt` and bails silently otherwise.

## Exploit

Running the XOR reconstruction (`solve.py`/`solve2.py`) yields a "Key candidate" hex string, but the scripts do not validate a plaintext and do not print a flag; no XTS combination triggers the flag branch either — outputs `ct.bin`/`out.bin` in `scratch/` show a 4665600-byte unrolled attempt against the memory fragment without a stored success.

## Flag

Flag: not recovered in the writeup. Fragment and key material are well-defined in the scripts, but a decrypting composition isn't preserved in any retained output.
