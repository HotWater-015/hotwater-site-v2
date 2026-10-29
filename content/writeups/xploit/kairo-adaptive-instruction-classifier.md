---
title: "Kairo — Adaptive Instruction Classifier"
description: "A pwn challenge around kairothd, an \"adaptive instruction classification engine\": it learns how your program behaves, decides it is trustworthy, and stops double-checking. The binary…"
event: "xploit"
category: "pwn"
categoryLabel: "Pwn"
tags: ["XploitX 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-4/pwn/writeup.md"
---

A pwn challenge around `kairothd`, an "adaptive instruction classification engine": it learns how your program behaves, decides it is trustworthy, and stops double-checking. The binary ships with a small VM-like protocol (load program, query, execute, leak, send) and a stack overflow in the "send" command.

## Files

- `kairothd` — target binary
- `readme.md` — brief (`nc xploitxctf.quest 9023`)
- `solve.py`

## Analysis

The protocol is fixed-width: each command is `u32 op, u32 arg, u16 len` followed by `len` bytes of data, and every reply is 12 bytes. The solve script walks the binary's command surface:

```python
def cmd(s, op, arg=0, data=b""):
    s.sendall(p32(op) + p32(arg) + p16(len(data)) + data)
    return recv12(s)
```

Sequence:

1. `op=1` — load a tiny program (`\x03\x03\x03\x04`); reply acknowledges.
2. `op=2..5` — build the trusted instruction classification state, same as a legitimate client.
3. `op=6` — leak. Bytes `[4:12]` of the reply contain a code pointer; subtracting the known offset `0x1292` yields the PIE base.
4. `op=7` — the vulnerable send path. A 72-byte buffer followed by a stack canary? No — the layout is `72` bytes to the saved return address, then a two-stage ROP chain:
   ```python
   payload = b"A"*72 + p64(base + 0x101a) + p64(base + 0x1257)
   ```
   The first gadget lands in the binary's own code (a `pop rdi; ret`-style setup or stack pivot), the second is the win/flag-reading function at offset `0x1257`.

The leak makes PIE irrelevant; the classifier only gates *which* instructions are trusted, not whether the buffer is bounds-checked, so the overflow still lands.

## Taking the flag

After sending the payload the server streams its output until EOF; the script reads it into a buffer and prints it — the flag appears in that final dump.

## Takeaway

"Adaptive trust" engines are a nice narrative but a trap: the classifier is an application-level policy, and a stack overflow is a memory-safety flaw below that policy. Getting a PIE leak from a separate command completes the chain. The fix is bounds checking on `send`, not smarter classification.

## Flag

Flag: not recovered in the writeup.
