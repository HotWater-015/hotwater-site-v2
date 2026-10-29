---
title: "PerpGuard — Solana Compute-Unit Exhaustion via a Player CPI Program"
description: "For H7CTF 2026 this Solana challenge (\"perp_guard\", target program perp_guard_solve) is about draining a transaction's compute budget through a crafted cross-program invocation, on a…"
event: "h7ctf"
category: "pwn"
categoryLabel: "Pwn"
tags: ["H7CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "H7CTF/test4/solve/writeup.md"
---

For H7CTF 2026 this Solana challenge ("perp_guard", target program `perp_guard_solve`) is about *draining a transaction's compute budget* through a crafted cross-program invocation, on a harness that lets you replay your own compiled BPF program side by side with the real target. The target binary I compiled is `target/deploy/perp_guard_solve.so` at the deployed pubkey `GvUAk6t9VipHHXtR28TjUGLNuL3yVHj1WjgW9aMQRGm7`.

## The harness protocol

`solve.py` speaks a line-based socket protocol:

1. Upload your program: reply to `program pubkey:` with the pubkey, then to `program len:` with the byte length, then the bytes of the `.so`.
2. The harness prints a banner with the real `program:`, `user:`, `market:`, `obligation:` pubkeys.
3. It then asks `num accounts:` — and this repeats *per instruction round*, with a total of 256 rounds streamed in one batch (`for round_number in range(1, 257)`).

Each round's instruction is submitted as `4\n` followed by one account per line, flagged `r`/`w`/`s` just like the Solana `AccountMeta` model:

```python
f"4\nr {target}\nw {market}\nw {obligation}s {user}\n".replace("}\ns", "}\ns")
```

then `len`-prefixed instruction data.

## The player program

`src/lib.rs` runs as `process_instruction`. Its shape: if the first input byte is `0`, exit immediately (the cheap no-op). Otherwise it treats input as `u32 LE count` (defaulting to 20,000 when absent), reads the market's price at data offset `[32..40]` as `u64 LE`, and computes a debt ratio:

```rust
let collateral = 1_000_000u64;
let debt = ((collateral as u128 * price as u128 / 1_000_000) * 80 / 100) as u64;
```

Then it CPI's the *real* target program with a Borsh `OpenMany` (variant 5) instruction, `[count, debt]` (`#[derive(BorshSerialize)]`-style enum), passing market/obligation writable and the user signer:

```rust
data.push(5);
data.extend_from_slice(&collateral.to_le_bytes());
data.extend_from_slice(&debt.to_le_bytes());
data.extend_from_slice(&count.to_le_bytes());
```

The `count` governs how many obligation records `OpenMany` writes.

## The round structure

Of the 256 rounds, the first `EXPLOIT_ROUNDS = 20` are heavy: `BATCH_SIZE = 999` per-transaction obligation opens each, so 20 rounds at 999 ops each. Rounds 21..256 are deliberately cheap padding:

```python
requests.extend(b"0\n")
# Deliberately duplicate the cheap padding transaction after its first use.
payload = b"\0"
```

— the `input.first() == Some(&0)` early-return in the player program turns each of these into a near-free round while still occupying a transaction slot, which is what keeps the overall transaction valid; at 999 * 20 heavy rounds the compute-unit budget gets ground down by the per-record OpenMany work plus the CPI dispatch overhead.

## What this achieves

By exhausting the compute budget inside the transaction, the target's per-instruction guardrails that normally validate debt/obligation invariants get skipped or short-circuited for the remaining rounds — which is the whole point: measure the actual per-open cost, then open enough obligations in one shot that the runtime's cu limit is what fails, not the program's own checks.

## Flag

Flag: not recovered in the writeup. The artifact scripts (`solve.py`, `src/lib.rs`) contain no flag literal, and I did not capture a harness success transcript here.
