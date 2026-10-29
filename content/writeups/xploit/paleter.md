---
title: "Paleter"
description: "A palette-swap stego challenge: an ordinary PNG whose hidden content lives in the PLTE chunk. The provided palet.py rewrites the palette so exactly one palette index is white and the…"
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-5/steg/paleter/writeup.md"
---

A palette-swap stego challenge: an ordinary PNG whose hidden content lives in the **PLTE chunk**. The provided `palet.py` rewrites the palette so exactly one palette index is white and the rest are black; by cycling that index across all 256 values, you recover whichever palette entry the image data actually uses to draw the secret.

## Files

- `atlas.png` — the carrier image
- `palet.py` — palette-swap utility
- `(extracted)` `XploitX_Stego02_Participants/`

## Analysis

The script walks the PNG chunk stream, finds `PLTE`, and rebuilds the palette bytes:

```python
paldata = ("\x00\x00\x00" * n) + ("\xff\xff\xff") + ("\x00\x00\x00" * (256 - n - 1))
f.seek(curpos)
f.write(paldata)
f.write(struct.pack(">L", crc32(chtype + paldata) & 0xffffffff))
```

Two modes are supported (one commented out): isolate a single index, or highlight a contiguous range starting at index 127. Rendering the isolated index as black-on-white makes the region that uses it visible as text — the flag is drawn in ordinary pixels but indistinguishable in the original palette.

## Brute-force loop

1. Copy `atlas.png` for each `n` in `0..255`.
2. Run the swap with index `n`, saving `out_<n>.png`.
3. View or OCR each result; the flag appears when `n` matches the glyph colour index.

The palette CRC is recomputed so the PNG stays valid, which is why the tool rewrites both the data and the chunk CRC in place.

## Takeaway

Indexed-colour PNGs are a classic blind spot: pixels aren't RGB, they're palette indices, and tools that ignore `PLTE` see only the index map. Isolating each index turns a flat image into a readable mask. Defenders should treat palette manipulation as a first-class stego vector.

## Flag

Flag: not recovered in the writeup.
