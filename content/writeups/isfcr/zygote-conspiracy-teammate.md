---
title: "Zygote-Conspiracy Bundle"
description: "The two apps are two halves of one decryption scheme. Each ships a 32 KB half.bin. At runtime the native libs exchange halves through sealed memfds, XOR them, and ChaCha20-decrypt the…"
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/zygote-conspiracy-teammate.md"
---

**Challenge:** `notesync.apk` + `batterybuddy.apk`, flag format `isfcr{...}`
**Flag:** `isfcr{tw1n_pr0cess_h4ndshake_mem0ry_0nly_9f23ac}`

## TL;DR

The two apps are two halves of one decryption scheme. Each ships a 32 KB `half.bin`. At runtime the native libs exchange halves through sealed `memfd`s, XOR them, and ChaCha20-decrypt the result into a hidden DEX. That DEX holds an AES-GCM blob whose key is derived from the shared signing certificate. Everything is derivable offline from the two APKs.

## 1. Recon

Both APKs have the same layout:

| File | Purpose |
|---|---|
| `classes.dex` | Activity UI plus `xyz.srspace.core.P` (JNI stub) |
| `lib/*/libbuddy.so`, `libnotesync.so` | Native `P.init` / `P.reset` |
| `assets/half.bin` | 32768 bytes each, different content |
| `META-INF/RELEASE.RSA` | Signing cert |

The signing certs are byte-identical (`CN=Srspace`, SHA-256 `F8:6B:E1:82:…:E5:C9`). That is what makes the pairing work.

## 2. Java layer

Both activities do the same thing in `doCheck` / `doSync`:

1. Read `assets/half.bin`.
2. Get the signing cert DER via `PackageManager.getPackageInfo(..., 64)`.
3. Call `P.init(half, certDer)`, which returns a `ByteBuffer` or `null`.
   - `null` gives "No companion detected" / "Peer unreachable".
4. Load the buffer with `InMemoryDexClassLoader`.
5. Call `xyz.srspace.vault.Vault.reveal(byte[] cert)` by reflection.

## 3. Native layer (`Java_xyz_srspace_core_P_init`)

Reversed from the x86_64 build (the arm64 build matches).

1. **Tag.** `tag = hex(HMAC-SHA256(key=cert, msg=label)[:8])`.
2. **Publish.** The process creates a `memfd_create` named `sync.<A|B>.<tag>`, writes its half into it, and applies seals. `A` is Note Sync, `B` is Battery Buddy.
3. **Find the sibling.**
   - It scans `/proc/*/cmdline` for the other package name (`xyz.srspace.notesync` or `xyz.srspace.batterybuddy`).
   - It then walks `/proc/<pid>/fd/*`, `readlink`s each entry, and matches `/memfd:sync.<other>.<tag> (deleted)`.
   - It retries 40 times at 100 ms intervals, then gives up ("sibling not found").
4. **Mask.** It mmaps the sibling's memfd (32768 bytes, read-only) and computes `combined = own_half XOR sibling_half`.
5. **Key derivation (HKDF-SHA256).**
   - `PRK = HMAC(salt = 32 zero bytes, cert)`
   - `key = HMAC(PRK, "sync-mask-v1" || 0x01)`
6. **Decrypt.** ChaCha20 with that key, 32-bit counter starting at 0, 96-bit nonce all zeros, applied to `combined`. The code uses `expand 32-byte k` and the SIMD rotate shuffle tables.
7. The 32768-byte result is returned as a direct `ByteBuffer`, which is the in-memory DEX.

Neither half alone, nor either app alone, yields the DEX. That is the "unrelated apps" trick.

**Note on the HKDF info string.** My disassembly of the obfuscated label bytes initially suggested XOR-with-`0x30` garbage. Decoding with `0x5f` gives `sync-mask-v1` (12 bytes), and only that value produces a valid DEX header. Always validate against the output.

## 4. Offline reconstruction

```python
import hmac, hashlib
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms

cert = open('cert.der','rb').read()      # from META-INF/RELEASE.RSA (openssl pkcs7 -print_certs)
a = open('bb/assets/half.bin','rb').read()
b = open('ns/assets/half.bin','rb').read()
comb = bytes(x ^ y for x, y in zip(a, b))

K   = hmac.new(b'\x00'*32, cert, hashlib.sha256).digest()
key = hmac.new(K, b'sync-mask-v1' + b'\x01', hashlib.sha256).digest()
dex = Cipher(algorithms.ChaCha20(key, b'\x00'*16), mode=None).encryptor().update(comb)
assert dex[:4] == b'dex\n'               # "dex\n039"
open('payload.dex','wb').write(dex)
```

The output starts with `dex\n039` and is exactly 32768 bytes. Its Adler32 field is not valid, so I fixed it on a copy (`zlib.adler32(dex[12:])` written at offset 8) so androguard would parse it. This is only needed for static analysis.

## 5. The hidden DEX: `xyz.srspace.vault.Vault`

- Static field `BLOB` is a 204-byte array.
- `hkdf(ikm, salt, info, len)` is a standard HKDF-SHA256 (an empty salt becomes 32 zero bytes).
- `reveal(cert)` does the following:
  1. `key = hkdf(ikm = cert, salt = empty, info = "sync-vault-key-v1", len = 32)`
  2. `iv = BLOB[0:12]`, `ct||tag = BLOB[12:]`
  3. AES-256-GCM decrypt with a 128-bit tag.
  4. Strip trailing `0x00` bytes and decode as ASCII.

## 6. Decrypting the vault

```python
def hkdf(ikm, salt, info, n):
    salt = salt or b'\x00'*32
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    out = t = b''; i = 1
    while len(out) < n:
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        out += t; i += 1
    return out[:n]

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
key = hkdf(cert, b'', b'sync-vault-key-v1', 32)
pt  = AESGCM(key).decrypt(blob[:12], blob[12:], None)
print(pt.rstrip(b'\0'))
```

Result:

```
isfcr{tw1n_pr0cess_h4ndshake_mem0ry_0nly_9f23ac}
```

## Summary of the chain

```
half.bin(BB) XOR half.bin(NS)
        │
        ▼
ChaCha20(key = HKDF(cert, "sync-mask-v1"), nonce = 0)
        │
        ▼
hidden DEX  ──►  Vault.BLOB
        │
        ▼
AES-256-GCM(key = HKDF(cert, "sync-vault-key-v1"))
        │
        ▼
isfcr{tw1n_pr0cess_h4ndshake_mem0ry_0nly_9f23ac}
```
