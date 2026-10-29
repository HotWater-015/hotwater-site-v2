---
title: "Cold Registry — frost-n04 Vault Release Code"
description: "The job was purged on 14 Jan, but the registry is copy-on-write. The four job/8149285a1114b9b0/... keys were tombstoned, while the old cursor leaf pages remained in freed pages. Each…"
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/7/writeup.md"
---

**Challenge:** COLD REGISTRY (`frost-n04`, bay 4)
**Category:** Forensics
**Artifact:** `frost-n04-cold.tar.gz`

**Flag:**

```
isfcr{fl_pvj9_fvu4_qqgn}
```

**Release code:** `FL-PVJ9-FVU4-QQGN`

---

## 1. Short version

The job was purged on 14 Jan, but the registry is copy-on-write. The four
`job/8149285a1114b9b0/...` keys were tombstoned, while the old cursor leaf pages
remained in freed pages. Each cursor page stores one segment's receipt byte.
For every segment I recovered the cursor page that was actually live immediately
before the next segment's transaction; this uniquely reconstructs the 48 receipts
used by the thaw release. Hashing those receipts with the vendor's formula gives the
release code above.

The job id is `8149285a1114b9b0`; the manifest says 48 segments of 64 KiB.

---

## 2. Artifacts

```
frost-n04-cold/
├── registry/registry.fvr              # 12 MiB registry volume, 3072 pages
├── usr/share/doc/fvregd/FROSTSYNC.txt # job layout + release formula
├── usr/share/doc/fvregd/ONDISK-NOTES.txt
├── usr/share/doc/fvregd/RELEASE-NOTES.txt
├── usr/share/doc/fvregd/include/fvr_format.h
└── var/log/
    ├── fvrctl-audit.log
    └── fvregd.log
```

Relevant log facts:

- 2026-01-03T01:49:47Z — job `8149285a1114b9b0` created: 48 segments to
  `sync-07.example.org:7443` (a peer not in `policy/sync/peer_allow`).
- 2026-01-12T12:57:30Z — segment 48/48 committed; 13:56:37Z job complete;
  13:56:38Z thaw release filed with escrow.
- 2026-01-14T03:11:11Z — `fvrctl purge --job 8149285a1114b9b0` removed 4 keys.
- 2026-01-14T06:38:45Z — compact rebuilt the free list.

The audit log's `--job` value and the log's `frostsync[...]` tag agree on the job id.

---

## 3. On-disk format: the notes are for v0, the image is v1

`ONDISK-NOTES.txt` describes format version 0, but the image's superblock begins
with `FVR\x01`. The image is therefore format version 1; the 12-byte cell
descriptors in the old notes do not apply.

For v1:

- page size = 4096; page count = 0x0c00 = 3072.
- page header is 24 bytes:
  `u64 pgid | u64 epoch | u16 kind | u16 cell_count | u32 body_crc32c`.
- data cell descriptor is 16 bytes:
  `u32 koff | u16 ksize | u16 vsize | u32 voff | u32 flags`.
- key/value offsets are relative to the **end** of the page:
  key = page_end - koff, value = page_end - voff.
- index entry is 16 bytes:
  `u32 koff | u16 ksize | u16 pad | u64 child`;
  the `u64` rightmost child follows the entries.

Superblock root slots hold the last eight committed epochs
(`slot = epoch mod 8`). The final slots cover epochs 1854–1861, long after the job,
but this is not needed for the receipt recovery.

Useful page kinds:

1 = index, 2 = data, 3 = free, 0 = never written.

Only 31 pages are marked kind 2 (data) and 8 kind 1 (index), while ~2073 pages are
kind 3 with stale contents. Those stale pages are the evidence.

A free page's body begins with `u64 next_free`, which overwrites the first 8 bytes of
the first data descriptor (or the first index entry). The remaining descriptors and
payloads are intact.

---

## 4. The job's four keys

The job leaf holds four keys:

```
job/8149285a1114b9b0/cursor
job/8149285a1114b9b0/manifest
job/8149285a1114b9b0/peer
job/8149285a1114b9b0/state
```

The values decode as:

```
manifest: 48 segments (0x30), 65536 bytes/chunk, created 2026-01-03T01:49:47Z
peer:     sync-07.example.org:7443
state:    running until the completion transaction, then complete
cursor:   u32 seq | u8 receipt | u8 reserved | u16 chunk_kib | 8-byte segid
```

The cursor value is exactly 16 bytes. `chunk_kib` is 64, `reserved` is 0, and the
segid matches the segment numbers in the log.

Example, segment 48:

```
30 00 00 00 88 00 40 00 15 fc dc 48 92 75 b3 01
seq=48       rcpt=0x88   reserved=0   chunk=64   segid=15fcdc489275b301
```

---

## 5. Recovering the cursor history

