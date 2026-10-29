---
title: "Deleting a Thing"
description: "Nothing incriminating — the suspect's story holds. But notice the rowid gap: _id 4 is missing while 1,2,3,5,6,7 are present. Message 4 was deleted, not never-existed."
event: "h7ctf"
category: "forensics"
categoryLabel: "Forensics"
tags: ["H7CTF 2026","forensics"]
date: "2026-09-26"
teammate: false
source: "H7CTF/forensic/1/writeup.md"
---

## Flag

```
H7CTF{7adf9695fb655c752810}
```

## Evidence

| File | Size | Notes |
|------|------|-------|
| `evidence.zip` | 863 B | archive holding the two files below |
| `messages.db` | 12288 B | SQLite 3.x, table `messages` |
| `secure.xml` | 255 B | app config: obfuscation key + body encoding |

`messages.db` schema:

```sql
CREATE TABLE messages(_id INTEGER PRIMARY KEY, thread TEXT, sender TEXT, ts INTEGER, body TEXT);
```

## Step 1 — Read the live table

```console
$ sqlite3 messages.db "SELECT * FROM messages;"
1  general  alice   1710001000000  lunch at 1?
2  general  bob     1710001100000  sure, the usual spot
3  general  alice   1710001200000  cool, see you
5  ops      mallory 1710002050000  burn this after you read it
6  general  bob     1710002100000  anyone seen the build?
7  general  carol   1710002200000  ci is green now
```

Nothing incriminating — the suspect's story holds. But notice the **rowid gap: `_id` 4 is missing** while 1,2,3,5,6,7 are present. Message 4 was deleted, not never-existed.

`PRAGMA freelist_count` returns 0, so nothing sits on the freelist — the content is still in the leaf page itself.

## Step 2 — Find the ghost in the page

```console
$ strings -a messages.db | grep -E '[0-9a-f]{40,}'
26073560251303150a564f025a5d521658054357545d064c5f000b
```

A 54-character hex blob in page 3 that no live row references. The leaf page 3 (`0x2000`) still holds it inside its unallocated gap, wedged between the cell for rowid 5 and the cell for rowid 3:

```console
$ xxd -s 0x2F3B -l 80 messages.db
00002f3b: 0000 4e13 1b05 796f 7073 6d61 6c6c 6f72 7901  ..N...yopsmallory.
00002f4b: 8e24 0fd0 8032 3630 3733 3536 3032 3531 332e  .$..2607356025133.
00002f5b: 3031 3530 6135 3634 6630 3235 6135 6435 3231  0150a564f025a5d52
00002f6b: 3136 3538 3035 3433 3537 3534 3564 064c 5f00 0b...1658054357545d..
00002f7b: 2503 0600 1b17 0527 6765 6e65 7261 6c61 6c69  %.....generalalli
00002f8b: 6365 018e 2403 9b80 636f 6f6c 2c20 7365 6520 79  c.$....cool, see y
```

Hand-parsing it as a SQLite table-leaf cell (layout `[payload size][rowid][record header][data]`):

| Offset | Bytes | Meaning |
|--------|-------|---------|
| `0x2F3D` | `4e` | payload size = 78 |
| `0x2F3E` | `13 1b 05 79` | surviving serial types (rowid + 2 header bytes were clobbered) |
| `0x2F42` | `6f 70 73` | thread = `ops` |
| `0x2F45` | `6d 61 6c 6c 6f 72 79` | sender = `mallory` |
| `0x2F4C` | `01 8e 24 0f d0 80` | ts = 1710002000000 (5 s *before* mallory's "burn this after you read it") |
| `0x2F52` | `32 36 30 37 … 30 62` (54 B) | body — the hex blob |

Serial types decode consistently: `0x13` → 3-byte text (`ops`), `0x1b` → 7-byte text (`mallory`), `0x05` → 6-byte integer (ts), `0x79` → 54-byte text (the body). The rowid is the one field that was overwritten, but the `_id` gap in the live table places it at **row 4**, thread `ops`, from `mallory`.

## Step 3 — Deobfuscate

`secure.xml` gives the scheme:

```xml
<string name="obfuscation_key">n0v4ch4t</string>
<string name="stored_body_encoding">hex(xor(body, obfuscation_key))</string>
```

So the body is `hex(XOR(plaintext, "n0v4ch4t"))` with a repeating 8-byte key — reverse it: `unhex` then XOR with the same repeating key.

```python
key  = b'n0v4ch4t'
blob = '26073560251303150a564f025a5d521658054357545d064c5f000b'
print(bytes(b ^ key[i % len(key)] for i, b in enumerate(bytes.fromhex(blob))).decode())
```

```console
H7CTF{7adf9695fb655c752810}
```

## Verdict

Mallory sent the message in the `ops` thread at `1710002000000`, then "burn this after you read it" (`_id` 5) and deleted `_id` 4. The `DELETE` only unhooked the row from the b-tree — the plaintext(ish) record, sender, thread and timestamp stayed verbatim in the unallocated space of leaf page 3, with the flag XOR-masked under a key that shipped in the same extraction. The claim of "nothing ugly" dies at the `_id` gap.
