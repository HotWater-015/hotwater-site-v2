---
title: "Vesper — Missed-Handover Recovery"
description: "The bundle describes a deterministic recovery export from a small RV32IM fixture. An MCU talks to a simulated sensor hub and a two-lane RF bridge, both of which stay powered while the…"
event: "cryovault"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CryoVault Finals 2026","iot"]
date: "2026-10-26"
teammate: false
source: "cryovault/iot/3/writeup.md"
---

**Flag:** `isfcr{fd0a085830b0802f234486bd05c201818fb469ae02c597cd}`

## 1. Overview

The bundle describes a deterministic recovery export from a small RV32IM
fixture. An MCU talks to a simulated sensor hub and a two-lane RF bridge, both
of which stay powered while the MCU does not. The export contains:

| File | Purpose |
| --- | --- |
| `vesper.elf` | Installed RV32IM firmware, entry point `0x10000` |
| `BOARD.md` | Fixture, power, sensor, RF and journal contract |
| `FORMAT.md` | Handover serialization and sealed-record format |
| `acquisition.bin` | 4096 packed u16 sensor entries |
| `power.csv` | Per-boot powered-slot range and unpowered-slot count |
| `journal.csv` | 24 diagnostic intervals (6 boots each) |
| `receipts.bin` | Gateway acceptance records |
| `fram.bin` | Final 64-byte NVM export |
| `record.sealed` | ChaCha20-Poly1305 sealed handover record |

The task is to recover the powered-slot count `Q` for every boot, replay the
fixture exactly, rebuild the handover serialization from the gateway
acceptances, and decrypt `record.sealed`.

---

## 2. Reversing the firmware

The ELF has only one loadable 0x500-byte `.text` segment at `0x10000`, no
symbols, and no compressed instructions. Disassembling with Capstone
(`CS_ARCH_RISCV`, `CS_MODE_RISCV32`) gives the complete boot routine.

### 2.1 Boot sequence

Each boot performs these steps:

1. Read all 64 NVM bytes (op 0, unmetered).
2. Validate the four 16-byte slots and select the valid slot with the highest
   sequence number.
3. Select the sensor hub, send `0x0D`, read two sensor entries, and deselect.
4. Derive `k` from the NVM state and the first two entries, then read another
   `3+k` entries. The complete vector has `N = 5+k` entries.
5. Hash the vector and build a six-byte RF frame.
6. Stage the frame through op 3 and submit it with op 4.
7. Commit a new NVM slot with 17 op-5 writes: invalidate marker, 15 data
   bytes, then write the `0xA5` marker.
8. Enter sleep (op 6).

A full boot executes exactly

```text
40 + 2k
```

metered commands, and a source-level reimplementation mixed with the RF and
sensor model is sufficient; a full CPU emulator is not required once the
routine is understood.

### 2.2 NVM slot layout

Each 16-byte slot is:

| Offset | Meaning |
| --- | --- |
| `0..1` | ASCII `VP` |
| `2..3` | sequence number, little-endian u16 |
| `4..5` | hash state `a3` |
| `6..7` | hash state `a2` |
| `8` | hash state `a5` (also the frame telemetry byte `b2`) |
| `9` | vector length `N` |
| `10..11` | CRC-16/CCITT-FALSE over bytes `0..9` |
| `12..13` | bitwise complement of the sequence number |
| `14` | zero |
| `15` | marker `0xA5` |

A slot is valid when `VP`, the marker, the zero byte, the complement, and the
CRC all check out. With no valid slot the firmware uses the defaults

```text
seq = 0, a3 = 0x6d2b, a2 = 0x9137, a5 = 0
```

and it commits the first new slot as sequence 1.

### 2.3 Sensor selection

The first sensor command reads entries `e0, e1`. The firmware computes

```text
k = (seq ^ a3 ^ (e0 & 0xff) ^ (e1 >> 3)) & 3
N = 5 + k
```

The second command reads the remaining `3+k` entries. The complete vector is
`[e0, e1, ...]`, including the original 16-bit type and sign-extension bits.

### 2.4 Hash and frame

For each vector entry `x` at index `i`:

```text
t    = ((x ^ 0xa73d) + a2) & 0xffff
a3   = (rol16(a3 ^ ((i*0x31 + (x & 0x3fff) + 0x31) & 0xffff), 5) + a2) & 0xffff
a2   = (a3 ^ rol16(t, 3)) & 0xffff
```

Two details matter:

- The NVM CRC is **full CRC-16/CCITT-FALSE**, init `0xFFFF`, not a 12-bit CRC.
- The `t4` term is `x & 0x3fff`, not `x & 0xfff`, because the firmware does a
  32-bit `(x << 18) >> 18`.

The frame is:

```text
id        = old sequence number (u16 LE)
byte 2    = ((a3 >> 2) ^ (a2 >> 5) ^ a5_old) & 0x1f
byte 3    = ((a2 >> 8) + (a3 >> 11)) & 7
bytes 4..5= CRC-16/CCITT-FALSE over bytes 0..3
```