For every segment the log gives the sent segid, e.g.:

```
segment 1/48 8bcc90e8295051fc -> ...
segment 2/48 d3e295a3d90ef861 -> ...
...
```

Scanning the image for each 8-byte segid finds cursor values in stale cursor leaves.
A cursor record is accepted only if:

- the 8 bytes immediately before the segid are a plausible `seq` matching that
  segment number,
- `reserved == 0`,
- `chunk_kib == 64`.

This finds one or more cursor versions per segment. Extra versions are expected:

- peer-confirm timeout: the failed attempt wrote a cursor page, then the retry wrote
  another page at the **same epoch**;
- fvregd watchdog crash + job resume: the job re-sent the last committed segment,
  producing another cursor version on a different branch;
- the completion transaction rewrote the cursor leaf with the same segment 48
  receipt and `state=complete`.

The receipt is random per transfer, so it cannot be derived from the segid or blob.
Selection has to be done from registry structure, not from the receipt values.

---

## 6. Choosing the right cursor version per segment

This is the actual trap. The latest wall-clock log event is **not** always the
receipt the registry holds as the committed cursor state.

The registry is a copy-on-write B-tree. For segment `k`, the cursor page that the
registry "holds" for the next step is the one that is still part of the committed
tree immediately before segment `k+1`'s transaction. Equivalently, the correct page
for segment `k` is referenced by the index pages of epoch `E(k+1)-1` (the last
committed transaction before segment `k+1` commits). The page for segment 48 is the
one referenced immediately before the completion transaction.

Applying that rule to all 48 segments yields a **single** chain. It rejects:

- failed-attempt pages (rolled back; they do not survive into the next epoch);
- post-resume pages that are dead ends on a discarded branch.

In particular, the final committed chain uses:

- segment 4: `0xf2` (242), the post-resume commit that is actually live;
- segment 8: `0xe2` (226), the pre-crash version, not the discarded `0x7e`;
- segment 13: `0x6c` (108), not the discarded `0xf9`;
- segment 21: `0xe7` (231), not the discarded `0x69`;
- segment 24: `0x5d` (93), the post-resume commit;
- segment 38: `0xc6` (198), not the discarded `0x56`.

The same rule identifies the successful retry for every timeout-rolled-back segment
(5, 7, 11, 12, 15, 16, 20, 30, 32, 33, 35, 41, 45, 47).

An independent check is the backward root chain from the final committed root:
following the index page at each epoch with maximal child-set overlap and reading
the child covering `job/.../cursor` reproduces the same sequence.

---

## 7. The 48 receipts

Decimal and hex, in segment order:

| seg | rcpt | hex | seg | rcpt | hex | seg | rcpt | hex |
|---:|---:|:---:|---:|---:|:---:|---:|---:|:---:|
| 1 | 41 | 29 | 17 | 254 | fe | 33 | 46 | 2e |
| 2 | 27 | 1b | 18 | 187 | bb | 34 | 254 | fe |
| 3 | 1 | 01 | 19 | 40 | 28 | 35 | 228 | e4 |
| 4 | 242 | f2 | 20 | 120 | 78 | 36 | 145 | 91 |
| 5 | 79 | 4f | 21 | 231 | e7 | 37 | 151 | 97 |
| 6 | 17 | 11 | 22 | 239 | ef | 38 | 198 | c6 |
| 7 | 50 | 32 | 23 | 109 | 6d | 39 | 171 | ab |
| 8 | 226 | e2 | 24 | 93 | 5d | 40 | 127 | 7f |
| 9 | 119 | 77 | 25 | 55 | 37 | 41 | 174 | ae |
| 10 | 73 | 49 | 26 | 46 | 2e | 42 | 151 | 97 |
| 11 | 189 | bd | 27 | 108 | 6c | 43 | 175 | af |
| 12 | 140 | 8c | 28 | 186 | ba | 44 | 248 | f8 |
| 13 | 108 | 6c | 29 | 108 | 6c | 45 | 234 | ea |
| 14 | 7 | 07 | 30 | 191 | bf | 46 | 231 | e7 |
| 15 | 252 | fc | 31 | 197 | c5 | 47 | 62 | 3e |
| 16 | 178 | b2 | 32 | 164 | a4 | 48 | 136 | 88 |

As one byte string:

```
291b01f24f1132e27749bd8c6c07fcb2febb2878e7ef6d5d372e6cba6cbfc5a4
2efee49197c6ab7fae97aff8eae73e88
```

For reproducibility, the selected cursor pages/epochs are:

