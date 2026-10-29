---
title: "The Third Key Phase"
description: "The evidence fields, in the required order, are:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/the-third-key-phase.md"
---

## Result

```text
isfcr{7d6bae9970a1173284046064}
```

The evidence fields, in the required order, are:

```json
["6e26102a48d71fe1d7f68231","87566bdc267eee5e8a8a7d0251033ec0ce2aef613ef35623cf1e6dc5fc1310d3","43669914701c2add27583d67043e96c02f44d622a78116f10fea5fac66e233dd"]
```

The exact accepted file is saved as `accepted-file.bin`. It contains **16,456 bytes**.

## 1. Inspect the capture and embedded metadata

The only supplied artifact is `capture.pcapng`. Initial inspection:

```bash
tshark -r capture.pcapng -q -z io,phs
strings capture.pcapng
```

The capture contains 265 Ethernet/IPv4/UDP packets. There is no initial QUIC handshake from which a normal dissector could establish all connection parameters.

The pcapng container provides two useful pieces of metadata:

- A Section Header Block comment contains a JSON mapping from five `client_random` values to `largest_client_pn` and `largest_server_pn` checkpoints.
- A Decryption Secrets Block contains TLS key-log entries named `CLIENT_TRAFFIC_SECRET_0` and `SERVER_TRAFFIC_SECRET_0` for those connections.

These secrets allow application-data decryption, but the capture still requires recovering connection-ID lengths, packet numbers, cipher suites, and successive key generations.

## 2. Decrypt the QUIC short-header packets

`recover.py` reads the pcapng blocks directly and extracts UDP payloads from Enhanced Packet Blocks. It tries the embedded secrets with candidate cipher suites and destination connection-ID lengths from 0 to 20 bytes. Successful AEAD authentication identifies the correct combination.

The connection carrying the accepted target upload uses **ChaCha20-Poly1305 and QUIC v2 key-derivation labels**. Its `client_random` is:

```text
87566bdc267eee5e8a8a7d0251033ec0ce2aef613ef35623cf1e6dc5fc1310d3
```

For this connection, derive keys using TLS 1.3 HKDF-Expand-Label, with SHA-256:

```text
packet_key = HKDF-Expand-Label(secret, "quicv2 key", "", 32)
packet_iv  = HKDF-Expand-Label(secret, "quicv2 iv",  "", 12)
hp_key     = HKDF-Expand-Label(secret_0, "quicv2 hp", "", 32)
next_secret = HKDF-Expand-Label(secret, "quicv2 ku", "", 32)
```

HKDF-Expand-Label adds the `tls13 ` prefix to each label. The header-protection key stays fixed across key updates; packet keys and IVs change with each generation.

For a short header, the packet-number field starts immediately after the first byte and destination connection ID. The header-protection sample begins four bytes after that field's starting offset. Remove protection from the low five bits of the first byte and from the packet-number bytes, then recover the packet number.

Use the embedded checkpoints to estimate full packet numbers. Because capture order differs from transmission order and some packet numbers are short, the solver also tries nearby packet-number windows. Each candidate must pass AEAD authentication.

The packet nonce is:

```text
nonce = packet_iv XOR packet_number.to_bytes(12, "big")
```

The unprotected header is AEAD associated data.

### Why the key-phase bit alone is insufficient

The solver labels the initial generation `0` and each update `1`, `2`, and `3`. The one-bit key-phase field alternates:

| Key generation | Key-phase bit |
| --- | --- |
| 0 | 0 |
| 1 | 1 |
| 2 | 0 |
| 3 | 1 |

Thus, generation 3 shares its bit with generation 1. Retaining multiple generations and checking authenticated decryption handles reordered packets correctly.

Connection IDs and UDP ports also change. For example, early-generation packets appear near the end of the capture on client port 57949, while later packets use port 37187. Authenticating against the secrets associates these packets with the same connection.

The script decrypts 264 of 265 packets. Frame 182 remains undecrypted and is not needed for the target reconstruction. Decrypted packet payloads are saved in `decoded.json`.

## 3. Reassemble streams and identify the accepted upload

`assemble.py` parses QUIC frames and reassembles STREAM data by:

```text
(client_random, direction, stream_id, stream_offset)
```

It checks that overlapping bytes agree, records FIN offsets, and reports missing bytes. ACK, CRYPTO, connection-ID, flow-control, and other frames are skipped according to their layouts. The reconstructed streams are saved in `streams.json`.

