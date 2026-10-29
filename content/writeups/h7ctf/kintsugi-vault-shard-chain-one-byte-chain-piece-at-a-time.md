---
title: "Kintsugi Vault — Shard Chain, One Byte Chain Piece at a Time"
description: "This H7CTF 2026 reverse challenge hands you a static, stripped Linux binary (vmrun, a \"shard runtime\") and eight-ish .shard files (\"guardian agents\") whose names are SHA-looking content…"
event: "h7ctf"
category: "rev"
categoryLabel: "Reverse"
tags: ["H7CTF 2026","rev"]
date: "2026-10-22"
teammate: false
source: "H7CTF/rev/hard/writeup.md"
---

This H7CTF 2026 reverse challenge hands you a static, stripped Linux binary (`vmrun`, a "shard runtime") and eight-ish `.shard` files ("guardian agents") whose names are SHA-looking content ids. The chain start is `f6f11ad133cab21c96e0185e3411ddc4`. Shards accept an 8-byte hex key via `vmrun <shard> <key> [decode-table-file]`, and the chain piece for *non-start* shards needs a decode **table** from elsewhere — its decode table is not shipped in the clear. The vault re-attests via a single-use Ed25519 nonce/signature endpoint once the 32-byte custody seed is rebuilt.

## The catch: unshipped decode tables

Every shard pair is a Z3-izable register machine, but non-start shards ship their dispatch table in an opaque location; `pairsolve.py` therefore solves *pairs* of shards: the program bytes come from one shard and the decode table from another, and the solver cross-tries every `(tp, ep)` combination until a satisfiable model check passes. The relevant slicing in `pairsolve.py` is at fixed byte offsets inside each shard file:

```python
t  = eb[0x32:0x132]   # decode table of the "ep" (endpoint) shard
sb = tb[0x132:0x232]  # lookup table used by the "tp" shard's program
c  = tb[0x232:0x4bb]  # program (bytecode) of the "tp" shard
```

The interpreter's opcodes come from the loader loop, dispatched via an indirection array (`A` in the Z3 encoding) rather than a seq of hard-coded cases.

## The bytecode model

Registers are `r[0..7]`; inputs are `x[0..7]` (constrained to `[0, 255]`). Opcodes interleave 32-bit register ops with a generic byte-boundary `Select(A, ...)` LUT that Z3 represents symbolically:

```python
elif o == 6:  r[c[i+1]&7] *= r[c[i+2]&7]; i += 3
elif o == 9:  r[c[i+1]&7] = RotateLeft(r[c[i+1]&7], c[i+2]&31); i += 3
elif o == 10: r[c[i+1]&7] = Select(A, r[c[i+2]&7]); i += 3
elif o == 11: s.add(r[c[i+1]&7] == int.from_bytes(c[i+2:i+6], 'little')); i += 6
```

The whole solver run is bounded by `if i != 0x288: return None` — the program must run to exactly `0x288` bytes, no early `op 0` exit. Solve, and you reconstruct an 8-byte key:

```python
m = s.model(); return bytes(m.eval(v).as_long() for v in x).hex()
```

Feeding this back into `vmrun` unlocks the shard's chunk and names the next shard chain piece; looping this reassembles the chain key by key.

## Getting to flag

Once every 8-byte piece is recovered in chain order, concatenating them gives the 32-byte custody seed. The live `GET /attest` returns a nonce; `POST /attest` expects `nonce` and `sig` hex, verified under the vault's `pubkey.bin` public key (each nonce is single use, so one good signature is all you need).

## What made it fun

The chain-of-shards structure is aggravating on purpose: without the runtime's dispatch-table shuffling, you cannot even *order* the shard files, and the shard that *should* run first is the one with the in-clear decode table — ordering discovery is a Z3 fixed point, not a runtime trace.

## Flag

Flag: not recovered in the writeup. `pairsolve.py` prints shard-id-to-key mappings but the `pairsolve.py`/README artifacts here contain no flag literal and no attestation transcript.
