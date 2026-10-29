---
title: "SILT Field Rack / Revision D"
description: "The service bundle silt-revision-d.zip contains:"
event: "cryovault"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CryoVault Finals 2026","iot"]
date: "2026-10-26"
teammate: false
source: "cryovault/iot/2/writeup.md"
---

**Flag:** `isfcr{dzzgtexh72kpmivvuypwm2oqbzk6w7t6}`

## 1. Overview

The service bundle `silt-revision-d.zip` contains:

| File | Purpose |
| --- | --- |
| `rack.vcd` | Logic-analyzer capture of the SPI service connector |
| `controller.rom` | SVM1 application bytecode (same on all boards) |
| `node-00.nor` … `node-06.nor` | ECC-interleaved storage exports, 1024 slots × 144 bytes each |
| `capsule.bin` | SLC2 sealed export (ChaCha20-Poly1305) |
| `service-manual.txt` | Hardware / journal / VM specification |
| `module-notes.txt` | Transport adapters and recovery policies |
| `export-contract.txt` | Frontier and restore-key definition |

The rack stopped during an export. The goal is to reconstruct the recoverable
frontier, rebuild the restore key, and open the capsule.

---

## 2. Decoding the SPI capture

The VCD defines four signals:

- `A` — serial clock
- `B` — active-low chip select
- `C` — controller → peripheral (MOSI)
- `D` — peripheral → controller (MISO)

SPI is mode 3 (idle high, sample on rising edge), MSB first. Each low interval of
`B` is one transaction. Sampling `C` on every rising edge of `A` yields
byte-aligned payloads.

All 628 transactions have a valid CRC-32/ISO-HDLC over
`opcode || payload_size || payload`. The opcodes present are:

| Opcode | Meaning | Count |
| --- | --- | --- |
| `0x12` | Publish application head | 14 |
| `0x19` | Select export ticket | 2 |
| `0x27` | Radio link delivery notification | 612 |

The final `D` byte is the status: `00` accepted, `E1` rejected / no persistent
change.

### Ticket

The first ticket-selection transaction was accepted:

```
ticket = 41f0e85926ae95168e0b7e728d28843f
cursor = [0x001b, 0x0020, 0x001f, 0x001f, 0x002f, 0x010d, 0x0041]
       = [27, 32, 31, 31, 47, 269, 65]
```

The second ticket selector returned `E1`, so the first one is the selected
ticket. This matches the ticket bytes embedded in the capsule header.

### Head publications

Each board published an accepted head (`00`) and a rejected duplicate (`E1`).
The accepted `(board, serial, SHA256(row)[:16])` values are:

| Board | Head serial | Head digest (first 16 bytes) |
| --- | --- | --- |
| 0 | 277 | `5df6656939c3a0be85c38e0a86f17a30` |
| 1 | 327 | `f21fc3cbf409d9186f7c3cd0b2967bc1` |
| 2 | 292 | `9a422a48258dfee81b72cd930dc7bc3f` |
| 3 | 329 | `6c7074d9c9489c4d5ec633de14b5a00b` |
| 4 | 289 | `668724dcecebce3540af9312a51903ee` |
| 5 | 278 | `bc4e1cefefda233f5af4fdf1bf9c3770` |
| 6 | 292 | `a9bb003dd9f66b5b66ffa646b683c0b9` |

These digests identify each board's head row in its NOR dump.

---

## 3. Decoding the NOR dumps

Each node file is `1024 × 144 = 147456` bytes. A slot is 16 extended
Hamming(72,64) codewords of 9 bytes. Decoding follows the manual:

- Word = 9-byte little-endian integer; bit positions `1..72` from the LSB.
- Parity positions `1,2,4,8,16,32,64` carry even parity over positions `1..71`.
- Position `72` carries even parity over all 72 bits.
- Data positions (the other 64 positions, increasing) carry data bits
  `0..63`, least significant first.

The decoder corrects single-bit errors and rejects detected double-bit errors.
Decoded words concatenate into the 128-byte logical row:

```text
00..03  "SJR1"
04      board
05      kind
06..07  local serial
08..23  previous row digest
24..31  event identifier
32      peer (FF for local events)
33..35  zero
36..43  referenced packet identifier
44..75  eight application argument words
76..79  local calibration epoch
80..95  post-state fingerprint = SHA256(LE32(state[0..3]))[:16]
96..123 zero
124..127 CRC-32 of bytes 0..123
```

Rows whose magic and CRC-32 validate are kept. The dumps also contained a small
number of uncorrectable / interrupted slots, which were discarded.

### Journal chain

Every row's `prev` field is the digest of the previous row. For each board the
chain is a single linear ancestry:

- It starts at a kind-4 initial-state row with an all-zero `prev`.
- It ends at the head row whose digest was published over SPI.
- Local serials increment by exactly one modulo 65536 along the chain.
- Duplicate/recycled slots are identical copies and collapse to the same digest.

