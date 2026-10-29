---
title: "Ouroboros — Reverse Engineering"
description: "We are given a single executable named chall and must find the 32-byte input that causes it to accept our answer. Unlike a simple strcmp checker, this program transforms the input before…"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/ouroboros.md"
---

**Challenge:** ouroboros  
**Author:** NotKnox  
**Points:** 50  
**Category:** Reverse Engineering  
**Artifact:** `chall` (stripped Linux x86-64 ELF)  
**Flag:** `isfcr{c0d3_th4t_3ats_1ts_t41l!!}`  
**Status:** Verified locally

## Challenge Description

> Hand it 32 bytes. It will tell you `nope.`

## Challenge Overview

We are given a single executable named `chall` and must find the 32-byte input that causes it to accept our answer. Unlike a simple `strcmp` checker, this program transforms the input before comparing it with embedded reference bytes.

## 1. Initial Reconnaissance

Inspect the program:

```bash
file chall
strings -a chall
objdump -d -M intel chall > disassembly.txt
```

`file` identifies a **stripped, dynamically linked, 64-bit x86-64 ELF**. The useful strings include:

```text
need exactly %d bytes of input
nope.
CORRECT
```

The absence of the full flag in printable strings suggests we need to reverse the validation routine instead of extracting a plaintext string.

## 2. Understand the Input Check

The code around `0x400400` calls `fread` with a count of `0x20` and checks its return value:

```asm
mov edx, 0x20
mov esi, 0x1
call fread@plt
cmp rax, 0x20
jne ...
```

Thus, the checker expects **exactly 32 bytes to be read**. Supplying too few bytes follows the error path.

Further down, the validation routine loops through **four 64-bit chunks**. It performs integer arithmetic, XORs, shifts, and multiplications, including constants such as `0x9e3779b97f4a7c15` and `0xbf58476d1ce4e5b9`. Those are strong signs of 64-bit bit-mixing, rather than a straightforward character-by-character comparison.

The program eventually compares 32 transformed bytes against an embedded target:

```asm
mov edx, 0x20
mov esi, 0x401380
lea rdi, [rsp+0x40]
call memcmp@plt
```

A zero return value from `memcmp` leads to `CORRECT`; otherwise it prints `nope.`.

## 3. Reversing the Validation

The important observation is that the checker is a deterministic transformation of the input, not a cryptographic hash check requiring a preimage search.

The recovery approach is:

1. Read the 32-byte target data from the binary and identify the four 8-byte input blocks.
2. Trace the operations applied to each 64-bit word in the disassembly, including any state passed from one block to the next.
3. Undo reversible operations in reverse order: reverse XOR/shift mixing, multiply by modular inverses modulo `2^64` for odd multipliers, and reverse the remaining XORs/additions in their actual order.
4. Account for the inter-block state so that each candidate block matches the transform expected by the next block.
5. Reassemble the recovered bytes and pass them to the original executable.

For reference, an odd 64-bit multiplier `m` has an inverse modulo `2^64`:

```python
MASK = (1 << 64) - 1

def undo_multiply(y, m):
    return (y * pow(m, -1, 1 << 64)) & MASK


def undo_xor_right(y, shift):
    x = y
    s = shift
    while s < 64:
        x ^= x >> s
        s *= 2
    return x & MASK
```

These helpers illustrate the standard inverse operations; the exact order must follow the disassembled routine. In particular, each stage must be handled with its actual state and constants.

The recovered 32-byte input was:

```text
isfcr{c0d3_th4t_3ats_1ts_t41l!!}
```

## 4. Verify the Flag

The definitive check is to run the original executable with the candidate. Since the file may not have executable permission after downloading, set that first:

```bash
chmod +x chall
printf '%s' 'isfcr{c0d3_th4t_3ats_1ts_t41l!!}' | ./chall
echo $?
```

Observed output:

```text
CORRECT
0
```

The zero exit status and `CORRECT` message confirm that the recovered flag satisfies the original binary's verification logic.

## Final Flag

```text
isfcr{c0d3_th4t_3ats_1ts_t41l!!}
```

## Key Takeaway

Stripping symbols and hiding the reference behind 64-bit mixing makes a checker harder to read, but doesn't make a reversible transform one-way. Locate the input boundary, follow the validation dataflow to the final comparison, and invert the operations or otherwise derive a candidate. Always validate the recovered answer against the unmodified challenge binary.
