---
title: "Thaw Ladder"
description: "We are given a 7.2 bench kit for thawd, a controller that executes small programs called thaw plans in a made-up 16-bit instruction set, FROSTLANG. The live pod runs an undocumented 7.3…"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/thaw/writeup.md"
---

**Category:** pwn / custom VM / side channel  
**Target:** `nc 0.cloud.chals.io 13929`  
**Flag:** `isfcr{pod_seven_4bde_woke_4364d220_in_bay_c}`

---

## 1. Challenge

We are given a 7.2 bench kit for `thawd`, a controller that executes small programs
called *thaw plans* in a made-up 16-bit instruction set, FROSTLANG. The live pod runs
an **undocumented 7.3 field build**. Every TCP connection is a fresh session with fresh
per-session randomness. Limits are 16,384 plans and 3,600 seconds per session.

The relevant memory map is:

| Range | Purpose |
|---|---|
| `0x0000`–`0x7fff` | writable RAM |
| `0x8000`–`0x80ff` | read-only BOOT data |
| `0x8100`–`0x81ff` | mailbox used by attestation |
| `0x8200`–`0x82ff` | gated control block (`CONT` at `0x8200`) |
| `0x9000` and up | protected controller data / recorded profile window |

A completed exploit normally looks like:

```
SEAL passes -> gate opens -> write CONT -> HALT resumes privileged -> 4x ATT -> THAWED
```

`SEAL` is supposed to compare 32 bytes of the recorded-profile window against the
secret sealed profile `P`. `ATT` performs four rounds of a keyed fold using `P`; after
four accepted answers the controller returns the thaw key.

The problem is that `P` is not readable through the normal VM memory map.

---

## 2. The 7.3 differences

Three field-build quirks combine into the exploit.

### 2.1 Signed `SEAL` offset check

In 7.2, `SEAL a` rejects `r[a] > 32`. The 7.3 field build instead performs a signed
16-bit check equivalent to:

```c
if ((int16_t)offset > 32) fault("span");
```

Consequences:

```text
SEAL 0x21   -> FAULT   (33, correctly rejected)
SEAL 0x8000 -> SETTLED (0x8000 is -32768 as int16_t)
```

Thus every offset with the high bit set (`0x8000`–`0xffff`) slips through. The
subsequent address calculation still wraps modulo 16 bits, redirecting the 32-cell
comparison out of the protected controller area and into **ordinary writable RAM**.

We cannot directly read `P`, but we can now control the bytes that `SEAL` compares
against it.

### 2.2 The answer "meter" is a work side channel

The 7.2 reference returns the number of retired instructions. The 7.3 banner instead
shows a cumulative work meter:

```text
thawd 7.3 pod 07 session <16 hex> meter <n> ready
```

It is a quantized counter:

```
new_meter = old_meter + floor((residue + work) / q)
residue   = (residue + work) % q
```

where `q` is a hidden per-session quantum (roughly 40–64) and there is a fixed
per-plan overhead. `SEAL` compares cells in order and stops at the first mismatch.
Therefore one extra matching profile byte is one extra unit of hidden work.

By first calibrating `q` and the overhead with `HALT` and `NOP; HALT` plans, we can pad
a probe plan so the hidden residue is exactly `q-1`. Then a single extra matching byte
makes the visible meter increment by one.

### 2.3 The profile ladder is shuffled

Pointing `SEAL` into RAM does not give a contiguous comparison:

```
RAM[A+0] vs P[0]
RAM[A+1] vs P[1]
...
```

The 7.3 build walks a **shuffled 32-rung ladder**. Each rung has:

* an expected profile byte, and
* a source address in RAM.

The 32 source addresses are a permutation of one contiguous 32-byte block, but their
order is randomized per session. So for every rung we must recover both the byte and
its source address.

---

## 3. Recovering the profile

All probing must happen on one TCP connection: a new connection reshuffles the profile,
the ladder and the meter parameters.

### 3.1 Meter calibration

`work/meter_solve.py` sends batches of `HALT` and `NOP; HALT` plans and intersects the
possible `(q, work, initial residue)` models. The extra NOP removes aliased floor
models. After calibration it pads to place the residue at `q-1`.

In the winning session:

```text
meter q=63 halt_cost=8 overhead=7 residue=9
SEAL base charge=1
```

### 3.2 Recovering byte 0

For a candidate byte `g`, one probe plan:

1. fills all 32 KiB of RAM with `g`,
2. restores any already-known rungs,
3. executes `SEAL 0x8000`,
4. pads with NOPs to align the meter,
5. halts.

A wrong `g` stops at the first rung. The correct `g` compares one cell further and
produces one extra meter tick.

### 3.3 Recovering a rung's source address

Once the expected byte for rung `k` is known, binary-search RAM for its source address:

* fill a range with that byte,
* restore all earlier known rungs,
* run the aligned `SEAL` probe.