Reconstructed chain lengths:

| Board | Rows | First serial | Head serial |
| --- | --- | --- | --- |
| 0 | 306 | 65508 | 277 |
| 1 | 352 | 65512 | 327 |
| 2 | 323 | 65506 | 292 |
| 3 | 355 | 65511 | 329 |
| 4 | 324 | 65502 | 289 |
| 5 | 315 | 65500 | 278 |
| 6 | 316 | 65513 | 292 |

Each head digest matched exactly one row at the expected serial, which validates
the ECC decoding and chain reconstruction.

---

## 4. Executing the application ROM

`controller.rom` is an SVM1 image:

```text
magic[4]        = "SVM1"
version:u16     = 1
register_count  = 24
entry[4]:u32    = instruction indices for kinds 0, 1, 2, 3
instruction_count:u32
instructions[]  = 8 bytes each
crc32
```

Each instruction is `opcode:u8, destination:u8, source:u8, auxiliary:u8,
immediate:u32` (little-endian). The four entry points are `0`, `105`, `238`,
`343`. The instruction set is the small ARX set from the manual:

```text
00 return
01 R[d] = R[s]
02 R[d] = immediate
03 R[d] ^= R[s]
04 R[d] += R[s]
05 R[d] = ROL32(R[d], immediate)
07 swap R[d], R[s]
08 R[d] *= immediate
09 R[d] ^= immediate
```

At entry:

```text
R[0..3]   prior application state
R[4..11]  row's eight argument words
R[12..15] consumed packet words (zero for non-kind-2)
R[16]     board number
R[17]     local serial
R[18]     calibration epoch
R[19]     kind
R[20..23] zero
```

Important semantics recovered from the data:

- Kind 4 initialises state directly from `args[0..3]`; no bytecode runs.
- Kind 3 increments the persistent calibration epoch, then executes entry 3.
  The row stores the **new** epoch.
- Kinds 5, 6, 7 do not execute core bytecode.
- Kind 2 skips core execution if its packet ID is already in the receipt
  window; otherwise it applies the input adapter and executes entry 2.
- Every non-kind-4 row's fingerprint must equal
  `SHA256(LE32(state))[:16]`, which gives a strong oracle for module inference.

---

## 5. Inferring the replacement modules

The module catalog is exactly:

| Module ID | Transport mode | Recovery policy |
| --- | --- | --- |
| 0 | 0 | retain |
| 1 | 1 | retain |
| 2 | 2 | retain |
| 3 | 0 | rewind |
| 4 | 1 | rewind |
| 5 | 2 | rewind |

The transport mode affects state evolution only at kind-2 consumption. The
policy affects only checkpoint restores (kind 6): `retain` keeps the current
receipt window, `rewind` restores the saved window.

Publication transport value:

```text
A = pre-state, B = post-state, V = core output R[4..7]
E = publication epoch

mode 0: W[i] = V[i]
mode 1: W[i] = ROL(V[i] XOR A[i+1], 1 + ((E+i) mod 31))
mode 2: W[i] = ROL(V[i+1] + B[i+2] + E, 7 + 3*i)
```

Consumption input adapter:

```text
W = publication transport value
A = consuming board's pre-state
E = consuming row's epoch
X = core input R[12..15]

mode 0: X[i] = W[i]
mode 1: X[i] = BSWAP(W[i]) XOR A[i+3]
mode 2: X[i] = (W[i+2] - ROL(A[i], i+1)) XOR E
```

The first kind-2 row on each board occurs before any restore, so its pre-state
is deterministic. Testing all `(receiver mode, sender mode)` pairs against that
row's fingerprint gives a direct constraint:

| Board | First kind-2 row | Reference source | Matching (receiver, sender) |
| --- | --- | --- | --- |
| 0 | serial 65510 | board 6 | (2, 0) |
| 1 | serial 65519 | board 0 | (2, 2) |
| 2 | serial 65512 | board 1 | (0, 2) |
| 3 | serial 65517 | board 2 | (1, 0) |
| 4 | serial 65505 | board 3 | (1, 1) |
| 5 | serial 65502 | board 4 | (0, 1) |
| 6 | serial 65520 | board 5 | (0, 0) |

Propagating these constraints yields the transport modes:

```text
board 0: mode 2
board 1: mode 2
board 2: mode 0
board 3: mode 1
board 4: mode 1
board 5: mode 0
board 6: mode 0
```

Policy does not show up in the state fingerprint directly, but it does affect
duplicate detection after a restore, and therefore state evolution in later
rows. Enumerating all `2^7` policy assignments and checking every fingerprint
and epoch leaves exactly one:

```text
policies = [rewind, retain, rewind, rewind, retain, retain, rewind]
```

Mapping through the catalog:

```text
module IDs = [5, 2, 3, 4, 1, 0, 3]
```

