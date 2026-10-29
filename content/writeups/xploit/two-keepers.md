---
title: "Two Keepers"
description: "A stego challenge built on visual secret sharing: two images (share1.png, share2.png) from a lighthouse keeper's apprentices. Individually they look like noise; XOR them back together…"
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-5/steg/writeup.md"
---

A stego challenge built on visual secret sharing: two images (`share1.png`, `share2.png`) from a lighthouse keeper's apprentices. Individually they look like noise; XOR them back together and the instructions appear.

## Files

- `share1.png`, `share2.png`
- `README (2).md` — brief
- `solve.py`

## Analysis

The two shares are the same canvas with complementary random noise: for each pixel, one share carries the signal and the other the mask, so XOR cancels the noise and leaves the message. One share is mirrored horizontally before combining — the classic "look at them side by side" misdirection.

```python
from PIL import Image
import numpy as np

A = np.array(Image.open("share1.png").convert("L"))
B = np.array(Image.open("share2.png").convert("L"))

B_flip = np.fliplr(B)
hidden = np.bitwise_xor(A, B_flip)

Image.fromarray(hidden).save("xor_result.png")
```

Converting to greyscale first makes the per-pixel operation meaningful regardless of the original channel layout; the flipped second share then aligns glyph-by-glyph with the first.

## Result

The XOR image shows the hidden instruction text in the clear — the recovered payload reads `beacon-fog`, which maps to the challenge's lighthouse theme and is the material the next shift was meant to find.

## Takeaway

Naïve "visual cryptography" that splits a message into two random-looking shares is only as strong as the relationship between the shares. If both are provided, alignment plus XOR reconstructs the signal by construction; the technique protects against a single-file leak, not against possession of the pair.

## Flag

Flag: not recovered as a `XploitXβ{...}` string in the writeup; the recovered payload is `beacon-fog`.
