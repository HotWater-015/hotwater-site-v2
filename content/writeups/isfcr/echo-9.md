---
title: "ECHO-9"
description: "ECHO-9's watchdog recovery preserved its boot counter and restarted its transmit sequence. This caused a reset event to reuse the AES-CTR nonce of an earlier service response. The…"
event: "isfcr"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CTF 2026","iot"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/echo-9.md"
---

## Summary

ECHO-9's watchdog recovery preserved its boot counter and restarted its transmit sequence. This caused a reset event to reuse the AES-CTR nonce of an earlier service response. The firmware, EEPROM, and UART capture provide enough information to reconstruct the reset event's plaintext. XORing that plaintext with the two ciphertexts recovers a diagnostic seed without recovering the device's OTP key.

The seed is verified by a SHA-256 proof. It then feeds a revision-3 HKDF construction bound to the device state, manifest, patched firmware, and canonical package data. The resulting key decrypts the update's diagnostic section with AES-GCM. The full flag, including its prefix, is stored in diagnostic TLV `0x0091`.

```text
isfcr{echo9_b5f049f6b72f5bda5bd20acbc3b5b2f8a566}
```

The solver does not use this flag, `echo9_`, or the expected suffix length as input.

## Artifacts

| Artifact | Role |
| --- | --- |
| `echo9_firmware.bin` | Container holding an ARM ELF, service dispatch table, cryptographic routines, and format constants |
| `echo9_eeprom.bin` | State journal and redundant commit areas |
| `uart_capture.log` | Device UID, reset status, and retained recovery values |
| `gateway_traffic.pcap` | MQTT traffic from the target and a neighboring gateway |
| `maintenance_update.ota` | Manifest, firmware delta, and encrypted diagnostic section |
| `incident_note.txt` | Warnings about clocks, neighboring traffic, and the second commit area |

Initial inspection:

```bash
file echo9_firmware.bin echo9_eeprom.bin gateway_traffic.pcap maintenance_update.ota
strings -a -t x echo9_firmware.bin
xxd -l 256 echo9_firmware.bin
```

The firmware starts with `E9FW`. Its section directory identifies an embedded ELF at file offset `0xC0`, length `0x54EC`. The ELF targets ARM Cortex-M4 and loads at `0x08004000`.

Useful strings include:

```text
watchdog:retained-ring-reset
E9/identity/v2
E9/link/v3
E9/proof/v2
E9/ota/diag/v3
```

The image also mentions the retired `E9/ota/diag/v1` recovery path. The accepted update is revision 3, so that older path is not the relevant derivation.

## Firmware Routines

Disassembling the embedded ELF in Thumb mode reveals a service dispatcher and the routines needed for the investigation.

| Address | Function |
| --- | --- |
| `0x08004008` | Select and validate EEPROM state |
| `0x080041C2` | Determine boot counter and initial transmit sequence |
| `0x080041F6` | Derive device identity |
| `0x08004254` | Derive link key using OTP material |
| `0x080042D6` | Parse packet fields into the CTR nonce |
| `0x0800433A` | Build reset-event plaintext |
| `0x0800443E` | Validate a diagnostic service response and its seed proof |
| `0x0800451C` | Derive revision-3 diagnostic key |
| `0x080045E2` | AES-CTR operation |
| `0x0800460E` | AES-GCM verification and decryption |
| `0x0800464C` | Apply the firmware delta |

The UART explicitly states that the OTP key aperture is excluded from the service readout. Extracting that key is unnecessary: the vulnerability is reused CTR keystream, not a weak AES key.

## Selecting EEPROM State

The EEPROM contains `E9ST` state records and `E9JC` commit records. Choosing the numerically largest sequence or the last occupied slot gives the wrong answer.

Both formats use CRC32 and a commit seal:

```python
seal = crc ^ (sequence * 0x10001) ^ 0xA9563CC5
```

For `E9JC`, the CRC covers the first 56 bytes. For `E9ST`, it covers the first 120 bytes. The CRC and seal follow the covered region.

The sequence numbers are 16-bit modular counters. The firmware's ordering is equivalent to:

```python
def newer(a, b):
    return 0 < ((a - b) & 0xFFFF) < 0x8000
```

The valid commit sequences wrap through:

```text
0xFFFE -> 0xFFFF -> 0x0000 -> 0x0001
```

The apparent next commit, sequence `2` at `0xBC0`, has an invalid seal. Its final word is still `FFFFFFFF`, consistent with an incomplete commit.

The newest valid commit is therefore at `0xA80`. It references state sequence `2`, key epoch `7`, and a particular state CRC. Applying the firmware's state filters selects the state at `0x480`.

Other state records can have valid local CRCs yet remain uncommitted. In particular, the valid state with sequence `5` is not selected by the valid commit. The state CRC referenced by the commit also matches the selected record.

Important selected fields:

| State Offset | Value | Use |
| --- | --- | --- |
| `0x04` | `2` | State sequence |
| `0x06` | `7` | Key epoch |
| `0x08` | `41` | Stored boot counter |
| `0x10..0x1F` | Masked identity bytes | Device identity derivation |
| `0x20..0x2F` | 16 bytes | Diagnostic-key salt input |
| `0x30..0x33` | `b1279000` | Identity derivation input |
| `0x34` | `1712400000` | Stored clock base |
| `0x3A` | `0x0105` | Reset-event field |
| `0x3C..0x43` | `e3da146a38db5a2b` | Event and diagnostic-key input |

## Identifying the Gateway

The UART prints the UID words out of order:

```text
UID[2]=50ef5798 UID[0]=b89886c3 UID[1]=a43a255f
```

In logical word order, with each word encoded little-endian, the UID bytes are:

```text
c38698b85f253aa49857ef50
```

The firmware derives the 16-byte identity by XORing the state's masked identity with the first 16 bytes of a SHA-256 digest:

```python
digest = SHA256(
    b"E9/identity/v2"
    + uid_le
    + state[0x30:0x34]
)
identity = XOR(state[0x10:0x20], digest[:16])
```

Result:

```text
4291efbdea4c846e35db2f20e0cda9c9
```

This matches the target gateway's packets. The neighboring gateway has a different identity:

```text
866395765acd832e8290cf053017401a
```

Filtering by the derived identity prevents combining ciphertexts from different devices.

## Reconstructing MQTT

The capture contains segmented MQTT messages, a TCP retransmission, and an MQTT-level duplicate. TCP payloads must first be reassembled by stream, direction, and sequence number. MQTT messages can then be parsed, and identical application payloads deduplicated.

The target uses MQTT topics under `facility/boreal7/echo9/`. Relevant message classes are:

| Class | Meaning |
| --- | --- |
| `0x0012` | Telemetry |
| `0x0031` | Reset event |
| `0x0072` | Service response |

The application packet layout is:

```text
40-byte header | ciphertext of declared length | 4-byte CRC32
```

The ciphertext begins at offset **40**, not 36. Treating the final four header bytes as ciphertext produces an incorrect plaintext reconstruction.

Relevant header offsets:

| Offset | Size | Field |
| --- | --- | --- |
| `0x04` | 2 | Message class |
| `0x06` | 2 | Key epoch |
| `0x08` | 4 | Boot counter |
| `0x0C` | 2 | Transmit sequence |
| `0x0E` | 2 | Ciphertext length |
| `0x10` | 16 | Device identity |
| `0x20` | 4 | Application clock field |
| `0x26` | 2 | Header CRC16 |
| `0x28` | Variable | Ciphertext |

The final packet CRC32 covers the header and ciphertext.

The capture contains records with boot counter `41`, then telemetry with boot counter `42`, followed by older boot-41 records. Arrival order is not necessarily device-event order. The recorder's UTC timestamps are trustworthy, but the gateway's application clock is not. The UART and incident note explicitly warn about its unavailable wall source and rebasing.

## AES-CTR Nonce Reuse

The firmware constructs a 12-byte CTR nonce from:

```text
boot counter, 4 bytes
key epoch, 2 bytes
identity tail, 4 bytes
transmit sequence, 2 bytes
```

