---
title: "The Last Committed Message"
description: "Recover the note and its attachment record as they existed immediately after the operation committed for export export-07abca69cd99. The evidence consists of four ASCII strings, in order:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/the-last-committed-message.md"
---

**Category:** Forensics / SQLite WAL reconstruction / Cryptography  
**Flag format:** `isfcr{...}`  
**Recovered flag:** `isfcr{a03a410f1b87dbc115dd1ef6}`

## Challenge objective

Recover the note and its attachment record **as they existed immediately after the operation committed** for export `export-07abca69cd99`. The evidence consists of four ASCII strings, in order:

1. Note ID
2. Revision, written as a decimal string
3. Destination, **exactly as stored**
4. Associated attachment's recorded SHA-256, in lowercase hexadecimal

These strings are serialized as a compact JSON array, fed into `hashlib.scrypt`, and used to derive the AES-256-GCM key that decrypts the flag.

## 1. Identify the correct export operation

The log includes **two entries for the same export ID**:

```json
{"export_id":"export-07abca69cd99","operation_id":"op-c46dc0e04bdd","status":"timeout"}
{"export_id":"export-07abca69cd99","operation_id":"op-09e0d79b4b14","status":"acknowledged"}
```

The timeout operation is **not** the requested export state. The authoritative record is the acknowledged entry, so our target is:

```text
op-09e0d79b4b14
```

A later database revision is also not the answer: the problem explicitly asks for the state *at that operation's commit*, not the latest state currently visible.

## 2. Inspect the evidence files

The supplied `handout (1).zip` contains:

```text
the-last-committed-message/
├── case.db
└── case.db-wal
```

`case.db` is a SQLite database; the `-wal` file stores write-ahead-log frames. The relevant schema is:

```sql
CREATE TABLE attachments (
    attachment_id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE notes (
    note_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL,
    destination TEXT NOT NULL,
    attachment_id TEXT NOT NULL REFERENCES attachments(attachment_id),
    operation_id TEXT NOT NULL UNIQUE
) WITHOUT ROWID;

CREATE TABLE operations (
    operation_id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    operation_kind TEXT NOT NULL
);
```

The proper evidence comes from joining `notes` to `attachments` while checking the matching `operations` row.

## 3. Recover historical SQLite states from the WAL

Opening `case.db` normally, even alongside `case.db-wal`, does **not** provide an arbitrary historical snapshot. The file contains retained WAL frames from several generations (distinguished by salt values). The SQLite base file and current WAL view show states later than our target.

Here the database uses **512-byte pages**. Each WAL frame consists of a **24-byte frame header** and a **512-byte page image**. The header includes the database page number, a database-size-in-pages field (nonzero only for commit frames), and two salt values.

The WAL file has **1,538 frames**. Examining consecutive salt values separates the retained generations:

| Physical frame range | WAL salt (two 32-bit integers) | Chronological order |
|---|---|---|
| 1–108 | `3e895953 / 95ad06c0` | Newest |
| 109–725 | `3e895952 / 4ff402f0` | Middle |
| 726–1538 | `3e895951 / 90500c65` | Oldest |

The older generations remain physically present past the current generation. **Do not simply replay physical frame order 1 → 1538.** Instead, replay generations in chronological order (oldest → newest), while keeping the frame order *inside* each generation.

At each frame, write its page image to offset `(page_number - 1) * page_size`. When the frame's database-size field is nonzero, a transaction has committed. At those boundaries, save the first `database_size * page_size` bytes as a temporary SQLite snapshot and examine its committed tables.

Some earlier intermediate snapshots may report a malformed database because the provided base image reflects a later checkpoint and not every overwritten page from the earliest history is retained. Continuing through the accumulated page images reconstructs valid states. The requested snapshot is available at a fully committed frame.

## 4. Locate the target commit

Replaying the older generations and querying the `operations`, `notes`, and `attachments` tables identifies the acknowledged operation at **physical WAL commit frame 455**. A suitable query is:

```sql
SELECT n.note_id,
       CAST(n.revision AS TEXT) AS revision,
       n.destination,
       a.sha256,
       n.attachment_id
FROM notes AS n
JOIN attachments AS a ON a.attachment_id = n.attachment_id
JOIN operations AS o ON o.operation_id = n.operation_id
WHERE o.operation_id = 'op-09e0d79b4b14';
```

At frame 455, the recovered fields are:

| Field | Recovered value |
|---|---|
| Note ID | `note-7211098c21a6` |
| Revision | `5` |
| Attachment ID (join key) | `blob-72346f69c681` |
| Attachment SHA-256 | `b89d5c5695803071522614060828e31e9bb4bc25813fdbc5d516db06ac4c2d58` |
| Destination | 1,097-character SFTP URL, shown verbatim below |

**Exact destination (one line):**