A hit means the rung's source lies inside the filled range. After each hit the hidden
residue may be uncertain because the comparison may have continued further, so the
residue is recovered before continuing. A final single-byte fill distinguishes the even
and odd address of the resulting word.

### 3.4 Batching the byte search

The public reference solver sends one candidate at a time. That is too slow for the
final connection lifetime, so `work/fast_ladder.py` sends all 256 candidates for a
rung in **one batch**.

All wrong candidates have identical cost. The first plan uses padding based on the
current residue; every later plan uses padding chosen so wrong plans end at residue
`q-1`. If candidate `g` is correct, its own answer is exactly one meter tick above the
all-wrong expectation, and that is the first deviation in the batch. This reduces the
byte search from 256 round trips to one batch per rung.

### 3.5 The last byte

For byte 31, a wrong byte and a correct byte both cause 32 cell comparisons, so the
timing/meter oracle has no difference. Instead use the gate itself:

1. fill RAM with the candidate,
2. restore the 31 known rungs,
3. execute `SEAL 0x8000`,
4. try to store a valid privileged `CONT` at `0x8200`,
5. `HALT` and execute one `ATT`.

If all 32 rungs match, the gate opens, the control store succeeds, and the privileged
`ATT` draws a challenge (`SETTLED`). Otherwise the control store faults. This gives a
1-bit gate oracle for the last byte and, afterwards, for the last rung's address.

### 3.6 Reordering the ladder

The recovered bytes are in *comparison* order. Pair each byte with its recovered source
address and sort by address to obtain the real profile used by the fold:

```python
pairs = sorted(zip(source_addresses, ladder_bytes))
fold_profile = bytes(value for address, value in pairs)
```

Recovered in the winning session:

```text
ladder order : f346b2d6aab557d881b9f46499802ebf7e8c84ddab8bd74a21d6da1ece3eaa2a
fold order   : f48b21b5812eda4a642aaa7ebfaad68cddb246b9f3d657849980abd7d81e3ece
source block : 0x1229 .. 0x1248 (shuffled)
```

The whole recovery used 11,282 plans, below the 16,384-plan session limit.

---

## 4. Final thaw plan

The final plan is a single execution:

1. Fill all RAM with the last ladder byte.
2. Restore the 31 known scattered rungs.
3. `SEAL 0x8000`; now all 32 rungs match and the gate opens.
4. Materialize the linear 16-word fold key table at `0x1000`
   (this must be done *after* `SEAL`, so it does not clobber the scattered source block).
5. Store the privileged continuation word in `CONT` at `0x8200`.
6. `HALT`, which resumes in privileged mode.
7. Run the documented 16-step fold for four `ATT` rounds.

The generated final program is 204 words; privileged code starts at word 105.

The fold is the manual's:

```text
for t = 0 .. 15:
    j = (t + (y >> 12)) & 15
    x = rotl16(x ^ K[j], y & 15)
    x = (x + N[t & 3]) & 0xffff
    y = (y * 0x9e35 + x + t) & 0xffff
    y = y ^ rotl16(x, 7)
```

Run:

```bash
cd work
python3 -u fast_ladder.py
```

Winning output tail:

```text
P[31]=2a PROFILE=f346b2d6aab557d881b9f46499802ebf7e8c84ddab8bd74a21d6da1ece3eaa2a plans=11282
SRC[31]=0x1232 FOLD_PROFILE=f48b21b5812eda4a642aaa7ebfaad68cddb246b9f3d657849980abd7d81e3ece
final words 204 priv 105
FINAL THAWED 9451909 isfcr{pod_seven_4bde_woke_4364d220_in_bay_c}
```

---

## 5. Flag

```
isfcr{pod_seven_4bde_woke_4364d220_in_bay_c}
```

---

## 6. Files

| File | Purpose |
|---|---|
| `work/fast_ladder.py` | batched driver used for the live solve |
| `work/solve.py` | FROSTLANG assembler, protocol client, final fold plan |
| `work/meter_solve.py` | meter calibration and probing primitives |
| `work/ladder_solve.py` | reference shuffled-ladder recovery |
| `work/solve.out` | full winning run log |

The 7.3 build is the same challenge that appeared in Cryovault 2026 Quals. The
technique here follows the public quals solution; the main addition is the batched
256-candidate byte search, which makes the exploit fast enough to complete reliably
against the shared finals controller.

---

## 7. Takeaways

* A signedness bug turned a bounds check into a pointer redirection: high-bit offsets
  wrapped `SEAL` into attacker-controlled RAM.
* A coarse work meter is still a side channel if you can calibrate its hidden residue
  and make one extra unit of work visible.
* The protected comparison did not walk memory linearly; it was a shuffled ladder, so
  both the expected bytes and their source addresses had to be recovered.
* Batching equal-cost probes removed most network round trips and made the whole
  recovery fit comfortably inside the session limits.