The corresponding packet slices are:

```python
nonce = packet[8:12] + packet[6:8] + packet[28:32] + packet[12:14]
```

The cipher uses AES-256-CTR, with a big-endian block counter starting at 1.

The earlier service response and the reset event have the same device identity, boot counter `41`, epoch `7`, and transmit sequence `0`. Their message classes and displayed clock fields differ, but neither difference changes the nonce.

The boot routine explains the collision. For `reset_status=5`, it preserves the stored boot counter instead of incrementing it. It also initializes the transmit sequence to zero.

The UART provides:

```text
reset_status=00000005
feed_ticks=00001ee9
tx_last=00000013
rtc_step=00000025
```

In decimal, the retained values are `7913`, `19`, and `37`. The reset-event builder also needs the retained boot counter `41`. It is important not to substitute reset status `5` for that boot-counter field: the boot transaction and event-builder contexts have different layouts.

## Reset-Event Plaintext

The firmware clears a 96-byte buffer, then constructs:

| Event Offset | Contents |
| --- | --- |
| `0x00` | `E9EV` |
| `0x04` | `03 05 60 00` |
| `0x08` | Device identity, 16 bytes |
| `0x18` | Retained boot counter `41`, LE32 |
| `0x1C` | Feed ticks `7913`, LE32 |
| `0x20` | Key epoch `7`, LE16 |
| `0x22` | State field `0x0105`, LE16 |
| `0x24` | Last transmit value `19`, LE32 |
| `0x28` | Stored clock base plus RTC step: `1712400037`, LE32 |
| `0x2C` | `watchdog:retained-ring-reset`, 28 bytes |
| `0x48` | Four zero bytes |
| `0x4C` | State bytes `0x3C..0x43` |
| `0x54` | `41 XOR 19 = 58`, LE32 |
| `0x58` | CRC32 of the first 88 bytes |
| `0x5C` | Bitwise complement of that CRC32 |

Reconstructed plaintext:

```text
45394556030560004291efbdea4c846e
35db2f20e0cda9c929000000e91e0000
0700050113000000a526116677617463
68646f673a72657461696e65642d7269
6e672d726573657400000000e3da146a
38db5a2b3a000000be1b5ce941e4a316
```

For reused CTR keystream `K`:

```text
C_event   = P_event   XOR K
C_service = P_service XOR K

P_service = C_service XOR C_event XOR P_event
```

Applying this to the 96-byte ciphertexts recovers a service plaintext beginning with `E9DG`.

## Verifying the Seed

The recovered diagnostic service plaintext contains:

```text
E9DG header | device identity | 32-byte seed | 32-byte proof | CRC32 | complemented CRC32
```

The seed is:

```text
7f144a21bbd98b82647b165b4d0e3f7aa3b9f7575bcc27f554d0a6ab1fd90cea
```

The firmware's proof is:

```python
proof = SHA256(
    b"E9/proof/v2"
    + seed
    + identity
    + build_id
    + key_epoch_le16
)
```

The build ID comes from the firmware and update headers:

```text
ed1cf0da21ee64df4cd91a729f30e42a
```

Verified proof:

```text
3469e34795128fab530bbf3bf6d96b7ac8707b6a650c0f0d24ebb33bf8b478c6
```

The SHA-256 proof matters more than merely obtaining a recognizable header or a valid CRC. CRC32 is linear: changing a CRC-consistent reconstructed plaintext through a reused XOR stream can preserve the recovered service's CRC while corrupting the seed. The cryptographic proof rejects those incorrect reconstructions.

## Reconstructing the Update

The update starts with `E9UP`, revision 3, and has three sections:

| Type | Offset | Stored Length | Role |
| --- | --- | --- | --- |
| `0x0001` | `0xA0` | `0xA7` | JSON manifest |
| `0x0002` | `0x147` | `0x88` | Firmware delta |
| `0x00D1` | `0x1CF` | `0xBE` | Encrypted diagnostic data |

The manifest specifies `zlib/tlv` and generation 3.

