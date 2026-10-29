---
title: "The-press"
description: "the-press** (binary: chall_1_) is a stripped x86-64 ELF. It reads exactly 32 bytes from stdin, compresses them with a custom LZMA-style range encoder, and compares the 36-byte result…"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/the-press-writeup.md"
---

**Category:** Reverse Engineering
**Flag:** `isfcr{r4ng3_c0d3r_b1t_3x4ct_y0!}`

## Summary

**the-press** (binary: `chall_1_`) is a stripped x86-64 ELF. It reads exactly 32 bytes from stdin, compresses them with a custom LZMA-style range encoder, and compares the 36-byte result against a constant in `.rodata`. If the output matches it prints `CORRECT`; otherwise `nope.`.

The solution is to run the encoder backwards: decode the 36-byte target with a range decoder that mirrors the binary's probability model, then undo the XOR chain.

## Recon

```
$ file chall_1_
ELF 64-bit LSB executable, x86-64, dynamically linked, stripped

$ strings chall_1_ | grep -iE 'nope|CORRECT|bytes'
need exactly %d bytes of input
CORRECT
nope.
```

Imports are minimal (`fread`, `memcmp`, `puts`, `fprintf`), so everything interesting is in a single function starting at `0x4003c0`, plus a helper at `0x400700`.

## Reversing the main function

### Input

`fread(buf, 1, 0x20, stdin)` must return `0x20`, otherwise the program prints `need exactly 32 bytes of input` and exits with code 2.

### Probability table

The table lives at `0x403100`: 65536 `uint16` entries, all initialised to `0x0800` (a 50% probability in a 12-bit scale).

### Encoder state

| Variable | Initial value | Role |
|---|---|---|
| range | `0xffffffff` | range |
| low | `0` | 64-bit low |
| cache | `0` | pending byte |
| cacheSize | `1` | pending count |
| out | `0x4030a0` | output buffer, 36 bytes expected |

This is the standard LZMA range coder layout, including the leading zero byte in the output.

### Per-byte transform

For each input byte `i`:

```
x[i] = in[i]            if i == 0
x[i] = in[i] ^ in[i-1]  otherwise      # XOR with the previous *raw* input byte
```

### Per-bit encoding

Bits of `x[i]` are encoded MSB first, using a bit-tree. The context index into the probability table is:

```
ctx = (x[i-1] << 8) + node        # x[-1] = 0, node starts at 1
```

For each bit:

```
bound = (range >> 12) * p
if bit == 0:
    range = bound
    p += (4096 - p) >> 4          # shift 4
else:
    low   += bound
    range -= bound
    p -= p >> 5                   # shift 5
node = node * 2 + bit
while range < 2**24:
    range <<= 8
    shiftLow()
```

The asymmetric update rates (4 for a 0 bit, 5 for a 1 bit) are the non-standard twist. A stock LZMA decoder will not decode this stream.

### Output routine (`0x400700`)

This is the textbook LZMA `ShiftLow` with cache and carry propagation. It writes at most `0x40` bytes into the buffer.

### Finish

After all 32 bytes, `shiftLow()` is called 5 times (flush). The program then requires:

1. Output length is exactly `0x24` (36) bytes.
2. `memcmp(out, 0x4012e0, 36) == 0`.

### Target constant (`.rodata` @ `0x4012e0`)

```
00 69 1a 0d 05 11 09 09 4e 93 af 58 eb 28 00 76
31 44 25 38 27 50 4c 83 a2 6d 5e de a3 25 46 5d
d7 b1 90 00
```

## Solving

Because the model is deterministic and adaptive, the target stream decodes uniquely.

1. Skip the leading `0x00` byte, load the next 4 bytes as `code`, and set `range = 0xffffffff`.
2. For each of the 32 bytes, rebuild `ctx` from the previously decoded XORed byte, then decode 8 bits with the same probability updates as above.
3. Decoder bit logic: if `code < bound` the bit is 0, otherwise subtract `bound` from `code` and `range` and the bit is 1.
4. Normalise when `range <= 0xffffff` by shifting in the next byte of the target.
5. Undo the XOR chain: `in[0] = x[0]`, `in[i] = x[i] ^ in[i-1]`.

### Solver

```python
tgt = bytes.fromhex(
    "00691a0d05110909" "4e93af58eb280076"
    "3144253827504c83" "a26d5edea325465d"
    "d7b19000"
)
assert len(tgt) == 36

probs = {}
P = lambda k: probs.get(k, 0x800)

code = int.from_bytes(tgt[1:5], "big")
pos = 5
rng = 0xFFFFFFFF

def nxt():
    global pos
    b = tgt[pos] if pos < len(tgt) else 0
    pos += 1
    return b

xored, prev = [], 0
for _ in range(32):
    ctx, node = prev << 8, 1
    for _ in range(8):
        k = ctx + node
        p = P(k)
        bound = (rng >> 12) * p
        if code < bound:
            bit = 0
            rng = bound
            probs[k] = p + ((4096 - p) >> 4)
        else:
            bit = 1
            code -= bound
            rng -= bound
            probs[k] = p - (p >> 5)
        node = node * 2 + bit
        while rng <= 0xFFFFFF:
            rng = (rng << 8) & 0xFFFFFFFF
            code = ((code << 8) | nxt()) & 0xFFFFFFFF
    prev = node & 0xFF
    xored.append(prev)

raw = [xored[0]]
for i in range(1, 32):
    raw.append(xored[i] ^ raw[i - 1])

print(bytes(raw).decode())
```

Output:

```
isfcr{r4ng3_c0d3r_b1t_3x4ct_y0!}
```

### Verification

```
$ printf 'isfcr{r4ng3_c0d3r_b1t_3x4ct_y0!}' | ./chall_1_
CORRECT
```

Use `printf` rather than `echo`. A trailing newline makes the input 33 bytes, and the program only consumes the first 32, so `echo` can still work, but `printf` avoids any ambiguity.

## Takeaways

- The "32 bytes" hint plus the compare against a fixed 36-byte blob points straight at a compressor or encoder whose output can be inverted.
- Recognising the LZMA shape (12-bit probs, `range >> 12`, the cache/carry `ShiftLow`, 5-call flush) makes the reversing fast.
- The only real trap is the modified adaptation rates (shift 4 for 0, shift 5 for 1) and the context built from the previous XORed byte. Match those exactly and a normal range decoder inverts it.
