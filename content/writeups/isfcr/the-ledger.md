---
title: "Leger"
description: "chall is a stripped 64-bit ELF that reads exactly 16 bytes of input and prints CORRECT iff the input satisfies a very specific arithmetic condition. At a high level the check is a…"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-11"
teammate: false
source: "isfcr/writeups/the-ledger.md"
---

**Category:** Reverse Engineering
**Goal:** recover the 16-byte input that makes the binary print `CORRECT`.

## Flag

```
isfcr{lll_dense}
```

Verified:

```
$ printf 'isfcr{lll_dense}' | ./chall
CORRECT -- the flag is the input you just gave me.
```

---

## Overview

`chall` is a stripped 64-bit ELF that reads **exactly 16 bytes** of input and
prints `CORRECT` iff the input satisfies a very specific arithmetic condition.
At a high level the check is a **256-bit subset-sum (knapsack) problem** over
128 numbers: the 16 input bytes are interpreted as a 128-bit vector of choices,
each set bit selects one 256-bit weight, and the sum of all selected weights
must equal a fixed target constant. The instance is dense and the weights are
full 256-bit numbers, so the intended solve is a **lattice reduction
(LLL/BKZ)** attack, which is also where the flag text comes from (`lll_dense`).

---

## Reverse engineering

The main logic lives in `.text:0x4003c0` (function is stripped, no symbols).

### 1. Read exactly 16 bytes

```asm
4003cb:  mov    $0x10,%edx          ; size 16
4003d0:  mov    $0x1,%esi
4003d5:  lea    0x10(%rsp),%rdi     ; input buffer
4003da:  call   0x400380 <fread>
4003df:  cmp    $0x10,%rax
4003e3:  jne    0x4004e9            ; "need exactly %d bytes of input"
```

Anything other than 16 bytes prints an error and exits with status 2.

### 2. A 256-bit accumulator is zeroed

```asm
4003e9:  lea    0x20(%rsp),%r8      ; 64-byte (8 qword) accumulator
4003ee:  ...
4003f3:  mov    $0x401360,%r10d     ; pointer to the weight table
4003f9:  mov    %r8,%rdi
4003ff:  rep stos %eax,(%rdi)       ; memset(acc, 0, ...)  -> zero the 256-bit sum
```

### 3. Loop over all 128 input bits

```asm
400440:  add    $0x1,%r9d           ; bit counter i
400444:  add    $0x40,%r10          ; next weight (256 bits = 64 bytes)
400448:  cmp    $0x80,%r9d          ; i == 128 ?
40044f:  je     0x4004a9            ; done summing

400451:  mov    %r9d,%eax
400454:  sar    $0x3,%eax           ; byte index  = i / 8
400457:  movzbl 0x10(%rsp,%rax,1),%edx
40045c:  mov    %r9d,%eax
40045f:  and    $0x7,%eax           ; bit index   = i % 8
400462:  bt     %eax,%edx
400465:  jae    0x400440            ; skip if bit i is 0
```

So the input is consumed as **128 bits**: `bit_i = (input[i/8] >> (i%8)) & 1`. Only
if the bit is set is weight `i` added.

### 4. Add the selected 256-bit weight to the accumulator

```asm
400480:  mov    (%r10,%rcx,1),%rax          ; weight[i].qword[rcx]
400486:  add    (%r8,%rcx,1),%rax           ; acc.qword[rcx] += ...
40048a:  adc    $0x0,%rdx
40048e:  add    %rax,%rsi
400491:  adc    %rdx,%rdi
400494:  mov    %rsi,(%r8,%rcx,1)
400498:  add    $0x8,%rcx
40049c:  mov    %rdi,%rsi
40049f:  xor    %edi,%edi
4004a5:  cmp    $0x40,%rcx                  ; 8 qwords
4004a5:  jne    0x400480
```

This is a standard 256-bit little-endian addition using `add`/`adc` chains over
8 qwords. i.e.

```
acc = Σ_{i : bit_i(input)=1} weight[i]     (all 256-bit, LE)
```

The `weight[i]` live at `0x401360 + 64*i` (128 × 64 = 8192 bytes).

### 5. Compare with the target

```asm
4004a9:  mov    $0x40,%edx
4004ae:  mov    $0x401320,%esi      ; target (64 bytes)
4004b3:  mov    %r8,%rdi            ; accumulator
4004b6:  call   0x400390 <memcmp>
4004bb:  test   %eax,%eax
4004bd:  je     0x4004d5            ; "CORRECT ..." else "nope."
```