The `E9DP` delta describes replacement operations against the embedded ELF. Each operation contains an ELF file offset, a replacement length, an operation code, and replacement bytes. Apply the operations to the ELF, not to the outer `E9FW` container.

Validation includes the original ELF length and CRC, the delta CRC, and the resulting ELF CRC:

```text
Original ELF CRC32: 72652ba5
Patched ELF CRC32:  4a412275
```

The revision-3 derivation binds to the **patched** ELF.

## Package Binding and HKDF

The canonical package bytes exclude the header CRC but include the remaining header, section directory, and manifest. They stop before the delta:

```python
canonical = ota[:60] + ota[64:0x147]
```

These same bytes serve as AES-GCM additional authenticated data.

The key derivation uses HKDF-SHA256 with:

```python
salt = SHA256(
    build_id
    + state[0x20:0x30]
    + state[0x3C:0x44]
)

ikm = seed + identity

info = (
    b"E9/ota/diag/v3"
    + key_epoch_le16
    + SHA256(manifest)
    + SHA256(patched_elf)
    + SHA256(canonical)
)
```

Only one 32-byte HKDF expansion block is needed:

```python
prk = HMAC_SHA256(salt, ikm)
key = HMAC_SHA256(prk, info + b"\x01")
```

Derived diagnostic key:

```text
f17f1fcf75f61f1635673dc8f569df7d2307880f4b6da9ee5dfcdc5cec86cb9b
```

## Authenticated Flag Extraction

The diagnostic section is laid out as:

```text
12-byte nonce | 162-byte ciphertext | 16-byte GCM tag
```

Decrypt and authenticate it using the derived key and canonical package AAD:

```python
cipher = AES.new(key, AES.MODE_GCM, nonce=section[:12])
cipher.update(canonical)
compressed = cipher.decrypt_and_verify(section[12:-16], section[-16:])
diagnostic = zlib.decompress(compressed)
```

The decompressed data is 164 bytes and begins with `E9DX`, revision 3. It contains three four-byte-aligned TLV records. Each record header is:

```text
type: LE16 | flags: LE16 | length: LE32 | value CRC32: LE32
```

All records verify:

| Type | Value Length | CRC32 |
| --- | --- | --- |
| `0x0010` | 42 bytes | `52351ba3` |
| `0x0091` | 49 bytes | `ae1ca93a` |
| `0x0020` | 24 bytes | `1b395316` |

The value of TLV `0x0091` is the complete ASCII flag:

```text
isfcr{echo9_b5f049f6b72f5bda5bd20acbc3b5b2f8a566}
```

Thus, `echo9_` is recovered from the authenticated artifact itself. It is not inserted by the solver, used as known plaintext, or guessed from the challenge name.

## Reproduction

The standalone solver is `solve.py`. It requires Python, PyCryptodome, and `tshark`.

```bash
python -m pip install pycryptodome
python solve.py
```

By default, it reads artifacts from the directory containing the script. An alternative evidence directory can be supplied:

```bash
python solve.py /path/to/artifacts
```

Verified output:

```text
EEPROM: commit 0xa80, state 0x480
Diagnostic seed SHA-256 proof verified
Patched firmware CRC32 verified: 4a412275
AES-GCM authentication verified
Diagnostic TLV 0x0010: 42 bytes, CRC32 verified
Diagnostic TLV 0x0091: 49 bytes, CRC32 verified
Diagnostic TLV 0x0020: 24 bytes, CRC32 verified
Flag read directly from diagnostic TLV 0x0091:
isfcr{echo9_b5f049f6b72f5bda5bd20acbc3b5b2f8a566}
```

## Root Cause

The security failure is the interaction between watchdog recovery and nonce construction. Recovery preserved the boot counter while resetting the transmit sequence. The link cipher's nonce did not distinguish service responses from reset events or incorporate the changing application clock.

Consequently, two different 96-byte plaintexts were encrypted with the same CTR keystream. The reset event was reconstructible from retained state and firmware constants, exposing the diagnostic seed in the earlier service response. The update's firmware and package bindings authenticated the subsequent decryption, but could not compensate for disclosure of that seed.
