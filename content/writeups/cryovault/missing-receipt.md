---
title: "Missing Receipt"
description: "We are provided with five forensic artifacts collected from a field relay environment: desc.txt: Challenge description stating that CRYO-LT-07 started an export at 03:17 UTC and pushed…"
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/2/writeup.md"
---

- **Category:** Forensics
- **Difficulty:** Insane / Hard
- **Flag Format:** `isfcr{...}`
- **Flag:** `isfcr{th3_r3l4y_h4d_1ts_0wn_v3rs10n_597c}`

---

## 1. Challenge Overview

We are provided with five forensic artifacts collected from a field relay environment:
- `desc.txt`: Challenge description stating that `CRYO-LT-07` started an export at `03:17 UTC` and pushed it to the field relay, after which someone "tidied up". The goal is to recover the export accepted in full by the relay.
- `acquisition.txt`: Acquisition notes detailing:
  - The client clock was running $6\text{ minutes }42\text{ seconds}$ ahead of reference time in local timezone `Asia/Kolkata` ($\text{UTC}+05:30$).
  - `relay.pcap` was captured on a passive tap directly in front of the relay host.
  - `agent_state.db` and `agent_state.db-wal` were acquired while the agent was running.
  - `field-unit.ext4` is an ext4 image of the unit's service partition.

---

## 2. Artifact Analysis

### 2.1 SQLite Configuration & State (`agent_state.db`)

Checking the `settings` table reveals the cryptographic and protocol architecture used by `cvagent 2.4.1`:

| Setting | Value / Formula |
|---|---|
| `relay.endpoint` | `203.0.113.67:7447/tcp` |
| `relay.protocol` | `cvrl/1` |
| `spool.magic.hex` | `43563300` (`CV3\0`) |
| `spool.layout` | `magic[4] nonce[12] aes-256-gcm(ciphertext\|\|tag[16])` |
| `spool.aad` | `relay-v3\|{session_id}` |
| `spool.plaintext` | `tar.gz` |
| `key.wrap` | `AES-KW-256 (RFC 3394) over 32-byte spool key` |
| `key.store` | `/var/lib/cryovault/keys (service partition)` |
| `key.record` | `magic 'CVKEK3\0\0' \| kek_id[16] \| sealed[32] \| sha256(preceding)[:16]` |
| `key.unseal` | `kek = sealed XOR sha256('cvkek3|' + kek_id + '|' + str(i_generation of owning inode))` |
| `key.derive` | `kek_eff = HKDF-SHA256(ikm=kek, salt=relay_nonce, info='relay-v3|' + session_id + '|' + started_local + '|' + key_slot, L=32)` |
| `key.relay_nonce`| `16 bytes issued by the relay when a session is opened` |

### 2.2 Time Skew & Correlating the 03:17 Export

The reference time is `03:17:00 UTC`.
- Local time offset: $\text{UTC} + 05:30 \implies \text{08:47:00}$.
- Clock skew: $+6\text{m }42\text{s} \implies \text{09:02:57}$ local time on `CRYO-LT-07`.

The database's active `jobs` table only retained 3 jobs due to a queue purge (`queue purge (4)` in `activity`). By inspecting raw SQLite WAL frames (`agent_state.db-wal`), we recovered the deleted job records:
- **Session ID:** `6ecc22c6-2398-40c2-abd4-5601770684e3`
- **Work Order:** `QX-17-CUSTODY`
- **Started Local:** `2026-10-17 09:02:57` (matches reference 03:17 UTC)
- **Key Slot:** `slot-60bfe90cdfa8`
- **Spool Length:** `26997` bytes (`0x6975`)
- **Spool SHA-256:** `7a012effadf82e1989c68144409299e8318bd726214d59e2039197473afb6eb1`
- **State:** `uploaded`

Carving the corresponding `spool_keys` record for `slot-60bfe90cdfa8` yielded:
- **Wrapped Key (40 bytes hex):** `673f893ec778cf6afecdb96666a0a50f4bf9bd471cba77389e5fe800d4662e00947b6a47981321eb`
- **KEK ID:** `389ecb36-7eb8-49b3-baaa-12f0e0a358de`

---

## 3. Cryptographic Key Recovery

### 3.1 Inode Carving & Generation Extraction (`field-unit.ext4`)

According to `key.unseal`, the KEK is unsealed using the `i_generation` field of the owning inode on `field-unit.ext4`.

Scanning `field-unit.ext4` for the KEK record magic `CVKEK3\0\0` and KEK ID `389ecb36-7eb8-49b3-baaa-12f0e0a358de` located two records:
1. Block 1352: Inode 59 (`dtime = 1792207018`, prior to export)
2. Block 1371: Inode 64 (`dtime = 1792207351`, after export)

