---
title: "Pset1"
description: "pset1 is an introductory stack overflow NNS CTF pwn challenge. The handout/solve.py captures the whole exploit in 12 lines: the target binary's input handler overflows a stack buffer,…"
event: "nns"
category: "pwn"
categoryLabel: "Pwn"
tags: ["NNS CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "NNS/pwn/pset1/pwn_pset1/writeup.md"
---

## Summary

`pset1` is an introductory stack overflow NNS CTF pwn challenge. The `handout/solve.py` captures the whole exploit in 12 lines: the target binary's input handler overflows a stack buffer, and after 72 bytes of padding the saved return address at `rsp+72` is overwritten with a hardcoded address `0x401b00` — the byte you need to redirect execution to (the challenge's win path, inferred from the non-PIE address that is the sole constant in the script).

## Files

- `handout/solve.py` — the exploit script.
- `handout/hello` — the target binary (`./hello` per `README.md`).
- `handout/README.md` — local-run instructions (`echo 'NNS{local}' | sudo tee /flag.txt; ./hello`).

## Analysis

The README says to run `./hello` locally after placing a local `/flag.txt`, and the remote endpoint in `solve.py` is `pset1-a0b738b71c56.chall.nnsc.tf:1337` over TLS, confirming the handout-located `solve.py` is a player solve rather than challenge tooling.

The script:

```python
context.arch = "amd64"
io = remote("pset1-a0b738b71c56.chall.nnsc.tf", 1337, ssl=True)
payload = b"A" * 72 + p64(0x401b00)
io.sendlineafter(b"> ", payload)
io.interactive()
```

Key observations:

- The target prints a `> ` prompt and reads a line, so `sendlineafter` is the natural primitive.
- The 72-byte offset is the classic distance to the saved return pointer for a 64-byte-ish buffer under routine compiler framing; only the offset is hand-measured in the script, not the binary (no `ELF()` load, no symbol table use).
- The overwritten address `0x401b00` is a low address typical of a **non-PIE** binary's `.text`, so the challenge binary runs at a fixed base and a single return-address swap is enough — no leak stage.
- There is no `cat`/`shell` construct in the script; execution is simply pointed at the win function and the resulting process output (presumably printing `/flag.txt`) is read interactively via `io.interactive()`.

This is the kind of pwn intro where the only thing to learn is return-address control: no overflow guard, no canary, no PIE, no leak required.

## Exploit

Reaching a shell is unnecessary: since the binary is non-PIE with the win code at a known fixed address, one `p64` over the return pointer finishes the challenge. `io.interactive()` keeps the connection open so the flag print isn't truncated.

## Flag

Flag: not recovered in the writeup. The flag string is read from the remote's output and not stored in the script.