```text
sftp://drop-edef61bb364d.example.invalid/inbox/f34143e1/2ce8a41a/139752d7/d8c5233e/7ba75d0e/c2866227/b4d0de1f/5912fed7/d1c81c27/3ef24a23/228a0961/472211dc/7c8b7086/367a0395/7d5a7d89/2862b085/c6d61a12/8c6f6794/0d0eb259/20e22b8d/926fd4cb/c1aa0858/10b61565/2856e80a/06b2f7e8/0cfa2eef/d9fe990b/4decc27e/5105817c/5b753c6c/2ed69d73/eb9d1558/576adb52/5130db6c/65ff8280/9c4947e4/669e56e1/f82be048/e264d8d2/6ba945ce/9dda4ae7/dc9c6092/de6373c8/cc083444/944ef3b8/d81c59fc/3c0f97ef/6929e194/5135f938/dc13be65/224842c9/180ad8aa/9f755c56/f637a19f/a26f4dd5/1dad1917/a7ea15f3/991850ac/d08bb530/7f53318f/69130c38/64d70554/4571a6e9/1e9b8a7b/b87d4a16/b242b6b8/5caabe03/ce99d334/e674d816/941dc470/745ecebb/992bdb53/0479206b/8d4d6f8d/f364797c/3a244740/75ea1c65/6d15bb61/d2a2000a/8fa3bd7c/4e4861a8/548d17c2/0b41a31f/94b1d689/ae0d2ead/616336c9/c7b5b361/4c61a156/dec276e8/2391cb1a/89ef1c23/4ca166c5/6a080fd6/e6e4e7de/8030b124/0b751683/c91c112e/5d33f9c9/bcfcd0a2/0f13b037/c69fb9ba/37018281/fb2be662/d3c3f6ea/0739fbc7/9527be8e/ecaf1959/d0f260aa/b89d461c/9a805d1d/5ec4921ffe4835a0.bin?ticket=a638d0e59bf0b87a8d34c22020f0555d
```

**Exact four-element evidence array:**

```json
[
  "note-7211098c21a6",
  "5",
  "sftp://drop-edef61bb364d.example.invalid/inbox/f34143e1/2ce8a41a/139752d7/d8c5233e/7ba75d0e/c2866227/b4d0de1f/5912fed7/d1c81c27/3ef24a23/228a0961/472211dc/7c8b7086/367a0395/7d5a7d89/2862b085/c6d61a12/8c6f6794/0d0eb259/20e22b8d/926fd4cb/c1aa0858/10b61565/2856e80a/06b2f7e8/0cfa2eef/d9fe990b/4decc27e/5105817c/5b753c6c/2ed69d73/eb9d1558/576adb52/5130db6c/65ff8280/9c4947e4/669e56e1/f82be048/e264d8d2/6ba945ce/9dda4ae7/dc9c6092/de6373c8/cc083444/944ef3b8/d81c59fc/3c0f97ef/6929e194/5135f938/dc13be65/224842c9/180ad8aa/9f755c56/f637a19f/a26f4dd5/1dad1917/a7ea15f3/991850ac/d08bb530/7f53318f/69130c38/64d70554/4571a6e9/1e9b8a7b/b87d4a16/b242b6b8/5caabe03/ce99d334/e674d816/941dc470/745ecebb/992bdb53/0479206b/8d4d6f8d/f364797c/3a244740/75ea1c65/6d15bb61/d2a2000a/8fa3bd7c/4e4861a8/548d17c2/0b41a31f/94b1d689/ae0d2ead/616336c9/c7b5b361/4c61a156/dec276e8/2391cb1a/89ef1c23/4ca166c5/6a080fd6/e6e4e7de/8030b124/0b751683/c91c112e/5d33f9c9/bcfcd0a2/0f13b037/c69fb9ba/37018281/fb2be662/d3c3f6ea/0739fbc7/9527be8e/ecaf1959/d0f260aa/b89d461c/9a805d1d/5ec4921ffe4835a0.bin?ticket=a638d0e59bf0b87a8d34c22020f0555d",
  "b89d5c5695803071522614060828e31e9bb4bc25813fdbc5d516db06ac4c2d58"
]
```

Note that the attachment ID is used for the SQL join, but it is **not** one of the four supplied key-derivation fields. The attachment's SHA-256 is the fourth field.

## 5. Derive the key and validate the flag

The challenge gives these parameters:

- KDF input: `b"isfcr-forensics\x00" + E`
- `E`: compact ASCII JSON serialization of the four evidence strings
- `scrypt`: `n=131072`, `r=8`, `p=1`, `maxmem=2**28`, `dklen=32`
- Salt: `a3845b1a904c5ee73abe7329b5d735d7`
- AES-GCM nonce: `ca98cff993b27fd3bb352436`
- Associated data: `b"the-last-committed-message"`

AES-GCM decryption with the reconstructed values **succeeds, including authentication-tag verification**, and yields:

```text
isfcr{a03a410f1b87dbc115dd1ef6}
```

Because AES-GCM authenticates the ciphertext and associated data, a successful decrypt confirms the derived key matches the sealed record; it is not merely a plausible-looking text guess.

## 6. Complete reproducible solver

Prerequisites: Python 3 and the `cryptography` package (`python -m pip install cryptography`). Save the following as `solve.py` alongside `handout (1).zip`, and run `python solve.py 'handout (1).zip'`.

```python
#!/usr/bin/env python3
"""Reconstruct the acknowledged export's SQLite snapshot and decrypt the flag."""
import hashlib
import json
import sqlite3
import struct
import sys
import tempfile
import zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ARCHIVE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('handout (1).zip')
TARGET_OP = 'op-09e0d79b4b14'
MEMBER_DIR = 'the-last-committed-message/'

with zipfile.ZipFile(ARCHIVE) as archive:
    base = bytearray(archive.read(MEMBER_DIR + 'case.db'))
    wal = archive.read(MEMBER_DIR + 'case.db-wal')

page_size = struct.unpack_from('>I', wal, 8)[0]
frame_length = 24 + page_size
frame_count = (len(wal) - 32) // frame_length
assert page_size == 512

epochs = []
for i in range(frame_count):
    off = 32 + i * frame_length
    page_no, db_pages, salt1, salt2 = struct.unpack_from('>IIII', wal, off)
    salt = (salt1, salt2)
    if not epochs or epochs[-1][0] != salt:
        epochs.append((salt, []))
    epochs[-1][1].append((i + 1, page_no, db_pages, wal[off + 24:off + frame_length]))

result = None
with tempfile.TemporaryDirectory() as tmp:
    snapshot = Path(tmp) / 'snapshot.db'
    # WAL generations are stored newest first. Apply oldest to newest.
    for _salt, frames in reversed(epochs):
        for frame_no, page_no, db_pages, image in frames:
            offset = (page_no - 1) * page_size
            if len(base) < offset + page_size:
                base.extend(bytes(offset + page_size - len(base)))
            base[offset:offset + page_size] = image
            if db_pages == 0:
                continue  # transaction not committed yet

            snapshot.write_bytes(base[:db_pages * page_size])
            try:
                with sqlite3.connect(snapshot.as_uri() + '?immutable=1', uri=True) as db:
                    row = db.execute('''
                        SELECT n.note_id, CAST(n.revision AS TEXT),
                               n.destination, a.sha256, n.attachment_id
                        FROM notes AS n
                        JOIN attachments AS a ON a.attachment_id = n.attachment_id
                        JOIN operations AS o ON o.operation_id = n.operation_id
                        WHERE o.operation_id = ?
                    ''', (TARGET_OP,)).fetchone()
            except sqlite3.DatabaseError:
                continue  # partial reconstruction of an earlier snapshot

            if row:
                evidence = list(row[:4])
                attachment_id = row[4]
                result = (frame_no, evidence, attachment_id)
                break
        if result:
            break

if result is None:
    raise SystemExit('Target commit not found')
frame_no, evidence, attachment_id = result
E = json.dumps(evidence, ensure_ascii=True, separators=(',', ':')).encode('ascii')
key = hashlib.scrypt(
    b'isfcr-forensics\x00' + E,
    salt=bytes.fromhex('a3845b1a904c5ee73abe7329b5d735d7'),
    n=131072, r=8, p=1, maxmem=2**28, dklen=32,
)
flag = AESGCM(key).decrypt(
    bytes.fromhex('ca98cff993b27fd3bb352436'),
    bytes.fromhex(
        '3fa8b9049b01fb8d12df130b404352f9c678c272cccb7e6c'
        '034554c902f1ca4d574fc04db8892fead1ad394735e021'
    ),
    b'the-last-committed-message',
).decode('ascii')
Path('evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
print('WAL commit frame:', frame_no)
print('Note:', evidence[0], 'revision:', evidence[1])
print('Attachment:', attachment_id)
print('SHA-256:', evidence[3])
print('Destination length:', len(evidence[2]))
print('Flag:', flag)
```

**Verified output:**

```text
WAL commit frame: 455
Note: note-7211098c21a6 revision: 5
Attachment: blob-72346f69c681
SHA-256: b89d5c5695803071522614060828e31e9bb4bc25813fdbc5d516db06ac4c2d58
Destination length: 1097
Flag: isfcr{a03a410f1b87dbc115dd1ef6}
```

The solver also saves `evidence.json` with all four fields copied verbatim, avoiding manual errors in the long URL.

## Final answer

```text
isfcr{a03a410f1b87dbc115dd1ef6}
```

**Key lesson:** An acknowledged export refers to the committed historical state associated with its operation ID. For SQLite WAL evidence, carefully distinguish logical commit time from the database's latest state and from the physical order of retained WAL generations.
