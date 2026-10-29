---
title: "PHANTOM-15: The Sensor That Transmitted Nothing"
description: "PHANTOM-15 was declared permanently offline during an industrial pressure incident. Although the gateway delivered a low-priority continuity report, it did not deliver the subsequent…"
event: "isfcr"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CTF 2026","iot"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/phantom-15.md"
---

**Category:** IoT / Forensics / Cryptography  
**Flag format:** `isfcr{...}`

## Challenge summary

PHANTOM-15 was declared permanently offline during an industrial pressure incident. Although the gateway delivered a low-priority continuity report, it did not deliver the subsequent emergency diagnostic. Three independent IEEE 802.15.4 sniffers captured traffic on channels 15, 20, and 25, and a manufacturing lab provided AES qualification traces. The objective was to authenticate the transmissions, recover the erased diagnostic record, and explain the gateway's apparent silence.

## Evidence

| Artifact | Purpose |
|---|---|
| `sniffer_alpha.pcapng`, `sniffer_beta.pcapng`, `sniffer_gamma.pcapng` | Independent 802.15.4 captures on three channels |
| `scope_traces.npz` | Side-channel measurements recorded during AES operations |
| `qualification_vectors.csv` | AES input vectors associated with capture IDs and sessions |
| `scope_session_metadata.bin` | Binary metadata mapping sessions to radio key indices |
| `field_service_excerpt.txt` | MAC encryption, synchronization, transport, and record layouts |
| `incident_report.txt` | Event timeline and gateway's duplicate-event message |

## 1. Understand the radio protocol

The field-service notes specify IEEE 802.15.4-2006 on PAN `0x4f21`. Secured frames use security level **6** (ENC-MIC-64, i.e. an 8-byte authentication tag), key identifier mode **1**, and a key index to select a radio-key slot.

Construct the **13-byte CCM\*** nonce from the 8-byte source EUI-64 as it appears on air, the 4-byte frame counter as it appears on air, and the one-byte security-level field. Authenticate the MAC header (including its auxiliary security header) as associated data. Strip or separately check the little-endian frame check sequence before attempting authenticated decryption. Never interpret ciphertext as an application payload until the MIC verifies.

The three monitoring stations have separate clock offsets and drift, so timestamp order across the PCAPNG files is not trustworthy without synchronization.

## 2. Recover the radio keys from qualification measurements

The scope archive contains `traces` (floating-point ADC samples), `capture_id` and `sample_period_ns`. Join `capture_id` against `qualification_vectors.csv` to associate each power trace with its known 16-byte AES input. Parse `scope_session_metadata.bin` according to the `P15Q` little-endian layout described in the service excerpt, grouping traces by session and radio key index.

Recover the AES key using **correlation power analysis (CPA)** against the first-round S-box leakage model. For each key byte position `j` and candidate byte `g` from 0 to 255, compute the hypothetical leakage for trace `i`:

```python
hypothetical[i] = HW(AES_SBOX[aes_input[i, j] ^ g])
```

Here `HW` is the bit count of a byte. Compute the Pearson correlation between this vector and each sampled time point; rank guesses by their maximum absolute correlation within the relevant byte-lane window. Exclude or mask saturated ADC traces and account for the sequential byte-lane activity after the nominal trigger. Repeat independently for both key-index sessions; this recovers the two installed radio keys without a key export.

Verify recovered keys by successful AES-CCM* MIC checks on the captured secured frames. A plausible CPA correlation alone is insufficient proof of the correct key.

## 3. Align the three sniffers and isolate the real hop stream

Each 79 ms coordinator window contains a beacon on every monitored channel. A broadcast synchronization frame follows each beacon after approximately **300 µs**. Its plaintext application format is:

```text
'V' | 'HS15' | window:u16 | network_tick_us:u64 | channel:u8
```

The values are little-endian. For each sniffer, fit a linear mapping from local capture timestamps to the shared network tick (an offset and a fractional drift correction). Use multiple sync frames rather than a single timestamp to estimate drift.

The active application hop uses channels `[15, 20, 25]` with index `(window + 1) mod 3`. After time alignment, select authenticated data frames on that hop, while retaining transmitter EUI-64, frame counters, key indices, message IDs, and shard indices. This separates meaningful transmissions from coordinator traffic and other candidate sources.

