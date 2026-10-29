---
title: "The Export That Never Existed"
description: "The goal was to reproduce export job 204 from dispatch.capture, then calculate the SHA-256 of the exact bytes returned by the supplied exporter."
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/11/writeup.md"
---

The goal was to reproduce export job **204** from `dispatch.capture`, then calculate the SHA-256 of the exact bytes returned by the supplied exporter.

The recovered output is **3,147 bytes**, containing **52 items**:

```text
isfcr{c916c4f7b8ecccf073bf5cd6e815218f3622ba7c3500919f2a6b11f2db891b68}
```

The output is saved as `job204.export`. The final replay checks every delivery route, each published meter, and all district settlement totals.

## Why simply restoring SQLite was insufficient

The archive is a SQLite container holding recovery records, rather than the appliance database itself. Its important record types are:

| Record | Purpose |
| --- | --- |
| `image`, `base-page` | Sparse initial database and candidate baseline pages |
| `wal-header`, `wal-frame`, `index` | Overlapping observations of several WAL epochs |
| `arena` | Worker identity and SQLite snapshot token |
| `receipts` | Snapshot token for the publication and settlement ledger |
| `events` | Attachment-broker descriptor operations and anonymous checkouts |
| `pack-member`, `pack-map` | Coded attachment storage and candidate logical roots |

`capture.py` verifies decompressed block hashes and each reconstructed entry's length and SHA-256. Those checks establish that the recovery records were read correctly. They do **not** authenticate a particular historical database page or attachment root.

There were four candidates at each of 131 supplied baseline-page positions. WAL observations also contained candidate pages that could survive checksum-chain validation. Choosing the last observation, or the first checksum-valid page, therefore does not solve the challenge.

## Reconstructing the database snapshots

### Recovering WAL order

Frame offsets were missing and entry IDs were shuffled, so neither archive order nor acquisition order supplied WAL frame order.

SQLite's WAL checksum gives a way to recover the predecessor state. For each pair of little-endian 32-bit words `x, y`, the checksum update is:

```text
a' = a + x + b       mod 2^32
b' = b + y + a'      mod 2^32
```

It can be reversed:

```text
b = b' - y - a'      mod 2^32
a = a' - x - b       mod 2^32
```

For a frame, the checksummed data is its first eight header bytes followed by the 1,024-byte page. The stored checksum words in the frame header are read big-endian. Reversing the checksum over the data yields the predecessor checksum.

I grouped frames by WAL salt, collapsed byte-identical observations, and followed checksum relationships from the corresponding WAL header. A nonzero database-size field marks a commit frame. The three recovered epochs ended at:

| WAL salt | Final committed frame count |
| --- | ---: |
| `c627064282dc8723` | 3,955 |
| `c6270643e893d201` | 3,992 |
| `c6270644fc0b0b38` | 4,001 |

Complete checkpoints before WAL restart allow earlier epochs to be applied before reconstructing a snapshot in a later epoch. Within the target epoch, the snapshot token supplies the frame count and final checksum. Frames after that boundary must not enter the read image.

Checksum-equivalent page candidates remain candidates. The final reconstruction retains their possible row values instead of treating an arbitrary representative page as historical truth.

### Identifying the accepted workers

Each 96-byte `worker_view` contains an address, generation, job, stage, batch, 48-byte SQLite snapshot token, and CRC-32. I checked the CRC over bytes `[0,88)` before using a worker record.

The address is a reusable allocation slot. Its generation is essential: the accepted identity is **`(address, generation)`**.

The receipt snapshot exposes the `publication` and `settlement` tables. For job 204, I matched each published lease to its arena record and used that worker's snapshot for its stage:

- Stage 0 reads the manifest and constructs the plan.
- Stage 1 reads tariffs and districts and produces quoted amounts.
- Stage 2 reads clearance policy and produces released rows.

The three stages need not share a database snapshot. The quote output feeds release, even when those invocations read different database versions.

### Preserving page choices

`sqliteparse.py` decodes table-leaf cells, SQLite varints, record serial types, and signed integer fields. `allcandidates.py` collects candidate rows from the pages visible at each accepted snapshot.

The candidate differences relevant to the exporter were limited to:

| Table | Varying field |
| --- | --- |
| `manifest` | `slot` |
| `tariff` | `rate` |
| `district` | `fee` |
| `clearance` | `priority` |

A page selection applies to every row on that page. Allowing each row to choose its fields independently would admit combinations that never existed in any candidate page. The solver therefore shares one choice variable for each candidate page set and reuses it wherever that page version is observed.

## Recovering the attachment bytes

### Decoding the Cauchy recovery pack

Each stripe represents 1,024 logical bytes: eight 128-byte data symbols, protected by four parity symbols. Member identity does not directly give the code-symbol role.

For member `m` and stripe `s`:

```text
address = 19*s + 7*m
symbol  = (m - 5*s) mod 12
```

The parity coefficients are:

```text
C[r,c] = inverse(r XOR (c+4))
```

Arithmetic is in GF(256), with reduction polynomial `0x11d`.

Each stripe has ten retained symbols: two erasures, plus at most one silently stale retained symbol. Taking the first eight symbols would sometimes use stale data.

`pack.py` tries excluding each retained symbol in turn, takes eight of the remaining symbols, inverts their generator submatrix, and decodes the eight data symbols. It then re-encodes the result and compares it against **all ten retained symbols**, accepting only a result that disagrees with at most one complete symbol.

