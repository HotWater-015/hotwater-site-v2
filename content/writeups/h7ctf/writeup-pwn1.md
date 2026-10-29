---
title: "Manifest — Format String Into Clearance"
description: "For H7CTF 2026's pwn1 challenge, the target binary is literally called manifest (its debug info says manifest.c), and its whole attack surface is a feedback terminal that echoes what you…"
event: "h7ctf"
category: "pwn"
categoryLabel: "Pwn"
tags: ["H7CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "H7CTF/pwn1/writeup-pwn1.md"
---

For H7CTF 2026's `pwn1` challenge, the target binary is literally called `manifest` (its debug info says `manifest.c`), and its whole attack surface is a feedback terminal that echoes what you type. That echo is an unguarded `printf`, and the stack can be coerced into writing to an arbitrary address.

## The interface

Live target is a menu loop:

```
1) leave feedback
2) view manifest
3) exit
```

Option 1 prompts with `Leave feedback for the terminal operators:` and reads a line, which is fed straight to a `printf`-style echo (there is no `%`-filtering — `sprintf`-style formatting is unfiltered on user input). Option 2 prints `[manifest] clearance code: %s`, gated by an `is_admin` boolean: if the clearance isn't set (`is_admin` initialized to denied), `view_manifest` prints `[!] admin clearance required.`. The flag path (`[!] flag file missing`, driven by `fopen`/`fclose`) lives behind the clearance check.

## The exploit

Two primitives do all the work:

1. **Positional argument control.** The feedback is echoed on the stack, so with the target address placed **eight bytes into the buffer**, `%7$n` reaches the pointer stored right after the prefix — the comment in `exploit.py` says it directly:

```python
# The feedback buffer starts at printf's seventh positional argument when the
# target address is placed eight bytes into the buffer.
payload = b"%1c%7$nA" + p64(elf.sym.is_admin)
```

`%1c` makes printf actually consume an argument (the suppress-without-write FAQ: `%n` without a preceding character-conversion can be optimized away by some libc builds) and `%7$n` writes the number of characters printed so far — 1 — into `is_admin`, flipping the flag check from "denied" to "cleared" (the binary's `is_admin` was zero before this).

2. **Stack-reliable entry.** The exploit drives the menu in a fixed order:

```python
io.sendlineafter(b"3) exit\n", b"1")
io.sendafter(b"terminal operators:\n", payload)
io.recvuntil(b"3) exit\n")
io.sendline(b"2")
```

so the format string spends its writes during the option-1 feedback handler and the subsequent `view manifest` call reads the now-elevated `is_admin`. Afterwards the code drains everything up to the next `1) leave feedback` banner and prints the manifest contents — which contain the clearance code plus the flag.

The binary is PIE-less in my check (`ELF("./manifest")` resolved symbols statically), so `elf.sym.is_admin` is the direct absolute address — no leaks needed.

## Flag

Flag: not recovered in the writeup. No flag literal appears in the exploit or README, and the artifact does not include a captured exploit transcript (the code ends at `result = ...; print(...)`), so the actual flag string was never persisted here.