## 4. Authenticate and collect diagnostic shards

Once a frame passes its MAC authentication check, decode the application transport header:

```text
'P15' [3 bytes]
version         u8
kind            u8
message_id      u32 LE
epoch_or_stream  u32 LE
n               u8
k               u8
shard_index     u8
original_length u16 LE
shard_width     u8
shard_data      bytes[shard_width]
```

Kind `0xd1` denotes a **systematic Reed–Solomon erasure shard**. Group shards by their full message ID and other relevant transport fields, never by the low 16 bits of the ID alone. Only use shards obtained from frames with a valid MAC MIC.

The configured Reed–Solomon code has `n=12`, `k=8`, 24-byte shards, and GF(2^8) reduction polynomial `0x11d`. Eight distinct, authentic shard indices are enough to recover the original record.

## 5. Reconstruct the record with Reed–Solomon decoding

Build the Vandermonde matrix over GF(256):

\[
V_{i,j}=(i+1)^j, \quad 0\le i<12,\;0\le j<8.
\]

Convert it into the systematic generator matrix:

\[
G=V\,\bigl(V_{0:8,:}\bigr)^{-1}.
\]

For any eight received shard indices `I`, take their eight rows `G[I,:]` and corresponding eight 24-byte shard vectors `S`. Recover the eight original data blocks by GF(256) matrix multiplication:

\[
D=\bigl(G[I,:]\bigr)^{-1}S.
\]

Concatenate the eight recovered blocks in order and truncate to the `original_length` in the transport header. **Do not treat Python integer matrix operations as GF(256) arithmetic**; addition is XOR, while multiplication and inversion must use polynomial `0x11d`.

## 6. Parse and validate the diagnostic

The reconstructed payload has the documented binary layout:

```text
'DG15'                    4 bytes
record_version            u8
sensor_eui64              u64
measurement_epoch         u64
sequence                  u16
fault_category            u8
sample_count              u8
samples                   sample_count x signed i16
full_message_id           u32
previous_message_id       u32
note_length               u16
note                      UTF-8[note_length]
crc32                     u32
blake2s_digest            16 bytes
```

Check these conditions in order:

1. The marker is `DG15` and all variable-length fields fit within the recovered length.
2. The sensor EUI-64 matches the authenticated radio source.
3. The full message ID agrees with the transport header.
4. CRC32 computed over all record bytes **before** the CRC field equals the stored CRC.
5. A 16-byte BLAKE2s digest computed over the bytes **through the CRC field** equals the trailing digest. Use `hashlib.blake2s(data, digest_size=16)`, not an arbitrary truncation of a 32-byte digest.

The reconstructed diagnostic evidence was:

| Field | Value |
|---|---|
| Record marker | `DG15` |
| Record version | `1` |
| Sensor EUI-64 | `0xacde480000000f15` |
| Full message ID | `0xa17c4a31` |
| Previous message ID | `0x00004a31` |
| Fault category | `7` |
| Sample count | `8` |
| CRC32 | `d9763a2a` |
| BLAKE2s-128 | Valid |

These values and the reported integrity results are from the recovered solution; the raw intermediate trace/key/shard arrays are not reproduced in this write-up.

## 7. Explain the gateway failure

The incident report says:

> duplicate application event (cached 4a31); replay filter: MAC counters normal; payload delivery suppressed.

The accepted older report used message ID `0x00004a31`; the emergency diagnostic used `0xa17c4a31`. They are different **32-bit** IDs but share the same **low 16 bits** (`0x4a31`). The gateway deduplicated at application level using this truncated identifier and dropped the valid new diagnostic as an apparent repeat. This explains why radio authentication and counters were normal while the operator console saw no emergency report.

## Flag

```text
isfcr{phantom15_6b4cf2a16a3ffc72c9420983dec02be1}
```

## Takeaway

The failure was not a silent sensor or a radio replay: the sensor sent an authenticated emergency diagnostic, which can be reconstructed from captured Reed–Solomon shards. The gateway suppressed its delivery because it conflated distinct full message IDs with the same lower 16 bits.
