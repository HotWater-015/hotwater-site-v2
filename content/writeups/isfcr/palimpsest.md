---
title: "Palimpsest — Restoration Press 04"
description: "Running the binary with ? prints the archive catalogue. The live prompt also prints all the surviving job cards:"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/palimpsest.md"
---

**Flag:** `isfcr{p4p3r_r3m3mb3rs_wh4t_1nk_f0rg3ts}`

**Binary:** `palimpsest` — ELF64, x86-64, statically linked, stripped.

Accepted input is a 39-byte string `isfcr{` + 32 inner bytes + `}`. The 32 inner
bytes are mapped little-endian into eight 32-bit registers, which are then run
through a 160-round bytecode VM. The binary prints
`Seal accepted. Job 04 restored.` only when the final machine state equals a
hard-coded target.

---

## 1. Recon

Running the binary with `?` prints the archive catalogue. The live prompt also
prints all the surviving job cards:

```
PALIMPSEST / Restoration Press 04
Supply the restoration seal, or ? for the archive catalogue.
>
PALIMPSEST / surviving job cards
--------------------------------
JOB 00  SELFTEST ONLY; commissioning print, no live seal.
        isfcr{th3_pr3ss_p4ss3d_1ts_s3lf_t3st_0}
JOB 02  SUPERSEDED; cancelled before the final impression.
        isfcr{0ld_1nk_n3v3r_t3lls_n3w_t4l3s_v2}
JOB 04  ACTIVE; eight registers, one sheet, many impressions.
        The press remembers the paper's position.
VERSO   .noisserpmi tsal eht ta strats noitarotseR
```

`JOB 00` and `JOB 02` are decoys (rejected as seals). The important line is the
mirrored `VERSO` entry:

```
.noisserpmi tsal eht ta strats noitarotseR   ->   "Restoration starts at the last impression."
```

