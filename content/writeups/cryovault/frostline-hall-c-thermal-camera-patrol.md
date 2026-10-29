---
title: "Frostline Hall C — Thermal Camera Patrol"
description: "We are given two lossless recordings of a thermal camera patrol:"
event: "cryovault"
category: "misc"
categoryLabel: "Misc"
tags: ["ISFCR CryoVault Finals 2026","misc"]
date: "2026-10-26"
teammate: false
source: "cryovault/misc/1/writeup.md"
---

## Challenge

We are given two lossless recordings of a thermal camera patrol:

- `hallc_cam07_patrol.mkv` — 384×216 grayscale, 30 fps, 40.07 s
- `hallc_cam07_patrol_halfspeed.mkv` — the same frame sequence played at 15 fps

The footage is almost entirely dense sensor speckle. The task is to recover the
three rack-tag characters shown at each of the four presets, then concatenate
them in patrol order and left-to-right order:

```text
isfcr{...}
```

The half-speed copy is only a playback aid; it contains exactly the same frames
as the normal-speed copy.

## 1. Inspecting the frames

The video decodes to 1202 frames. The top 30 rows contain a clean camera overlay:

```text
FROSTLINE  HALL C  CAM 07  PRESET 1   2026-10-19 02:13:40.00
```

Below the overlay, every pixel is one of exactly two values:

```text
70   (dark speckle)
186  (light speckle)
```

So each frame is a binary random pattern. The mean is ~128 and the standard
deviation is ~58, i.e. a balanced 50/50 binary image.

The preset overlay changes at these frame boundaries:

| Preset | Frames |
|---|---:|
| 1 | 0–263 |
| 2 | 264–521 |
| 3 | 522–839 |
| 4 | 840–1201 |

The presets are not equal length, so segmenting naively into 300-frame blocks
mixes adjacent presets and makes the tags harder to read.

## 2. The speckle is moving

A plain temporal average over a preset does not show the tags. The mean image
only contains streaks in the direction of motion.

Cross-correlating adjacent frames reveals why. For frames `t` and `t+1`, the
correlation has a strong peak at a non-zero integer shift, typically around
0.76–0.80:

- Preset 1: mostly horizontal motion
- Preset 2: mostly vertical motion
- Preset 3: mostly horizontal motion
- Preset 4: a changing/mixed motion direction

In other words, the background speckle is being shifted from frame to frame.
Averaging without compensation smears it into streaks.

The correlation between frames also decays with temporal lag. The speckle is
not a permanently fixed scene; it is a moving random texture whose pixels are
gradually replaced.

## 3. Tags are regions that decorrelate

The important observation is what happens after motion compensation.

For each pair of adjacent frames:

1. Estimate the integer frame-to-frame shift `(dy, dx)` by cross-correlation.
2. Shift `frame[t+1]` back into `frame[t]`'s coordinate system.
3. Compute the fraction of pixels that still differ.

Over the background, the shift aligns most of the speckle, so only about 11–12%
of pixels differ. Inside the rack tags, however, the pixels are re-randomized
every frame, so about 50% of them differ.

Averaging this “change fraction” over many frame pairs produces a clean image
of the tags.

Conceptually:

```python
# for each adjacent frame pair
shift = estimate_shift(frame[t], frame[t+1])
aligned_next = shift_frame(frame[t+1], shift)
difference = (frame[t] != aligned_next)
accumulate(difference)
```

Displaying the accumulated difference map with contrast stretching reveals the
glyphs directly.

## 4. Extracting the glyphs

The tag characters use the same 5×7 bitmap font as the camera overlay, but
scaled up by roughly a factor of 9. After thresholding the change-fraction map,
each glyph occupies a component about 46–51 pixels wide and 63 pixels high.

Downsampling each component to its native 5×7 grid gives:

### Preset 1

```text
F          T          7
#####      #####      #####
#....      ..#..      ....#
#....      ..#..      ...#.
####.      ..#..      ..#..
#....      ..#..      .#...
#....      ..#..      .#...
#....      ..#..      .#...
```

`FT7`

### Preset 2

```text
U          T          F
#...#      #####      #####
#...#      ..#..      #....
#...#      ..#..      #....
#...#      ..#..      ####.
#...#      ..#..      #....
#...#      ..#..      #....
.###.      ..#..      #....
```

`UTF`

### Preset 3

```text
E          T          9
#####      #####      .###.
#....      ..#..      #...#
#....      ..#..      #...#
####.      ..#..      .####
#....      ..#..      ....#
#....      ..#..      ...#.
#####      ..#..      .##..
```

`ET9`

### Preset 4

```text
N          F          L
#...#      #####      #....
#...#      #....      #....
##..#      #....      #....
#.#.#      ####.      #....
#..##      #....      #....
#...#      #....      #....
#...#      #....      #####
```

`NFL`

## 5. Flag

Reading presets 1 → 4 and each tag left → right:

```text
FT7 UTF ET9 NFL
```

Lowercased and placed inside the flag format:

```text
isfcr{ft7utfet9nfl}
```