The target request ID appears in more than one connection. The connection beginning `bfa62422` contains the same request ID, but its upload is incomplete: client stream 8 has no FIN. The accepted file comes from the connection beginning `87566bdc`.

On that connection, client control stream 2 contains this manifest, recovered from frame 261:

```json
{"request_id":"6e26102a48d71fe1d7f68231","parts":[0,4,8,12],"unit":119}
```

Later control streams request replacements:

| Control stream | Capture frame | Replacement |
| --- | --- | --- |
| 6 | 18 | `8 -> 16` |
| 10 | 42 | `4 -> 20` |
| 14 | 224 | `8 -> 24` |

Capture frame order is not the control-message transmission order. Stream offsets, packet numbers, and the corresponding server responses provide the relevant context.

Reassembled server responses show:

| Data stream | Status | Reconstruction decision |
| --- | --- | --- |
| 0 | 217 | Keep |
| 8 | 26 | Use accepted replacement 16 |
| 12 | 217 | Keep |
| 16 | 217 | Use for original part 8 |
| 20 | 217 | Use for original part 4 |
| 24 | 26 | Do not supersede accepted stream 16 |

Here, status 217 is interpreted as acceptance and status 26 as rejection. The final authenticated flag decryption validates this interpretation and the resulting byte reconstruction.

The effective ordered parts are therefore:

```text
[0, 20, 16, 12]
```

The rejected stream 24 closely resembles stream 16 but differs in its bytes. Applying every replacement blindly would select the wrong file.

All four selected streams have FINs and no missing bytes:

| Stream | Length |
| --- | --- |
| 0 | 2,530 bytes |
| 20 | 2,499 bytes |
| 16 | 2,499 bytes |
| 12 | 2,499 bytes |

## 4. Recover the exact file bytes

The manifest's `unit` is the stripe size. Reconstruct the compressed data by taking 119 bytes from each selected part in order, then repeating at the next offset:

```python
parts = [streams[i] for i in [0, 20, 16, 12]]
compressed = b"".join(
    part[offset:offset + 119]
    for offset in range(0, max(map(len, parts)), 119)
    for part in parts
)
```

This produces 10,027 compressed bytes. They are a **raw DEFLATE stream**, so decompress with a negative window size:

```python
decoder = zlib.decompressobj(-15)
file_bytes = decoder.decompress(compressed) + decoder.flush()
assert decoder.eof
assert not decoder.unused_data
assert not decoder.unconsumed_tail
```

The output is 16,456 bytes and begins:

```text
# transfer 6e26102a48d71fe1d7f68231
# columns: seq,unit,reading,checksum,note
00000,u47,-87.56904,48207208,quarry basin ledger relay willow yarrow
```

Hash the decompressed bytes directly, preserving line endings and all other bytes:

```text
SHA-256 = 43669914701c2add27583d67043e96c02f44d622a78116f10fea5fac66e233dd
```

## 5. Derive and decrypt the flag

Serialize the three evidence strings exactly as specified:

```python
evidence = [request_id, client_random, hashlib.sha256(file_bytes).hexdigest()]
E = json.dumps(evidence, ensure_ascii=True, separators=(",", ":")).encode("ascii")
key = hashlib.scrypt(
    b"isfcr-forensics\x00" + E,
    salt=bytes.fromhex("55cfbdc7a31326404d59e133d991dc88"),
    n=131072, r=8, p=1, maxmem=2**28, dklen=32,
)
flag = AESGCM(key).decrypt(
    bytes.fromhex("f684f2db484cdd8e6f38b16e"),
    bytes.fromhex("c4805539a3db8bc0bba5f5fb6ad76c1125d889aab86af18041007f8f49e30d2b5822be5cf8d26d21ddb576b25d06bc"),
    b"the-third-key-phase",
)
```

AES-GCM authentication succeeds and returns:

```text
isfcr{7d6bae9970a1173284046064}
```

## Reproduce

The scripts require Python and the `cryptography` package. Run them from the challenge directory:

```bash
python recover.py > recovery.log
python assemble.py
python finish.py
sha256sum accepted-file.bin
```

`finish.py` saves the exact recovered bytes to `accepted-file.bin`, writes the evidence list to `evidence.json`, and prints the authenticated flag.
