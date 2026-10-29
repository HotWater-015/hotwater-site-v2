---
title: "Journal-necromancy"
description: "Given: a single 64 MiB NTFS raw image, evidence.img."
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/journal-necromancy-writeup.md"
---

**Category:** Forensics (NTFS)
**Flag:** `isfcr{mft_slack_dies_but_data_clusters_remember_1a2f}`

## Challenge

> An engineer wiped their tracks before a seized workstation was handed back, but a small partition got imaged first. On that image is an encrypted archive we think holds what they took, and the key that opens it was deliberately destroyed before the machine was seized.

Given: a single 64 MiB NTFS raw image, `evidence.img`.

## TL;DR

The vault key is split into three XOR shares. Each share was hidden as a small tagged record (`de ad 53 47 | idx | share | parity`) in the slack at the tail of decoy data blocks. Searching the raw image for that marker finds all three. XOR the shares to get the AES-256-GCM key, then decrypt `secure_archive.enc`.

## 1. Orientation

`file` identifies an NTFS volume (4 KiB clusters, 1 KiB MFT records, `$MFT` at cluster 4). I walked it with `pytsk3`, including deleted entries. Relevant tree:

```
/Personal/vault/secure_archive.enc   85 bytes
/Personal/reminders.txt              351 bytes
/Cache/_c                            (deleted dir, ~130 deleted 80-byte resident files)
/Documents, /Downloads, /Photos, /Projects   (filler)
```

`reminders.txt` is the key hint:

```
- vault (aes-256-gcm). three-way xor key. do NOT lose a carrier.
  vault layout: 4-byte marker, 12-byte nonce, then ciphertext,
  16-byte tag at the end.
  each carrier holds a 32-byte share plus a 1-byte index and a
  1-byte xor-parity. shares self-identify by index (1/2/3).
```

The vault itself (`ENC1` marker + 12-byte nonce + ciphertext + 16-byte tag) matches that layout, so the task reduces to recovering three "carriers".

## 2. Dead ends

- **`$LogFile`** (2 MiB at `0x2000000`) is entirely `0xFF`. It was reset, so no journal replay is possible.
- **`/Cache/_c`**: MFT records 89–219 are deleted 80-byte resident files that look like random noise. They are chaff. (One of them, record 94, even starts with a byte pattern that passes a naive parity check by coincidence.)
- **First scan was wrong.** I assumed the carrier layout was `share(32) | idx(1) | parity(1)` and scanned for windows with idx ∈ {1,2,3} and a matching XOR parity. That produced only coincidental hits (including one in the MFT chaff) and never an index-2 carrier, which was the clue that the layout assumption was wrong.

## 3. Finding the carriers

A coarse map of non-zero 4 KiB blocks showed that almost the whole image is zero. The only data outside the MFT, index buffers and mirror is a handful of decoy blocks: log-style text at `0x28b4000`, CSV and markdown text, and some blocks of random bytes.

The log-text block at `0x28b4000` ends with a line that is not a log line, starting with `de ad 53 47`. Searching the entire image for that 4-byte marker gives exactly three hits:

| Offset      | Index byte | Location                              |
|-------------|-----------:|----------------------------------------|
| `0x28b4a5d` | `01`       | tail of the log-text block             |
| `0x2f65960` | `02`       | tail of a random-data block            |
| `0x36187ce` | `03`       | tail of a text block                   |

The record layout is:

```
de ad 53 47 | idx (1) | share (32) | parity (1)
```

Parity is the XOR of the index byte and the 32 share bytes, which checks out for all three:

```
0x28b4a5d  idx 1  share 6d71c9d7ead70c055cfa2927a3d3c6a5fb0a7c341b18a986d0196d588b4c9409  parity 0xbf
0x2f65960  idx 2  share e1785bae1e7ae88432441b37d3c3d9e3465f003e540d929367cf1f37cc742540  parity 0x34
0x36187ce  idx 3  share ef39842f2220d28e4a6c38c14e8442048ce9522b0794333c1b54fb3bde564383  parity 0x34
```

These sit in space that no live or deleted MFT entry owns; they are leftovers in data clusters, which is what the flag text alludes to.

## 4. Key and decryption

```
key = share1 ^ share2 ^ share3
    = 63301656d68d360f24d20ad13e945d4231bc2e2148810829ac828954996ef2ca
```

Vault layout: `ENC1` (4) | nonce (12) | ciphertext | tag (16). AES-256-GCM with no AAD decrypts and authenticates successfully, giving the flag:

```
isfcr{mft_slack_dies_but_data_clusters_remember_1a2f}
```

## 5. Solver

```python
import pytsk3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

d = open("evidence.img", "rb").read()

# 1. collect carriers: de ad 53 47 | idx | share(32) | parity
shares, pos = {}, 0
while (pos := d.find(b"\xde\xadSG", pos)) != -1:
    idx, share, parity = d[pos+4], d[pos+5:pos+37], d[pos+37]
    x = idx
    for b in share:
        x ^= b
    assert x == parity, hex(pos)
    shares[idx] = share
    pos += 4

# 2. XOR the three shares
key = bytes(a ^ b ^ c for a, b, c in zip(shares[1], shares[2], shares[3]))

# 3. read the vault via TSK and decrypt
fs = pytsk3.FS_Info(pytsk3.Img_Info("evidence.img"))
f = fs.open("/Personal/vault/secure_archive.enc")
v = f.read_random(0, f.info.meta.size)
assert v[:4] == b"ENC1"
nonce, ct, tag = v[4:16], v[16:-16], v[-16:]
print(AESGCM(key).decrypt(nonce, ct + tag, None).decode())
```
