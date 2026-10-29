---
title: "SilverGate — silvergate.apk + base.odex"
description: "base.odex is not a real ART/OAT file — it's a hand-crafted container with a small AArch64 \"native code\" section and three methods:"
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/oatmeal.md"
---

**Category:** Mobile / Reverse Engineering
**Flag:** `isfcr{5958fbb07efd243b}`

---

## 0. TL;DR

`base.odex` is not a real ART/OAT file — it's a hand-crafted container with a
small AArch64 "native code" section and three methods:

| Method | Offset | Behaviour |
|---|---|---|
| `checkFlag_v1_LEGACY` | `0x7e0` | compares a 32-byte input against the constant at `0x1c8` |
| `checkFlag_v2` | `0x4b0` | 8-register bytecode VM that validates a **24-byte passphrase** |
| `finalizeFlag` | `0x820` | `FNV-1a-64(passphrase) ^ 0xa55a96693c3cd2ad` |

`checkFlag_v2` is fully invertible. Doing so reveals the passphrase
`art_image_took_the_cake!`, and `finalizeFlag` turns it into the flag:

```
isfcr{5958fbb07efd243b}
```

The APK's `classes.dex`, `assets/notes.txt` and two embedded `isfcr{...}`
strings are decoys designed to send you down a SHA-256 preimage rabbit hole.

---

## 1. Inventory

```
silvergate.apk   12,921 bytes   Android package (staging build)
base.odex         6,355 bytes   fake OAT/ART image (the real target)
```

```text
silvergate.apk/
├── AndroidManifest.xml
├── classes.dex                 <- staging LockActivity (decoy logic)
├── assets/notes.txt            <- "hint" document (misdirection)
├── res/layout/activity_lock.xml
├── res/mipmap-mdpi-v4/ic_launcher.png
├── resources.arsc
└── META-INF/{MANIFEST.MF,DBG.SF,DBG.RSA}
```

`base.odex` header:

```
00000000: 6f61 740a 3234 3300 ...    "oat\n243\0"  (OAT version 243)
00000040: 4152 542d 4f50 542f 3133 2e30 2e30 2d72  "ART-OPT/13.0.0-r"
00000050: 3433 ...                          "43"
...
00000120: 6172 742e 636f 6d70 696c 6572 ...   "art.compiler.filter=speed-profile"
00000130: 4152 4d36 342d 4137 352d 7634 2e33    "ARM64-A75-v4.3-"
00000150: 6f61 742e 696d 6167 652e 6c6f 6361 7469  "oat.image.locati"
00000160: 6f6e 3d2f 7379 7374 656d 2f66 7261 6d65  "on=/system/frame"
00000170: 776f 726b 2f62 6f6f 742e 6172 74        "work/boot.art"
```

So it *pretends* to be `/system/framework/boot.art` (ARM64, art-opt
v13.0.0-r43). The tell is the file's contents: a string table, a compact
region of genuine AArch64 instructions, and a padded blob that starts with a
`dex\n035\0` magic but is high-entropy filler.

Relevant strings:

```text
checkFlag_v1_LEGACY
checkFlag_v2
finalizeFlag!
com.silvergate.vault.LockActivity
isfcr{%016llx}
[dbg] checkFlag_v2 entered: %d bytes
isfcr{dev_overlay_do_not_submit_18ca3b}      <- decoy
isfcr{preprod_token_v3_40df11a0ce9c}         <- decoy
android.boot.image.art.token
# compiled by art-opt v13.0.0-r43 (sr) do not distribute
```

The format string `isfcr{%016llx}` is the single most important clue: the real
flag is `isfcr{` + a 16-hex-digit 64-bit value + `}`.

---

## 2. The APK is a decoy

`classes.dex` was built with D8 `compilation-mode: debug` and decompiles
cleanly. `LockActivity`:

```java
public class LockActivity extends Activity implements View.OnClickListener {
    private static final byte[] EXPECTED =
        HexUtil.decode("42b39944397bbbe271c695b40844f3f41c3a2b5a8d1c0400ce733878dbc44bb2");

    public static boolean checkFlag(String str) {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(str.getBytes("UTF-8"));
        int i = 0;
        for (int j = 0; j < digest.length; j++) i |= (digest[j] ^ EXPECTED[j]) & 0xff;
        return i == 0;                       // SHA-256(str) == EXPECTED
    }

    static String deriveFlag(String str) {   // "staging" flag format
        StringBuilder sb = new StringBuilder("isfcr{");
        for (int i = 0; i < str.length(); i++) {
            String h = Integer.toHexString(str.charAt(i) ^ 'U');   // XOR 0x55
            if (h.length() == 1) sb.append('0');
            sb.append(h);
        }
        return sb.append('}').toString();
    }
}
```

Taken at face value this is a dead end: it wants a SHA-256 **preimage** of a
32-byte constant, which is infeasible. `assets/notes.txt` reinforces the trap:

> the SHA256 constant in `LockActivity#EXPECTED` is derived from the lowercased
> passphrase without a trailing newline

…which is a *staging* claim. The stage is set: the interesting logic must be in
`base.odex`, whose own strings name `checkFlag_v1_LEGACY`, `checkFlag_v2` and
`finalizeFlag` — i.e. an optimized/legacy reimplementation of the same check.

(The two `isfcr{...}` strings inside the odex are the builders' own
"do not submit" breadcrumbs.)

---

## 3. Reversing `base.odex`

### 3.1 Layout

```text
0x000 - 0x180   OAT header + string table
0x180 - 0x198   key table        (24 bytes)   <-- referenced as x24
0x198 - 0x1b0   table D1         (24 bytes)   <-- referenced as x25
0x1b0 - 0x1c8   table D2         (24 bytes)   <-- referenced as x26
0x1c8 - 0x1e8   EXPECTED         (32 bytes)   <-- checkFlag_v1_LEGACY target
0x1e8 - 0x290   strings
0x290 - 0x4a2   VM bytecode      (530 bytes = 265 x 2-byte instructions)
0x4a2 - 0x4b0   padding
0x4b0 - 0x878   AArch64 code
0x890 - 0x18d6  high-entropy blob ("dex\n035" magic, otherwise filler)
```

The tables:

```
key180 @0x180 : 59 95 6b 4e 5a f0 d8 28 f9 e2 61 b7 29 d9 86 ed
                79 2d bc 8b fc 86 bc b0 27 ca c8 76 9b 1d 8b 22
d198   @0x198 : 27 ca c8 76 9b 1d 8b 22 fd 21 33 a7 a6 2e f2 0e
                39 89 68 c2 18 92 24 d7
d1b0   @0x1b0 : a1 62 be 96 b4 78 32 e5 ce a2 f9 f9 cc 56 b7 3b
                9a 36 2d dd ef 55 dd 6c
EXPECTED@0x1c8 : 42 b3 99 44 39 7b bb e2 71 c6 95 b4 08 44 f3 f4
                 1c 3a 2b 5a 8d 1c 04 00 ce 73 38 78 db c4 4b b2
```

Note the first 24 bytes of `EXPECTED` overlap the region `0x1c8`, and the
32-byte constant in the DEX is exactly `EXPECTED` re-encoded as a hex string —
confirming both binaries share the same data.

### 3.2 `checkFlag_v1_LEGACY` @ `0x7e0`

```asm
0007e0  sub   x12, x1, #0x20      ; length must be 0x20 (32)
0007e4  cbnz  x12, reject
0007e8  mov   x8, #0x1c8          ; EXPECTED
0007ec  mov   x2, #0
loop:
0007f0  cmp   x2, #0x20
0007f4  b.eq  accept
0007f8  ldrb  w3, [x0, x2]        ; input[i]
0007fc  ldrb  w4, [x8, x2]        ; EXPECTED[i]
000800  cmp   w3, w4
000804  b.ne  reject
000808  add   x2, x2, #1
00080c  b     loop
```

A straight 32-byte comparison — the "legacy" check, not what produces the flag.

### 3.3 `checkFlag_v2` @ `0x4b0` — the bytecode VM

Prologue requires a 24-byte input:

