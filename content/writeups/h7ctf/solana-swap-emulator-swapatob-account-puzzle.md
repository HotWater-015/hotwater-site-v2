---
title: "Solana Swap Emulator: SwapAToB Account Puzzle"
description: "For H7CTF 2026 the AI-category target here is a toy Solana SPL swap program. A raw-socket harness drives a self-contained re-implementation of the program loader, and solving it is:…"
event: "h7ctf"
category: "ai"
categoryLabel: "AI"
tags: ["H7CTF 2026","ai"]
date: "2026-10-22"
teammate: false
source: "H7CTF/ai/writeup.md"
---

For H7CTF 2026 the AI-category target here is a toy Solana SPL swap program. A raw-socket harness drives a self-contained re-implementation of the program loader, and solving it is: submit one correct account list for the swap instruction, encoded exactly how a real Solana runtime would need it.

## Files

- `lib.rs` - the on-chain program. Borsh-defined `Pool` account plus an `InitPool`/`SwapAToB`/`SwapBToA` instruction enum.
- `solve.py` - the driver. Opens a socket, parses the banner into address/value names, submits accounts then a Borsh-encoded instruction.

## Analysis

The target program's `lib.rs` is a small AMM skeleton with no real pricing. The interesting piece is the direction check inside `swap`:

```rust
let (want_src, want_dst) = if a_to_b { (p.vault_a, p.vault_b) } else { (p.vault_b, p.vault_a) };
```

Because the pool explicitly names which vault is source and which is destination, the account submission has to map cleanly onto that check, otherwise it fails on direction. For `SwapAToB`, funds for the incoming leg flow from a user-held `user_a` account into `vault_a`; the outgoing leg pays out of `vault_b` into `user_b`; the checking must keep exactly this mapping so the pooled deposited tokens become the intended direction, i.e. not merely the converse, for both the input and the payout legs. The user wallet is the only signer-checked authority and holds both `user_a` and `user_b`.

The Borsh encoding is trivial: the instruction enum tags are `InitPool=0`, `SwapAToB=1`, `SwapBToA=2`, and `SwapAToB { amount }` is `bytes([1]) + struct.pack("<Q", amount)`.

## Exploit

`solve.py` parses per-key values from the banner text with a regex (`^name: value` in multiline mode) for pool, authority, user, mint_a, mint_b, vault_a, vault_b, user_a, user_b, token_program, then encodes the accounts:

```python
accounts = [f"r {pool}", f"r {authority}", f"s {user}", f"w {user_a}",
            f"w {user_b}", f"w {vault_a}", f"w {vault_b}",
            f"r {mint_a}", f"r {mint_b}", f"r {token_program}"]
```

The flags are `r` read-only, `s` signer, `w` writable - the standard Solana `AccountMeta` semantics. The swap instruction is then:

```python
instruction = bytes([1]) + struct.pack("<Q", 101010101)
```

The amount is arbitrary; `101010101` is a non-zero, un-suspicious filler amount, with high bits set so it does not look like a degenerate sell-all test.

## Flag

Flag: not recovered in the writeup. No flag string appears anywhere in `solve.py` or `lib.rs`.
