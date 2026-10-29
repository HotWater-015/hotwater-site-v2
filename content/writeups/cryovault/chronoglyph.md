---
title: "Chronoglyph"
description: "We are given chronoglyph.zip, containing a single disk image:"
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/5/writeup.md"
---

## Challenge summary

We are given `chronoglyph.zip`, containing a single disk image:

```text
chronoglyph/evidence.img
```

The prompt says a reporter's workstation was imaged before it was returned, and that the story they were protecting is hidden somewhere on the image. We need to recover the text; the flag is in `isfcr{...}` format.

The image turned out to contain several layers:

1. An outer ext4 filesystem (`evidence`) with a research project documenting a timestamp-steganography tool called **Chronoglyph**.
2. A 200-byte Chronoglyph payload hidden in ext4 `i_crtime_extra` fields. It contained a LUKS2 passphrase and the location of a hidden encrypted container.
3. A LUKS2 container at offset 100 MiB containing a second ext4 filesystem (`notes`).
4. Deleted zlib-compressed Git objects in the inner filesystem's unallocated blocks. One of them held the real story and flag, surrounded by several fake flags.

---

## 1. Initial triage

```bash
unzip chronoglyph.zip
file chronoglyph/evidence.img
```

```text
Linux rev 1.0 ext2 filesystem data, UUID=7ac3e5f1-9d41-4a68-b2c7-5e0f12d3b4a9,
volume name "evidence" (extents) (64bit) (large files) (huge files)
```

The volume is 100 MiB (`102400` blocks of 1 KiB) inside a 160 MiB image. Because we could not mount it, `debugfs` was enough to inspect it:

```bash
dumpe2fs -h chronoglyph/evidence.img
debugfs -R 'ls -l /' chronoglyph/evidence.img
```

The root contains `/home/kesh`. The home directory is full of generated decoy documents, plus a suspicious project:

```text
/home/kesh/research/chronoglyph/
├── README.md
├── paper/draft-v1.md
├── pyproject.toml
├── src/chronoglyph/encode.py
└── tests/fixtures/old_demo.txt
```

`README.md` says the decoder exists but its constants were stripped, and that the paper is normative:

```text
* decoder: implemented, but the final key constants were stripped
  from this source tree before uploading. Reconstruct them from the
  paper draft before running the decoder.
```

`paper/draft-v1.md` describes **Chronoglyph v1**, an ext4 nanosecond-timestamp covert channel.

The bash history also confirms the tool was used and the key file was shredded:

```text
python3 -m chronoglyph encode --help
python3 -m chronoglyph scrub $HOME --dry-run
python3 -m chronoglyph scrub $HOME
fsfreeze -f /mnt/evidence || true
shred -u ~/.chronoglyph/keys.toml
history -c
```

---

## 2. The Chronoglyph v1 payload

### Encoding as specified by the paper

The paper defines a 200-byte payload spread over the `i_crtime_extra` field of **160 marked regular-file inodes**.

For every marked inode:

```text
i_crtime_extra = (nsec << 2)
nsec = (noise3 << 26) | (payload10 << 16) | tag16
```

where:

* `tag16` is an HMAC marker:
  `HMAC_SHA256(uuid_bytes, b"chronoglyph/v1/tag:" + inode_u32_le)[:2]`, interpreted little-endian.
* `payload10` is the next 10 payload bits.
* `noise3` is random.

The payload bitstream is read **MSB first**, and the 160 marked inodes are selected by a Fisher–Yates shuffle driven by a custom HMAC stream:

```text
K = HMAC_SHA256(uuid_bytes, b"\x00" + b"chronoglyph/v1/perm")
V = HMAC_SHA256(K,          b"\x01" + b"chronoglyph/v1/perm")
refill: V = HMAC_SHA256(K, V)
```

Candidates are all inodes `i >= 12` whose mode is regular file, sorted ascending. The first 160 entries of the shuffled candidate list are the marked inodes.

The payload layout is:

```text
[  0..  8]  magic "CGLYPHv1"
[  8.. 16]  le64 inner_offset
[ 16.. 24]  le64 inner_length
[ 24.. 88]  passphrase, ASCII NUL-padded
[ 88..168]  reserved / zero
[168..200]  HMAC_SHA256(uuid, body[0..168])
```

### Decoding

I parsed the ext4 superblock, group descriptors, and inode tables directly, then:

1. Built the sorted candidate list of regular-file inodes.
2. Checked the HMAC tag of every candidate's `crtime_extra`; exactly 160 matched.
3. Reproduced the HMAC-based Fisher–Yates permutation.
4. Read the 10 payload bits from each marked inode in permuted order.
5. Reassembled the 200-byte payload.

