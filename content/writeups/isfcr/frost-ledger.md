---
title: "Frost-ledger"
description: "The archive includes a registry.fvr volume, fvrctl, an SDK header, documentation, and daemon logs. The daemon uses fvregd 1.4.2 / on-disk format v1. In v1, the 16-byte cell descriptor…"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/frost-ledger.md"
---

**Category:** Forensics / File Format Recovery  
**Flag format:** `isfcr{...}`  
**Target record:** `bay/07/thaw-authority`

## Challenge Description

> Bay 07's controller cabinet went down with the vault and took the vendor's reader with it. What survived is the registry volume, the documentation on the controller image, and fvrctl. Recover the authority token from the registry record `bay/07/thaw-authority`.

## Flag

```text
isfcr{stale_cow_67c1_root_fc8fe97f_backwards_heap}
```

## 1. Inspect the archive

```bash
tar -xzf frost-ledger.tar.gz
cat README.txt
cat usr/share/doc/fvregd/RELEASE-NOTES.txt
cat usr/share/doc/fvregd/ONDISK-NOTES.txt
cat include/fvr_format.h
cat var/log/fvregd.log
```

The archive includes a `registry.fvr` volume, `fvrctl`, an SDK header, documentation, and daemon logs. The daemon uses **fvregd 1.4.2 / on-disk format v1**. In v1, the 16-byte cell descriptor adds a `flags` field and, critically, the key/value offsets use a different convention from the v0 notes. The released `fvrctl` no longer provides `get` or `walk`, so the registry must be parsed offline.

The log mentions a policy update that reissued `bay/07/thaw-authority` and retained a superseded copy in copy-on-write (CoW) history. Therefore, finding a matching key in arbitrary pages is not enough: we need the **latest valid committed root**.

## 2. Select the live root

The superblock occupies page 0. Pages are 4,096 bytes. Its root-slot table begins at byte 16 and contains eight 32-byte slots. Each slot holds an epoch, root page ID and an **FNV-1a 64-bit checksum over its first 24 bytes**.

Among the latest slots:

| Epoch | Root page | Checksum |
|---|---:|---|
| 288 | 3018 | Valid |
| 289 | 3029 | Valid |
| **290** | **3039** | **Valid** |
| 291 | 3049 | **Invalid / torn** |

Although epoch 291 is numerically newer, its root slot fails verification. The authoritative committed root is **epoch 290 on page 3039**.

## 3. Decode the B+tree with the correct offset convention

Each page (other than the superblock) has a 24-byte header, and INDEX and DATA pages use 16-byte v1 cell descriptors:

```c
struct fvr_cell {
    uint32_t koff;
    uint16_t ksize;
    uint16_t vsize;
    uint32_t voff;
    uint32_t flags;
};
```

The old v0 documentation describes `24 + offset` addressing. **That is wrong for this v1 image.** The v1 key/value bytes are located by counting backward from the *end of the page*:

```python
key   = page[4096 - koff : 4096 - koff + ksize]
value = page[4096 - voff : 4096 - voff + vsize]
```

Starting at root page **3039**, compare separator keys to `bay/07/thaw-authority`. The first child leads to DATA page **3030**, where the exact target key is found. The cell has flags `0x2`, indicating an overflow value.

Its 12-byte inline value is an overflow reference: a little-endian 64-bit head page ID followed by a little-endian 32-bit **stored** length:

```text
c6 03 00 00 00 00 00 00 44 09 00 00
```

That decodes to **head page 966**, **stored length 2,372 bytes**.

## 4. Reassemble and decompress the value

An OVERFLOW page has `next_pgid` at offset 24, `bytes_used` at offset 28, and exactly `bytes_used` payload bytes starting at offset 32. Follow the pointers instead of assuming overflow pages are contiguous:

| Page | Next page | Payload bytes |
|---:|---:|---:|
| 966 | 2675 | 739 |
| 2675 | 184 | 662 |
| 184 | 355 | 489 |
| 355 | 0 | 482 |
| **Total** | | **2,372** |

The assembled value begins with `78 da`, consistent with a zlib stream. Release notes for fvregd 1.4.0 warn that authority records of version 4 or later are not stored verbatim. Decompressing the 2,372 stored bytes with zlib yields **3,961 plaintext bytes**.

The recovered text contains:

```text
FROSTLINE VAULT AUTHORITY RECORD
record-version: 4
epoch: 290
bay: 07
subject: cryogenic-pod-array-07
...
authority-token: isfcr{stale_cow_67c1_root_fc8fe97f_backwards_heap}
```

## 5. Reproducible solver

Save this as `solve.py` beside `registry.fvr` and run `python3 solve.py`:

```python
#!/usr/bin/env python3
import re
import struct
import zlib

PAGE = 4096
TARGET = b"bay/07/thaw-authority"
blob = open("registry.fvr", "rb").read()


def u32(buf, off=0):
    return struct.unpack_from("<I", buf, off)[0]


def u64(buf, off=0):
    return struct.unpack_from("<Q", buf, off)[0]


def page(n):
    data = blob[n * PAGE : (n + 1) * PAGE]
    assert len(data) == PAGE
    return data


def fnv1a64(data):
    value = 0xCBF29CE484222325
    for byte in data:
        value ^= byte
        value = (value * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return value


def get_live_root():
    sb = page(0)
    assert sb[:3] == b"FVR"
    assert u32(sb, 4) == PAGE
    assert u32(sb, 12) == 1, "Expected on-disk format v1"
    valid = []
    for idx in range(8):
        slot = sb[16 + idx * 32 : 16 + (idx + 1) * 32]
        epoch = u64(slot, 0)
        root = u32(slot, 8)
        if epoch and fnv1a64(slot[:24]) == u64(slot, 24):
            valid.append((epoch, root))
    return max(valid)


def get_cells(pg):
    d = page(pg)
    kind = d[12]
    count = struct.unpack_from("<H", d, 14)[0]
    cells = []
    for i in range(count):
        off = 24 + 16 * i
        koff, ksize, vsize, voff, flags = struct.unpack_from("<IHHII", d, off)
        key = d[PAGE - koff : PAGE - koff + ksize]
        val = d[PAGE - voff : PAGE - voff + vsize]
        cells.append((key, val, flags))
    return kind, cells


def lookup(root, target):
    pg = root
    while True:
        kind, cells = get_cells(pg)
        if kind == 2:  # DATA
            for key, val, flags in cells:
                if key == target:
                    return pg, val, flags
            raise KeyError(target)
        assert kind == 1, f"Unexpected page kind: {kind}"
        index = next((i for i, (key, _, _) in enumerate(cells)
                      if target < key), len(cells))
        if index < len(cells):
            pg = u32(cells[index][1])
        else:
            pg = u32(page(pg), PAGE - 4)


def read_overflow(head, total_len):
    chunks = []
    seen = set()
    pg = head
    while pg:
        assert pg not in seen, "Overflow cycle"
        seen.add(pg)
        d = page(pg)
        assert d[12] == 3, "Not an overflow page"
        next_pg = u32(d, 24)
        used = u32(d, 28)
        assert used <= PAGE - 32
        chunks.append(d[32 : 32 + used])
        pg = next_pg
    result = b"".join(chunks)
    assert len(result) == total_len
    return result


epoch, root = get_live_root()
print(f"Live root: epoch={epoch}, page={root}")
data_page, ref, flags = lookup(root, TARGET)
assert flags & 0x2 and len(ref) == 12
head, stored_len = struct.unpack("<QI", ref)
print(f"Data page={data_page}, overflow head={head}, stored length={stored_len}")
stored = read_overflow(head, stored_len)
plaintext = zlib.decompress(stored)
print(f"Decoded length={len(plaintext)}")
match = re.search(rb"^authority-token:\s*(isfcr\{[^\r\n}]+\})", plaintext, re.M)
assert match, "Authority token not found"
print("FLAG:", match.group(1).decode())
```

Expected output:

```text
Live root: epoch=290, page=3039
Data page=3030, overflow head=966, stored length=2372
Decoded length=3961
FLAG: isfcr{stale_cow_67c1_root_fc8fe97f_backwards_heap}
```

## Key Takeaways

- The newest-looking CoW root can be **torn**; verify its checksum before selecting it.
- Old on-disk documentation can be misleading after a format migration: version 1 uses **backward-relative** cell payload offsets.
- Overflow page IDs are **linked**, not necessarily consecutive; use the byte count on every page.
- A version 4 authority record is **compressed**, and its declared overflow length measures the stored representation, not the decompressed text.

**Final flag:** `isfcr{stale_cow_67c1_root_fc8fe97f_backwards_heap}`
