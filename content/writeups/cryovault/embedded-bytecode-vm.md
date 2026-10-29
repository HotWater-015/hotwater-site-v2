---
title: "Embedded Bytecode VM"
description: "The .bss range 0x403040–0x403160 is suspiciously large and is filled at runtime. The important part of .text is the function at 0x4003c0, which is passed directly to __libc_start_main:"
event: "cryovault"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CryoVault Finals 2026","rev"]
date: "2026-10-26"
teammate: false
source: "cryovault/rev/1/writeup.md"
---

## Challenge

We are given a stripped 64-bit ELF:

```
$ file chall
chall: ELF 64-bit LSB executable, x86-64, ... stripped
```

The program accepts one line of input and prints either `nope` or
`correct: the flag is your input`. The input must be the flag in the format
`isfcr{...}`.

## Initial recon

The imports are small:

```
fgets, strlen, puts, memcmp, __libc_start_main
```

The `.bss` range `0x403040`–`0x403160` is suspiciously large and is filled at
runtime. The important part of `.text` is the function at `0x4003c0`, which is
passed directly to `__libc_start_main`:

```
4007f8: mov rdi,0x4003c0
4007ff: call QWORD PTR [rip+0x27d3]
```

## S-box generation

Before reading input, the loop at `0x400430` writes 256 bytes to
`0x403060`–`0x40315f`. It uses SSE instructions, but the generated table has a
very simple form. Dumping it at the end of the loop gives:

```
0d 14 1b 22 29 30 37 3e 45 4c 53 5a 61 68 6f 76
7d 84 8b 92 99 a0 a7 ae b5 bc c3 ca d1 d8 df e6
...
```

which is exactly

```python
sbox[x] = (7*x + 13) mod 256
```

This table is the substitution box used by one of the VM opcodes.

## Input handling

The main function reads at most `0x80` bytes with `fgets`, strips trailing
`\n` / `\r`, and then checks:

```
40053d: cmp rax,0x1f
400541: jne 0x4005a9    ; reject
```

At this point `rax` is the index of the last remaining character, i.e. the
length minus one. Therefore the accepted input is exactly 32 bytes long.

The first 16 bytes are copied to `[rsp+0x10]` and the next 16 bytes to
`[rsp+0x20]`; together these form a 32-byte VM state.

## The bytecode VM

The interpreter starts with `r8 = 0x401300` and `dl = 1`. Its bytecode is a
sequence of `(opcode, operand)` pairs. The dispatch table is at `0x4012a0`:

| opcode | handler | operation |
|-------:|---------|-----------|
| 0 | `0x400713` | no-op / continue |
| 1 | `0x40078f` | `state[i] ^= (i + operand) & 0xff` |
| 2 | `0x40074e` | `state[i] = (state[i] + operand + 3*i) & 0xff` |
| 3 | `0x40063b` | rotate each byte left by `operand & 7` |
| 4 | `0x400614` | `state[i] = sbox[state[i]]` |
| 5 | `0x4005bf` | apply a fixed byte permutation |
| 6 | `0x400720` | `memcmp(state, target, 32)`, then exit |

The permutation is stored at `0x401340`:

```
07 17 02 13 1f 0b 00 1c 0e 05 1a 09 11 1e 03 15
0c 19 01 12 1d 06 0f 1b 0a 16 04 14 08 18 0d 10
```

For opcode 5 the program does:

```python
tmp[perm[i]] = state[i]
state = tmp
```

The target compared at the end is the 32 bytes at `0x4012e0`:

```
12 10 77 9e 33 29 1b 00 54 fd c8 ab cc be c8 ae
57 cb 3e f0 db 09 ec 68 74 ae 29 ad 8c 7b d0 a0
```

## Bytecode

The VM bytecode at `0x401300` is:

```
01 5a   02 31   03 03   04 00   05 00
01 a7   02 6d   03 05   04 00   05 00
01 1c   02 b8   03 01   04 00   05 00
01 e3   02 4f   03 07   04 00   05 00
01 90   02 22   03 02   04 00   05 00
06 00
```

So the transformation is five identical rounds:

1. XOR with `(i + xor_operand)`
2. Add `(add_operand + 3*i)`
3. Rotate each byte left by `rol_operand`
4. Apply the S-box
5. Apply the permutation

with parameters:

```
round 1: xor 0x5a, add 0x31, rol 3
round 2: xor 0xa7, add 0x6d, rol 5
round 3: xor 0x1c, add 0xb8, rol 1
round 4: xor 0xe3, add 0x4f, rol 7
round 5: xor 0x90, add 0x22, rol 2
```

## Inverting the transformation

Every operation is bijective, so each round can be reversed:

- inverse permutation: `old[i] = new[perm[i]]`
- inverse S-box: `sbox_inv[y]`, where `sbox[x] = (7*x + 13) mod 256`
- inverse rotate: rotate right by the same amount
- undo add: subtract `(add_operand + 3*i)`
- undo XOR: XOR with `(i + xor_operand)`

## Solver

```python
target = bytes.fromhex(
    "12 10 77 9e 33 29 1b 00 54 fd c8 ab cc be c8 ae "
    "57 cb 3e f0 db 09 ec 68 74 ae 29 ad 8c 7b d0 a0"
)

perm = [
    0x07, 0x17, 0x02, 0x13, 0x1f, 0x0b, 0x00, 0x1c,
    0x0e, 0x05, 0x1a, 0x09, 0x11, 0x1e, 0x03, 0x15,
    0x0c, 0x19, 0x01, 0x12, 0x1d, 0x06, 0x0f, 0x1b,
    0x0a, 0x16, 0x04, 0x14, 0x08, 0x18, 0x0d, 0x10,
]

rounds = [
    (0x5a, 0x31, 3),
    (0xa7, 0x6d, 5),
    (0x1c, 0xb8, 1),
    (0xe3, 0x4f, 7),
    (0x90, 0x22, 2),
]

sbox = [(7 * x + 13) & 0xff for x in range(256)]
sbox_inv = {v: k for k, v in enumerate(sbox)}


def ror8(x, n):
    return ((x >> n) | (x << (8 - n))) & 0xff if n else x


state = bytearray(target)

for xor_op, add_op, rol_op in reversed(rounds):
    # inverse permutation
    state = bytearray(state[perm[i]] for i in range(32))

    # inverse S-box
    state = bytearray(sbox_inv[b] for b in state)

    # inverse rotate
    state = bytearray(ror8(b, rol_op) for b in state)

    # undo add
    state = bytearray(
        (b - (add_op + 3 * i)) & 0xff for i, b in enumerate(state)
    )

    # undo XOR
    state = bytearray(
        b ^ ((i + xor_op) & 0xff) for i, b in enumerate(state)
    )

print(bytes(state).decode())
```

Output:

```
isfcr{c41rn_vm_r3v3rs3_by_h4nd1}
```

## Verification

```text
$ echo 'isfcr{c41rn_vm_r3v3rs3_by_h4nd1}' | ./chall
correct: the flag is your input
```

## Flag

```
isfcr{c41rn_vm_r3v3rs3_by_h4nd1}
```
