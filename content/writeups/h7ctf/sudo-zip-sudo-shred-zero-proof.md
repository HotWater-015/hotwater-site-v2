---
title: "\"sudo zip, sudo shred, zero proof\""
description: "No sleuthkit and no root on this box, but debugfs / dumpe2fs read the image read-only straight from the file, which is all this needs."
event: "h7ctf"
category: "forensics"
categoryLabel: "Forensics"
tags: ["H7CTF 2026","forensics"]
date: "2026-09-26"
teammate: false
source: "H7CTF/forensic/3/writeup.md"
---

## Flag

```
H7CTF{e211b7db9d4f5c9f0812}
```

## Evidence

| File | Size | Notes |
|------|------|-------|
| `case_disk.img` | 20 971 520 B | Linux ext4, volume label `CASE-2026-0917`, 1 KiB blocks, clean unmount |

No `sleuthkit` and no root on this box, but `debugfs` / `dumpe2fs` read the image
read-only straight from the file, which is all this needs.

```console
$ file case_disk.img
case_disk.img: Linux rev 1.0 ext4 filesystem data, UUID=1703f65b-..., volume name "CASE-2026-0917"
```

## Step 1 — The live filesystem is boring. That is the point.

```console
$ debugfs -R "ls -l -r /" case_disk.img
      2   40755 (2)      0      0    1024 26-Sep-2026 01:52 .
      2   40755 (2)      0      0    1024 26-Sep-2026 01:52 ..
     11   40700 (2)      0      0   12288 26-Sep-2026 01:52 lost+found
     13   40755 (2)      0      0    1024 26-Sep-2026 01:52 home
     18   40755 (2)      0      0    1024 26-Sep-2026 01:52 var

$ debugfs -R "ls -l -r /home/jdoe" case_disk.img
     14   40755 (2)      0      0    1024 26-Sep-2026 01:52 .
     13   40755 (2)      0      0    1024 26-Sep-2026 01:52 ..
     15   40755 (2)      0      0    1024 26-Sep-2026 01:52 designs
     16   40755 (2)      0      0    1024 26-Sep-2026 01:52 .cache

$ debugfs -R "ls -l /home/jdoe/.cache/staging" case_disk.img
     17   40755 (2)      0      0    1024 26-Sep-2026 01:52 .
     16   40755 (2)      0      0    1024 26-Sep-2026 01:52 ..
```

Three files exist in the whole image:

| Path | Size | Content |
|------|------|---------|
| `/home/jdoe/designs/notes.txt` | 41 B | `sprint planning notes, nothing sensitive` |
| `/home/jdoe/designs/roadmap.pdf` | 51 B | `%PDF-1.4` + `% internal product roadmap - confidential` — a stub, not a real PDF |
| `/var/log/auth.log` | 99 B | one line, below |

```console
$ cat var/log/auth.log
Sep 17 02:11:04 ws-jdoe sudo: jdoe : TTY=pts/0 ; PWD=/home/jdoe ; USER=root ; COMMAND=/usr/bin/zip
```

`jdoe` escalated to root and ran **`/usr/bin/zip` from `/home/jdoe`**. The user
story is "I zipped my designs and nothing else is here" — but there is no zip
anywhere in the directory tree, and an empty `.cache/staging` is exactly where a
staging archive gets parked before being shipped out.

Two tells that a file is *missing* rather than never having existed:

* `/home/jdoe/.cache/staging` exists but holds nothing — a directory created for
  a file that is no longer in it.
* The timestamps. Every inode in the image carries `dtime`-free timestamps of
  `2026-09-26 01:52:32`, i.e. the image was finalised after the deletion, so the
  "last known good" view is worthless.

## Step 2 — Find the blocks the file used to live in

`dumpe2fs` names the suspects immediately — the deleted file's blocks are now
free, and they are the *first* free blocks of group 0:

```console
$ dumpe2fs case_disk.img | sed -n '/Group 0:/,/^$/p'
Group 0: (Blocks 1-8192) csum 0x99dc [ITABLE_ZEROED]
  ...
  6691 free blocks, 1682 free inodes, 9 directories, 1681 unused inodes
  Free blocks: 1502-8192
  Free inodes: 23-1704
```

Free **blocks 1502-1505**, and **free inode 23** (the very first free inode).
Block arithmetic (1 KiB blocks, so block *n* = `0x` *n* * 1024):

