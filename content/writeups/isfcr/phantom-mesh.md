---
title: "Phantom Mesh"
description: "An unrecognized device was observed on a Lumeta smart-lighting mesh, sending a periodic diagnostic report. The challenge supplies:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/phantom-mesh.md"
---

**Category:** Wireless forensics / cryptography / power side-channel analysis  
**Flag format:** `isfcr{...}`  
**Status:** Solved; authenticated cryptographic verification passed.

## Flag

```text
isfcr{ph4nt0m_m3sh_h4rm0n1cs_un14sk_th3_tc_l1nk_k3y}
```

## Challenge objective and evidence

An unrecognized device was observed on a Lumeta smart-lighting mesh, sending a periodic diagnostic report. The challenge supplies:

- `mesh.pcap` — IEEE 802.15.4 frames containing vendor-specific Lumeta Mesh Protocol (LMP) messages.
- `traces/iq.npz` — 2,500 trigger-aligned I/Q records, each 2,500 complex samples.
- `traces/nonces.csv` — the public 16-byte `KEY_CONFIRM` nonce corresponding to each trace.
- `docs/LMP-protocol.md` — LMP framing, key hierarchy, AES-CCM* nonce/AAD specifications, and message layouts.
- `docs/sdr-capture.md` — capture setup and the vendor's note about instability in the coordinator's power-amplifier bias feed.

The target diagnostic report is encrypted under a per-mesh Network Key (NWK Key). The NWK Key is distributed in a `TRANSPORT_KEY` command encrypted under a fleet-wide Trust Center (TC) Link Key. That TC Link Key is not directly present in the files, so we first recover it through power analysis of the coordinator's transmissions.

## 1. Inspect the radio frames

The PCAP uses link type **195**, IEEE 802.15.4 with a two-byte frame check sequence (FCS). Within the MAC payload, an LMP packet begins:

```text
1c 03 <command> <body>
```

The command byte identifies the important packets:

| Command | Name | Count in capture | Protection |
|---|---|---:|---|
| `0x30` | BEACON | 1 | Plaintext |
| `0x12` | KEY_CONFIRM | 8 | Plaintext; contains a cryptographic verification tag |
| `0x11` | TRANSPORT_KEY | 1 | AES-CCM* under TC Link Key |
| `0x21` | SECURE_REPORT | 96 | AES-CCM* under NWK Key |

There are **106 frames** in total. The LMP header is inside each frame, and the two trailing MAC FCS bytes must **not** be fed into AES-CCM*.

The key-confirmation message has a 16-byte known `nonce` and an eight-byte `confirm_tag`. Although the notes only describe a deterministic derivation, we can determine and verify the actual primitive after recovering the key:

```python
confirm_tag == AES_128_ECB_Encrypt(TC_Link_Key, nonce)[:8]
```

## 2. Recover the TC Link Key using correlation power analysis

The coordinator implements AES in software. The SDR note highlights an inadequately decoupled PA supply: the transmitted I/Q **envelope power** contains a small amount of data-dependent leakage from the crypto computation. The trigger aligns the 2,500 captures to within approximately one sample, making statistical analysis practical.

For complex I/Q samples, compute the per-sample observed power:

\[
P_{j,t} = |I_{j,t} + iQ_{j,t}|^2 = I_{j,t}^2 + Q_{j,t}^2
\]

For each guessed AES key byte `k` and corresponding known nonce byte `n[j, b]`, use the first-round AES S-box Hamming-weight leakage model:

\[
H_{j,b,k} = \operatorname{HW}(\operatorname{SBox}(n_{j,b} \oplus k))
\]

Compute the Pearson correlation between each predicted vector `H[:,b,k]` and the measured power vector `P[:,t]` for each nearby sample time. The largest absolute correlation indicates the most likely key byte.

The observable leakage occurs in 16 sequential windows spaced about **48 samples** apart, beginning near sample **1051**. Searching a small region around `1044 + 48*b` for byte index `b` is sufficient. The correct key byte ranks first for all 16 bytes; the peak absolute correlations are approximately 0.12–0.17.

**Recovered 128-bit TC Link Key:**

```text
7cf8b0b78be9f36a225c1e70692e1e1c
```

### Independent confirmation of the recovered key

The eight observed `KEY_CONFIRM` tags all match the first eight bytes of AES-ECB applied to their nonces with the recovered key. For example, the first captured confirmation contains:

```text
nonce       = fa834b9abd379d2c17b312c34411b815
confirm_tag = c38d863b06d04469
```

Computing `AES-128-ECB(key, nonce)[:8]` returns `c38d863b06d04469`. All eight checks pass. This rules out a chance correlation or incorrect candidate key.

## 3. Unwrap the Network Key

