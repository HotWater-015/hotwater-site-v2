---
title: "GHOST-13 offline investigation"
description: "The solution combines commit-journal recovery, TCP and Modbus fragment reconstruction, ECDSA nonce reuse, DTMF decoding, and an authenticated OTA decryption. All work is local; no…"
event: "isfcr"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CTF 2026","iot"]
date: "2026-10-11"
teammate: false
source: "isfcr/writeups/ghost-13.md"
---

## Result

```text
isfcr{ghost13_dc8f84a256fa64108b6c75a151a1474d}
```

The solution combines commit-journal recovery, TCP and Modbus fragment reconstruction, ECDSA nonce reuse, DTMF decoding, and an authenticated OTA decryption. All work is local; no controller or external service is required.

## Files and reproduction

The supplied artifacts are `plc_firmware.bin`, `plc_program.bin`, `plc_traffic.pcap`, `alarm_buzzer.wav`, `maintenance_update.ota`, `uart_log.txt`, and `field_service_excerpt.txt`.

The accompanying [solve_ghost.py](solve_ghost.py) implements the recovery. Run it from the directory containing those files, using Python 3 with `numpy` and `cryptography` available:

```sh
python solve_ghost.py
```

Its final output is:

```text
WIRE 64658003 DIGITS 53977997
SECRET {"diagnostic":"power-restoration","flag":"isfcr{ghost13_dc8f84a256fa64108b6c75a151a1474d}"}
```

## 1. Recover the committed configuration

The service excerpt describes the binary formats. The factory firmware begins with `G13W`, followed by a 64-byte header and 24-byte directory entries. Each entry contains a section tag, offset, length, CRC32, auxiliary value, and flags. Parsing the directory and checking section CRCs identifies:

- `VMBC`: signing VM program.
- `KDFD`: `G13K`, a 32-byte factory constant, and domain strings.
- `PUBK`: `P256` followed by two 32-byte big-endian public coordinates.
- `RECV`: legacy recovery material, which does not apply to the v4 update.

The protected signing scalar is absent from the image; it resides in secure slot `0x13`.

The program image begins with `G13L`. It contains eight 128-byte `G13P` slots at offset `0x40` and eight 64-byte `G13J` journals at offset `0x440`.

For a slot, validate its CRC32 over bytes `0..119` and its commit word:

```text
commit = CRC32(slot[0:120]) XOR 0x13c0ffee
         XOR ((slot_sequence << 16) | epoch)
```

For a journal, validate its CRC32 over bytes `0..55` and its commit word:

```text
commit = CRC32(journal[0:56]) XOR 0xa91f0eed
         XOR ((journal_sequence << 16) | journal_sequence)
```

A journal must also match its referenced slot's sequence, epoch, and CRC. A valid slot alone is insufficient to establish activation.

| Slot | Slot sequence | Epoch | Program | Slot valid | Matching journal valid |
| --- | ---: | ---: | --- | --- | --- |
| 0 | 65533 | 6 | TON_PREHEAT | Yes | Yes |
| 1 | 65534 | 7 | CTU_CONVEYOR | Yes | Yes |
| 2 | 65535 | 7 | R_TRIG_FEED | Yes | Yes |
| 3 | 0 | 7 | TON_GATE | Yes | Yes |
| 4 | 1 | 7 | CTU_BATCH | Yes | Yes |
| 5 | 2 | 7 | TON_WATCHDOG | Yes | Yes |
| 6 | 3 | 7 | TON_WATCHDOG | Yes | No |
| 7 | 4 | 8 | R_TRIG_ALARM | No | No |

Sequence comparisons must use 16-bit serial-number arithmetic. A candidate is newer when:

```python
0 < (candidate - current) % 65536 < 32768
```

Thus sequence 2 is newer than 65535. The latest valid matching journal is **sequence 2, referencing slot 5**.

The active configuration is:

| Field | Value |
| --- | --- |
| Slot | 5 |
| Sequence | 2 |
| Epoch | 7 |
| Program name | `TON_WATCHDOG` |
| Committed ID | `75f83e16b7969d3985c35154de9fcb10` |
| Committed salt | `ac0c0f86d58bdde419cd50a98450c012` |
| Keypad trim | `9, 9, 3, 2, 9, 9, 9, 4` |
| Bytes 40..51 | `fa0000008813000003001103` |