* `/var/log/auth.log` → block **1501** = `0x177400` (99 B, confirmed via `debugfs stat` → `EXTENTS: (0):1501`)
* deleted file → blocks **1502-1505** = `0x177800`-`0x178FFF`

Everything from `0x177800` on is a dense non-zero run — the only large data
region in an otherwise 99.9 % zeroed 20 MB image:

```console
$ python3 - <<'EOF'
d=open('case_disk.img','rb').read()
print(hex(d.find(b'PK\x03\x04')), hex(d.find(b'PK\x01\x02')), hex(d.find(b'PK\x05\x06')))
EOF
0x177800 0x17852f 0x17857f
```

`0x177800` is exactly block 1502, the first free block. And those three
signatures are the **only** ones in the entire image — one archive, no second
copy, no fragmentation to reassemble.

## Step 3 — Reconstruct the name from the swallowed directory entry

Before touching the data blocks, the deleted file can be *named*. The staging
directory (block 1496 = `0x176000`) is "empty" to `debugfs`, but its block
still contains the old dirent, absorbed into the `..` entry's `rec_len`:

```console
$ xxd -s 0x176000 -l 48 case_disk.img
00176000: 1100 0000 0c00 0102 2e00 0000 1000 000e  ..................
00176010: 8030 202e 2e00 0000 1700 0000 dc03 0e01  .0 ...$........
00176020: 7133 5f64 6573 6967 6e73 2e7a 6970 0000  q3_designs.zip....
```

Parsed as ext4 dirents (layout `[inode u32][rec_len u16][name_len u8][type u8][name]`):

| Offset | inode | rec_len | name_len | type | name |
|--------|-------|---------|----------|------|------|
| `0x00` | 17 | 12 | 1 | 2 (dir) | `.` |
| `0x0C` | 16 | **1000** | 2 | 2 (dir) | `..` |
| `0x18` | **23** | 988 | 14 | 1 (reg) | **`q3_designs.zip`** |

Beforehand the block held `.` (0x00, rec 12), `..` (0x0C, rec 12) and
`q3_designs.zip` (0x18, rec 988, ending at 1012, followed by the usual 12-byte
tail entry). The `..` entry now reads `rec_len` **1000** — 0x0C + 1000 = 1012,
i.e. grown so it swallows the deleted entry's slot. ext4 adjusts the length but
does not scrub the bytes inside the swallowed span, so the 8+14 bytes of the old
dirent are still sitting there, still carrying **inode 23** and the name
**`q3_designs.zip`**. The entry is unreachable from the directory b-tree; the
bytes are not gone.

## Step 4 — The deleted inode confirms name, size and time

Inode 23 is on the free-inode list but not zeroed, so its metadata survives:

```console
$ python3 - <<'EOF'
import struct
d=open('case_disk.img','rb').read()
b=d[168*1024+(23-1)*256:][:256]        # inode table starts at block 168
print("mode=%o size=%d links=%d i_blocks=%d" % struct.unpack_from('<H',b,0)[0],
      struct.unpack_from('<I',b,4)[0], struct.unpack_from('<H',b,26)[0],
      struct.unpack_from('<I',b,28)[0])
print("dtime =", struct.unpack_from('<I',b,20)[0])   # 1790367752
eh=struct.unpack_from('<HHHHI',b,40); print("extent hdr", hex(eh[0]), "entries",eh[1],"depth",eh[3])
for i in range(eh[1]):
    lb,ln,hi,lo=struct.unpack_from('<IHHI',b,52+i*12)
    print("  extent logical=%d len=%d physical=%d" % (lb,ln,(hi<<32)|lo))
EOF
mode=100644 size=3477 links=0 i_blocks=8
dtime = 1790367752
extent hdr 0xf30a entries 1 depth 0
  extent logical=0 len=4 physical=1502
```

