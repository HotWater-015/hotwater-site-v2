---
title: "Two Faces"
description: "Base64-decodes to tw1n_f4c3s_4r3_h4rd (\"twin faces are hard\")."
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit-2/steg/two-faces/.read.md"
---

## Flag

```
XploitXβ{tw0_f4c3s_0n3_f1l3_0rph4n_0bj3ct}
```

## Solution

### 1. Read the PDF metadata / visible text

`exiftool` shows the PDF `Keywords`:

```
dHcxbl9mNGMzc180cjNfaDRyZA==
```

Base64-decodes to `tw1n_f4c3s_4r3_h4rd` ("twin faces are hard").

The page content stream also contains white-coloured text (invisible against the
white page):

```
XploitXbeta{wh1t3_t3xt_1s_n0t_th3_w4y}
```

This is a **decoy** ("white text is not the way").

### 2. Extract the embedded ZIP

`binwalk` locates a ZIP appended at offset `0x4EB`. It contains two entries, both
encrypted. The passphrase is the decoded keyword: **`tw1n_f4c3s_4r3_h4rd`**.

- `readme.txt` → `"Archive of accounting scratch data. Nothing to see here."`
  (another **decoy**)
- `pad.bin` → 43 bytes (a one-time **pad**)

### 3. Decode the orphan object

Object `7` is an **orphan** (never referenced by the page's `/Contents`, which only
uses object `4`). Its stream uses `/Filter [/ASCII85Decode /FlateDecode]`:

```
GhN0K!7_$TX58HJ*-cJJFpcEJTro*b3g0PlB9lLC^3pq?1!!$"3su'MJuN+Y4O:F-&mP~>
```

ASCII85-decode, then zlib-inflate → 43 bytes of ciphertext.

### 4. XOR with the pad

```
ciphertext XOR pad.bin = XploitXβ{tw0_f4c3s_0n3_f1l3_0rph4n_0bj3ct}
```

`tw0_f4c3s_0n3_f1l3_0rph4n_0bj3ct` → "two faces, one file, orphan object".
