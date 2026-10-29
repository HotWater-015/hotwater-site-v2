---
title: "Double Exposure"
description: "file on double_exposure.jpg reveals a JPEG comment:"
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit-2/steg/double-exposure/.read.md"
---

## Flag

```
XploitXβ{tr4l1ng_sp4c3s_t4b_b1ts_pk_f1x_2d7e}
```

## Solution

### 1. Spot the decoy

`file` on `double_exposure.jpg` reveals a JPEG comment:

```
comment: "XploitXβ{just_a_c0mm3nt_n0th1ng_m0r3}"
```

That is a **decoy** ("just a comment, nothing more").

### 2. Find the appended ZIP

The JPEG ends (EOI `FFD9`) well before the end of the file. There is a ZIP archive
appended after the EOI. Its `PK\x03\x04` magic had been overwritten with
`00 00 00 00`, so `binwalk` misses it. Restoring the magic reveals a single entry:
`memo.txt` (ZipCrypto-encrypted).

The hint file `found.txt` gives the passphrase: **`n1ghtsh1ft`**.

```bash
# carve from offset of the last FFD9 and fix the magic
dd if=double_exposure.jpg bs=1 skip=<eoi+2> of=memo.zip
# first 4 bytes: 00 00 00 00 -> 50 4B 03 04
unzip -P n1ghtsh1ft memo.zip
```

### 3. Decode the trailing whitespace

`memo.txt` looks like an ordinary harbour maintenance memo, but every line ends
with a different amount of trailing spaces/tabs (classic **snow** steganography).

Treat `tab = 1`, `space = 0`, read 8 bits per line (MSB first), and decode as
ASCII:

```
01011000 X
01110000 p
01101100 l
01101111 o
01101001 i
01110100 t
01011000 X
11001110 }  β (0xCE)
10110010 }  β (0xB2)
01111011 {
...
```

This yields the flag.

### Flag content decoded

`tr4l1ng_sp4c3s_t4b_b1ts_pk_f1x_2d7e` → "trailing spaces / tab bits / pk fix"
(confirming both the whitespace technique and the restored ZIP `PK` magic).
