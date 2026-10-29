---
title: "Zygote Conspiracy"
description: "The two APKs cooperate to reconstruct an encrypted DEX payload. Each contains a 32,768-byte asset named half.bin. Their native libraries publish their own half through a memory-backed…"
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/zygote-conspiracy.md"
---

## Flag

```text
isfcr{tw1n_pr0cess_h4ndshake_mem0ry_0nly_9f23ac}
```

## Overview

The two APKs cooperate to reconstruct an encrypted DEX payload. Each contains a 32,768-byte asset named `half.bin`. Their native libraries publish their own half through a memory-backed file, locate the companion process, and XOR the halves together. A certificate-derived ChaCha20 key decrypts the result. The recovered `xyz.srspace.vault.Vault` class contains a second encrypted payload, which decrypts to the flag using AES-GCM.

Everything needed for offline recovery is in the APKs; an Android emulator is unnecessary.

## 1. Inspect the APKs

```bash
unzip -l notesync.apk
unzip -l batterybuddy.apk
jadx -d notesync notesync.apk
jadx -d batterybuddy batterybuddy.apk
```

Relevant files:

| Note Sync | Battery Buddy |
| --- | --- |
| `assets/half.bin` | `assets/half.bin` |
| `lib/x86_64/libnotesync.so` | `lib/x86_64/libbuddy.so` |
| `META-INF/RELEASE.RSA` | `META-INF/RELEASE.RSA` |

Both manifests declare:

```xml
android:sharedUserId="xyz.srspace.suite"
```

The APKs contain the same signing certificate, with subject `C=XX, O=Srspace, CN=Srspace`. Their complete `RELEASE.RSA` containers differ because they include signatures over different APK contents. Extracting and comparing the certificate DER confirms the shared certificate.

## 2. Follow the Java loader

Both activities read `half.bin` and retrieve their signing certificate:

```java
byte[] asset = readAsset("half.bin");
byte[] signingCertDer = getSigningCertDer();
ByteBuffer payload = P.init(asset, signingCertDer);
```

The certificate comes from `getPackageInfo(..., 64).signatures[0].toByteArray()`.

If native initialization succeeds, the apps load a class directly from memory:

```java
new InMemoryDexClassLoader(payload, getClassLoader())
    .loadClass("xyz.srspace.vault.Vault")
    .getMethod("reveal", byte[].class)
    .invoke(null, signingCertDer);
```

The error messages also explicitly mention opening the companion app. This establishes that the two products are connected.

## 3. Reverse the native reconstruction

Disassemble the x86-64 library:

```bash
objdump -d -Mintel notesync/resources/lib/x86_64/libnotesync.so
objdump -s -j .rodata notesync/resources/lib/x86_64/libnotesync.so
```

`Java_xyz_srspace_core_P_init` checks that the asset length is `0x8000`. The native code uses `memfd_create`, writes the local half, applies seals, and searches `/proc` for the companion package and its file descriptors. Strings such as `sync.%s.%s`, `/proc/%d/cmdline`, and `/proc/%d/fd/%s` expose this handshake.

Once the peer half is mapped, the code XORs corresponding bytes:

```text
ciphertext[i] = notesync_half[i] XOR batterybuddy_half[i]
```

The cryptographic routines are identifiable from the SHA-256 constants, HMAC pads `0x36` and `0x5c`, and ChaCha20's `expand 32-byte k` constant and rotation schedule.

The working payload key is HKDF-SHA256 over the signing certificate DER, using a zero salt and the info string `sync-mask-v1`:

```text
PRK = HMAC-SHA256(32 zero bytes, certificate_der)
key = HMAC-SHA256(PRK, "sync-mask-v1" || 0x01)
```

Decrypt the XOR result with ChaCha20, a 12-byte zero nonce, and initial counter zero.

### Native obfuscation discrepancy

The inspected x86-64 code computes its label mask as:

```text
((17 * 7) XOR 0x5a) + 3 = 0x30
```

