---
title: "FlaGuard"
description: "This flag was confirmed accepted by the challenge submission system."
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/flaguard.md"
---

## Challenge

An Android application, FlaGuard, is advertised as a strict flag-format validator. The provided attachment is `flaguard.apk`, and the flag format is `isfcr{...}`.

## Accepted Flag

```text
isfcr{sh4d0w_cl455l04d3r_tr1ckery}
```

This flag was confirmed accepted by the challenge submission system.

## APK Inspection

List the APK contents and decompile its code with JADX:

```bash
unzip -l flaguard.apk
jadx -d flaguard-jadx flaguard.apk
```

The APK contains a small `classes.dex` and two assets:

```text
assets/palette.webp
assets/theme.pack
```

The relevant Java classes are in the package `dev.srspace.flaguard`:

- `MainActivity`: reads the input and invokes `FlagChecker.check()`.
- `FlagChecker`: contains a rolling-state validator.
- `App`: decrypts and loads an additional DEX at startup.
- `obf.Veil`: decodes obfuscated strings used by the loader.

## Reversing the Original Validator

The `FlagChecker` in the original `classes.dex` first requires the input to start with `isfcr{`, end with `}`, and have exactly 34 bytes.

It then checks the following recurrence for every input byte:

```java
int state = 7039;
for (int index = 0; index < bytes.length; index++) {
    state = (state * 131
        + (bytes[index] & 255)
        + P[index % P.length]) & 65535;
    if (state != C[index]) {
        return false;
    }
}
```

The constants are:

```python
P = [55, 141, 25, 242, 75, 166]
C = [
    4765, 34647, 16900, 51553, 3424, 55617, 11501, 65084,
    6401, 52441, 54150, 16047, 5155, 20185, 22928, 54742,
    27906, 51425, 52166, 18191, 23802, 38212, 25162, 19702,
    25208, 25705, 25158, 19189, 23565, 7096, 12228, 29259,
    31987, 61896,
]
```

Every intermediate state is known because it must equal the corresponding element of `C`. Therefore, each input byte can be recovered directly:

```text
byte[i] = (C[i] - 131 * previous_state - P[i % 6]) mod 65536
```

The initial previous state is `7039`; subsequent previous states are `C[i - 1]`. There is no brute force or hash cracking involved.

## Solve Script

The following standalone script recovers the flag and checks it against the original validator's constraints:

```python
P = [55, 141, 25, 242, 75, 166]
C = [
    4765, 34647, 16900, 51553, 3424, 55617, 11501, 65084,
    6401, 52441, 54150, 16047, 5155, 20185, 22928, 54742,
    27906, 51425, 52166, 18191, 23802, 38212, 25162, 19702,
    25208, 25705, 25158, 19189, 23565, 7096, 12228, 29259,
    31987, 61896,
]

state = 7039
flag = bytearray()
for index, expected in enumerate(C):
    byte = (expected - state * 131 - P[index % len(P)]) & 0xffff
    assert 0 <= byte <= 255
    flag.append(byte)
    state = expected

assert flag.startswith(b"isfcr{") and flag.endswith(b"}")
assert len(flag) == len(C)
state = 7039
for index, byte in enumerate(flag):
    state = (state * 131 + byte + P[index % len(P)]) & 0xffff
    assert state == C[index]

print(flag.decode("ascii"))
```

Output:

```text
isfcr{sh4d0w_cl455l04d3r_tr1ckery}
```

As an additional check, the decompiled original Java `FlagChecker` was compiled and executed against this string. It accepted the recovered flag and rejected a one-character mutation.

## The Second Validator

The APK also contains a loader that complicates the analysis. In `App.attachBaseContext()`, the application calls `bind()`, which decrypts `theme.pack` and constructs an `InMemoryDexClassLoader`. It then uses reflection to replace the original class loader's `parent` with that loader.

The loader derives its AES key and IV as follows:

```text
dex_hash = SHA256(original classes.dex bytes)
offset   = (palette.webp[16] & 63) + 64
seed     = palette.webp[offset : offset + 128]
key      = SHA256(seed || UTF8("flaguard-boot-v3") || dex_hash)
iv       = SHA256(dex_hash || seed[:16])[:16]
payload  = AES-CBC-NoPadding-Decrypt(key, iv, theme.pack)
```

The package name is `dev.srspace.flaguard`, so the conditional `.internal` branch that modifies the IV is not enabled.

The decrypted DEX contains another class with the same fully qualified name, `dev.srspace.flaguard.FlagChecker`. Its validator uses two byte arrays and a rolling XOR state:

```text
state = 90
expected_byte[i] = (T[i] XOR M[i] XOR state) AND 255
state = state XOR input_byte[i]
```

Reversing this second validator produces a different candidate:

```text
isfcr{p4r3nt_f1rst_d3x_1s_s0_m34n}
```

That candidate passes the decompiled hidden checker, but the challenge submission system rejected it. The original checker's flag was accepted instead. Thus, the hidden-checker result must not be presented as the submission flag. No Android runtime test was performed to establish which checker resolves on a particular device; the submission result is the decisive evidence for the flag reported here.

## Conclusion

The accepted flag is recovered by subtracting the known previous rolling state and periodic constant from each target state. The encrypted DEX explains why inspecting only the apparent startup behavior can lead to a different candidate, but the confirmed submission flag is:

```text
isfcr{sh4d0w_cl455l04d3r_tr1ckery}
```
