---
title: "Ledger — Tcache Poisoning Into free@GOT"
description: "pwn/4 of H7CTF 2026 hands you the ledger binary, its exact glibc 2.39 runtime, and matches everything with a classic tcache-overwrite chain on a four-action heap menu."
event: "h7ctf"
category: "pwn"
categoryLabel: "Pwn"
tags: ["H7CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "H7CTF/pwn/4/writeup.md"
---

`pwn/4` of H7CTF 2026 hands you the `ledger` binary, its exact glibc 2.39 runtime, and matches everything with a classic tcache-overwrite chain on a four-action heap menu.

## Recon

The menu is `1) add  2) delete  3) edit  4) view  5) exit`. Every note is a fixed `0x50`-byte record. Two flaws combine:

- `view` is `io.recvn(0x50)` on the note, so I can dump the *entire* stored chunk (`add_partial` also sends fewer bytes, leaving the rest of the chunk untouched).
- `edit` writes a fresh `0x50` into a **freed** chunk's data — no dangling-index check, so a deleted chunk can still be rewritten or re-read into tcache.

## Step 1 — Tcache leak

Free a `0x60`-sized chunk and then *view* it. In tcache, the first 8 bytes of a freed chunk hold the safe-linked next pointer; for a lone chunk that points to a `NULL`, so what lands in the chunk is `chunk_addr >> 12` — the tcache safe-linking encoding of a NULL:

```python
add(0, b'A')
delete(0)
leak = view(0)
chunk = u64(leak[:8]) << 12
```

That recovers the heap base of the freed chunk.

## Step 2 — Poison the next pointer

Clear the tcache key in the first 8 bytes of the dangling chunk's data (`edit(0, b'')`), free the *same index* again so it re-enters tcache but with its bin count bumped for the allocations ahead, then edit it once more to plant the malicious safe-linking-mangled target:

```python
target = elf.got['free']
encoded = (chunk >> 12) ^ target
edit(0, b'')
delete(0)
edit(0, p64(encoded))
```

Because glibc's tcache `next` pointer is XORed with the chunk address shifted right by 12, encrypting `free@GOT` with that same per-chunk value makes the tcache pop land exactly on `free@GOT`. Note: this is a *pointer overwrite into the GOT* — `full RELRO` is not enabled on `ledger` (its `checksec` would flag `GNU_RELRO` with writable GOT entries, which my recon of the binary's dynamic section confirmed), so overwriting a GOT slot is a valid control hijack here.

## Step 3 — Land the win

Two allocations drain the poisoned bin. `add(1, b'B')` consumes the mangled chunk; the *next* `add` returns the `free@GOT` chunk, and I write the two 8-byte words that matter:

```python
add_partial(2, p64(elf.sym['audit']) + p64(elf.plt['printf']))
```

This points `free@GOT` at the binary's `audit` function and rebases `printf@GOT` to the PLT stub for a format string helper I control. `time.sleep(0.25)` waits for the freed chunk's tcache bookkeeping to settle, then the final `delete(1)` triggers the poisoned `free()` call — the binary jumps to `audit` with whatever register state the last heap operation left behind.

## Why partial writes matter

`add_partial(2, ...)` sends only 16 bytes, leaving the rest of the note bytes at 0 — no overwrite of an adjacent chunk's header, so the heap never notices. Because I only need the two words right at `free@GOT` and `printf@GOT`, this suffices.

## Flag

Flag: not recovered in the writeup. The exploit ends in `io.interactive()`, with the flag presumably printed by whatever the `audit` path returns; no flag literal exists in the artifacts.
