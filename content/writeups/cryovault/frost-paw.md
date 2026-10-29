---
title: "Frost Paw"
description: "The unit starts each submitted job at a 64-bit register value x. After the job, it advances its ratchet by running a secret, six-line job on the same starting value. If that secret job…"
event: "cryovault"
category: "misc"
categoryLabel: "Misc"
tags: ["ISFCR CryoVault Finals 2026","misc"]
date: "2026-10-26"
teammate: false
source: "cryovault/misc/frost/writeup.md"
---

## Goal

The unit starts each submitted job at a 64-bit register value `x`. After the job, it advances its ratchet by running a secret, six-line job on **the same starting value**. If that secret job is `F`, the next submitted job starts at `F(x)`. A `manifest` line releases the flag only when its register equals `F(x)`.

The unit address is private and is deliberately omitted here. Units expire, and their line parameters and secret job change at each 120-second cut.

## Recovering the line language

The important observation is that `trace` is an instruction, not a passive read. It rotates the register and then reports its low 32 bits. A job with many consecutive `trace` lines shows overlapping bit windows of the same 64-bit value. Searching the 64 possible rotation amounts for one that makes all windows consistent reveals the `trace` rotation for the current cut.

Probing other lines between runs of `trace` showed that each line first rotates right by an amount determined by its *text length*. Let

```text
R(s) = (base + stride × (len(s) − 3)) mod 64
z    = ROR64(x, R(s))
```

The remaining effect depends on the line:

| Line | New register |
| --- | --- |
| `c/k` | `ROR64(x, (R(s) + k) mod 64)` |
| `g/k` | `(z − k) mod 2^64` |
| `u/k` | `z XOR (z >> k)` |
| `y/` | `z XOR (z >> 32)` |
| `trace`, `manifest` | `z` |

The right shifts in the XOR lines are logical shifts. The `trace` and `manifest` lines also emit their respective notes after changing the register. Leading zeros change `len(s)` while preserving the numeric operand: `u/9`, `u/09`, and `u/009` are different transformations.

For each cut, the solver finds the `trace` rotation from thirteen trace notes. It then measures the rotations of `c/0` and `c/10` by placing each between six traces on either side. Those two measurements give `base` and `stride`; the other line rules were checked against full-register input/output probes.

## Recovering a ratchet input/output pair

Once the rotations are known, each trace note identifies 32 bits of a job's starting register. The solver chooses a short probe whose trace windows cover all 64 bit positions. Consecutive copies of that probe reveal `x`, `F(x)`, and `F(F(x))`, because the ratchet always operates on the job's starting value.

In the successful cut, the parameters were:

```text
trace left rotation = 21
base = 13
stride = 47
probe = trace / trace / trace

x       = 325fd19a34e55077
F(x)    = bbc6c8b02478c624
F(F(x)) = 1605173aa9abd22c
```

Three traces sufficed in this cut to expose all 64 bits. Other cuts required a `c` line between traces to move the observation window.

## Finding the six-line job

Every transformation above is invertible. A rotation can be reversed with the opposite rotation, subtraction with addition, and `z XOR (z >> k)` by applying right-shift XORs at distances `k`, `2k`, `4k`, and so on.

The search enumerated all legal operand spellings of one to three digits. Equivalent `c` rotations were deduplicated, leaving 206 distinct candidate operations. A meet-in-the-middle search stored the states reached by every three-line prefix from `x`, then walked three inverse lines backward from `F(x)` and looked for a matching middle state. It found:

```text
u/3
y/
u/022
u/8
u/09
g/04
```

Applying those six lines to the second measured state produced `F(F(x))`, independently confirming the recovered ratchet transformation within that cut.

## Opening the manifest

Appending `manifest` immediately to those six lines returned `locked`. The check occurs after the `manifest` line's own rotation. In this cut, `manifest` rotated right by 56 bits. The line `c/12` rotated right by 8 bits, canceling that rotation. The successful job was therefore:

```text
u/3
y/
u/022
u/8
u/09
g/04
c/12
manifest
```

The response contained:

```text
manifest isfcr{frost_pawl_6842eb724c40da}
```

The implementation is in [solve.py](solve.py) and [mitm.cpp](mitm.cpp). The former handles cut calibration, state probes, and the final request; the latter performs the meet-in-the-middle search.
