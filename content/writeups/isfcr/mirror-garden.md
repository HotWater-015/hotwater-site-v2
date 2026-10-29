---
title: "Mirror Garden"
description: "The input to enter into the app's \"whisper\" field is:"
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/mirror-garden.md"
---

## Challenge

> Something is growing in the mirror garden, and only one leaf remembers.

Attachment: `mirror-garden.apk`  
Flag format: `isfcr{...}`

## Result

```text
isfcr{m1rr0r_g4rden_bl00ms_@t_m1dn1ght_7f3a}
```

The input to enter into the app's "whisper" field is:

```text
L.]^ooq(LlU^(a]#
```

## APK Inspection

Listing the archive revealed a DEX file and a small ARM64 native library:

```bash
unzip -l mirror-garden.apk
jadx -d /tmp/opencode/mirror-jadx mirror-garden.apk
unzip mirror-garden.apk 'lib/*' -d /tmp/opencode/mirror-native
```

The important files are:

- `classes.dex`
- `lib/arm64-v8a/libgarden.so`
- `one/sr/garden/MainActivity.java` in the decompiled output
- 1,024 classes named `one/sr/garden/leaf/L0000` through `L1023`

`MainActivity` loads the native library and declares:

```java
private native String bloom(byte[] input);
```

When the user presses **Water**, the app converts the entered text to bytes and calls `bloom`. There is no flag validation in the activity itself; the native routine determines which leaf to invoke and processes its output.

## Finding the Remembering Leaf

The native library exports:

```text
Java_one_sr_garden_MainActivity_bloom
```

Its entry point is at virtual address `0x1b28`. Disassembling the ARM64 code with Capstone shows an early call to an internal state-generation routine at `0x2374`.

The caller takes the first 32-bit word of the generated state and masks it with `0x3ff`:

```text
leaf_index = first_state_word & 0x3ff
```

It then formats the class name as:

```text
one/sr/garden/leaf/L%04d
```

Rather than analyze all 1,024 leaf classes, we can emulate the state-generation routine with Unicorn. Loading the ELF's `PT_LOAD` segments at their virtual addresses, setting up a stack and an output buffer, and running `0x2374` produces:

```text
657db61a964a04d3a54b416f0243ab7b
aaf6b1146475155b2b6faa6e3f56b86d
1784d10160343a78ca7a31c665f12b33
f244a1f8a01c651e5173856718388c8e
```

The first word is little-endian:

```text
0x1ab67d65 & 0x3ff = 357
```

The remembering leaf is therefore **`L0357`**. This was also confirmed by intercepting the native routine's JNI `FindClass` call during emulation.

## Solving the Leaf

Each leaf exposes a static method with the signature:

```java
public static byte[] verify(byte[] input)
```

The selected leaf rejects inputs that are not exactly 16 bytes long. It interprets the input bytes as unsigned values, computes a series of arithmetic expressions, and compares the results with constants. A failed comparison returns `null`.

The expressions disguise familiar operations. For example:

```text
(a | b) - (a & b) = a ^ b
(a ^ b) + 2 * (a & b) = a + b
```

The code also uses multiplication, 32-bit masks, and rotations represented as shifts and ORs:

```text
((value << r) | (value >>> (32 - r))) & 0xffffffff
```

To solve these checks, represent the 16 input bytes as Z3 bit-vectors constrained to `0..255`, evaluate the decompiled assignments symbolically, and assert that every checked expression equals its expected constant.

The recovery script uses 64-bit bit-vectors to match the Java `long` intermediates and retains the explicit `0xffffffff` masks. For these expressions, the right-shift operands are nonnegative masked values, so translating their unsigned Java shifts to bit-vector right shifts does not change the result.

Z3 finds:

```text
L.]^ooq(LlU^(a]#
```

After the checks pass, the leaf XORs a fixed 48-byte array with the repeating 16-byte input:

```java
for (int i = 0; i < 48; i++) {
    output[i] = (byte) (encoded[i] ^ input[i & 15]);
}
```

For the recovered whisper, the resulting payload is:

```text
85d3d1dfacd6abaa42931f9a7b26b7366
9decf40a7e42467c996e931baac6e8d6
ce5ef43f22bcbd14fafbfc3360b589b
```

This payload is not the flag. It must still pass through the native routine.

## Native Authentication and Decryption

The native code calls `L0357.verify` through JNI and requires a 48-byte result. It XORs that result with the first 48 bytes of the generated native state, then performs hash-based key derivation, authentication, and decryption. The library contains the domain-separation strings:

```text
garden/e/v1
garden/m/v1
```

To recover the final output without an Android device, emulate the complete `bloom` routine and provide minimal implementations for the JNI and libc calls it makes:

- `snprintf` formats the selected leaf class name.
- `memcpy` copies buffers inside the emulated address space.
- `FindClass` and `GetStaticMethodID` return placeholder handles after checking the requested class and method.
- `CallStaticObjectMethod` returns a handle for the independently computed leaf payload.
- The array access functions expose that payload and its length.
- `ReleaseByteArrayElements` and `DeleteLocalRef` are no-ops in this harness.
- `NewStringUTF` captures the final native output.

The emulated library follows its normal authentication check before reaching the successful decryption path. The captured string is:

```text
isfcr{m1rr0r_g4rden_bl00ms_@t_m1dn1ght_7f3a}
```

## Verification

The symbolic result was checked independently by compiling the decompiled `L0357.java` and calling its actual Java `verify` method with the recovered whisper. The method returned the expected 48-byte payload rather than `null`.

```bash
javac -d /tmp/opencode/mirror-jadx \
  /tmp/opencode/mirror-jadx/sources/one/sr/garden/leaf/L0357.java \
  /tmp/opencode/MirrorVerify.java
java -cp /tmp/opencode/mirror-jadx MirrorVerify
```

The output confirmed:

```text
Java leaf verification passed: 85d3d1dfacd6abaa42931f9a7b26b73669decf40a7e42467c996e931baac6e8d6ce5ef43f22bcbd14fafbfc3360b589b
```

The complete recovery script from this solve is available locally at `/tmp/opencode/mirror_solve.py`. It uses `pyelftools`, `unicorn`, and `z3-solver`, together with the JADX output at the paths above:

```bash
python /tmp/opencode/mirror_solve.py
```

Verification was performed using Java execution and ARM64 native emulation, not by launching the APK on an Android device.