```asm
0004c8  sub   x12, x1, #0x18      ; length must be 0x18 (24)
0004cc  cbnz  x12, reject
0004d0  mov   x27, x0             ; input pointer
0004d4  mov   x28, #0x290         ; program start
0004d8  mov   x29, #0x212         ; program length
0004e0  mov   x24, #0x180         ; key table
0004e4  mov   x25, #0x198         ; D1 table
0004e8  mov   x26, #0x1b0         ; D2 table
...
00050c  mov   w16, #0x5c
000510  mov   w17, #0xa7
```

Dispatch loop reads **two bytes per instruction**:

```asm
000514  sub   x12, x9, x28        ; offset
000518  cmp   x12, x29           ; reached end?
00051c  b.ge  reject
000520  ldrb  w10, [x9]          ; b0 = opcode|dest
000524  ldrb  w11, [x9, #1]      ; b1 = operand / index
000528  add   x9, x9, #2
00052c  and   w13, w10, #0xf     ; dest  = low nibble
000530  lsr   w14, w10, #4       ; opcode = high nibble
```

Decoded opcodes:

| Opcode | Mnemonic | Semantics |
|---|---|---|
| `0x1` | `LOAD_INPUT` | `r[dest] = input[idx]` |
| `0x2` | `LOAD_KEY`  | `r[dest] = key180[idx] ^ ((idx*0xa7 ^ 0x5c) & 0xff)` |
| `0x3` | `LOAD_D1`   | `r[dest] = d198[idx] ^ (((idx+0x18)*0xa7 ^ 0x5c) & 0xff)` |
| `0x4` | `LOAD_D2`   | `r[dest] = d1b0[idx] ^ (((idx+0x30)*0xa7 ^ 0x5c) & 0xff)` |
| `0x5` | `CONST`     | `r[dest] = idx` |
| `0x6` | `ADD`       | `r[dest] = (r[dest] + r[idx]) & 0xff` |
| `0x7` | `EOR`       | `r[dest] = (r[dest] ^ r[idx]) & 0xff` |
| `0x8` | `ROL8`      | `r[dest] = rol8(r[dest], idx & 7)` |
| `0x9` | `ASSERT`    | if `r[dest] != r[idx]` → return false |
| `0xa` | `RET1`      | return true |

There are 8 registers (`w19,w20,w21,w22,w23,w3,w4,w5`) and two helper stubs:
`0x590` dispatches the destination register, `0x614` reads a register.

Dumping the 265 instructions shows a **repeating 8-instruction block**
repeated 24 times, once per passphrase byte, plus a trailing `RET1`:

```text
CONST r7 = 0x29
CONST r6 = 0x51
EOR   r7, r6          ; r7 = 0x29 ^ 0x51 = 0x78  <-- DEAD / decoy
LOAD_INPUT r0, i
LOAD_KEY   r1, i
ADD   r0, r1
LOAD_D1    r1, i
EOR   r0, r1
ROL8  r0, 3           ; shift operand is 3 in every block
LOAD_D2    r1, i
ASSERT r0, r1
```

The `CONST/CONST/EOR` prologue writes `r7` and is overwritten by the next
block before it is ever read — pure filler. The real constraint is the last
four lines. For each index `i = 0..23`:

```
rol8( ((input[i] + K[i]) & 0xff) ^ D1[i], 3 ) == D2[i]
```

where, applying the loader masks,

```
K[i]  = key180[i] ^ ((i      * 0xa7 ^ 0x5c) & 0xff)
D1[i] = d198[i]   ^ (((i+0x18) * 0xa7 ^ 0x5c) & 0xff)
D2[i] = d1b0[i]   ^ (((i+0x30) * 0xa7 ^ 0x5c) & 0xff)
```

Each equation is trivially invertible:

```
input[i] = ( ror8(D2[i], 3) ^ D1[i] - K[i] ) & 0xff
```

Solving all 24 gives:

```
input = 61 72 74 5f 69 6d 61 67 65 5f 74 6f 6f 6b 5f 74 68 65 5f 63 61 6b 65 21
      = "art_image_took_the_cake!"
```

### 3.4 `finalizeFlag` @ `0x820`

