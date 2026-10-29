---
title: "Nested Steam Package"
description: "The challenge is a chain of nested archives (\"nested stream package\")."
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit-2/steg/nested-steam-package/.read.md"
---

## Flag

```
XploitXβ{n3st3d_cl34n}
```

## Solution

The challenge is a chain of nested archives ("nested stream package").

### 1. Level 1 — `CTF_sample_9.zip`

```
CTF_sample_9.zip
├── CHALLENGE.md         → "Nested stream package."
└── nested_package.zip
```

### 2. Level 2 — `nested_package.zip`

```
nested_package.zip
├── playlist.txt         → the flag
├── preview.mp4          → broken MP4 ("moov atom not found") — decoy
└── nested_stream.dat    → another ZIP
```

`playlist.txt` contains the flag directly:

```
stream0=preview
stream1=nested_stream
XploitXβ{n3st3d_cl34n}
```

### 3. Level 3 — `nested_stream.dat` (ZIP)

```
nested_stream.dat
├── decoy1.wav      → decoy
├── decoy2.mp4      → decoy
├── final_echo.wav  → decoy
└── final_frame.png → decoy
```

The deeper files are all decoys meant to burn time. The real flag is in
`playlist.txt`.

`n3st3d_cl34n` → "nested clean" — the packages nest cleanly until the flag is
found.
