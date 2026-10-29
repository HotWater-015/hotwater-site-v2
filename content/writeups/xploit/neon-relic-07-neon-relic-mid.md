---
title: "Neon Relic (07_neon_relic.mid)"
description: "The MIDI file is a container. A ZIP is appended after the MIDI tracks, and inside it is a PNG whose top three pixel rows hide the flag as a 1-bit-per-pixel bitmap. The other files are…"
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit/steg/neon-relic/hi/writeup.md"
---

**Category:** Forensics / Stego
**Flag:** `XploitXβ{n30n_r3l1c|_1n_th3_fr4m3}`

## TL;DR

The MIDI file is a container. A ZIP is appended after the MIDI tracks, and inside it is a PNG whose top three pixel rows hide the flag as a 1-bit-per-pixel bitmap. The other files are decoys and a hint.

## 1. Recon

```
$ file 07_neon_relic.mid
Standard MIDI data (format 1) using 2 tracks at 1/960
$ stat -c %s 07_neon_relic.mid
533602
```

A MIDI file with a short arpeggio shouldn't be 533 KB. `strings` shows `--MIDI_PAYLOAD_BOUNDARY--`, `relic.png` and `neon.wav` after the track data (marker at offset 276, `PK\x03\x04` right after it).

## 2. Carve the ZIP

```python
d = open('07_neon_relic.mid','rb').read()
open('p.zip','wb').write(d[d.find(b'PK\x03\x04'):])
```

`unzip p.zip` (stored, no password) gives:

| File | Notes |
|---|---|
| `relic.png` | 480x320, dark background with scattered magenta dots |
| `neon.wav` | 6 s, 44.1 kHz mono |
| `frag.txt` | Decoys (see below) |

`frag.txt`:

```
KEY_PIECE=_3ncrypt3d_3ch0
XploitXβ{sysex_3mpty}
XploitXβ{t3mp0_1s_th3_k3y}
```

None of these is the real flag. Nothing in the MIDI sysex or tempo data needed decrypting.

## 3. The PNG

- Plain LSB extraction on R/G/B returns only gradient patterns, no text.
- The image has only 12 unique colours. The dots are noise.
- Everything that differs from the exact background `(15,5,30)` outside the dots lies in the **top 3 rows**, and only on **even x columns**. Odd columns are always background.

So each even column gives 3 bits (row 0, 1, 2), for 3 x 240 = 720 bits.

## 4. Decode

Read the 3x240 grid row-major, then invert (pixel differs from background = 0, equals background = 1), then pack into bytes:

```python
import numpy as np
from PIL import Image

im = np.array(Image.open('relic.png')).astype(int)
bg = np.array([15,5,30])
m = (im[:3] != bg).any(2).astype(int)[:, 0::2]      # 3 x 240
bits = ''.join('1' if v == 0 else '0' for v in m.flatten())
data = bytes(int(bits[i:i+8], 2) for i in range(0, len(bits)//8*8, 8))
print(data.decode('utf-8', 'replace'))
```

Output:

```
\x00\x00\x00 D XploitXβ{n30n_r3l1c|_1n_th3_fr4m3}|FAKE=XploitXβ{m1d1_n0t3s_cl34n} \xff...
```

The `D` is `0x44` = 68, a length byte. The next 68 bytes are exactly `real|FAKE=fake`, and the rest is `0xff` padding. The author labels the second string `FAKE`, so the first one is the real flag.

## 5. The audio (confirmation)

The spectrogram of `neon.wav` shows on/off keying of a ~1.7 kHz tone from about 1.8 s to 5.2 s. Band-passing at 1701 Hz, taking the envelope and thresholding gives dits of ~50 ms and dahs of ~150 ms:

```
-. . --- -. - .-. . .-.. .. -.-.  ->  NEON?RELIC
```

(The stray `T` is where a word gap would go.) It matches `n30n_r3l1c` in the flag, so it works as a hint and sanity check rather than a separate puzzle.

## Flag

```
XploitXβ{n30n_r3l1c|_1n_th3_fr4m3}
```

**Caveat:** the `|` inside the braces is unusual. It is present in the decoded data and covered by the 68-byte length field, so it is reported as found. If the platform rejects the flag, try `_` in its place.

## Takeaways

- Check file size against expected content, since trailing data after a format's end is common.
- Carve with magic bytes (`PK\x03\x04`) rather than trusting the container format.
- Decoy flags are common. A length-prefixed `real|FAKE=fake` layout tells you which to submit.