The tag check gave exactly 160 marked inodes, and the payload HMAC verified. Recovered fields:

```text
magic:         CGLYPHv1
inner_offset:  104857600   (100 MiB)
inner_length:  50331648    (48 MiB)
passphrase:    Z5JCHzgEXGvFPi53KeBhZrJH9TULvpN5dv39GRpfWcfZ3pMM
HMAC:          valid
```

The 100 MiB offset is exactly the end of the outer ext4 filesystem, so the hidden container lives in the partition slack after the visible filesystem.

---

## 3. The LUKS2 container

Extracting the declared range:

```bash
dd if=evidence.img of=inner.bin bs=1M skip=100 count=48 status=none
```

`file` identified it as LUKS2:

```text
LUKS encrypted file, ver 2, header size 16384,
UUID: 41b0d8f2-6c93-4f1a-9e22-c0317a5f8d64
```

`cryptsetup luksDump` showed:

```text
Data segments:
  0: crypt
     offset: 16777216 bytes
     cipher: aes-xts-plain64
     sector: 512 bytes

Keyslots:
  0: luks2
     Key:        512 bits
     Cipher:     aes-xts-plain64
     PBKDF:      argon2id
     Time cost:  4
     Memory:     65536
     Threads:    1
     AF stripes: 4000
     AF hash:    sha256
```

The Chronoglyph passphrase verified successfully:

```bash
printf '%s' 'Z5JCHzgEXGvFPi53KeBhZrJH9TULvpN5dv39GRpfWcfZ3pMM' > pass.txt
cryptsetup luksOpen --test-passphrase --key-file pass.txt inner.bin
```

Because we were working without root/device-mapper access, I used `cryptsetup luksDump --dump-master-key` to export the volume key, then decrypted the data segment in Python with AES-XTS:

* Data starts at `0x1000000` (16 MiB) inside `inner.bin`.
* Encrypted length is 32 MiB.
* Sector size is 512 bytes.
* Each sector's XTS tweak is the sector index as a 16-byte little-endian integer, starting at sector 0 of the mapped device.

The decrypted result was an ext4 filesystem:

```text
Linux rev 1.0 ext2 filesystem data,
UUID=41b0d8f2-6c93-4f1a-9e22-c0317a5f8d64,
volume name "notes"
```

---

## 4. Inside the inner ext4 volume

The inner filesystem is 32 MiB (`8192` blocks of 4 KiB) and contains:

```text
/
├── README.txt
├── lost+found/
├── mail/
│   └── 000.eml ... 013.eml
├── staging.log
└── chat/
    ├── .git/
    ├── .gitignore
    ├── notes.md
    └── sprint.md
```

`README.txt`:

```text
offline notes volume

mount read-only after acquisition.
```

The visible files are decoys:

* `mail/*.eml` contain 14 fake `isfcr{...}` values.
* `staging.log` contains 2000 lines of the form:

  ```text
  2026-01-22 candidate=isfcr{13b78b41fb25a26c2d31f4002f6}
  ```

  All 2000 are fake candidates.
* The `chat` Git repository contains four harmless commits and no unreachable objects.

So the real story was not in the visible file contents. The next place to look was unallocated space.

---

## 5. Carving deleted Git objects

The inner filesystem has 7550 free blocks. Parsing the block bitmap and scanning only the free blocks showed that almost all of them were zeroed, but a handful still contained data:

```text
nonzero free blocks: 10, 1066, 1067, 1074, 1075, 1080, 1081, 1082
```

* Block 10 was an old directory block.
* Blocks 1066–1067 contained the text `add notes` and a Git commit hash.
* Blocks 1074–1075 and 1080–1082 contained zlib streams.

The zlib streams were Git loose objects that had been deleted but whose data blocks were never reused or wiped. Decompressing each stream produced valid Git blob objects:

| Block | Git blob SHA-1 prefix | Content |
|-------|-----------------------|---------|
| 1074 | `2fadb46b...` | `team review doc` with a fake rotate-token flag |
| 1075 | `4fb7596c...` | `autogenerated placeholder` with a fake value |
| 1080 | `dfb0e804...` | `sed script test input` with a fake flag |
| 1081 | `25391a0c...` | `scratch note`, explicitly labels its flag fake |
| 1082 | `3220520d...` | The real story and flag |

The final blob (block 1082) decompresses to:

```text
blob 145\0ignore the previous notes.

the real token for this quarter is:
isfcr{n4no_t1me_h0ld5_what_th3_j0urnal_f0rg0t_a71c3}

rotate at the next window.
```