```asm
000820  mov  x1, #0x2325
000824  movk x1, #0x8422, lsl #16
000828  movk x1, #0x9ce4, lsl #32
00082c  movk x1, #0xcbf2, lsl #48      ; x1 = 0xcbf29ce484222325  (FNV-1a 64 offset basis)
000830  mov  x2, #0x1b3
000834  movk x2, #0x100, lsl #32       ; x2 = 0x100000001b3        (FNV-1a 64 prime)
000838  mov  x3, #0
loop:
00083c  cmp  x3, #0x18                 ; over 24 bytes
000840  b.eq done
000844  ldrb w4, [x0, x3]
000848  eor  x1, x1, x4
00084c  mul  x1, x1, x2                ; FNV-1a: h = (h ^ byte) * prime
000850  add  x3, x3, #1
000854  b    loop
done:
000858  mov  x6, #0xd2ad
00085c  movk x6, #0x3c3c, lsl #16
000860  movk x6, #0x9669, lsl #32
000864  movk x6, #0xa55a, lsl #48      ; x6 = 0xa55a96693c3cd2ad
000868  eor  x1, x1, x6
00086c  mov  x4, #0x1e8
000870  mov  x0, x1
000874  ret
```

So:

```
flag_value = FNV1a64("art_image_took_the_cake!") ^ 0xa55a96693c3cd2ad
           = 0xfc026dd942c1f696 ^ 0xa55a96693c3cd2ad
           = 0x5958fbb07efd243b
```

Formatted with the `isfcr{%016llx}` string:

```
isfcr{5958fbb07efd243b}
```

---

## 4. Consensus check

A faithful re-implementation of the VM (not just the algebra) returns `true`
for `art_image_took_the_cake!`, so the recovery is self-consistent. The
SHA-256 "hint" does **not** match the recovered passphrase — confirming
`notes.txt` and `EXPECTED` belong to the staging decoy, not the production
odex.

---

## 5. Solver

```python
#!/usr/bin/env python3
import hashlib
from pathlib import Path

data = Path("base.odex").read_bytes()

def rol8(v, n): return ((v << n) | (v >> (8 - n))) & 0xff
def ror8(v, n): return ((v >> n) | (v << (8 - n))) & 0xff

key180   = data[0x180:0x198]
d198     = data[0x198:0x1b0]
d1b0     = data[0x1b0:0x1c8]
EXPECTED = data[0x1c8:0x1e8]

mask = lambda i, base: (((i + base) * 0xa7) ^ 0x5c) & 0xff

# invert the 24 VM constraints
pw = bytearray()
for i in range(24):
    K  = key180[i] ^ mask(i, 0x00)
    D1 = d198[i]   ^ mask(i, 0x18)
    D2 = d1b0[i]   ^ mask(i, 0x30)
    pw.append((ror8(D2, 3) ^ D1) - K & 0xff)
    assert rol8(((pw[i] + K) & 0xff) ^ D1, 3) == D2

print("passphrase :", pw.decode())

# FNV-1a-64 finalize
M = (1 << 64) - 1
h = 0xcbf29ce484222325
for b in pw:
    h = ((h ^ b) * 0x100000001b3) & M
h ^= 0xa55a96693c3cd2ad

print("flag       : isfcr{%016x}" % h)
```

Output:

```
passphrase : art_image_took_the_cake!
flag       : isfcr{5958fbb07efd243b}
```

The same script is saved alongside this writeup as `solve.py`.

---

## 6. Lessons / indicators

- **A file's magic is not its format.** `base.odex` advertises `oat\n243` and
  `boot.art`, but the byte layout (string table → AArch64 → random blob) is not
  a valid OAT image.
- **Trust the format strings, not the hints.** `isfcr{%016llx}` tells you the
  output is a 64-bit integer, which immediately rules out the SHA-256 /
  `deriveFlag` staging path.
- **Dead code is a trap.** The `CONST/CONST/EOR` prologue in each VM block
  computes a value that is never used; only the final `ASSERT` matters.
- **Decoys are labelled, if you look.** `isfcr{dev_overlay_do_not_submit_...}`
  and `isfcr{preprod_token_v3_...}` are baked into the string table precisely so
  a lazy `strings | grep isfcr` gives the wrong answer.

## Flag

```
isfcr{5958fbb07efd243b}
```
