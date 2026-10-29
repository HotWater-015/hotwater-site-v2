---
title: "Lunar Forensic Challenge 4"
description: "A PNG image (case_evidence.png) containing multiple layers of hidden data."
event: "lunar"
category: "forensics"
categoryLabel: "Forensics"
tags: ["Lunar CTF 2026","forensics"]
date: "2026-09-20"
teammate: false
source: "lunar/forensic/4/writeup.md"
---

**Flag:** `Lun4R{c4rv1ng_m3t4d4t4_4nd_p1x3l_wh1sp3rs}`

## Overview

A PNG image (`case_evidence.png`) containing multiple layers of hidden data.

## Step 1: PNG Metadata (tEXt chunks)

Examining PNG chunks revealed three text entries:

- **Comment:** `Lun4R{th1s_1s_n0t_th3_r34l_fl4g_k33p_d1gg1ng}` — Decoy flag
- **archive_note:** `RnU0cTBqUzF5cl8yMDI0` — Base64 string (password hint)
- **Author:** Warning about solving it yourself

## Step 2: Embedded ZIP After IEND

728 bytes found after the PNG IEND chunk — a password-protected ZIP file containing `secret.png`.

## Step 3: Cracking the ZIP Password

The `archive_note` base64 decodes to `Fu4q0jS1yr_2024`. Applying ROT13 yields the ZIP password:

```
RnU0cTBqUzF5cl8yMDI0 → base64 decode → Fu4q0jS1yr_2024 → ROT13 → Sh4d0wF1le_2024
```

Extracted `secret.png` with password `Sh4d0wF1le_2024`.

## Step 4: LSB Steganography

Analyzing the least significant bits of the RGB channels in `secret.png` yielded a Base32-encoded string:

```
JR2W4NCSPNRTI4TWGFXGOX3NGN2DIZBUOQ2F6NDOMRPXAMLYGNWF653IGFZXAM3SON6Q
```

## Step 5: Base32 Decode

Decoding the Base32 string reveals the flag:

```
Lun4R{c4rv1ng_m3t4d4t4_4nd_p1x3l_wh1sp3rs}
```

## Tools Used

- `exiftool` — PNG metadata inspection
- `xxd` / hex analysis — Finding embedded data after IEND
- `zsteg` — LSB steganography detection
- Python (`struct`, `zipfile`, `base64`, `PIL`) — Parsing and extraction
- `base32` — Final flag decode