Combined with the hints ("the paper moves as part of the mechanism", "a mirror
was left on the workbench"), the intended solve is a **time-reversal**: the
"last impression" is the target state, and we run the reversible VM backward to
the initial state, which *is* the seal.

---

## 2. Static analysis

The comparison loop starts at `0x1001900`. The relevant control flow:

- Input read into a 0x40-byte buffer; length must be `0x27` (39).
- Prefix/suffix checks: `input[0]=='i'`, `input[1:5]=="sfcr"`, `input[5]=='{'`,
  `input[38]=='}'`.
- Inner 32 bytes at `input[6:38]` are loaded with two `movups`/`movdqu` into the
  register file at `-0x50(%rbp)` (eight dwords).

Constants stored in `.rodata` (load base: `file_offset + 0x1000000`):

| Offset | Value | Meaning |
|--------|-------|---------|
| `0x39c` | `0xa0` | round count = 160 |
| `0x3a0` | `0x6d2b79f5` | `r9` seed |
| `0x3a4` | `0x3` | `r15` seed |
| `0x120` | `e8ee0984 00c1e0d9 cee2bffa cda90206` | target `state[4..7]` |
| `0x130` | `e74d487f 3d01bcd0 cd6b620a d803ecbd` | target `state[0..3]` |

The exit path checks three things (`0x1001dc9`):

```
cmp  $1, r15
add  esi, ecx            ; esi = 160 (loop counter)
cmp  $0xf7f77ddb, ecx    ; checksum, so ecx_159 = 0xf7f77ddb - 160 = 0xf7f77d3b
pcmpeqd ... state vs targets
```

The bytecode program is 160 × 8-byte instructions in `0x3d0`..`0x8d0`.

---

## 3. VM specification

For round `k` (`rdx = 8k`), instruction bytes `b0..b7`, and `H = r9_k`:

```
A1  = rol(H + b0 + rdx + 0x9e3779b9, 5) ^ 0xa5a5f00d
e0  = (A1 >> 24) ^ b1
A2  = rol(A1 + b1 + rdx + 0x9e3779ba, 5) ^ 0xa5a5f00d
e1  = (A2 >> 24) ^ b2
A3  = rol(A2 + b2 + rdx + 0x9e3779bb, 5) ^ 0xa5a5f00d
ecx = (A3 >> 24) ^ b3
A4  = rol(A3 + b3 + rdx + 0x9e3779bc, 5) ^ 0xa5a5f00d
r11 = (A4 >> 24) ^ b4
A5  = rol(A4 + b4 + rdx + 0x9e3779bd, 5) ^ 0xa5a5f00d
A6  = rol(A5 + b5 + rdx + 0x9e3779be, 5) ^ 0xa5a5f00d
A7  = rol(A6 + b6 + rdx + 0x9e3779bf, 5) ^ 0xa5a5f00d

VAL    = ((b7^(A7>>24))<<24) | ((b6^(A6>>24))<<16) | ((b5^(A5>>24))<<8) | r11
opcode = ((H >> 24) ^ b0) & 0xff
```

Register selection (uses the **pre-op** `r15`):

```
regA = (e0 + r15_k) & 7
regB = (e1 + r15_k) & 7
```

Validity gates (any failure prints `Seal rejected.`):

```
e0 <= 7
e1 <= 7
1 <= ecx <= 0x1f
opcode in {0x13, 0x27, 0x39, 0x4d, 0x62, 0x78, 0x8b, 0xa6}
opcode == 0x4d  =>  r11 is odd
opcode in {0x62,0x78,0x8b} => regA != regB
```

Operations:

| opcode | meaning |
|--------|---------|
| `0x13` | `state[regA] ^= VAL` |
| `0x27` | `state[regA] += VAL` |
| `0x39` | `state[regA] = rol(state[regA], ecx)` |
| `0x4d` | `state[regA] *= VAL` (VAL odd → invertible) |
| `0x62` | `state[regA] += rol(state[regB], ecx)` |
| `0x78` | `state[regA] ^= rol(state[regB], ecx)` |
| `0x8b` | swap `state[regA]`, `state[regB]` — **`r15` unchanged** |
| `0xa6` | `r15 = (r15 + r11) & 7` — no state change |

Tail (uses the **post-op** `r15`, written `r15_post`):

```
t        = rol(rdx + A7 + b7 + 0x9e3779c0, 5)
eax      = (r15_post + k) & 7
edi2     = (r15_post + k + 3) & 7
ecx_tail = rol(t ^ S[eax] ^ rol(S[edi2], 11) ^ 0xa5a5f00d, 7)
r9_next  = k + ecx_tail + 0x7f4a7c15
```

Note `A7` is mixed with `b7` here — the disassembly restores `r14` to `b7` on
every opcode path before `add %r14d,%edi`.

### The critical bug found during analysis

The first attempt modelled `r15` as a full byte and assumed:

- `0x8b` sets `r15 = b5`
- `0xa6` sets `r15 = (b5 + r11) & 7`

Re-reading `0x1001bfa`–`0x1001d74` shows this is wrong. The old `r15` is saved to
`r8`, then `r15` is temporarily set to `b5` only so it can be folded into `VAL`;
before the tail, **every** opcode path restores `r15 = r8` except `0xa6`. So:

- `0x8b` leaves `r15` **unchanged**
- `0xa6` computes `r15 = (r15 + r11) & 7` on the pre-op value

As a result `r15` is always in `0..7` (starting at `3`), and tracking it mod 8 is
exact. With the wrong model the backward chain dead-ended at `k = 149` with zero
solutions; with the corrected model it terminates immediately and is unique.

---

## 4. Backward solver

Every round operation is invertible, so run the VM backward from the target.
Since `r15` lives in `0..7`, iterate the pre-op residue `Rk_res` over eight
values; the tail uses the known post-op residue `Rnext_res`.

The chain is inverted by applying the inverse of the affine/rotate chain:

```
A6 = ror(A7 ^ 0xa5a5f00d, 5) - (b6 + rdx + 0x9e3779bf)
A5 = ror(A6 ^ 0xa5a5f00d, 5) - (b5 + rdx + 0x9e3779be)
...
A1 = ror(A2 ^ 0xa5a5f00d, 5) - (b1 + rdx + 0x9e3779ba)
H  = ror(A1 ^ 0xa5a5f00d, 5) - (b0 + rdx + 0x9e3779b9)
```

and the state operations by their inverses (`xor`, `sub`, `ror`, modular
multiply by `VAL^-1 mod 2^32`, `sub rol(...)`, `xor rol(...)`, swap).

```python
import sys, pickle
data = open('palimpsest','rb').read()
code = data[0x3d0:0x3d0+0x500]
TARGET = [0xe74d487f,0x3d01bcd0,0xcd6b620a,0xd803ecbd,
          0xe8ee0984,0x00c1e0d9,0xcee2bffa,0xcda90206]
M = 0xffffffff

def rol(x,n):
    n &= 31; return ((x<<n)|(x>>(32-n))) & M
def ror(x,n):
    n &= 31; return ((x>>n)|(x<<(32-n))) & M

ALLOWED = {0x13,0x27,0x39,0x4d,0x62,0x78,0x8b,0xa6}

def params(step, r9):
    rdx = step*8; b = list(code[rdx:rdx+8]); H = r9
    A1 = rol((H +b[0]+rdx+0x9e3779b9)&M,5) ^ 0xa5a5f00d; e0  = ((A1>>24)^b[1])&0xff
    A2 = rol((A1+b[1]+rdx+0x9e3779ba)&M,5) ^ 0xa5a5f00d; e1  = ((A2>>24)^b[2])&0xff
    A3 = rol((A2+b[2]+rdx+0x9e3779bb)&M,5) ^ 0xa5a5f00d; ecx = ((A3>>24)^b[3])&0xff
    A4 = rol((A3+b[3]+rdx+0x9e3779bc)&M,5) ^ 0xa5a5f00d; r11 = ((A4>>24)^b[4])&0xff
    A5 = rol((A4+b[4]+rdx+0x9e3779bd)&M,5) ^ 0xa5a5f00d
    A6 = rol((A5+b[5]+rdx+0x9e3779be)&M,5) ^ 0xa5a5f00d
    A7 = rol((A6+b[6]+rdx+0x9e3779bf)&M,5) ^ 0xa5a5f00d
    VAL = (((b[7]^(A7>>24))&0xff)<<24)|(((b[6]^(A6>>24))&0xff)<<16)| \
          (((b[5]^(A5>>24))&0xff)<<8)|r11
    opcode = ((H>>24)^b[0])&0xff
    return b,e0,e1,ecx,r11,VAL,opcode,A7

sols = []
def backward(k, S, Hnext, Rnext_res):
    rdx = k*8; b = list(code[rdx:rdx+8])
    for Rk_res in range(8):
        eax  = (Rnext_res + k) & 7
        edi2 = (Rnext_res + k + 3) & 7
        ecx_tail = (Hnext - k - 0x7f4a7c15) & M
        t1 = ror(ecx_tail, 7)
        t0 = t1 ^ S[eax] ^ rol(S[edi2], 0xb) ^ 0xa5a5f00d
        A7 = (ror(t0,5) - (b[7]+rdx+0x9e3779c0)) & M
        A6 = (ror(A7^0xa5a5f00d,5) - (b[6]+rdx+0x9e3779bf)) & M
        A5 = (ror(A6^0xa5a5f00d,5) - (b[5]+rdx+0x9e3779be)) & M
        A4 = (ror(A5^0xa5a5f00d,5) - (b[4]+rdx+0x9e3779bd)) & M
        A3 = (ror(A4^0xa5a5f00d,5) - (b[3]+rdx+0x9e3779bc)) & M
        A2 = (ror(A3^0xa5a5f00d,5) - (b[2]+rdx+0x9e3779bb)) & M
        A1 = (ror(A2^0xa5a5f00d,5) - (b[1]+rdx+0x9e3779ba)) & M
        H  = (ror(A1^0xa5a5f00d,5) - (b[0]+rdx+0x9e3779b9)) & M

        bb,e0,e1,ecx,r11,VAL,opcode,A7b = params(k, H)
        if A7b != A7: continue
        if e0 > 7 or e1 > 7: continue
        if not (1 <= ecx <= 0x1f): continue
        if opcode not in ALLOWED: continue
        if opcode == 0x4d and (r11 & 1) == 0: continue
        regA = (e0 + Rk_res) & 7
        regB = (e1 + Rk_res) & 7
        if opcode in (0x62,0x78,0x8b) and regA == regB: continue

        # r15 transition (always 0..7)
        g = (Rk_res + r11) & 7 if opcode == 0xa6 else Rk_res
        if g != Rnext_res: continue

        Sk = S[:]
        if   opcode == 0x13: Sk[regA] = S[regA] ^ VAL
        elif opcode == 0x27: Sk[regA] = (S[regA] - VAL) & M
        elif opcode == 0x39: Sk[regA] = ror(S[regA], ecx)
        elif opcode == 0x4d: Sk[regA] = (S[regA] * pow(VAL,-1,1<<32)) & M
        elif opcode == 0x62: Sk[regA] = (S[regA] - rol(S[regB], ecx)) & M
        elif opcode == 0x78: Sk[regA] = S[regA] ^ rol(S[regB], ecx)
        elif opcode == 0x8b: Sk[regA], Sk[regB] = S[regB], S[regA]

        if k == 0:
            if H == 0x6d2b79f5 and Rk_res == 3:
                sols.append(Sk)
        else:
            backward(k-1, Sk, H, Rk_res)

ecx_last = (0xf7f77ddb - 160) & M
r9_160   = (159 + ecx_last + 0x7f4a7c15) & M
backward(159, TARGET, r9_160, 1)
print(len(sols))
inner = b''.join((x & M).to_bytes(4,'little') for x in sols[0])
print(b'isfcr{' + inner + b'}')
```

Output:

```
1
b'isfcr{p4p3r_r3m3mb3rs_wh4t_1nk_f0rg3ts}'
```

The search is essentially linear: except for `0xa6`, the constraint
`g == Rnext_res` forces `Rk_res == Rnext_res`, so only rounds with opcode `0xa6`
branch. It explores the full 160 rounds and finds exactly one preimage.

---

## 5. Verification

A faithful forward emulator (with the corrected `r15` semantics) run on the 32
inner bytes confirms:

```
final state == TARGET
r9_160 == 0x7741f9ef
r15_160 == 1
ecx_159 + 160 == 0xf7f77ddb
```

And the real binary accepts it:

```
$ printf 'isfcr{p4p3r_r3m3mb3rs_wh4t_1nk_f0rg3ts}' | ./palimpsest
PALIMPSEST / Restoration Press 04
Supply the restoration seal, or ? for the archive catalogue.
> Seal accepted. Job 04 restored.
```

---

## 6. Flag

```
isfcr{p4p3r_r3m3mb3rs_wh4t_1nk_f0rg3ts}
```
