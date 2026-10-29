---
title: "loom — Reversible Cellular Automaton Crackme"
description: "loom is a stripped x86-64 ELF that reads exactly 32 bytes from stdin, runs them through roughly a million generations of a second-order (reversible) cellular automaton, and compares the…"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/loom.md"
---

**Flag:** `isfcr{2nd_0rd3r_r3v_c3ll_aut0m8}`

## Overview

`loom` is a stripped x86-64 ELF that reads exactly 32 bytes from stdin,
runs them through roughly a million generations of a **second-order
(reversible) cellular automaton**, and compares the output of that
simulation against two hard-coded targets. If both match, it prints the
success message and tells you the flag is literally the input you gave
it.

```
$ file loom
loom: ELF 64-bit LSB executable, x86-64, ... stripped

$ strings loom
need exactly %d bytes of input
CORRECT -- the flag is the input you just gave me.
nope.
```

## Reverse engineering the logic

### Input handling

```c
fread(buf, 1, 0x20, stdin);   // must read exactly 32 bytes
if (n != 0x20) { fprintf(stderr, "need exactly %d bytes of input\n", 1); return 2; }
```

### Unpacking into a bit array

The 32-byte input is expanded into a 256-element byte array where each
element holds a single bit (0 or 1), LSB-first:

```
bit[i] = (input[i >> 3] >> (i & 7)) & 1      for i = 0 .. 255
```

This is equivalent to just treating the 32-byte buffer as a 256-bit
little-endian integer — bit `i` of that integer *is* `bit[i]`.

### The automaton step

Three rotating buffers are used: `r8` = generation *t−1*, `r9` =
generation *t* (“current”), `rdi` = the generation being written
(*t+1*). For each cell index `i` (0..255, indices taken **mod 256**,
i.e. the ring wraps around):

```
N1 = gen_t[i-2]
N2 = gen_t[i-1]
C  = gen_t[i]
N3 = gen_t[i+1]
N4 = gen_t[i+2]

f  = (C & N1) ^ N2 ^ N3 ^ (N2 & N3) ^ (C & N4) ^ (N1 & N4)

gen_{t+1}[i] = f ^ gen_{t-1}[i]
```

Buffers are rotated and this is repeated `r10d = 0xf4243` = **1,000,003**
times. This XOR-with-two-generations-back structure is the classic
**second-order / reversible CA** trick (same family as the "Fredkin"
or "Margolus" reversible automata): because the new cell only depends
on `f(gen_t)` XORed with `gen_{t-1}`, the whole thing is trivially
invertible:

```
gen_{t+1} = f(gen_t) ^ gen_{t-1}      (forward)
gen_{t-1} = f(gen_t) ^ gen_{t+1}      (backward — same f!)
```

### The checks

After the loop (let `N = 1,000,003`):

* `pack(gen_N)` is compared (via four 64-bit XOR/OR checks) against a
  hard-coded 32-byte constant found in `.rodata` at `0x401320`.
* `pack(gen_{N-1})` is `memcmp`'d against a second hard-coded 32-byte
  constant at `0x401340` — if this matches, the program prints
  `CORRECT -- the flag is the input you just gave me.`

So the challenge boils down to: **find the 32-byte `gen_0` (the
input) such that after 1,000,003 forward steps, `gen_N` and
`gen_{N-1}` equal the two known constants.**

## Solving it — run the automaton backward

Since the recurrence is self-inverting, there's no need to search or
brute-force anything. We already *know* `gen_{N-1}` (bytes at
`0x401340`) and `gen_N` (bytes at `0x401320`) directly from the
binary. Running the backward recurrence `N − 1 = 1,000,002` times from
that pair lands exactly on `gen_0` — the required input.

Representing each 256-bit generation as a single Python big integer
(instead of an array of 256 ints) lets the whole backward pass run in
about a second, using 256-bit circular rotations for the neighbor
lookups:

```python
MASK = (1 << 256) - 1
def rol(x, k): return ((x << k) | (x >> (256 - k))) & MASK
def ror(x, k): return ((x >> k) | (x << (256 - k))) & MASK

X = int.from_bytes(flag_bytes, 'little')   # gen_{N-1}, from 0x401340
Y = int.from_bytes(t1_bytes,   'little')   # gen_N,     from 0x401320

for _ in range(N - 1):
    N1, N2, N3, N4 = rol(X,2), rol(X,1), ror(X,1), ror(X,2)
    f = (X & N1) ^ N2 ^ N3 ^ (N2 & N3) ^ (X & N4) ^ (N1 & N4)
    X, Y = (f ^ Y) & MASK, X        # X <- gen_{t-1}, Y <- old gen_t

flag_input = X.to_bytes(32, 'little')
```

This produced:

```
69736663727b326e645f30726433725f7233765f63336c6c5f617574306d387d
→ b'isfcr{2nd_0rd3r_r3v_c3ll_aut0m8}'
```

## Verification

1. **Forward simulation:** starting from that candidate input with
   `gen_{-1} = 0`, running the *original* forward recurrence for the
   full 1,000,003 steps reproduces both hard-coded targets exactly.
2. **Ground truth:** feeding the bytes to the actual binary:

```
$ printf 'isfcr{2nd_0rd3r_r3v_c3ll_aut0m8}' | ./loom
CORRECT -- the flag is the input you just gave me.
```

## Flag

```
isfcr{2nd_0rd3r_r3v_c3ll_aut0m8}
```
