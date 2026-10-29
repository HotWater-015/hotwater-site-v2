---
title: "Cut Me"
description: "The challenge handed over hereyougo.png, a PNG whose IHDR height field had been shrunk so most of the image was invisible in a normal viewer. Because JPEG-style truncation does not apply…"
event: "sun"
category: "forensics"
categoryLabel: "Forensics"
tags: ["SunshineCTF 2026","forensics"]
date: "2026-10-22"
teammate: false
source: "sun/forensic/cut-me/writeup.md"
---

The challenge handed over `hereyougo.png`, a PNG whose IHDR height field had been shrunk so most of the image was invisible in a normal viewer. Because JPEG-style truncation does not apply to PNGs, the compressed IDAT payload still exists in full — the fix is to recompute the real height from the decompressed scanline count and patch the header. (SunshineCTF 2026, forensics.)

## Summary

Feeding `hereyougo.png` to `file` or an image viewer shows a sliver of the picture, because the header claims a smaller `height` than the data actually encodes. The giveaway is that decompressing IDAT yields more bytes than the claimed geometry can account for. `solve.py` automates the recovery: parse IHDR, concat every IDAT chunk, decompress, derive the true height, rewrite IHDR plus its CRC, and write `recovered.png`.

## Analysis

The script first parses the IHDR chunk, which sits at a fixed offset after the 8-byte signature:

```python
width, height = struct.unpack('>II', data[16:24])
bit_depth = data[24]
color_type = data[25]
```

Then it walks chunks and concatenates every `IDAT` payload (a PNG may split the zlib stream across several chunks):

```python
while offset < len(data):
    length, = struct.unpack('>I', data[offset:offset+4])
    chunk_type = data[offset+4:offset+8]
    if chunk_type == b'IDAT':
        idat_data += data[offset+8:offset+8+length]
    offset += 12 + length
```

Times 12 accounts for each chunk's length field, type field, and trailing CRC. The real scanline count falls out of the decompressed size: each row is one filter byte plus `width * bytes_per_pixel`, where color type 6 means RGBA (4 channels) and 3 channels otherwise:

```python
bytes_per_row = 1 + width * bytes_per_pixel
true_height = len(decompressed) // bytes_per_row
```

The stdout from the run prints the original (lied-about) header, the decompressed size, and the computed true height before writing the corrected image.

## Fix

```python
data[20:24] = struct.pack('>I', true_height)
new_crc = zlib.crc32(data[12:29]) & 0xFFFFFFFF
data[29:33] = struct.pack('>I', new_crc)
```

Two subtleties: the height bytes at `data[20:24]` (width occupies 16–19), and the IHDR CRC covers only the chunk type plus 13 data bytes — offsets `12..28`, hence the `crc32(data[12:29])` slice.

## Result

Running the solver:

```bash
python solve.py
```

produces `recovered.png`. Restored at full height, the image is a screenshot of a Discord chat where the author asks for a CTF challenge idea and then simply announces the answer in plain text. The visible chat message contains the flag directly:

```text
sun{totallyoriginalchallengeidea}
```

## Flag

```text
sun{totallyoriginalchallengeidea}
```

The whole challenge is a lesson in trusting PNG chunk data over the advertised header — the pixels were never gone, only hidden behind a bad height field.