The NVM commit stores the new `a3`, `a2`, byte 2 as the new `a5`, and `N` in
the new sequence's slot.

---

## 3. Fixture model

### 3.1 Power slots

Boot `b` has `Q` powered slots and `G` unpowered slots. At the start of every
slot both RF lanes advance once. In a powered slot, after the lane advance, the
MCU executes one metered command if it is still awake. If the firmware sleeps
early, the remaining powered slots still elapse.

If the rail falls before a command, that command never happens. A completed
command is atomic. Reset clears the MCU staging register and deasserts sensor
chip select, but leaves the NVM, sensor FIFO, RF lanes and gateway untouched.

### 3.2 Sensor FIFO

The cursor advances by

```text
ceil(number_of_data_bytes / 2)
```

for each sensor command. If power is lost after an odd number of data bytes,
the pending high byte is discarded and the next boot continues at the next
entry's low byte. This is why the cursor must be updated incrementally, not
only at deselect.

### 3.3 RF lanes and gateway

A submission enters the lowest empty lane. Its countdown is

```text
D = 60 + 12 * ((frame[2] ^ frame[3]) & 15)
```

Both lanes decrement at every slot. A lane reaching zero delivers its frame
before the MCU command in that slot; simultaneous deliveries occur in lane
order. If both lanes are occupied, the submission is dropped.

The gateway accepts the first delivered frame for each identifier and counts
all later deliveries with that identifier as duplicates. Every delivery
increments RX. Dropped submissions increment DROPPED but never RX.

### 3.4 Journal checks

`memory_check` is CRC-16/CCITT-FALSE over all 64 NVM bytes. `radio_check` is
the same CRC over lane 0 then lane 1, where an empty lane contributes nine
zero bytes and an occupied lane contributes `01`, the u16 remaining count, and
the six-byte frame.

---

## 4. Recovering the power sequence

Boots are grouped into 24 intervals of six boots. `power.csv` gives an
inclusive range `[min, max]` for each `Q`, plus the fixed `G`. The capture
windows additionally pin six exact values:

```text
boot  11 -> 25
boot  35 -> 50
boot  59 -> 38
boot  83 -> 41
boot 107 -> 13
boot 131 -> 3
```

For each interval a depth-first search tries every `Q` in the allowed range for
its six boots. The search carries the complete fixture state:

- NVM bytes,
- sensor FIFO cursor,
- both RF lane states,
- the set of already accepted identifiers,
- interval counters RX / DUPLICATES / DROPPED.

Branches are pruned using:

- monotonic cursor growth,
- partial RX / duplicate / dropped counts,
- the receipt frames for the current interval: any new acceptance must be the
  next expected frame; later duplicates are free,
- at the interval boundary, exact cursor, `memory_check`, `radio_check` and
  counter equality.

The final interval also advances the extra 512 unpowered drain slots before
checking the last journal row.

The recovered `Q` values are:

| Interval | Boots | `Q` values |
| --- | --- | --- |
| 0 | 0–5 | `0, 10, 38, 15, 44, 22` |
| 1 | 6–11 | `14, 3, 10, 44, 11, 25` |
| 2 | 12–17 | `44, 8, 3, 43, 25, 46` |
| 3 | 18–23 | `38, 38, 45, 39, 41, 32` |
| 4 | 24–29 | `25, 44, 16, 19, 30, 35` |
| 5 | 30–35 | `27, 46, 40, 35, 28, 50` |
| 6 | 36–41 | `12, 12, 40, 40, 41, 15` |
| 7 | 42–47 | `40, 33, 45, 13, 40, 34` |
| 8 | 48–53 | `42, 25, 11, 34, 14, 44` |
| 9 | 54–59 | `10, 44, 3, 27, 33, 38` |
| 10 | 60–65 | `25, 46, 12, 48, 9, 11` |
| 11 | 66–71 | `0, 20, 33, 35, 5, 19` |
| 12 | 72–77 | `10, 29, 0, 36, 16, 50` |
| 13 | 78–83 | `4, 5, 30, 43, 12, 41` |
| 14 | 84–89 | `42, 36, 25, 41, 40, 45` |
| 15 | 90–95 | `46, 5, 10, 43, 22, 46` |
| 16 | 96–101 | `23, 46, 15, 3, 31, 22` |
| 17 | 102–107 | `44, 29, 34, 32, 9, 13` |
| 18 | 108–113 | `38, 24, 3, 18, 29, 28` |
| 19 | 114–119 | `42, 0, 33, 0, 16, 16` |
| 20 | 120–125 | `23, 10, 28, 40, 14, 12` |
| 21 | 126–131 | `43, 5, 25, 40, 30, 3` |
| 22 | 132–137 | `29, 27, 25, 35, 18, 32` |
| 23 | 138–143 | `46, 46, 30, 46, 10, 16` |