| Field | Value | Reading |
|-------|-------|---------|
| `i_mode` | `100644` | regular file, `-rw-r--r--` |
| `i_size` | **3477** | the archive's exact byte length |
| `i_links_count` | **0** | unlinked — the tell-tale of a deleted file |
| `i_dtime` | 1790367752 = 2026-09-25 20:22:32 UTC | deletion time (the ZIP's own `UT` field says 2026-09-26 01:52:31 local, +05:30) — and `i_mtime`/`i_ctime` carry the *same* second, so the archive was created and unlinked inside one second |
| extent | logical 0, len 4, **physical 1502** | blocks 1502-1505 = `0x177800`-`0x178FFF` |

`size 3477` + `physical 1502` is a self-checking prediction: the payload must run
from `0x177800` for exactly 3477 bytes, i.e. end at **`0x178595`**. The EOCD
sits at `0x17857f` with a 22-byte record and a zero comment length — which lands
on `0x178595` to the byte.

## Step 5 — Carve, and the archive is intact

```console
$ python3 -c "open('q3_designs.zip','wb').write(open('case_disk.img','rb').read()[0x177800:0x178595])"
$ unzip -v q3_designs.zip
Archive:  q3_designs.zip
 Length   Method    Size  Cmpr    Date    Time   CRC-32   Name
--------  ------  -------  ----------  ---------- -----  --------
    9240  Defl:X     3307  64% 2026-09-26 01:52 fbe9bcae  secret.txt
```

The local file header is intact and points at the whole 3307-byte deflate stream
that ends exactly where the central directory begins:

```console
$ xxd -s 0x177800 -l 64 case_disk.img
00177800: 504b 0304 1400 0200 0800 900e 3a5d aebc  PK..........:]..
00177810: e9fb eb0c 0000 1824 0000 0a00 1c00 7365  .......$......se
00177820: 6372 6574 2e74 7874 5554 0900 0307 d8b6  cret.txtUT......
00177830: 6a04 d8b6 6a75 780b 0001 04e8 0300 0004  j...jux.........
```

`PK\x03\x04`, version 20, method 8 (deflate), **flags `0x0002` — bit 0 clear, so
the entry is not encrypted**, CRC `0xfbe9bcae`, csize 3307 (`0x0ceb`), usize
9240 (`0x2418`), name `secret.txt`, then a `UT` (mtime) + `ux` (uid/gid) extra
field. No password prompt, no `zipcrypto`, no AES — `unzip -P ""` inflates it
straight away and the CRC-32 checks out.

## Step 6 — The manifest

`secret.txt` (9240 B) is an "EXFIL MANIFEST": a header plus **120** numbered
assets with **truncated** (16-byte, not 32-byte) SHA-256 digests, all of which
point at `designs/roadmap_part_*.pdf` and `designs/spec_part_*.docx` files that
do not exist on this volume — the live `roadmap.pdf` is a 51-byte stub whose
real hash is not in the list either. The manifest is a wall of noise designed to
be skimmed and dismissed.

It takes a filter to see the one line that is not an asset:

```console
$ awk 'NR>1 && !/^asset_[0-9]+ [^ ]+ sha256=[0-9a-f]{32}$/' secret.txt
recovery token: H7CTF{e211b7db9d4f5c9f0812}
```

And it is not even at the end of the file — it is line **62 of 122**, wedged
between `asset_60` and `asset_61`, at byte offset `0x122E`:

```
asset_60 designs/roadmap_part_60.pdf sha256=89d368c5151b4771b05cca1f76153cdc
recovery token: H7CTF{e211b7db9d4f5c9f0812}
asset_61 designs/spec_part_61.docx sha256=3eda6898d4f5da75141908e35bcd9506
```

Anyone who "read the manifest" and moved on missed it.

## Verdict

At 2026-09-26 01:52 local, `jdoe` used `sudo /usr/bin/zip` in `/home/jdoe` to
bundle designs, staged the result as `/home/jdoe/.cache/staging/q3_designs.zip`
(3477 B, inode 23, blocks 1502-1505) and then deleted it. `unlink` only did three
things: `i_links_count` to 0, `i_dtime` stamped, and the four data blocks
returned to the allocator. Everything else stayed put —

* the file's name inside the dirent that `..`'s `rec_len` swallowed,
* the whole inode: size, mode, and the extent tree pointing at blocks 1502-1505,
* and the entire archive, local header through EOCD, in blocks the filesystem now
  lists as free.

Deleting a file on ext4 is a bookkeeping operation, not an erasure one. The
staging directory being empty and `designs/` holding nothing but a 41-byte note
and a 51-byte fake PDF is exactly the shape of a cover story, and the recovery
token sat in the middle of a 120-line manifest where nobody would look twice.