The earlier deleted objects are additional decoys. The last one explicitly says to ignore the previous notes and gives the real token.

---

## 6. Flag

```text
isfcr{n4no_t1me_h0ld5_what_th3_j0urnal_f0rg0t_a71c3}
```

---

## Appendix A — Chronoglyph payload decoder

The core decoder logic used:

```python
import hashlib, hmac, struct

img = open("evidence.img", "rb").read()

sb = img[1024:2048]
assert struct.unpack_from("<H", sb, 0x38)[0] == 0xEF53
bs = 1024 << struct.unpack_from("<I", sb, 0x18)[0]
blocks_count = struct.unpack_from("<I", sb, 0x04)[0]
first_data_block = struct.unpack_from("<I", sb, 0x14)[0]
blocks_per_group = struct.unpack_from("<I", sb, 0x20)[0]
inodes_count = struct.unpack_from("<I", sb, 0x00)[0]
inodes_per_group = struct.unpack_from("<I", sb, 0x28)[0]
inode_size = struct.unpack_from("<H", sb, 0x58)[0]
desc_size = struct.unpack_from("<H", sb, 0xFE)[0]
uuid = sb[0x68:0x78]
ngroups = (blocks_count - first_data_block + blocks_per_group - 1) // blocks_per_group

gdt = (first_data_block + 1) * bs
inode_tables = []
for g in range(ngroups):
    off = gdt + g * desc_size
    lo = struct.unpack_from("<I", img, off + 8)[0]
    hi = struct.unpack_from("<I", img, off + 40)[0]
    inode_tables.append(lo | (hi << 32))

def inode_raw(ino):
    g = (ino - 1) // inodes_per_group
    idx = (ino - 1) % inodes_per_group
    off = inode_tables[g] * bs + idx * inode_size
    return img[off:off + inode_size]

candidates = []
for ino in range(12, inodes_count + 1):
    mode = struct.unpack_from("<H", inode_raw(ino), 0)[0]
    if (mode & 0xF000) == 0x8000:
        candidates.append(ino)

# HMAC-based permutation stream
info = b"chronoglyph/v1/perm"
K = hmac.new(uuid, b"\x00" + info, hashlib.sha256).digest()
V = hmac.new(K, b"\x01" + info, hashlib.sha256).digest()
buf = b""

def refill():
    global V, buf
    V = hmac.new(K, V, hashlib.sha256).digest()
    buf += V

def take(n):
    global buf
    while len(buf) < n:
        refill()
    out, buf = buf[:n], buf[n:]
    return out

def rand_below(n):
    mask = (1 << n.bit_length()) - 1
    while True:
        x = int.from_bytes(take(8), "big") & mask
        if x < n:
            return x

perm = list(candidates)
for i in range(len(perm) - 1, 0, -1):
    j = rand_below(i + 1)
    perm[i], perm[j] = perm[j], perm[i]

bits = []
for ino in perm[:160]:
    extra = struct.unpack_from("<I", inode_raw(ino), 0x94)[0]
    nsec = extra >> 2
    payload10 = (nsec >> 16) & 0x3FF
    for k in range(9, -1, -1):
        bits.append((payload10 >> k) & 1)

payload = bytearray()
for i in range(0, 1600, 8):
    v = 0
    for bit in bits[i:i + 8]:
        v = (v << 1) | bit
    payload.append(v)
payload = bytes(payload)

print(payload[:8])                              # b'CGLYPHv1'
print(struct.unpack_from("<Q", payload, 8)[0])  # inner_offset
print(struct.unpack_from("<Q", payload, 16)[0]) # inner_length
print(payload[24:88].rstrip(b"\x00"))           # passphrase
assert hmac.new(uuid, payload[:168], hashlib.sha256).digest() == payload[168:200]
```

## Appendix B — Useful commands

```bash
# Inspect the outer filesystem without mounting
dumpe2fs -h evidence.img
debugfs -R 'ls -l /' evidence.img

# Extract the hidden LUKS2 container
dd if=evidence.img of=inner.bin bs=1M skip=100 count=48 status=none

# Inspect and test the LUKS2 passphrase
cryptsetup luksDump inner.bin
cryptsetup luksOpen --test-passphrase --key-file pass.txt inner.bin

# Inspect the decrypted inner filesystem
dumpe2fs -h decrypted.img
debugfs -R 'ls -l /' decrypted.img

# Carve and decompress a deleted zlib-compressed Git blob
python3 - <<'PY'
import zlib
img = open("decrypted.img", "rb").read()
print(zlib.decompress(img[1082*4096:1083*4096]))
PY
```