Carving deleted directory entries from `/var/lib/cryovault/keys` showed that `Inode 64` (`kr-da5196af93.blob`) was active during the 03:17 export.
Extracting the 32-bit `i_generation` from `Inode 64`:
$$\text{Generation} = 158282948$$

### 3.2 Unsealing and Deriving the Spool Key

1. **Unseal KEK:**
   $$\text{unseal\_input} = \text{"cvkek3|389ecb36-7eb8-49b3-baaa-12f0e0a358de|158282948"}$$
   $$\text{kek} = \text{sealed} \oplus \text{SHA256}(\text{unseal\_input})$$

2. **Extract Relay Nonce:**
   In `relay.pcap`, when TCP Stream 5 opened the session with message Type `0x01` (`6ecc22c6...`), the relay responded with Type `0x81`:
   - Session Token (8 bytes): `2a2d29825d66bb97`
   - Relay Nonce (16 bytes): `f044d4b085aad7f13d090f3e5db25f49`

3. **Key Derivation (HKDF-SHA256):**
   - $\text{Salt} = \text{relay\_nonce}$
   - $\text{Info} = \text{"relay-v3|6ecc22c6-2398-40c2-abd4-5601770684e3|2026-10-17 09:02:57|slot-60bfe90cdfa8"}$
   - $\text{Length} = 32$

4. **Unwrap Key (RFC 3394 AES-KW-256):**
   Unwrapping the 40-byte wrapped key using $\text{kek\_eff}$ succeeds with valid integrity:
   $$\text{Spool Key} = \text{2441d75d660c92ddbc9b7143fbc0e919b71581e6b7fa14f91baf2f3be1c90ea6}$$

---

## 4. Network Forensics & Spool Assembly

### 4.1 Passive Tap Inconsistencies & Path Resolution

`relay.pcap` contains passive tap artifacts: overlapping TCP sequence numbers with conflicting byte payloads caused by network retransmissions and segment anomalies.

By modeling the TCP sequence space as a directed graph where each edge represents an exact, non-overlapping segment transmission $[seq, seq + len)$, we discovered that for each stream there exists **exactly one** contiguous path from the initial `SYN` sequence to the final `FIN/RST` sequence that partitions the TCP stream with zero gaps and zero overlaps.

- **Stream 5 (Initial Upload):** Port 48396, Packets 251–375.
- **Stream 6 (Resume Upload):** Port 55085, Packets 380–493 (resuming at offset `0x3679`).

### 4.2 Application Protocol Reassembly (`cvrl/1`)

In the `cvrl/1` protocol:
- Client chunks are sent with message Type `0x03`:
  - `[0:2]`: Chunk sequence number
  - `[2:6]`: File offset
  - `[6:]`: Spool payload data
- The relay acknowledges each chunk with message Type `0x83`:
  - `status = 0`: Accepted
  - `status != 0`: Rejected / Duplicate

Assembling only chunks that received `status = 0` produces a 26,997-byte file whose SHA-256 matches the expected checksum from the SQLite job record:
$$\text{SHA-256}(\text{spool}) = \text{7a012effadf82e1989c68144409299e8318bd726214d59e2039197473afb6eb1}$$

---

## 5. Decryption & Flag Extraction

Using the parameters specified in `settings`:
- **Cipher:** AES-256-GCM
- **Key:** `2441d75d660c92ddbc9b7143fbc0e919b71581e6b7fa14f91baf2f3be1c90ea6`
- **Nonce (12 bytes):** `spool[4:16]`
- **Ciphertext + Tag (16 bytes):** `spool[16:]`
- **AAD:** `b'relay-v3|6ecc22c6-2398-40c2-abd4-5601770684e3'`

Decrypting produces the plaintext `tar.gz` archive containing:
- `manifest.json`
- `telemetry.bin`
- `custody-result.txt`

Reading `custody-result.txt`:
```text
work order QX-17-CUSTODY
sealed: isfcr{th3_r3l4y_h4d_1ts_0wn_v3rs10n_597c}
```

---

## 6. Complete Solution Script