The `TRANSPORT_KEY` is frame **39** with zero-based PCAP indexing (frame **40** in a one-based viewer). The vendor uses AES-CCM* with a 128-bit key, 13-byte nonce and four-byte MIC (`M=4`, `L=2`). The message body is:

```text
sec_ctl (1) | frame_counter_le (4) | src_eui64_le (8) | ciphertext (16) | MIC (4)
```

Per the vendor documentation, the decryption parameters are:

```python
nonce = src_eui64_le[::-1] + frame_counter_le + sec_ctl
aad   = sec_ctl + frame_counter_le + src_eui64_le
plaintext = AESCCM(tc_link_key, tag_length=4).decrypt(nonce, ciphertext + mic, aad)
```

The source EUI-64 is **big-endian in the nonce**, but **little-endian in AAD**. Using the same ordering in both places fails authentication.

For the transport packet:

```text
source EUI-64 = 00124b0025aa0001
frame counter = 100 (0x64)
security ctrl = 05
nonce         = 00124b0025aa00016400000005
aad           = 05640000000100aa25004b1200
```

The MIC authenticates successfully and reveals the **NWK Key**:

```text
ffa0be732cd8f56eae8caa21359baf06
```

## 4. Decrypt the anomalous report

Frame **80** (zero-based; **81** in a one-based viewer) is the distinctive long `SECURE_REPORT` from the unusual node:

```text
source EUI-64 = 00124b0025aa0040
frame counter = 3501 (0x0dad)
security ctrl = 05
nonce         = 00124b0025aa0040ad0d000005
aad           = 05ad0d00004000aa25004b1200
```

AES-CCM* authentication succeeds using the recovered NWK Key. The authenticated plaintext has the ZCL-like structure:

```text
cluster_id_le (2) | attribute_id_le (2) | value_length_le (2) | value
```

Its header decodes as follows:

| Field | Decoded value |
|---|---|
| Cluster ID | `0xFC01` (`01 fc` on the wire) |
| Attribute ID | `0x0042` (`42 00` on the wire) |
| Value length | `52` (`34 00` on the wire) |
| Value encoding | ASCII |

The authenticated plaintext is:

```text
01 fc 42 00 34 00 | isfcr{ph4nt0m_m3sh_h4rm0n1cs_un14sk_th3_tc_l1nk_k3y}
```

The decoded string is exactly 52 bytes, printable ASCII, and meets the flag format without spaces inside the braces.

## 5. Root cause and significance

This was **not** a direct mathematical break of AES or AES-CCM*. The cryptographic key was recovered because the coordinator's radio power envelope leaked information correlated with the software AES S-box intermediate. The design amplified the damage by reusing a **fleet-wide TC Link Key**: compromising that one key exposes the encrypted key-distribution procedure for any affected coordinator observed by the attacker. The subsequent authenticated decryption proves that the recovered data belongs to the captured transmissions.

The relevant defensive lessons are to address side-channel leakage at the firmware/hardware level, avoid globally shared provisioning keys, and keep independent per-site/per-device keys with rotation and revocation procedures.

## 6. Reproduce the solution

Requirements: Python 3, `numpy`, and `cryptography`. Extract `phantom-mesh.zip` and run the solver (also provided separately alongside this writeup):

```bash
python3 -m pip install numpy cryptography
unzip phantom-mesh.zip
OPENBLAS_NUM_THREADS=1 python3 solve_phantom_mesh.py phantom-mesh
```

The solver performs the complete CPA attack **from the I/Q traces and public nonces**, confirms all eight AES tags, decrypts the transport key, and authenticates and extracts the target report. No recovered key is hardcoded in the script.

### Full solver (`solve_phantom_mesh.py`)

