---
title: "Port 0xBEEF (Hyper-Nested)"
description: "Incident Case File: #2026-2184-GAMMA | PORT 0xBEEF (HYPER-NESTED) Category: Networking / Network Forensics / Cryptography Target Flag Format: XploitX[beta]{...} (decoded as XploitXβ{...})"
event: "xploit"
category: "networking"
categoryLabel: "Networking"
tags: ["XploitX 2026","networking"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit-2/networking/port-oxbeef/writeup.md"
---

## Challenge Overview

- **Incident Case File**: `#2026-2184-GAMMA | PORT 0xBEEF (HYPER-NESTED)`
- **Category**: Networking / Network Forensics / Cryptography
- **Target Flag Format**: `XploitX[beta]{...}` (decoded as `XploitXβ{...}`)

---

## 1. Initial Reconnaissance

Inspecting the directory files:
- `CASE_BRIEF.txt`:
  - Flag format: `XploitX[beta]{...}`
  - Key exchange over TCP headers: $p = 65521$, $g = 17$.
  - Pipeline: `XOR(SHA512) -> GZIP -> Invert/Reverse -> ZLIB -> InvAffine -> BZ2`.
- `volatility_volshell_dump.txt`:
  - `PID: 4910 | Image: vault_daemon.elf | Command: /usr/local/bin/vault_daemon --port 0xBEEF`
  - `Crypto: DH Key Exchange (p=65521, g=17). Master key = SHA512(Shared_Secret).`
  - `Pipeline: XOR(SHA512) -> GZIP -> Invert(~b)/Reverse -> ZLIB -> Inverse_Affine[(b^0xAA - 37)*modinv(13,256)] -> BZ2.`
- `knock_daemon.log`:
  - Shows client public key $A$ sent on port `22222`.
  - Server public key $B$ transmitted in `RST/ACK`.
  - Client private key $a$ verified on port `33333`.
  - Port `48879` (`0xBEEF`) opened for 500ms.

---

## 2. Diffie-Hellman Key Exchange Analysis

Inspecting frames 119 to 122 in `capture_port_knock_mirror.pcap`:

1. **Frame 119** (`192.168.100.50:51001 -> 192.168.100.1:22222`):
   - Client sends a `SYN` packet.
   - Window size: `62852`.
   - Client Public Key: $A = 62852$.

2. **Frame 120** (`192.168.100.1:22222 -> 192.168.100.50:51001`):
   - Server responds with `RST, ACK`.
   - Raw Acknowledgment number: `50290`.
   - Server Public Key: $B = 50290$.

3. **Frame 121** (`192.168.100.50:51002 -> 192.168.100.1:33333`):
   - Client sends a `SYN` packet.
   - Window size: `1337`.
   - Client Private Key: $a = 1337$.

Verification:
$$A = g^a \pmod{p} = 17^{1337} \pmod{65521} = 62852 \quad \text{(Confirmed)}$$

Computing the shared secret $s$:
$$s = B^a \pmod{p} = 50290^{1337} \pmod{65521} = 29048$$

The master key is computed as:
$$\text{Master Key} = \text{SHA512}(s \text{ as a 4-byte big-endian integer}) = \text{SHA512}(\texttt{\\x00\\x00\\x71\\x78})$$

---

## 3. Data Extraction and Packet Reassembly

In `capture_port_knock_mirror.pcap`, after the knock sequence, client port `55412` connects to vault port `48879` (`0xBEEF`) and sends:
```
VAULT_CMD_EXTRACT_HYPER_NESTED_CORE_ARCHIVE\n
```

The server responds with 10 data packets (`PSH, ACK, URG`). Examining the TCP headers reveals that the packets carry non-zero **Urgent Pointers** representing chunk indexes from `0` to `9`:

| Frame | Seq | Urgent Pointer | Payload Length | Payload (Hex Text) |
|:-----:|:---:|:--------------:|:--------------:|:-------------------|
| 145   | 219 | **0**          | 26             | `d3f6e7d8a08b3506d22c7f8287` |
| 143   | 193 | **1**          | 26             | `6197c034518a4ac1851a5a2761` |
| 141   | 167 | **2**          | 26             | `483ecaceaca6ce6526baa1e5a1` |
| 135   | 105 | **3**          | 26             | `7e5950a2f023575ffcd8f851ab` |
| 133   | 79  | **4**          | 26             | `c045edabe305c93b25683289ec` |
| 131   | 53  | **5**          | 26             | `5b73608fb9f300f26a0e71e08d` |
| 137   | 131 | **6**          | 26             | `18af347cf315eb789eb1fc3394` |
| 129   | 27  | **7**          | 26             | `e2dfc20e0a2f94fc95fbd8d367` |
| 127   | 1   | **8**          | 26             | `89f8ff049cb2147028d12d3f97` |
| 139   | 157 | **9**          | 10             | `7c51dba42f`                 |

Concatenating payloads ordered by `Urgent Pointer` ascending ($0 \to 9$) yields a 244-character hex ASCII string. Unhexifying it results in 122 bytes of encrypted data.

---

## 4. De-encapsulation Pipeline

Following the reverse pipeline specified in `volatility_volshell_dump.txt` and `CASE_BRIEF.txt`:

1. **XOR (SHA512)**:
   - XOR each byte with $\text{SHA512}(\text{uint32\_be}(29048))$.
   - Output begins with `\x1f\x8b`, the standard GZIP magic header.

2. **GZIP Decompress**:
   - Decompressing the 122 bytes produces 99 bytes.

3. **Invert / Reverse**:
   - Reverse the byte order and invert each bit:
     $$\text{out}[i] = (\sim \text{in}[len - 1 - i]) \ \&\ 0\text{xFF}$$

4. **ZLIB Decompress**:
   - Decompressing the inverted and reversed bytes produces 88 bytes.

5. **Inverse Affine Permutation**:
   - Formula:
     $$\text{byte}' = \left(((b \oplus 0\text{xAA}) - 37) \times 13^{-1}\right) \pmod{256}$$
   - Where $\text{modinv}(13, 256) = 197$.
   - The result begins with `BZh91AY&SY`, the standard BZIP2 header.

6. **BZ2 Decompress**:
   - Decompressing the BZ2 stream yields the flag.

---

## 5. Full Exploit Script

```python
#!/usr/bin/env python3
import bz2
import gzip
import hashlib
import subprocess
import zlib


def solve():
  # 1. Extract packets from PCAP using tshark
  cmd = [
      "tshark",
      "-r",
      "capture_port_knock_mirror.pcap",
      "-Y",
      "tcp.srcport == 48879 && tcp.len > 0",
      "-T",
      "fields",
      "-e",
      "tcp.urgent_pointer",
      "-e",
      "tcp.payload",
  ]
  output = subprocess.check_output(cmd).decode().strip().split("\n")

  chunks = []
  for line in output:
    urg, payload = line.split("\t")
    chunks.append((int(urg), bytes.fromhex(payload)))

  # Reassemble by urgent pointer (0 to 9)
  sorted_hex_ascii = b"".join(p[1] for p in sorted(chunks, key=lambda x: x[0]))
  enc_payload = bytes.fromhex(sorted_hex_ascii.decode("ascii"))

  # 2. Compute DH shared secret and key
  # p = 65521, g = 17, a = 1337, B = 50290
  p, a, B = 65521, 1337, 50290
  s = pow(B, a, p)  # 29048
  master_key = hashlib.sha512(s.to_bytes(4, "big")).digest()

  # Step 1: XOR
  step1 = bytes(
      [b ^ master_key[i % len(master_key)] for i, b in enumerate(enc_payload)]
  )

  # Step 2: GZIP Decompress
  step2 = gzip.decompress(step1)

  # Step 3: Invert & Reverse
  step3 = bytes([(~b) & 0xFF for b in step2[::-1]])

  # Step 4: ZLIB Decompress
  step4 = zlib.decompress(step3)

  # Step 5: Inverse Affine Permutation
  modinv13 = pow(13, -1, 256)  # 197
  step5 = bytes([(((b ^ 0xAA) - 37) * modinv13) % 256 for b in step4])

  # Step 6: BZ2 Decompress
  flag_bytes = bz2.decompress(step5)
  flag = flag_bytes.decode("utf-8")

  print(f"[+] Flag: {flag}")


if __name__ == "__main__":
  solve()
```

---

## 6. Flag

```text
XploitXβ{kn0ck_0xb33f_st4t3_m4ch1n3_byp4ss_8912}
```
*(Canonical Challenge Format: `XploitX[beta]{kn0ck_0xb33f_st4t3_m4ch1n3_byp4ss_8912}`)*
