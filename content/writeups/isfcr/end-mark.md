---
title: "End Mark"
description: "The worker read 24 payloads of 24 bytes each. Concatenating them in ascending slot order gives 576 bytes with SHA-256:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-11"
teammate: false
source: "isfcr/writeups/end-mark.md"
---

## Result

```text
isfcr{28bc454d9b8fc1b73ff97a0d7db31a76}
```

The worker read 24 payloads of 24 bytes each. Concatenating them in ascending slot order gives 576 bytes with SHA-256:

```text
28bc454d9b8fc1b73ff97a0d7db31a76f16db9ebfa7690e2b48e3fa4600a5746
```

## Evidence

The handout contains `BRIEF.md`, `ledger.db`, `ledger.db-wal`, and `trace.ndjson`. The trace records the total order of writer commits and reader operations, but omits query results. The database has these tables:

```sql
CREATE TABLE fragments(
    slot INTEGER PRIMARY KEY,
    payload BLOB NOT NULL,
    revision INTEGER NOT NULL
);
CREATE TABLE heartbeat(
    id INTEGER PRIMARY KEY,
    marker INTEGER NOT NULL
);
```

The ZIP remains the unchanged evidence. All inspection uses extracted files, and SQLite opens reconstructed snapshots with `immutable=1` so it does not process or alter the captured WAL.

## Recovering the WAL generations

The WAL has a 32-byte header and uses 1024-byte database pages. Each frame consists of a 24-byte frame header followed by one page, so the 125792-byte WAL contains:

```text
(125792 - 32) / (24 + 1024) = 120 frames
```

Each writer transaction occupies two frames: page 2, followed by page 3. The page-2 frame has a database-size field of zero; the page-3 frame has a database-size field of three, marking the commit. Page 2 contains `fragments`, and page 3 contains `heartbeat`.

The key event in the trace is:

```text
seq 82: PRAGMA wal_checkpoint(RESTART)
```

This follows transaction 60, after C1, C2, and C3 have ended their transactions. The checkpoint copies the committed pages into the database and permits the writer to restart the WAL at its beginning. A RESTART checkpoint does not truncate the file, so the next 30 transactions overwrite only its first 60 frames.

The captured WAL therefore contains two generations:

| Physical frames | Transactions | Salt pair |
| --- | --- | --- |
| 1–60 | 61–90 | `(73852823, 3311427778)` |
| 61–120 | 31–60 | `(73852822, 801949562)` |

The WAL header carries the newer salt pair. SQLite's normal WAL reader would use the newer generation; forensic reconstruction also needs the surviving older frames.

For a transaction `t`, its first frame index, counting from zero, is:

```python
first = 2 * (t - 1) if t <= 60 else 2 * (t - 61)
```

Only transactions 31–60 survive in the older generation; the formula for that generation is used within this available range.

To reconstruct a needed snapshot, copy `ledger.db` and replace pages 2 and 3 with the corresponding transaction's frame contents. Each transaction supplies both pages, so the reconstruction does not depend on replaying earlier overwritten frames. Page 1 supplies the unchanged schema.

## Determining what each reader saw

`BEGIN DEFERRED` does not immediately establish a database snapshot. A connection acquires its main-database snapshot when it first reads that database, and retains it until `END`.

The exact SQL in the log matters. A main-table read, `PRAGMA user_version`, or a read of `sqlite_schema` establishes the snapshot. `SELECT 1`, `SELECT sqlite_version()`, and a read confined to a temporary table do not establish a main-database snapshot.

| Reader | Operation establishing the snapshot | Sequence | Latest completed writer transaction | Slots fetched |
| --- | --- | --- | --- | --- |
| C1 | `SELECT marker FROM heartbeat WHERE id=1` | 40 | 38 | 15, 20, 13, 23 |
| C2 | First `FETCH`; earlier `SELECT 1` reads no database | 49 | 42 | 9, 3, 11, 16 |
| C3 | `PRAGMA user_version` | 53 | 44 | 17, 8, 10, 0 |
| C4 | First `FETCH`; earlier read accesses `temp.pulse` | 93 | 65 | 18, 12, 14, 7 |
| C5 | `SELECT count(*) FROM sqlite_schema` | 96 | 67 | 22, 5, 21, 19 |
| C6 | First `FETCH`; earlier `SELECT sqlite_version()` reads no database | 105 | 71 | 1, 4, 6, 2 |

For example, C1 begins before transaction 36 but first reads the main database after transaction 38. Its subsequent fetches all use transaction 38, even while the writer continues committing.

C4's temporary-table setup ran in autocommit mode before its deferred transaction. Its later temporary-table read does not pin the main database; the first fragment fetch does, after transaction 65.

As a local verification of these distinctions, I ran each SQL statement inside a deferred reader transaction, changed a main-table value through a separate WAL writer, and then read that value on the reader. The main-table read, `PRAGMA user_version`, and schema read retained the old value. The constant, version-function, and temporary-table reads saw the new value at their subsequent main-table read. This verification used local SQLite 3.53.4; the handout states the capture used SQLite 3.50.4.

## Extracting and hashing the payloads

`solve.py` reconstructs snapshots for transactions 38, 42, 44, 65, 67, and 71. It then walks the trace in `seq` order, tracks each reader's snapshot, and selects the payload for each recorded `FETCH`.

The script verifies:

- The frame count, page size, generation salts, and commit markers.
- The current WAL header and all current-generation frame checksums.
- The checksum chain after the first surviving old-generation frame, using that frame's stored checksum as the starting state. Its predecessor was overwritten, so the first old frame cannot be independently checked this way.
- SQLite integrity checks on every reconstructed snapshot.
- Exactly one recovered payload for every slot from 0 through 23, each 24 bytes long.

The final operation is:

```python
result = b''.join(recovered[slot] for slot in range(24))
digest = hashlib.sha256(result).hexdigest()
flag = 'isfcr{' + digest[:32] + '}'
```

Run the recovery from this directory with:

```sh
python solve.py
```

The script writes `recovered.bin`, containing the exact 576 bytes, and `recovered.json`, containing each slot's payload in hexadecimal together with its reader and snapshot transaction.
