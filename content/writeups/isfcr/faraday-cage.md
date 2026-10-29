---
title: "Faraday"
description: "The attachment is an Android diagnostic app for the LumoWise LW-7 smart bulb. Its UI accepts a 16-byte challenge response as 32 hexadecimal characters. The actual validation and flag…"
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/faraday-cage.md"
---

## Flag

```text
isfcr{p3rmut3d_h4ndl3rs_v5_cust0m_ch4ch4_1n_th3_c4g3}
```

## Overview

The attachment is an Android diagnostic app for the LumoWise LW-7 smart bulb. Its UI accepts a 16-byte challenge response as 32 hexadecimal characters. The actual validation and flag decryption are implemented in a native library, not in Java.

The native library validates the response through a custom virtual machine with shuffled opcode handlers. Reversing the VM's four transformation rounds produces the accepted response:

```text
Hex:   4c756d6f734661726164436167653031
ASCII: LumosFaradCage01
```

No bulb, Bluetooth connection, or running Android device is needed. The pairing button only changes local UI state, and the native validation can be emulated directly.

## Initial Inspection

List the APK contents and decompile the Java code:

```bash
unzip -l Faraday.apk
jadx -d /tmp/opencode/faraday-jadx Faraday.apk
```

The APK contains a small `classes.dex` and two native libraries:

```text
lib/arm64-v8a/libbulb.so
lib/armeabi-v7a/libbulb.so
```

`com.lumos.faraday.MainActivity` parses the user's hexadecimal input, checks that it is exactly 16 bytes, and calls:

```java
byte[] result = BulbNative.submit(response);
```

An empty result displays an unlock rejection. A nonempty result is displayed as the payload of GATT notification `0xA008`.

`BulbNative` loads `libbulb.so` and declares the native method:

```java
public static native byte[] submit(byte[] response);
```

## Native Entry Point

The following analysis uses the ARM64 library. Addresses below are virtual addresses relative to the library's load base.

The library exports `JNI_OnLoad` at `0x5420`. It dynamically registers `submit`, with JNI signature `([B)[B`, to the function at `0x54c8`.

The JNI wrapper obtains the input byte array and calls the native validation routine at `0x43dc`. That routine:

1. Initializes the VM through `0x4470`.
2. Executes its bytecode through `0x4504`.
3. Checks the status at `0x7e58` for success, represented by `1`.
4. On success, calls `0x45bc` to decrypt a 53-byte payload.
5. Copies the plaintext into the output buffer.

Useful inspection commands:

```bash
readelf -Ws /tmp/opencode/faraday-jadx/resources/lib/arm64-v8a/libbulb.so
r2 -e scr.color=0 -e bin.relocs.apply=true -q \
  -c 'aaa; pdf @ 0x5420; pdf @ 0x54c8; pdf @ 0x43dc; iz' \
  /tmp/opencode/faraday-jadx/resources/lib/arm64-v8a/libbulb.so
```

### Decoys

The native library contains several conspicuous strings, including:

```text
lumos.devkey = 0000000000000000000000000000000000000000
isfcr{nope_this_is_a_decoy_please_move_on}
```

It also contains an errata message suggesting that engineering builds use the opcode byte directly as the handler index. The actual initialization constructs a shuffled dispatch table, so treating opcode values as fixed handler indices would produce the wrong semantics.

The visible flag string is a decoy. The real flag is returned only after successful native validation and decryption.

## VM Structure

Initialization places the VM context at `0x7b10`. Important fields are:

| Context Offset | Purpose |
| --- | --- |
| `0x00` | 32-bit VM registers |
| `0x40` | Byte-addressed VM memory |
| `0x244` | Bytecode instruction index |
| `0x248` | Submitted input bytes |
| `0x348` | Result/status code |
| `0x34c` | Halt indicator |
| `0x350` | Bytecode pointer |
| `0x358` | Bytecode length |

The program is 240 bytes at `0x138a`, with four bytes per instruction:

```text
opcode, operand1, operand2, operand3
```

The interpreter fetches the corresponding handler from the runtime dispatch table at `0x7e78`, then calls it with the VM context and three operands.

The one-time initializer at `0x5058` derives a shuffle stream and uses it to permute 48 handler pointers. Rather than reimplementing that initialization, the solver emulates it and reads the resulting table directly.

## Validation Transform

The bytecode first copies the submitted response into VM memory. It then applies four rounds to the 16-byte state.

Each round consists of:

1. Substitute each byte using the AES S-box at `0x147a`.
2. Permute the 16 substituted bytes using a table in VM memory.
3. Apply a custom linear mixing function to each consecutive four-byte word.
4. XOR the state with a round-specific 16-byte constant.

The permutation table, at VM memory offsets `96..111`, is:

```text
[0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]
```

The round constants occupy VM memory offsets `32..95`. The final state is compared against the 16 bytes at offsets `16..31`:

```text
f809792ec246f0098538517c71c64461
```

### Custom Mixing

The mixing handler at `0x4b4c` calls the function at `0x52c0`. For a little-endian word containing bytes `a`, `b`, `c`, and `d`, its output is:

```text
y0 = 2*a XOR 3*b XOR 5*c XOR 1*d
y1 = 1*a XOR 2*b XOR 3*c XOR 5*d
y2 = 5*a XOR 1*b XOR 2*c XOR 3*d
y3 = 3*a XOR 5*b XOR 1*c XOR 2*d
```

The multiplications are finite-field operations implemented by the native helper at `0x51b8`, not ordinary integer multiplication. This is not the standard AES MixColumns matrix.

The solver avoids assumptions about the field implementation by evaluating `0x52c0` on all 32 single-bit input words. Those outputs form the columns of a 32-by-32 binary matrix. Gaussian elimination over GF(2) produces its inverse.

## Reversing the Response

Starting from the expected final state, undo the four rounds in reverse order:

```python
state = target
for round_index in reversed(range(4)):
    state = xor(state, round_constants[round_index])
    state = inverse_mix_each_word(state)
    previous = [0] * 16
    for i, source_index in enumerate(permutation):
        previous[source_index] = inverse_sbox[state[i]]
    state = bytes(previous)
```

The recovered initial state is:

```text
4c756d6f734661726164436167653031
```

Decoded as ASCII:

```text
LumosFaradCage01
```

## Emulation and Verification

The solver is located at `/tmp/opencode/faraday_solve.py`. It uses Python with `unicorn` and `pyelftools` to execute the original ARM64 library.

Its emulation setup:

1. Maps the ELF load segments into Unicorn memory.
2. Applies `R_AARCH64_RELATIVE` relocations.
3. Allocates a stack and input/output buffers.
4. Hooks the library's `memcpy` and `memset` PLT stubs.
5. Calls VM initialization and extracts the embedded constants.
6. Reverses the validation transform.
7. Submits the recovered response to the original native routine at `0x43dc`.

Run it with:

```bash
python /tmp/opencode/faraday_solve.py
```

The result is:

```text
target f809792ec246f0098538517c71c64461 permutation [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]
unlock 4c756d6f734661726164436167653031
accepted 1 payload b'isfcr{p3rmut3d_h4ndl3rs_v5_cust0m_ch4ch4_1n_th3_c4g3}'
```

As a negative control, submitting 16 zero bytes returns `0` with output length `0`. Submitting the recovered response returns `1` and the 53-byte flag above.

The verification does not patch the validator, force its success status, or replace its decryption logic. The original native code accepts the recovered response and decrypts the flag itself.