However, XORing the embedded label bytes with `0x30` produces an unusable label and does not recover a DEX. Trying all 256 possible one-byte masks identifies `0x5f`, which decodes the bytes to `sync-mask-v1` and recovers a payload beginning with `dex\n039\0`.

The recovered DEX decompiles successfully, although its stored SHA-1 does not match the SHA-1 of the recovered bytes after offset 32. This writeup therefore uses offline recovery and does not claim that the shipped apps successfully load the payload at runtime.

## 4. Decrypt the vault

Decompile the reconstructed payload:

```bash
jadx -d vault vault.dex
```

`Vault.reveal` derives another 32-byte key from the certificate, this time with HKDF info `sync-vault-key-v1`. Its `BLOB` array is structured as:

```text
12-byte nonce || ciphertext || 16-byte GCM authentication tag
```

The class uses `AES/GCM/NoPadding`, decrypts the blob, removes trailing zero bytes, and returns the ASCII plaintext. The authentication tag verifies successfully, confirming the recovered flag.

## Reproducible solver

Requirements: Python with PyCryptodome, OpenSSL, and JADX. Save the following as `solve.py` beside both APKs and run `python solve.py`.

```python
import hashlib
import hmac
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

from Crypto.Cipher import AES, ChaCha20


def mac(key, message):
    return hmac.new(key, message, hashlib.sha256).digest()


with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    with zipfile.ZipFile("notesync.apk") as apk:
        half_a = apk.read("assets/half.bin")
        (work / "release.rsa").write_bytes(apk.read("META-INF/RELEASE.RSA"))
    with zipfile.ZipFile("batterybuddy.apk") as apk:
        half_b = apk.read("assets/half.bin")

    subprocess.run([
        "openssl", "pkcs7", "-inform", "DER",
        "-in", str(work / "release.rsa"), "-print_certs",
        "-out", str(work / "cert.pem"),
    ], check=True)
    subprocess.run([
        "openssl", "x509", "-in", str(work / "cert.pem"),
        "-outform", "DER", "-out", str(work / "cert.der"),
    ], check=True)

    certificate = (work / "cert.der").read_bytes()
    prk = mac(bytes(32), certificate)
    assert len(half_a) == len(half_b) == 32768
    ciphertext = bytes(a ^ b for a, b in zip(half_a, half_b))

    encoded_info = bytes([
        0x2c, 0x26, 0x31, 0x3c, 0x72, 0x32,
        0x3e, 0x2c, 0x34, 0x72, 0x29, 0x6e,
    ])
    for mask in range(256):
        info = bytes(value ^ mask for value in encoded_info)
        key = mac(prk, info + b"\x01")
        dex = ChaCha20.new(key=key, nonce=bytes(12)).decrypt(ciphertext)
        if dex.startswith(b"dex\n039\x00"):
            print(f"Recovered DEX: mask={mask:#x}, info={info!r}")
            break
    else:
        raise RuntimeError("DEX reconstruction failed")

    dex_path = work / "vault.dex"
    dex_path.write_bytes(dex)
    subprocess.run([
        "jadx", "-d", str(work / "vault"), str(dex_path),
    ], check=True, stdout=subprocess.DEVNULL)

    source = (work / "vault/sources/xyz/srspace/vault/Vault.java").read_text()
    values = re.search(r"BLOB\s*=\s*\{([^}]+)\}", source).group(1)
    blob = bytes(int(value.strip()) & 255 for value in values.split(","))
    vault_key = mac(prk, b"sync-vault-key-v1\x01")
    cipher = AES.new(vault_key, AES.MODE_GCM, nonce=blob[:12])
    plaintext = cipher.decrypt_and_verify(blob[12:-16], blob[-16:])
    print(plaintext.rstrip(b"\x00").decode("ascii"))
```

Expected output includes:

```text
Recovered DEX: mask=0x5f, info=b'sync-mask-v1'
isfcr{tw1n_pr0cess_h4ndshake_mem0ry_0nly_9f23ac}
```
