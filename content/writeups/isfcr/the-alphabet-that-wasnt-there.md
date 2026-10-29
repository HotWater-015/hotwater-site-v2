---
title: "The Alphabet That Wasn't There"
description: "The recovered evidence passes the AES-GCM authentication check supplied in the challenge."
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/the-alphabet-that-wasnt-there.md"
---

## Result

```text
isfcr{d7ef3d5dd98bd325c3b50114}
```

The recovered evidence passes the AES-GCM authentication check supplied in the challenge.

## Extracting the PDFs

The handout contains two files:

```sh
unzip 'handout (5).zip'
```

They are extracted into `the-alphabet-that-wasnt-there/`. The symbols are drawn by Type 3 fonts: their glyph programs paint rectangles rather than using a conventional alphabet. Text bytes and glyph names therefore cannot be treated as the decoded characters.

The damaged file also contains compressed objects, nested Form XObjects, clipping, invisible text, and stale object data. A small parser in [inspect_pdf.py](inspect_pdf.py) scans the surviving indirect objects, decompresses `/FlateDecode` streams, and expands `/ObjStm` objects using their `/First` offsets and object-number/offset headers. This recovers the dictionaries and content streams without relying on an intact PDF trailer.

## Selecting the requested document

There are two catalog objects in `damaged.pdf`:

| Catalog object | `/CaseID` |
| --- | --- |
| `1 0 R` | `9697624543591457a15dc6d9a4797c45` |
| `217 0 R` | `c29ae09064867052e3434981c8dd13e1` |

The requested catalog is object 1, recovered from object stream 226. Its page tree points through object 2 to page object 3. That page has:

```text
/Rotate 90
/Contents [112 0 R 113 0 R]
```

The page inherits its resources from object 2. Its top-level Form XObjects are objects 39, 63, 87, and 108; those contain further nested forms.

The challenge specifies the page's **default user space**, so the viewer's `/Rotate 90` must not be applied to the reading order. The relevant coordinates come from the page content and nested form transformations.

## Recovering the reference alphabet

The reference page draws 16 symbols on one baseline. Its content stream, object 21, supplies these character codes from left to right:

```text
37 4e 48 c1 cd f6 e0 4c ea 67 ec 5e 52 45 50 61
```

The challenge assigns them the following meanings:

| Reference character code | Hex digit |
| --- | --- |
| `37` | `8` |
| `4e` | `b` |
| `48` | `d` |
| `c1` | `4` |
| `cd` | `e` |
| `f6` | `2` |
| `e0` | `5` |
| `4c` | `7` |
| `ea` | `f` |
| `67` | `9` |
| `ec` | `1` |
| `5e` | `6` |
| `52` | `c` |
| `45` | `3` |
| `50` | `0` |
| `61` | `a` |

These codes are specific to the reference font. To identify symbols in the damaged file, the solver follows each font's `/Encoding /Differences` to its glyph name, then follows `/CharProcs` to the drawing program. PDF name escapes such as `#32` are decoded, and later entries in `/Differences` override earlier assignments to the same character code.

Each glyph program describes a union of filled rectangles. The solver normalizes negative rectangle dimensions, removes translation, divides coordinates by the smallest rectangle dimension, and constructs a binary occupancy array. It then chooses a canonical representation from the four quarter-turn rotations of that array.

This removes the differences in glyph scale and orientation while preserving the symbol's shape. All 16 reference shapes are distinct, and every encountered glyph shape matches one of them.

## Interpreting the grid

[solve.py](solve.py) implements the subset of PDF graphics and text operations used by these files. It tracks:

- Graphics-state saves and restores (`q`, `Q`), `cm` transformations, and Form `/Matrix` transformations.
- Text matrices and line movement (`Tm`, `Td`, `TD`, `T*`, and the quote operators).
- Font selection, size, horizontal scaling, character spacing, word spacing, text rise, and rendering mode.
- Text strings and `TJ` arrays, including octal string escapes and numeric positioning adjustments.
- Explicit clipping rectangles and transformed Form `/BBox` clipping.

Invisible text with `3 Tr` still advances the text position but does not contribute a visible symbol. For a character, the horizontal advance is computed as:

```text
(font_width * FontMatrix[0,0] * font_size
 + character_spacing
 + word_spacing_if_space) * horizontal_scale
```

A numeric `TJ` adjustment contributes:

```text
-adjustment / 1000 * font_size * horizontal_scale
```

The solver records the baseline position after composing the current graphics and text matrices. Its clipping checks are tailored to the rectangular clips and quarter-turn transforms in this challenge; it is not a general-purpose PDF renderer.

### The stale overlay trap

Object 107 contains an `/Ov` resource pointing at object 10 and ends by invoking `/Ov Do`. The surviving bytes of object 10 contain white rectangles followed by replacement glyphs. Executing those bytes produces a plausible but incorrect grid.

However, cross-reference stream 224 updates object 10 to a **free entry**. Its `/W` is `[1 4 2]`, and the entry for object 10 is:

```text
Raw bytes: 00 00000000 0001
Fields:    [0, 0, 1]
```

The first field, `0`, marks the object as free. Its old stream bytes remain in the damaged file, but the resource reference must not resolve to that stale stream. The solver explicitly skips object 10 based on this recovered cross-reference evidence.

After excluding that overlay, invisible text, and clipped glyphs, the solver retains exactly **256 symbols**.

## Reading order and evidence

The grid baselines run from approximately `y = 392` down to `y = 152`, separated by 16 units. Columns run from approximately `x = -8` to `x = 232`, also separated by 16 units. Rounded positioning adjustments introduce tiny coordinate differences, so the solver sorts symbols by descending baseline y, partitions them into 16 rows of 16, and sorts each row by ascending baseline x.

The decoded grid is:

```text
e7463684552dfb02
7076afdf977a1a94
bb89d9112b4ace4b
c9207e7c18b3fbf5
5526ba3a9e437c7d
6c4a3ef3bf7e0dcd
4694f7288fc5d4c1
89be389bbbaadd51
4031b50de7eba382
0e5230915ddfa4bc
c793d2b7aa7c880f
1900cd60b1caedd9
507009b6658d86d3
ce052d46f8f4c16d
13c9e5e6302733f3
906ff5e24f690ab6
```

The row breaks above are for readability. The second evidence field is their concatenation, without whitespace. The exact serialized evidence is saved in [evidence.json](evidence.json):

```json
["9697624543591457a15dc6d9a4797c45","e7463684552dfb027076afdf977a1a94bb89d9112b4ace4bc9207e7c18b3fbf55526ba3a9e437c7d6c4a3ef3bf7e0dcd4694f7288fc5d4c189be389bbbaadd514031b50de7eba3820e5230915ddfa4bcc793d2b7aa7c880f1900cd60b1caedd9507009b6658d86d3ce052d46f8f4c16d13c9e5e6302733f3906ff5e24f690ab6"]
```

## Decrypting the flag

The evidence is serialized using the challenge's compact JSON settings, then passed to scrypt. The resulting 32-byte key decrypts the supplied AES-GCM ciphertext:

```python
import hashlib
import json
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

evidence = json.loads(Path("evidence.json").read_text())
E = json.dumps(
    evidence, ensure_ascii=True, separators=(",", ":")
).encode("ascii")

key = hashlib.scrypt(
    b"isfcr-forensics\x00" + E,
    salt=bytes.fromhex("8a251a8101ffa67ed383a445a05e77f2"),
    n=131072, r=8, p=1, maxmem=2**28, dklen=32,
)

flag = AESGCM(key).decrypt(
    bytes.fromhex("cf5d90d20b821db4c5bf1b73"),
    bytes.fromhex(
        "27b4469da3cc30f3ec487d60be3053aa2"
        "d5aa00c9f4da69fe54e7d51da8463883b"
        "4aa1b0a10a69c45c4e974171133f"
    ),
    b"the-alphabet-that-wasnt-there",
)
print(flag.decode("ascii"))
```

AES-GCM authenticates successfully and returns:

```text
isfcr{d7ef3d5dd98bd325c3b50114}
```

## Reproduction

The full recovery requires Python with `numpy` and `cryptography`. Run from the directory containing the extracted handout and the two solver scripts:

```sh
python solve.py
```

The solver writes `draws.json` with glyph coordinates and visibility decisions, writes `evidence.json`, and prints the grid and authenticated flag.