```python
#!/usr/bin/env python3
import hashlib
import io
import tarfile
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.keywrap import aes_key_unwrap
import scapy.all as scapy

# 1. Unseal KEK and derive spool key
with open('field-unit.ext4', 'rb') as f:
    ext4 = f.read()

# Inode 64 owns block 1371 (offset 0x156c00), generation = 158282948
rec = ext4[0x156c00:0x156c00 + 72]
sealed = rec[24:56]
kek_id = '389ecb36-7eb8-49b3-baaa-12f0e0a358de'
i_generation = 158282948

h_unseal = hashlib.sha256(f'cvkek3|{kek_id}|{i_generation}'.encode()).digest()
kek = bytes(a ^ b for a, b in zip(sealed, h_unseal))

relay_nonce = bytes.fromhex('f044d4b085aad7f13d090f3e5db25f49')
session_id = '6ecc22c6-2398-40c2-abd4-5601770684e3'
started_local = '2026-10-17 09:02:57'
key_slot = 'slot-60bfe90cdfa8'
info = f'relay-v3|{session_id}|{started_local}|{key_slot}'.encode()

hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=relay_nonce, info=info)
kek_eff = hkdf.derive(kek)

wrapped_key = bytes.fromhex('673f893ec778cf6afecdb96666a0a50f4bf9bd471cba77389e5fe800d4662e00947b6a47981321eb')
spool_key = aes_key_unwrap(kek_eff, wrapped_key)

# 2. Reassemble network capture along exact contiguous paths
pkts = scapy.rdpcap('relay.pcap')

def find_contiguous_path(sport, base_seq, end_seq):
    client_pkts = []
    for i, p in enumerate(pkts):
        if 'TCP' in p and p['TCP'].sport == sport and bytes(p['TCP'].payload):
            client_pkts.append((i + 1, p['TCP'].seq, len(bytes(p['TCP'].payload)), bytes(p['TCP'].payload)))
    
    def find_paths(cur_seq, path):
        if cur_seq == end_seq:
            return [path]
        res = []
        for pkt_num, seq, plen, data in client_pkts:
            if seq == cur_seq:
                sub = find_paths(cur_seq + plen, path + [(pkt_num, seq, plen, data)])
                res.extend(sub)
        return res

    return find_paths(base_seq, [])[0]

path5 = find_contiguous_path(48396, 439600694, 439623232)
path6 = find_contiguous_path(55085, 1724160559, 1724181339)

s5_client_data = b''.join(x[3] for x in path5)
s6_client_data = b''.join(x[3] for x in path6)

def reassemble_server(sport, dport):
    server_pkts = [p for p in pkts if 'TCP' in p and p['TCP'].sport == sport and p['TCP'].dport == dport and bytes(p['TCP'].payload)]
    for p in pkts:
        if 'TCP' in p and 'SA' in p['TCP'].sprintf('%TCP.flags%') and p['TCP'].dport == dport:
            base_seq = p['TCP'].seq + 1
    total_len = max(p['TCP'].seq + len(bytes(p['TCP'].payload)) for p in server_pkts) - base_seq
    buf = bytearray(total_len)
    for p in server_pkts:
        seq = p['TCP'].seq
        data = bytes(p['TCP'].payload)
        for i, b in enumerate(data):
            idx = (seq - base_seq) + i
            if 0 <= idx < total_len:
                buf[idx] = b
    return bytes(buf)

s5_server_data = reassemble_server(7447, 48396)
s6_server_data = reassemble_server(7447, 55085)

def parse_server_acks(data):
    pos = 0
    acks = {}
    while pos + 6 <= len(data):
        if data[pos:pos + 2] != b'\xc7R': break
        mtype = data[pos + 2]
        mlen = int.from_bytes(data[pos + 3:pos + 6], 'big')
        payload = data[pos + 6:pos + 6 + mlen]
        pos += 6 + mlen
        if mtype == 0x83:
            cseq = int.from_bytes(payload[0:2], 'big')
            status = payload[2]
            next_off = int.from_bytes(payload[3:7], 'big')
            acks[cseq] = (status, next_off)
    return acks

all_acks = {**parse_server_acks(s5_server_data), **parse_server_acks(s6_server_data)}

def extract_chunks(data):
    pos = 0
    chunks = []
    while pos + 6 <= len(data):
        if data[pos:pos + 2] != b'\xc7R': break
        mtype = data[pos + 2]
        mlen = int.from_bytes(data[pos + 3:pos + 6], 'big')
        payload = data[pos + 6:pos + 6 + mlen]
        pos += 6 + mlen
        if mtype == 3:
            chunk_seq = int.from_bytes(payload[:2], 'big')
            chunk_off = int.from_bytes(payload[2:6], 'big')
            chunks.append((chunk_seq, chunk_off, payload[6:]))
    return chunks

all_chunks = extract_chunks(s5_client_data) + extract_chunks(s6_client_data)

spool = bytearray(26997)
for cseq, coff, cdata in all_chunks:
    status, _ = all_acks.get(cseq, (None, None))
    if status == 0:
        spool[coff:coff + len(cdata)] = cdata

# 3. Decrypt payload
nonce = spool[4:16]
ct_and_tag = spool[16:]
aad = f'relay-v3|{session_id}'.encode()

plaintext = AESGCM(spool_key).decrypt(nonce, ct_and_tag, aad)

with tarfile.open(fileobj=io.BytesIO(plaintext), mode='r:*') as tar:
    flag_file = tar.extractfile('custody-result.txt').read().decode()
    print(flag_file)
```