### Summary of the constraint

There are 128 weights `w_i` (256-bit integers, stored little-endian) and one
256-bit target `T`. We must choose a subset of the weights that sums to `T`;
the answer is communicated as 16 input bytes whose 128 bits encode the chosen
subset:

```
T  =  Σ  w_i  mod 2^256      where b_i ∈ {0,1} and input encodes the b_i
       i:b_i=1
```

The `weights` and `target` are dumped straight from `.rodata`:

| symbol | offset | size |
|--------|--------|------|
| target `T` | `0x1320` | 64 bytes (256-bit LE) |
| `weight[i]` | `0x1360 + 64*i` | 64 bytes each, **128 weights** (0x2000 bytes) |

---

## Solving the subset-sum

This is a classic **dense subset-sum / knapsack** instance. Brute forcing
`2^128` subsets is hopeless, so we use a **lattice attack**.

Following the low-weight construction (Kannan-style embedding), build a lattice
of dimension `N+1 = 129` whose short vectors encode solutions. A subset/sign
vector `s ∈ {±1}^N` with `Σ s_i·w_i = 0` gives a collision of two subsets; but
here we want `Σ b_i·w_i = T` with `b_i ∈ {0,1}`. Using the trick `b_i =
(s_i+1)/2`, we embed `T` so that zero in the last coordinate selects the exact
subset.

The lattice basis used (as in `solve_chall.sage`):

```
B_{i,i}   = 2
B_{i,N}   = 2·w_i
B_{N,i}   = -1
B_{N,N}   = -2·T
```

A combination vector `s ∈ {±1}^N` leads to a short lattice vector whose first
`N` coordinates are `±1` and whose final coordinate is `2·(Σ b_i·w_i − T)`,
which is **0** exactly when the subset sums to `T`. LLL then BKZ find those
short vectors; from the `±1` entries we read back the bits, reconstruct the 16
input bytes, and verify against the binary.

---

## The solver (`solve_chall.sage`)

```python
from sage.all import *
import subprocess

path = '/tmp/opencode/chall_part1'          # the challenge binary
blob = open(path, 'rb').read()
N = 128
weights = [Integer(int.from_bytes(blob[0x1360 + i*64:0x1360 + (i+1)*64], 'little')) for i in range(N)]
target = Integer(int.from_bytes(blob[0x1320:0x1360], 'little'))

# Kannan embedding: a correct subset produces a vector of 128 signs (+/- 1)
# and a zero in the final coordinate.
B = matrix(ZZ, N+1, N+1)
for i, w in enumerate(weights):
    B[i,i] = 2
    B[i,N] = 2*w
for i in range(N):
    B[N,i] = -1
B[N,N] = -2*target

def extract(rows):
    for v in rows:
        if v[N] != 0 or any(abs(v[j]) != 1 for j in range(N)):
            continue
        for sign in (1,-1):
            bits = [(sign*int(v[j])+1)//2 for j in range(N)]
            if sum(weights[i] for i in range(N) if bits[i]) != target:
                continue
            raw = bytes(sum(bits[8*k+b] << b for b in range(8)) for k in range(16))
            print('Input hex:', raw.hex())
            print('Input repr:', repr(raw))
            print('Verification:', subprocess.run([path],input=raw,capture_output=True).stdout.decode(errors='replace'))
            return True
    return False

print('Running LLL on 129-dimensional lattice...', flush=True)
R = B.LLL(delta=0.99)
if not extract(R.rows()):
    print('Trying BKZ with blocks 10, 20, 30...',flush=True)
    for block in (10,20,30,40):
        R = R.BKZ(block_size=block)
        if extract(R.rows()):
            break
    else:
        print('No solution found; try BKZ with larger block size')
```

LLL already returns the solution (no BKZ needed):

```
Running LLL on 129-dimensional lattice...
Input hex: 69736663727b6c6c6c5f64656e73657d
Input repr: b'isfcr{lll_dense}'
Verification: CORRECT -- the flag is the input you just gave me.
```

---

## Result

```
$ printf 'isfcr{lll_dense}' | ./chall
CORRECT -- the flag is the input you just gave me.
```

**Flag: `isfcr{lll_dense}`**
