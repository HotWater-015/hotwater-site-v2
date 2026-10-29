---
title: "Slow Motion"
description: "A looping loading animation left running on a harbour crane control panel — a GIF that never finishes. The hidden message is carried in the least-significant bits of the red channel,…"
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-2/steg/slow-motion/writeup.md"
---

A looping loading animation left running on a harbour crane control panel — a GIF that never finishes. The hidden message is carried in the least-significant bits of the **red channel**, sampled row-wise across every frame.

## Files

- `slow_motion.gif` — the animation
- `challenge04_slow_motion_README.md` — brief
- `hotwa-solve/solve.py`

## Analysis

GIF frames are palettised; after converting each frame to RGB, the red channel's LSB looks like noise to the eye but survives the palette quantisation applied by the challenge author. The trick is *where* to sample: only the first row of each frame (`y = 0`), iterating `x` across the width, frame after frame.

```python
from PIL import Image, ImageSequence

bits = []
im = Image.open("slow_motion.gif")
for frame in ImageSequence.Iterator(im):
    f = frame.convert("RGB")
    for x in range(f.width):
        r, _, _ = f.getpixel((x, 0))
        bits.append(str(r & 1))
```

## Reassembly

The bitstream needs alignment: try each of the 8 bit offsets, and both MSB-first and LSB-first grouping, decoding bytes until an ASCII flag pattern `{...}` appears.

```python
def bits_to_bytes(bits, msb_first=True):
    out = bytearray()
    for i in range(len(bits) // 8):
        chunk = bits[i*8:(i+1)*8]
        if not msb_first:
            chunk = chunk[::-1]
        out.append(int("".join(chunk), 2))
    return bytes(out)

for offset in range(8):
    for msb in (True, False):
        blob = bits_to_bytes(bits[offset:], msb_first=msb)
        m = re.search(rb"\{[A-Za-z0-9_\-]+\}", blob)
        if m:
            print(m.group(0).decode())
```

The offset/MSB search only has to cover 16 possibilities, and one of them yields the flag inside readable ASCII.

## Takeaway

Animation formats are stego-friendly because per-frame LSB writing survives palette quantisation if you keep the payload shallow. Iterating frames in order and sampling a fixed row keeps the channel contiguous despite inter-frame compression.

## Flag

Flag: not recovered in the writeup.