The two little-endian u32 values at offsets 40 and 44 are 250 and 5000. The remaining bytes are preserved above without assigning undocumented meanings.

## 2. Reconstruct the diagnostic traffic

First reconstruct each directional TCP byte stream by sequence number. This removes retransmission duplication and handles Modbus messages split across TCP packets. Then parse Modbus MBAP lengths; a complete ADU occupies `6 + MBAP_length` bytes.

The diagnostic writes use function code 16 and carry `G13C` fragments. Validate each fragment's CRC16/CCITT-FALSE and register address:

```text
Data index i: 0x4200 + 20*i
Parity index 3: 0x4300
```

Each fragment carries 40 payload bytes. Indices 0, 1, and 2 form the padded frame; index 3 is their bytewise XOR.

The recovered fragments are:

| Stream | Valid data indices | Parity | Action |
| --- | --- | --- | --- |
| `0x41` | 0, 2 | Present | Recover index 1 |
| `0x42` | 0, 1 | Present | Recover index 2; deduplicate repeated index 0 |
| `0x43` | 0, 1, 2 | Not needed | Reject damaged extra index 1 |

For example:

```text
slice1 = parity XOR slice0 XOR slice2
```

Each reconstructed `G13F` frame is 118 bytes: a 26-byte header, an 88-byte encrypted body, and a four-byte CRC32. All reconstructed frame CRCs validate.

Derive the link key:

```text
link_key = SHA256(
    "G13/link/v2" || factory_constant || committed_ID || committed_salt
)
```

Decrypt each body using AES-256-CTR with the IV from header bytes `10..25`. The plaintext consists of a 24-byte state, 32-byte big-endian ECDSA `r`, and 32-byte big-endian `s`.

The first two records have different headers, IVs, and states:

```text
stream 0x41 state:
504c432d4731332f53544154452f21ebe297e01eec662c64

stream 0x42 state:
504c432d4731332f53544154452f2250bb19118a259d4234
```

However, both signatures have the same `r`:

```text
078dd73275efff9f09cdce9736dd401811d03172bc40a48d28d9396f9432c9765
```

Their `s` values are:

```text
s1 = 5b2a3f357bc53ed854c0b3173bdb5101d02547b140b9254a77e396c9b6ae2a97
s2 = bfb2f38dadad1dbb5b41088f08bbee028ffb7fca8deea75726ab9ab592f72860
```

Stream `0x43` has a different `r` and is unnecessary for the scalar recovery.

## 3. Recover the signing scalar

For each record, the signed message is exactly:

```text
"G13/sign/v2" || G13F_header[0:26] || state[0:24]
              || committed_ID || committed_salt[0:8]
```

Let `z1` and `z2` be the big-endian integer values of the corresponding SHA-256 digests. ECDSA satisfies:

```text
s = k^-1 * (z + r*d) mod n
```

For a reused nonce:

```text
k = (z1 - z2) * (s1 - s2)^-1 mod n
d = (s1*k - z1) * r^-1 mod n
```

The P-256 subgroup order is:

```text
n = ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
```

Because replacing `s` by `n-s` preserves ECDSA validity, the solver tries both signs for each signature. It verifies each resulting private scalar by deriving its public point and comparing both coordinates with `PUBK`.

The recovered scalar is:

```text
2f1945b86a823a5bffb808c0f5edc9bd981fb15481696d7c29bde45fb8e1a4cb
```

One corresponding nonce is:

```text
b467b40088e70a1c81902bcbf6d5bb3b1d571d56bcf58b2b96ef19628c05336a
```

The opposite-sign solution uses `n-k` and yields the same scalar.

## 4. Reconstruct the reboot sequence

The UART establishes this timeline:

| Time | Event |
| --- | --- |
| 06:13:01.002 | Factory image accepted; VM revision 3 |
| 06:13:01.087 | Program journal frontier restored after 16-bit rollover |
| 06:13:01.150 | Retention tick restored to 1729 ms; secure slot `0x13` available |
| 06:13:02.443 | Diagnostic stream `0x41` emitted over Modbus/TCP FC16 |
| 06:13:02.700 | Pre-reset keypad self-check recorded |
| 06:13:02.970 | Legacy CRC16 module self-test passed |
| 06:13:04.011 | Watchdog exception `0x06`; CPU brownout restart |
| 06:13:04.151 | Retention tick again restored to 1729 ms; secure slot still available |
| 06:13:05.070 | Diagnostic stream `0x42`; service buzzer pulse recorded |
| 06:13:07.002 | Active program keypad trim applied after capture |
| 06:13:08.001 | Legacy v1 recovery key reported as retained |

The unchanged retention tick across the restart supports a reset-related nonce-reuse explanation. The cryptographic evidence independently establishes reuse up to nonce sign: different signed messages yield the same `r`, and the recovered scalar matches the stored public key. The exact VM instruction semantics are not needed for the recovery and were not inferred from the opaque bytecode.

## 5. Decode the buzzer

The recording is mono 16-bit PCM at 8000 Hz. Standard DTMF uses row frequencies 697, 770, 852, and 941 Hz, and column frequencies 1209, 1336, 1477, and 1633 Hz.

The solver analyzes 20 ms windows, measures energy at those frequencies, and collapses repeated labels within a tone. It distinguishes the separating 440 Hz service-ready carrier from DTMF.

The two eight-digit groups are:

```text
Power-on self-check: 70372720
Diagnostic wire code: 64658003
```

Only the second group contributes to the update nonce. Apply the committed trim digit by digit modulo 10:

```text
wire:    6 4 6 5 8 0 0 3
trim:    9 9 3 2 9 9 9 4
result:  5 3 9 7 7 9 9 7
```

The required eight ASCII digits are **`53977997`**.

## 6. Apply the maintenance delta

The update begins with a 64-byte `G13U` v4 header. The manifest length is 163 bytes, the sparse delta length is 388 bytes, and the sealed plaintext length is 111 bytes. The file contains a further 16-byte GCM authentication tag.

The raw manifest identifies the factory ROM as the source and `maintenance-4` as the target:

```json
{"product":"GHOST-13","revision":4,"source":"factory-rom","target":"maintenance-4","base_crc32":"9b658883","target_crc32":"922823e4","diagnostic_section":"sealed"}
```

Parse the `G13X` v2 delta, validate its trailing CRC32, and confirm the full factory image CRC32 is `9b658883`. Apply its six replacement hunks to a copy of the complete firmware image.

The reconstructed target has CRC32 `922823e4`. Its SHA-256 begins:

```text
73842f3957f72613e4e61dda81dd1c0b
```

This matches update header bytes `24..39`; the first eight bytes also match the delta's target digest. All target firmware section CRCs validate. Extract the KDF constant from the **target** image's `KDFD` section, and use the target firmware's little-endian version field in the derivation.

The complete target image and the exact raw manifest and delta bytes are required. Parsing and reserializing the JSON would risk changing the authenticated bytes.

## 7. Derive the update key and authenticate the secret

The nonce is the eight ASCII digits followed by the four-byte suffix from update header bytes `12..15`:

```text
nonce = ASCII("53977997") || ba28ff2e
```

Derive a 32-byte key with HKDF-SHA256:

```text
IKM = recovered_scalar_be32 || committed_ID || committed_salt

salt = SHA256(target_KDF_constant || committed_salt)

info = "G13/diagnostic/v4"
       || committed_ID
       || target_firmware_version_le16
       || ASCII("53977997")
       || SHA256(full_target_image)
       || SHA256(raw_manifest)
       || SHA256(raw_delta)
```

The AES-256-GCM additional authenticated data is:

```text
AAD = update_header[0:60] || raw_manifest || raw_delta
```

Decrypt the ciphertext with its appended 16-byte tag. Authentication succeeds. The plaintext begins with `G13D`; decompressing the remaining bytes with zlib yields:

```json
{"diagnostic":"power-restoration","flag":"isfcr{ghost13_dc8f84a256fa64108b6c75a151a1474d}"}
```

The matching public key, validated target-image checksums, and successful GCM authentication provide independent checks on the recovered configuration and cryptographic inputs.