Replaying this sequence reproduces every journal row, including the final NVM
export byte-for-byte.

---

## 5. Reconstructing the handover records

`receipts.bin` actually contains

```text
0x1b = 27
```

records, not 25. Each record is a diagnostic-interval index and the accepted
six-byte frame.

During replay, every submission is stored with its vector start and `N`:

```text
vector = acquisition[start : start + N]
```

When a lane delivers a frame whose identifier has not been accepted before,
the gateway creates a new acceptance, so the vector attached to that lane is
the correct one. This also handles the retry case where several submissions
share an identifier: only the first delivered frame is accepted, and the
vector comes from that specific submission.

The accepted records are:

| # | Interval | Boot | Id | Vector start | N | Frame |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1 | 2 | 0 | 3 | 8 | `000019002b3d` |
| 1 | 2 | 11 | 2 | 47 | 6 | `020016023fe0` |
| 2 | 2 | 9 | 1 | 37 | 7 | `01000804593b` |
| 3 | 3 | 16 | 4 | 68 | 6 | `0400070187c7` |
| 4 | 3 | 15 | 3 | 63 | 5 | `0300190473e6` |
| 5 | 3 | 20 | 5 | 97 | 6 | `05000202a57e` |
| 6 | 4 | 22 | 6 | 111 | 7 | `06001903d12a` |
| 7 | 5 | 28 | 7 | 148 | 7 | `07001a021719` |
| 8 | 5 | 32 | 8 | 176 | 5 | `08001a02f9cd` |
| 9 | 5 | 33 | 9 | 181 | 7 | `090003070352` |
| 10 | 6 | 38 | 10 | 210 | 5 | `0a0014029e03` |
| 11 | 7 | 39 | 11 | 215 | 8 | `0b000a07f305` |
| 12 | 8 | 46 | 13 | 254 | 5 | `0d001107e3fd` |
| 13 | 8 | 47 | 14 | 259 | 8 | `0e001e054356` |
| 14 | 9 | 49 | 15 | 273 | 6 | `0f000f013150` |
| 15 | 9 | 57 | 17 | 308 | 7 | `11000604f103` |
| 16 | 12 | 69 | 19 | 366 | 5 | `13000d070002` |
| 17 | 14 | 80 | 20 | 415 | 5 | `14001c064e73` |
| 18 | 14 | 85 | 21 | 446 | 7 | `150011022233` |
| 19 | 16 | 93 | 24 | 490 | 6 | `18001204313f` |
| 20 | 16 | 95 | 25 | 501 | 6 | `19000205d75a` |
| 21 | 16 | 97 | 26 | 512 | 8 | `1a0004048c7b` |
| 22 | 17 | 100 | 27 | 526 | 5 | `1b001205ccb4` |
| 23 | 18 | 104 | 28 | 551 | 6 | `1c001a038e0c` |
| 24 | 19 | 116 | 29 | 608 | 7 | `1d000607a07c` |
| 25 | 21 | 126 | 30 | 655 | 6 | `1e000305cb38` |
| 26 | 22 | 128 | 31 | 663 | 5 | `1f001c00970d` |

The canonical serialization is 440 bytes:

```text
b"VESPER-HANDOVER\x00\x01"
u32 record_count = 27
per record:
    u16 id
    u8  N
    N * u16 original FIFO entries
```

The vectors are the original u16 values from `acquisition.bin`, not the
byte-swapped SPI stream.

---

## 6. Decryption

`record.sealed` starts with `VSR1`, followed by:

```text
salt   = sealed[4:20]
nonce  = sealed[20:32]
ct+tag = sealed[32:]
```

The key is HKDF-SHA256 with:

```text
IKM  = canonical serialization
salt = sealed[4:20]
info = b"vesper/handover/v1"
```

Decrypting with ChaCha20-Poly1305, using the first 32 bytes as associated data,
authenticates and yields:

```text
isfcr{fd0a085830b0802f234486bd05c201818fb469ae02c597cd}
```

---

## 7. Verification

The reconstruction was checked in several independent ways:

- Every one of the 24 journal rows matched for cursor, `memory_check`,
  `radio_check`, RX, DUPLICATES and DROPPED.
- The final NVM state matched `fram.bin` exactly.
- The final journal checks matched:
  - `memory_check = 9465`
  - `radio_check = 17835`
- All 27 rebuilt acceptance frames matched `receipts.bin` in order.
- The canonical serialization authenticated under the sealed record's AEAD,
  which confirms the exact vector contents as well as the record order.

Artifacts in `work/`:

| File | Contents |
| --- | --- |
| `sim.py` | Firmware, sensor, RF and journal model |
| `search.py` | Per-interval `Q` search |
| `run_search.py` | Full 24-interval recovery driver |
| `result.json` | Recovered `Q` sequence |
| `final.py` | Handover reconstruction, serialization and decryption |
| `serialization.bin` | Rebuilt 440-byte canonical handover record |