```python
#!/usr/bin/env python3
"""Reproduce Phantom Mesh side-channel key recovery and authenticated decrypts.
Run from the extracted phantom-mesh directory, or pass its path as argv[1].
Dependencies: numpy, cryptography.
"""
import csv
import struct
import sys
from pathlib import Path

import numpy as np
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESCCM

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")


def gf_mul(x, y):
    result = 0
    for _ in range(8):
        if y & 1:
            result ^= x
        x = (x << 1) ^ (0x11B if x & 0x80 else 0)
        x &= 0xFF
        y >>= 1
    return result


def gf_pow(x, n):
    result = 1
    while n:
        if n & 1:
            result = gf_mul(result, x)
        x = gf_mul(x, x)
        n >>= 1
    return result


def rol8(x, n):
    return ((x << n) | (x >> (8 - n))) & 255


def sbox_byte(x):
    a = gf_pow(x, 254) if x else 0
    return a ^ rol8(a, 1) ^ rol8(a, 2) ^ rol8(a, 3) ^ rol8(a, 4) ^ 0x63


SBOX = np.array([sbox_byte(i) for i in range(256)], dtype=np.uint8)
HW = np.array([i.bit_count() for i in range(256)], dtype=np.float32)


def recover_link_key():
    with (ROOT / "traces/nonces.csv").open(newline="") as f:
        nonces = np.array(
            [list(bytes.fromhex(r["nonce_hex"])) for r in csv.DictReader(f)],
            dtype=np.uint8,
        )
    iq = np.load(ROOT / "traces/iq.npz")["iq"]
    assert iq.shape == (2500, 2500) and nonces.shape == (2500, 16)

    # The PA's power envelope leaks the software AES first-round S-box output.
    power = (iq.real ** 2 + iq.imag ** 2).astype(np.float32)
    power -= power.mean(axis=0)
    power /= np.maximum(power.std(axis=0), 1e-8)

    key = bytearray()
    for b in range(16):
        # The 16 consecutive byte operations are ~48 samples apart.
        # Analyze the narrow high-leakage interval, starting near sample 1051.
        start = 1044 + 48 * b
        observed = power[:, start:start + 12]
        guesses = np.arange(256, dtype=np.uint8)
        model = HW[SBOX[nonces[:, b, None] ^ guesses[None, :]]]
        model -= model.mean(axis=0)
        model /= np.maximum(model.std(axis=0), 1e-8)
        corr = model.T @ observed / len(nonces)
        scores = np.max(np.abs(corr), axis=1)
        best = int(np.argmax(scores))
        key.append(best)
        print(f"byte {b:02d}: {best:02x}  |Pearson r|={scores[best]:.4f}")
    return bytes(key)


def load_pdus():
    with (ROOT / "mesh.pcap").open("rb") as f:
        hdr = f.read(24)
        assert hdr[:4] == b"\xd4\xc3\xb2\xa1"  # little-endian PCAP
        assert struct.unpack_from("<I", hdr, 20)[0] == 195  # 802.15.4 + FCS
        out = []
        while packet_header := f.read(16):
            assert len(packet_header) == 16
            length = struct.unpack_from("<I", packet_header, 8)[0]
            raw = f.read(length)
            at = raw.find(b"\x1c\x03")
            assert at >= 0 and length >= at + 5
            out.append(raw[at:-2])  # discard 2-byte 802.15.4 FCS
    return out


def decrypt_secure_pdu(pdu, key):
    body = pdu[3:]  # skip 1C 03 cmd
    sec = body[:1]
    ctr_le = body[1:5]
    source_le = body[5:13]
    nonce = source_le[::-1] + ctr_le + sec
    aad = sec + ctr_le + source_le
    return AESCCM(key, tag_length=4).decrypt(nonce, body[13:], aad)


def main():
    tc = recover_link_key()
    print("TC Link Key:", tc.hex())
    pdus = load_pdus()
    confirms = [p for p in pdus if p[2] == 0x12]
    assert len(confirms) == 8
    encryptor = Cipher(algorithms.AES(tc), modes.ECB()).encryptor()
    for pdu in confirms:
        assert encryptor.update(pdu[3:19])[:8] == pdu[19:27]
    encryptor.finalize()
    print("Validated all 8 KEY_CONFIRM tags")

    transports = [p for p in pdus if p[2] == 0x11]
    assert len(transports) == 1
    nwk = decrypt_secure_pdu(transports[0], tc)
    assert len(nwk) == 16
    print("NWK Key:    ", nwk.hex())

    for n, pdu in enumerate(pdus):
        if pdu[2] != 0x21:
            continue
        try:
            plain = decrypt_secure_pdu(pdu, nwk)
        except Exception:
            continue  # not the diagnostic frame (other nodes/keys)
        if len(plain) < 6:
            continue
        cluster, attr, length = struct.unpack_from("<HHH", plain, 0)
        if (cluster, attr) != (0xFC01, 0x0042):
            continue
        value = plain[6:]
        assert length == len(value)
        flag = value.decode("ascii")
        assert flag.startswith("isfcr{") and flag.endswith("}")
        assert all(33 <= ord(c) <= 126 for c in flag[6:-1])
        print(f"Report packet: {n}, cluster=0x{cluster:04x}, attribute=0x{attr:04x}, length={length}")
        print("FLAG:", flag)
        return
    raise RuntimeError("Diagnostic report not found")


if __name__ == "__main__":
    main()
```

### Expected final output

```text
TC Link Key: 7cf8b0b78be9f36a225c1e70692e1e1c
Validated all 8 KEY_CONFIRM tags
NWK Key:     ffa0be732cd8f56eae8caa21359baf06
Report packet: 80, cluster=0xfc01, attribute=0x0042, length=52
FLAG: isfcr{ph4nt0m_m3sh_h4rm0n1cs_un14sk_th3_tc_l1nk_k3y}
```

**Final flag:** `isfcr{ph4nt0m_m3sh_h4rm0n1cs_un14sk_th3_tc_l1nk_k3y}`