A full replay with these modules reproduces every row fingerprint in all seven
chains.

---

## 6. Computing the frontier

The ticket supplies inclusive local cursors, i.e. each board's prefix runs from
its kind-4 initial row through the row with the cursor serial.

Initial prefix end indices (0-based in the chain):

| Board | Cursor serial | Prefix end index |
| --- | --- | --- |
| 0 | 27 | 55 |
| 1 | 32 | 56 |
| 2 | 31 | 61 |
| 3 | 31 | 56 |
| 4 | 47 | 81 |
| 5 | 269 | 305 |
| 6 | 65 | 88 |

A recoverable frontier must also contain, for every included kind-2 row, the
publication row it references. Starting from the prefixes above, iteratively
extend the source board's prefix to include the referenced publication. This is
the least fixed point, reached after 7 rounds:

| Board | Frontier index | Frontier serial | Event ID | Epoch |
| --- | --- | --- | --- | --- |
| 0 | 193 | 165 | `4b1a986ffb616e8f` | 22 |
| 1 | 214 | 190 | `ad555f48cbce2205` | 24 |
| 2 | 267 | 237 | `6eeee774bc2dc293` | 34 |
| 3 | 334 | 309 | `68de21c250eca3ea` | 30 |
| 4 | 310 | 276 | `8d11cb3f0cd36539` | 34 |
| 5 | 305 | 269 | `3068dbbf131e4a62` | 33 |
| 6 | 195 | 172 | `17d8f04f944ffcfd` | 20 |

At that frontier, the simulation provides:

- current application state
- current receipt window
- live checkpoint table (handle → saved state + saved window)
- every publication row inside the frontier, with its epoch and immutable
  transport value `W`

A publication inside the frontier is **pending** iff its ID is absent from the
destination board's current receipt window. With the reconstructed state there
are **266 pending packets**.

---

## 7. Building the restore key

The key is:

```text
SHA256(
  "SILT/SNAPSHOT/2" || 00
  || ticket[16]
  || board_count:u8 = 7
  || for board 0..6:
       board:u8
       module_ID:u8
       frontier_event_ID[8]
       frontier_calibration_epoch:u32
       frontier_application_state[4]:u32
       current_receipt_window:ID-set
       live_checkpoint_count:u16
       for each checkpoint sorted by handle:
         handle[8]
         saved_application_state[4]:u32
         saved_receipt_window:ID-set
  || pending_packet_count:u32
  || for each pending packet sorted by (source, destination, raw ID):
       source:u8
       destination:u8
       packet_ID[8]
       publication_epoch:u32
       immutable_transport_value[4]:u32
)
```

where an ID-set is:

```text
u32 count || unique 8-byte IDs in lexicographically increasing byte order
```

All multi-byte integers are unsigned little-endian, with no padding.

Using:

- ticket `41f0e85926ae95168e0b7e728d28843f`
- module IDs `[5, 2, 3, 4, 1, 0, 3]`
- the frontier, windows, checkpoint tables and 266 pending entries above

gives the 32-byte restore key.

---

## 8. Opening the capsule

`capsule.bin` layout:

```text
"SLC2" || selected_ticket[16] || nonce[12] || ciphertext || tag[16]
```

- Key: the restore key from §7.
- Nonce: bytes `20..31` (immediately after the 16-byte ticket).
- AAD: all 32 header bytes (`"SLC2" || ticket || nonce`).
- Cipher: ChaCha20-Poly1305.

Decryption verifies the Poly1305 tag and returns:

```text
isfcr{dzzgtexh72kpmivvuypwm2oqbzk6w7t6}
```

---

## 9. Reproducing

The working scripts are in `work/`:

| Script | Function |
| --- | --- |
| `decode.py` | Hamming(72,64) decode, row extraction and CRC checks |
| `chain.py` | Ancestry reconstruction from `prev` digests and head publications |
| `parse.py` | Row field parser / sanity checks |
| `vm.py` | SVM1 decoder and interpreter |
| `sim.py` | Publication transport / consumption adapter helpers |
| `full.py` | Full journal replay with module modes and recovery policies |
| `build_key.py` | Frontier closure, restore-key assembly and capsule decryption |

Run `python3 work/build_key.py` to rebuild the key, the pending set and the
decrypted flag.

---

## 10. Key takeaways

- The SPI capture is not just metadata: the accepted ticket and cursors are
  required inputs, while the rejected ticket is a decoy.
- The ECC layer must be decoded correctly before anything else; a single
  mis-indexed data bit breaks every CRC and digest.
- The module is not labelled in the export. Both the transport mode and the
  recovery policy must be inferred: fingerprints pin down the mode, and the
  policy only becomes observable through post-restore duplicate detection.
- The frontier is the least fixed point of the publication dependency closure,
  not simply the ticket cursors.
- Pending packets are determined by application receipt state, not by the radio
  notifications in the VCD.