```
 1 pg=362  ep=951   rc=41      25 pg=2981 ep=1303 rc=55
 2 pg=1786 ep=966   rc=27      26 pg=777  ep=1323 rc=46
 3 pg=68   ep=980   rc=1       27 pg=2202 ep=1340 rc=108
 4 pg=1963 ep=999   rc=242     28 pg=494  ep=1359 rc=186
 5 pg=2521 ep=1014  rc=79      29 pg=1655 ep=1379 rc=108
 6 pg=2592 ep=1031  rc=17      30 pg=553  ep=1396 rc=191
 7 pg=1218 ep=1047  rc=50      31 pg=2758 ep=1411 rc=197
 8 pg=2886 ep=1063  rc=226     32 pg=2806 ep=1431 rc=164
 9 pg=63   ep=1064  rc=119     33 pg=310  ep=1446 rc=46
10 pg=2698 ep=1077  rc=73      34 pg=1507 ep=1466 rc=254
11 pg=1601 ep=1093  rc=189     35 pg=2387 ep=1486 rc=228
12 pg=2302 ep=1107  rc=140     36 pg=293  ep=1505 rc=145
13 pg=1661 ep=1121  rc=108     37 pg=1750 ep=1520 rc=151
14 pg=2219 ep=1122  rc=7       38 pg=550  ep=1537 rc=198
15 pg=2994 ep=1137  rc=252     39 pg=1469 ep=1538 rc=171
16 pg=2405 ep=1158  rc=178     40 pg=1765 ep=1557 rc=127
17 pg=2327 ep=1179  rc=254     41 pg=1014 ep=1578 rc=174
18 pg=1864 ep=1195  rc=187     42 pg=938  ep=1597 rc=151
19 pg=392  ep=1215  rc=40      43 pg=1408 ep=1612 rc=175
20 pg=963  ep=1237  rc=120     44 pg=2536 ep=1629 rc=248
21 pg=1658 ep=1249  rc=231     45 pg=2654 ep=1651 rc=234
22 pg=2476 ep=1250  rc=239     46 pg=675  ep=1673 rc=231
23 pg=2103 ep=1265  rc=109     47 pg=1100 ep=1690 rc=62
24 pg=144  ep=1283  rc=93      48 pg=2820 ep=1703 rc=136
```

---

## 8. Computing the release code

`FROSTSYNC.txt` defines:

```
R = SHA-256("frostsync-release-v1" || jobid (8 bytes) || rcpt_1 || ... || rcpt_n)
code = "FL-" + first 60 bits of R, big-endian, as twelve 5-bit digits
       over ABCDEFGHJKLMNPQRSTUVWXYZ23456789, in three groups of four
```

The job id bytes are in the order the hex digits appear in the keys:

```
jobid = 81 49 28 5a 11 14 b9 b0
```

Python:

```python
import hashlib

receipts = bytes.fromhex(
    "291b01f24f1132e27749bd8c6c07fcb2febb2878e7ef6d5d372e6cba6cbfc5a4"
    "2efee49197c6ab7fae97aff8eae73e88"
)
jobid = bytes.fromhex("8149285a1114b9b0")

h = hashlib.sha256(b"frostsync-release-v1" + jobid + receipts).digest()
v = int.from_bytes(h[:8], "big") >> 4          # first 60 bits
alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
digits = "".join(alphabet[(v >> (55 - 5 * i)) & 31] for i in range(12))
code = "FL-" + digits[0:4] + "-" + digits[4:8] + "-" + digits[8:12]
print(code)
```

Values from the image:

```
SHA-256: 6cd1f2ce5a738ccdbcb8c1fffc207de383d5dcaae144c6996a2b0a580476294a
60-bit:  0x6cd1f2ce5a738cc
digits:  PVJ9 FVU4 QQGN
code:    FL-PVJ9-FVU4-QQGN
```

The challenge accepts the release code lowercased, with `-` replaced by `_`:

```
isfcr{fl_pvj9_fvu4_qqgn}
```

---

## 9. Traps encountered

1. **Wrong format notes.** `ONDISK-NOTES.txt` describes v0's 12-byte cells.
   The image is v1 (`FVR\x01`); v1 uses 16-byte cells and page-end-relative
   offsets. Parsing with v0 gives garbage.
2. **Deleting keys does not delete pages.** The purge tombstoned the four job keys;
   the copy-on-write history remained in kind-3 pages. The compact only rebuilt the
   free list.
3. **First descriptor on a free page is damaged.** `next_free` overwrites the first
   8 bytes of the body. The first cursor/key descriptor's `koff`/`ksize`/`vsize`
   are lost; the payload and the remaining descriptors are still valid.
4. **Retries and resumes are not interchangeable.** A failed or discarded attempt
   wrote a real-looking cursor page. The release uses the cursor state that remained
   live in the committed tree, not simply the last line in the log. Segments
   8/13/21/38 are the clearest examples: their post-resume pages are dead ends.
5. **Receipts are raw bytes.** Do not hash their hex text or include separators;
   the formula concatenates `jobid (8 bytes)` and one byte per receipt.