This recovered **2,616 stripes**. Concatenating `D0` through `D7` gives each logical stripe's bytes.

### Evaluating logical object roots

The pack map is an expression graph of `stripe`, `concat`, and bytewise `xor` nodes. Evaluating it produced two candidate byte strings for each of **109 immutable objects**.

Neither root order nor node handle identifies the historical root. I retained both roots and assigned one binary choice to each immutable object key. Every read through every descriptor alias of that object uses that same choice.

## Replaying the broker

The event trace records ordinary descriptor operations. I simulated them with a descriptor table per process and shared open-file-description objects containing an immutable object key and current offset.

This sharing matters:

- `dup` and `dup2` create aliases with a shared offset.
- `fork` copies descriptor references, retaining shared offsets.
- Maintenance reads advance offsets even though their bytes are not exported.
- A new `open` starts a separate offset at zero.
- Replacing a path binding does not change an already-open object.

Within a checkout, process 1's 24-byte reads on descriptor 100 are the deliveries. For each delivery, `broker.py` records the route partition, immutable object key, actual logical offset, and the 24 bytes from each candidate root.

The route comes from the decimal stem of the object's path. It is not the physical recovery-pack address or the selected 400-byte window.

The replay recovered **192 anonymous checkout groups**. The trace supplies no direct job or stage identity for those groups.

## Matching checkouts and candidate storage

I used OR-Tools CP-SAT in `cpsolve.py` to solve the remaining choices together:

- Candidate database page selections.
- One attachment root per immutable object.
- Quote and release checkout groups for each batch.
- Which quoted rows pass clearance.
- Every route, running meter, and final invoice amount.

For quote, the model follows the supplied exporter exactly:

```text
state = (13*len(rows) + sum(item_ids)) mod 65521
route = (slot + 16*rate + 256*fee + 11*item + state) mod 13
mix   = LE16(data[0:2]) + 3*data[2] + 17*data[3]
amount = ((units*rate - discount)*basis)//divisor + fee + mix
state  = (31*state + data[4] + 17*data[5] + item + amount) mod 65521
```

Each route must match the corresponding broker delivery, and the terminal state must equal the published quote meter.

Release starts from the complete quoted row sequence:

```text
state = (7*len(rows) + sum(quoted_amounts)) mod 65521
```

A row consumes a stamp only when clearance is enabled and its amount is at most the ceiling. For an accepted row:

```text
route  = (19*item + 37*priority + 17*amount + state) mod 13
billed = amount + surcharge + LE16(stamp[12:14])
state  = (43*state + stamp[15] + 11*stamp[16] + billed) mod 65521
```

Rejected rows consume no delivery and leave the release state unchanged. The model checks the release meter and requires distinct groups for the eight selected invocations.

Finally, it constrains the released item counts and billed sums to match the independent settlement ledger by district. These totals connect the four batches and provide evidence beyond the routing observations.

The matching groups were:

| Batch | Quote group | Release group | Exported items |
| --- | ---: | ---: | ---: |
| 0 | 20 | 152 | 15 |
| 1 | 89 | 125 | 11 |
| 2 | 34 | 139 | 15 |
| 3 | 58 | 140 | 11 |

## Exact replay and serialization

The constraint model identifies choices; it does not generate the final file directly. `finish.py` applies those choices and runs the supplied `exporter.quote`, `exporter.release`, and `exporter.serialize` functions.

Its broker adapter asserts every requested route, checks that each checkout is consumed exactly, and verifies the final meters. It also recomputes settlement:

| District | Items | Billed total |
| --- | ---: | ---: |
| 0 | 6 | 686879 |
| 1 | 8 | 1088184 |
| 2 | 4 | 394865 |
| 3 | 7 | 888817 |
| 4 | 5 | 1211515 |
| 5 | 7 | 817805 |
| 6 | 7 | 1674987 |
| 7 | 8 | 1286620 |

The serializer starts with `DSP9\x00`, followed by little-endian job and batch-count fields (`<IH`). Each batch contributes `<HH` for its index and row count. Released rows are sorted by `(priority, rank, item)` and serialized with:

```python
struct.pack('<IiiqH', item, priority, rank, billed, len(label_utf8))
```

The UTF-8 label and 24-byte attachment follow. The attachment combines `quote_data[:12]` with `release_stamp[12:]`.

There is no trailing newline.

## Reproduction

Run from this challenge directory. The scripts use Python 3 and NumPy. The CP-SAT solver imports OR-Tools from `/tmp/dispatch-ortools`, matching the installation used during the solve:

```bash
pip install --target /tmp/dispatch-ortools ortools
unzip -q the-export-that-never-existed.zip
python3 solve.py
python3 pack.py
python3 broker.py
python3 views.py
python3 epochs.py
python3 allcandidates.py
python3 cpsolve.py
python3 finish.py
sha256sum job204.export
```

`solve.py` creates the integrity-checked record cache and representative database images. `views.py` extracts the accepted leases and ledger. The final solve uses the preserved page candidates from `allcandidates.py`, rather than trusting the representative images for export data.

With the saved intermediate files, only `python3 finish.py` is needed to replay and verify the recovered selection.

Expected hash:

```text
c916c4f7b8ecccf073bf5cd6e815218f3622ba7c3500919f2a6b11f2db891b68  job204.export
```

This reconstructs the requested export. It does not require resolving the history of unused database rows or unselected attachment objects, nor does a satisfying solver result by itself prove uniqueness of every recovered storage choice.
