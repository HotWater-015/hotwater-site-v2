---
title: "Deadbit Thermostat"
description: "The power cut left a later epoch-1 page in NAND, but its journal checksum is invalid. The last committed resource is epoch 0. Its archive needs two pieces of volatile evidence: a key…"
event: "cryovault"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CryoVault Finals 2026","iot"]
date: "2026-10-26"
teammate: false
source: "cryovault/iot/dead/writeup.md"
---

The recovered record is:

```text
isfcr{th3_r41l_h4s_m3m0ry_s0_d03s_th3_c0d3_35e90a7c}
```

The power cut left a later epoch-1 page in NAND, but its journal checksum is invalid. The last committed resource is epoch 0. Its archive needs two pieces of volatile evidence: a key seed reconstructed from cold SRAM and a 16-byte shutdown record decoded from the voltage trace.

## 1. Recover NAND pages

`service_extract.txt` gives the geometry: 1024 blocks, 64 rows per block, and 2048 data bytes plus 64 spare bytes per row. I kept physical row numbers, including erased rows. I rejected a block when spare byte 0 of either of its first two raw rows was not `ff`; that marker bypasses the controller's transforms.

ROM dispatch entry 2 reveals the column steering and byte randomizer. For physical row `r` and output byte `j`, the data source column is `(17*r + 109*j) & 2047`; spare columns retain their positions. The randomizer starts at `((r+1)*0x9e3779b9) ^ 0x6d2b79f5`, advances by xorshift32 for each byte, and XORs its low byte into the source. Spare byte 0 is copied without randomization. The implementation is in [recover.py](recover.py).

The ROM's ECC profile specifies BCH8 over GF(2^15), primitive polynomial `0x8003`, with 15 parity bytes. I decoded the 2048 data bytes followed by spare bytes 1–23, using spare bytes 24–38 as parity. I corrected errors *before* checking the `FTL2` spare header and the data CRC32. This yielded 2,595 valid pages; see [ecc.py](ecc.py).

## 2. Follow the commit journal and repair its stripes

The `JNL2` records form a predecessor chain through 16-bit epoch wraparound:

| Epoch | Physical row | Journal status | Image SHA-256 |
| --- | ---: | --- | --- |
| `ffff` | 22805 | Valid root | `e36363071fcb9f16dd877668b75c208ca4ad48a8715894554689948c6e544014` |
| `0000` | 42707 | Valid; predecessor is the `ffff` journal hash | `1c8af1d108101fdc29a5ba5302714996e55573460aba11d152a3053ad2fe4d77` |
| `0001` | 39847 | Programmed, journal CRC fails | `ce5412771c6aa7ae22b520feef78cbd9acf671ae725560f36b4a628f7b521501` |

For epoch 0, type-2 `CMT3` pages contain 114 SHA-256 commitments, one for each eight-sector stripe. Their concatenated hash is `9ac0abe09d17c7406a51d6eac83dd05e1c42dad4798e1d3b05b94afe52889c58`, exactly the catalog hash in the epoch-0 journal. I grouped only epoch-0 sectors by stripe and slot. ROM entry 5 defines parity `P` as the XOR of the eight data sectors and `Q` as their weighted sum in GF(256), using polynomial `0x11d` and weights 1 through 8. These equations restore up to two missing data sectors. When a logical slot had competing pages, the stripe commitment selected the correct combination. [stripes.py](stripes.py) recovered all 114 stripes. Trimming the final stripe to the journal's 1,857,536 bytes produced the epoch-0 image hash shown above.

## 3. Decode the inner resource volume

The first recovered 2048-byte sector is an `RSC3` descriptor; the remaining sectors are input to the controller transfer engine. ROM entry 10 evaluates its bytecode and transforms each sector. The transfer context starts at sector number 0 after the descriptor and uses the CRC32 of the preceding encoded sector, beginning with the descriptor's CRC32 (`acfb015e`). Replaying the ROM routine in [transfer.py](transfer.py) produced a SquashFS image beginning with `hsqs`. Its SHA-256 is `f0ad154afc4d0e5c4f40527553d6282684217bc91511df978627cdd49a066ce6`, matching the descriptor. The relevant files are `factory/retention.tbl`, `factory/enrollment.hlp`, `cfg/security.json`, and `archive/telemetry.dbv`.

## 4. Reconstruct the SRAM key seed

`security.json` specifies eight enrollment blocks. Each has 80 message bytes and 38 stored BCH parity bytes; 295 parity bits are active. ROM entry 3 maps logical PUF slots to physical SRAM cells using the printed serial `1c440c37`. I read physical cell 0 as the most significant bit of SRAM byte 0, and included the parity storage bytes when advancing between logical blocks.

The 1,048,576 factory table entries are transition voltages in physical cell order. A fit to the clean portion of `vcc_decay.csv` gave a bulk rail of approximately `3.76149*exp(-t/0.229472) + 0.00253` volts. For physical cell `c`, I sampled it at `0.195 + floor(c/256)*5e-6` seconds. The absolute distance between that bulk voltage and the cell's factory threshold ranked the uncertain bits. After XORing SRAM with the helper, direct BCH decoding failed. Flipping small combinations of the least reliable *active* bits and then using BCH(30, polynomial `0x409`) recovered each block; [puf.py](puf.py) contains the search. The SHA-256 of `b"TC440/PUF/v2\0"` followed by the eight recovered messages is:

```text
ec7f31a4be923a22bb543001ff375a5d94f126778ff9b603087e48bcf51dddf7
```

This seed is an input to the archive KDF.

## 5. Decode the shutdown waveform

ROM entry 8 emits the 64-bit training word at ROM offset `0x648`, followed by 166 input bits encoded as two symbols each. The first 160 input bits contain the 16-byte payload and its CRC32; the last six are zero tail bits. The encoder's generator masks are `0x79` and `0x5b`.

I removed the smooth bulk rail from `vcc_decay.csv`, found symbol boundaries near the 2.5 kHz RC clock, and tracked its changes in rate. Short ADC disturbances created misleading edges near 85.788, 136.974, 163.815, and 184.333 ms; excluding them and interpolating across genuine missing edges aligned the training and data symbols. Least squares on the known training word estimated the three signed channel gains as approximately `(+0.00403, +0.00801, -0.00411)` volts, with a `-0.00201` volt offset. A Viterbi search carried both the convolutional encoder state and the two previous channel symbols across the training/data boundary. [shutdown.py](shutdown.py) implements the decoder.

The recovered payload and appended checksum were:

```text
payload: 43b46323ab6bcb883ff7fe91851483e1
CRC32:   7a81db02
```

CRC32 of the payload is `0x02db817a`, matching the stored little-endian bytes, and all six tail bits decoded to zero. The payload is the HKDF salt; the archive's AES-GCM nonce is stored separately in `telemetry.dbv`.

## 6. Authenticate and decrypt the record

The security descriptor calls for HKDF-SHA256 with the SRAM seed as input key material, the shutdown payload as its 16-byte salt, info `tc440/archival-v2`, and a 32-byte output. I parsed `telemetry.dbv` as `DBV2 || nonce[12] || ciphertext || tag[16]`, with AAD `TC440C|1c440c37|epoch=0000`. AES-256-GCM tag verification succeeded and yielded the flag at the top of this write-up. The same plaintext is saved in [last_record.txt](last_record.txt).
