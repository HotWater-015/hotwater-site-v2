---
title: "Afterglow — DOS Panel ROM Bitplane Reconstruction"
description: "For H7CTF 2026 this hardware-adjacent challenge hands you a DOS ROM for a \"recovered status panel\" that boots under qemu-system-i386 (-drive format=raw,file=panel.rom). In stock…"
event: "h7ctf"
category: "hardware"
categoryLabel: "Hardware"
tags: ["H7CTF 2026","hardware"]
date: "2026-10-22"
teammate: false
source: "H7CTF/hardwate/hardd/1/writeup.md"
---

For H7CTF 2026 this hardware-adjacent challenge hands you a DOS ROM for a "recovered status panel" that boots under `qemu-system-i386` (`-drive format=raw,file=panel.rom`). In stock emulation it self-tests and shows a factory-printed calibration tag; the real flag for your unit only lights up once the panel is brought "into service". I did not emulate it — the disassembly shows a 32×256 one-bit-per-pixel plane-plane framebuffer (the VGA mode 13h linear buffer at `0xA0000`, written byte-per-pixel with `0x00`/`0xFF` values), two render routines (8-bit-per-plane palette source atlas dumped during self-test, and post-service combined frame), a service-code gate (`cmp eax, [0x506]`, then a `hlt` loop on success — so even the correct hex code greyscreens), and, crucially, flag rendering down at `0x83d4` in the service handler. Everything needed to re-derive it purely from the ROM is present in the shipped scripts, so I reconstructed the framebuffer statically from `panel.rom` byte plane data.

## Files

- `panel.rom`, `panel2.rom` — 32KB raw boards; `payload.bin` is the code section isolated for disassembly.
- `dis.txt` — objdump of `payload.bin`; all instructions referenced below come from addresses `0x8000..0x8364`.
- `solve.py` — final reconstruction into a grayscale PNG + ASCII art.
- `planes.py` — per-bitplane dump used to sanity-check plates.
- `ocr.py`, `ocr2.py` — OCR fan-out over my rendered PNG.
- `strip.txt` — the factory calibration strip, also OCR'd for cross-reference.

## Analysis

The seed lives at `0x83d6` (first word `c2 22 e9 63`) and feeds a Objective murmur-flavored hash:

```python
x = (x ^ 0x5bd1e995) & M
x = (x * 0x9e3779b1) & M
x ^= x >> 15
x = (x * 0x85ebca77) & M
x ^= x >> 13
```

That produces the service code the panel asks you to type. Because the service handler is `hlt`-gated rather than flag-revealing, getting the *service code* pulled out was pointless here — I derived it anyway (`SERVICE CODE` printed by `solve.py`) because the same active value seeds the per-plane keystream. A 16-bit LFSR, seeded from the same active value, generates two interleaved, byte-granular obfuscation streams with a `small` inversion flag per plane and a Fisher-Yates bit-permutation over the 8 planes plus per-plane `+/-2` row and column rotations. `planes.py` notes the two offset arrays interleave (one `rnd()` per element, `A0,B0,A1,B1,...` per plane), and quirks of signedness (`offA2 = offA[i] - 256 if offA[i] > 127 else offA[i]`) that make the offsets sometimes fold into the negative range.

Each bitplane lives at `0x83DC + plane*0x400`, XORed with a keystream seeded as `((plane+1) * 0x01000193) ^ code` and stepped by the classic `x*0x19660D + 0x3C6EF35F` LCG, one byte per iteration, with the top byte driving the XOR:

```python
s = (s*0x19660D + 0x3C6EF35F) & M
dec[k] = rd(src+k)[0] ^ ((s >> 24) & 0xFF)
```

Then 32 rows × 256 columns of bits are unpacked MSB-first, applied through per-plane row/col offsets, inverted per the per-plane inversion bit, and OR-ed into the shared framebuffer at bit position `perm[plane]`.

## Exploit

`solve.py` reconstructs the 256×32 grid and renders it. The trick is that my first render was not a legible palette-mapped image — it was a low-contrast anti-aliased PNG, which tésséract absolutely refused to read. The path that worked:

1. Render *two* variants: the plain 1× PNG and a 4× nearest-neighbor upscale. These turn out to be *byte-identical in pixel content* yet produce different OCR results — the upscale is what finally tripped Tesseract's adaptive threshold into reading it cleanly.
2. `ocr.py` fans out Tesseract over numpy crops (rows 9-25), multiple binarization thresholds — `--oem 1 --oem 3`, multiple `--psm` modes, upsampling factors, and an explicit whitelist `ABC...xyz0123456789{}_-`. Results were cross-checked against the factory calibration strip (`strip.txt`) and my per-bitplane dumps, and any digit that disagreed across threshold variants was verifed manually against the raw PNG.

## Flag

`H7CTF{f0757a7d-06ae-412e-97dc-5d1a0bb6a812}` — visible directly in `panel.rom` for this board instance once the bitplane reconstruction and per-plane offsets/inversions are reversed. (Per `README.txt`, every instance serves a different board, so the flag is per-instance; the `afterglow.zip` handout contains the same panel.rom for the challenge author's instance.)

## Root Cause

The "bring it into service" gate never actually displays the real flag through the emulator — it just halts. The flag is fully recoverable statically because every obfuscation input (seed, bit permutation, plane offsets, inversion, LCG parameters) is derived from constants baked into the ROM's own data section rather than from any external state.
