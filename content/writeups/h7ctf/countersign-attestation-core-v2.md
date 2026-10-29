---
title: "Countersign attestation core v2"
description: "Reverse engineering of the countersign PIE binary and a protocol-only solver that recovers the 24-byte RUN payload for any live instance."
event: "h7ctf"
category: "rev"
categoryLabel: "Reverse"
tags: ["H7CTF 2026","rev"]
date: "2026-09-27"
teammate: false
source: "H7CTF/rev/insane/writeup.md"
---

Reverse engineering of the `countersign` PIE binary and a protocol-only solver that recovers the
24-byte `RUN` payload for any live instance.

## TL;DR

| instance | sections | records | live edges | start | emit | flag |
|---|---|---|---|---|---|---|
| A (`:43186`) | 40 | 127 | 53 | `0x02f6` | `0x05d3` | `H7CTF{efb99265-4cbd-4dc0-bc40-539d7d0321f7}` |
| B (`:43230`) | 40 | 129 | 53 | `0x64d1` | `0x8695` | `H7CTF{6f548304-625c-4ed8-9696-b460e2167a45}` |

Local binary (self-hosted, `FLAG=h7{local_test_flag}`) also verified end-to-end.

## 1. The challenge

The service speaks a tiny line protocol:

```
Countersign attestation core v2 ready.
commands: GET | NONCE | MINT <hex<=16> | RUN <hex 24>
```

* `GET` — returns the hex encoding of a self-contained bytecode image.
* `NONCE` — returns the instance nonce.
* `MINT <hex>` — returns `SipHash-2-4` (truncated to 6 bytes) of the supplied data, keyed by the
  instance key. This is the **hash oracle** the whole challenge is built around.
* `RUN <48 hex chars>` — feeds 24 bytes into the VM; if the program reaches its `EMIT` section the
  flag is printed, otherwise `denied`.

The image is generated **in-process at startup**, and every port/connection is a fresh instance
with a fresh key and a fresh program, so everything has to be done inside one session.

## 2. Static analysis

Ghidra (headless via `scripts/DecompAll.java`) loaded the PIE at `0x100000`, i.e. Ghidra addresses
are file vaddr `+ 0x100000`. Useful entry points:

| file vaddr | role |
|---|---|
| `0x1172` | end of program generation — good spot to dump the image/key after startup |
| `0x1810` | `exec_section(sec*, u32 regs[8], u8 mem[24], key)` — the interpreter loop |
| `0x1d50` | transition selection (inlined into `0x1810`) |
| `0x1af0` | the MAC/hash routine used by both transitions and `MINT` |

Calling convention confirmed in GDB: `rdi` = section, `rsi` = register file, `rdx` = 24-byte
input memory, `rcx` = key (`u64 k0, u64 k1`).

## 3. Image format (`CSGN`)

```
offset  size  field
0x00    4     "CSGN"
0x04    2     version (2)
0x06    2     section count
0x08    2     start section id
0x0a    8     nonce
0x12         sections, back to back
```

Per section:

```
size  field
2     id
1     bitreg            (0xff = unconditional)
1     bitidx
2     default_next      (used when no record matches)
2     code_len
n     code
1     n_transitions
13*n  records
```

Per transition record (13 bytes):

```
size  field
1     bit
2     next_id
4     x            (unused by the interpreter — decoy material)
6     mac          (6-byte truncated SipHash-2-4)
```

## 4. The VM

Eight 32-bit registers (contiguous `u32` slots — GDB shows the 8-byte GDB view as *pairs* of
registers, which is a classic source of confusion) and a 24-byte memory holding the raw input.
All arithmetic is mod 2^32.

| op | code | encoding | semantics |
|---|---|---|---|
| `NOP` | `0x00` | 1 byte | — |
| `MOVI` | `0x01` | op, dst, imm32 | `dst = imm` |
| `MOV` | `0x02` | op, dst, src | `dst = src` |
| `ADD` | `0x03` | op, dst, src | `dst += src` |
| `XOR` | `0x04` | op, dst, src | `dst ^= src` |
| `AND` | `0x05` | op, dst, src | `dst &= src` |
| `OR` | `0x06` | op, dst, src | `dst \|= src` |
| `ROL` | `0x07` | op, dst, n | rotate left, count mod 32 |
| `SHR` | `0x08` | op, dst, n | logical shift right (`0` if `n > 31`) |
| `ADDI` | `0x09` | op, dst, imm32 | `dst += imm` |
| `XORI` | `0x0a` | op, dst, imm32 | `dst ^= imm` |
| `ANDI` | `0x0b` | op, dst, imm32 | `dst &= imm` |
| `LD` | `0x0c` | op, dst, idx | `dst = mem[idx]` (byte, zero-extended; `0` if `idx > 0x17`) |
| `EMIT` | `0x0d` | 1 byte | success: prints the flag |
| `HALT` | `0x0e` | 1 byte | stop |
| `TRAP` | `0x0f` | 1 byte | failure |

**Branching.** The section body runs first, then the interpreter picks the successor:

```
bit = 0xff                       if bitreg == 0xff
bit = (reg[bitreg] >> bitidx)&1  otherwise
successor = first record (in file order) with record.bit == bit AND a valid mac
            else default_next
```

The "first record with a valid mac" clause is the crux: the generator fills most records with
garbage MACs, so **MAC validation is what defines the real control-flow graph**.

## 5. The MAC (and the tag that isn't)

`FUN_00101af0` is SipHash-2-4 (2 compression rounds per message block, 4 rounds per final block),
64-bit output truncated to 6 bytes, length folded into the last block. The decompiler makes it
look like a 1-byte tag is prepended to the data:

```c
local_48 = param_1;                       // "tag"
for (uVar4 = 0; uVar4 < param_3; uVar4++)
    local_47[uVar4 - 1] = *(param_2 + uVar4);   // <-- uVar4 == 0 writes local_47[-1]
```

`local_47[-1]` *is* `local_48`, so the very first copy **overwrites the tag with `data[0]`**. The
effective message is therefore just the data, and the transition MAC is

```
mac = SipHash24(key, msg = sid_le16 || next_le16 || bit_u8 || x_le32, len = 9)[:6]
```

Brute-forcing field orders/permutations against a known key confirmed this layout: 51 of 123
records in a local dump matched, the rest being deliberate decoys.

Because the tag is a no-op, `MINT` is a **chosen-message oracle for the transition MAC**:

```
MINT <sid_le16 next_le16 bit x_le32>   # 9 bytes -> 12 hex chars
```

Comparing that against the MAC stored in each record yields the live edges (≈53 out of ≈127
records per instance).

## 6. Program structure

A 40-section program is always the same skeleton (verified across instances):

```
prologue
  -> round0  --bit0--> constA --\
  -> round0  --bit1--> constB --+--> round1 -> ... -> round11 -> verify
verify --bit0--> EMIT (flag)
verify --bit1--> TRAP
```

* **prologue** (252 bytes) — six times
  `MOVI k,0; LD 6,4k+i; ROL 6,8i; OR k,6` for `i = 0..3`, i.e.
  `reg[k] = int.from_bytes(input[4k:4k+4], "little")`.
  `reg6` is scratch and is left holding `input[23] << 24`; `reg7` stays 0.
* **round** (8 instructions, always this shape) — touches only `r0..r3`:
  `ADD r0,r1; ROL r0,s; XOR r2,r0; ADD r3,r2; ROL r3,s; XOR r1,r3; ADDI r0,k; XORI r2,k`.
  The branch bit is read from `r0..r3` (`bitreg ∈ {0,1,2,3}`), so the two halves of the input are
  fully independent.
* **constant entry** (3 instructions, always `XORI r4,k; ADD r5,r4; ROL r5,s`) — touches only
  `r4,r5`. Each round has two of them, one per branch value.
* **verify** (117 bytes) — builds
  `r6 = (r0^C0)|(r1^C1)|(r2^C2)|(r3^C3)|(r4^C4)|(r5^C5)` and then OR-folds it with itself
  shifted by 16, 8, 4, 2 and 1, and branches on `r6` bit 0.

  The fold makes bit 0 the OR of *all 32 bits* of the initial `r6`, so

  ```
  bit0 == 0   <=>   r0 == C0, r1 == C1, ..., r5 == C5
  ```

  That is the entire verification condition — no parity, no SAT problem. The constants are read
  straight out of the `MOV r7,k ; XORI r7,Ck` pairs. The verify section carries 5 records but only
  two of them are live: `EMIT` on bit 0 and `TRAP` on bit 1; the rest are decoys pointing back into
  the middle of the chain (which is why MAC validation matters even at the very last step).

## 7. Solving it (no SMT solver needed)

Every step of the program is a bijection on `(r0..r5)`, so the whole thing inverts:

| op | inverse |
|---|---|
| `ADD a,b` | `SUB a,b` |
| `ADDI a,k` | `ADDI a,-k` |
| `XOR a,b` | `XOR a,b` |
| `XORI a,k` | `XORI a,k` |
| `ROL a,n` | `ROR a,n` |

Algorithm:

1. `GET` and parse the image.
2. `MINT` the 9-byte message of every record; keep the ones whose MAC matches → live successor map.
3. Walk the chain: `prologue`, then 12 × (`round`, `const[0]`, `const[1]`), then `verify`.
4. Extract `C0..C5` from `verify`.
5. Invert the 12 rounds **in reverse order** starting from `(C0,C1,C2,C3)` → `w0..w3` → input bytes 0..15.
6. Run the 12 rounds **forward** on `w0..w3` to obtain the 12 branch bits.
7. Invert the 12 *selected* constant entries **in reverse order** starting from `(C4,C5)` →
   `w4,w5` → input bytes 16..23.
8. Emit the 24 bytes little-endian, sanity-check by emulating the whole program, then `RUN`.

Steps 5 and 7 are independent precisely because rounds only read/write `r0..r3` and constant entries
only read/write `r4,r5`.

## 8. Reference implementation

```python
import socket, struct

def live_edges(conn, P):
    succ = {}
    for sid, s in P['secs'].items():
        for bit, nid, x, mac in s['trs']:
            msg = struct.pack('<HHB', sid, nid, bit) + struct.pack('<I', x)
            if bytes.fromhex(conn.cmd('MINT ' + msg.hex())) == mac:
                succ.setdefault(sid, {})[bit] = nid     # first valid record wins
    return succ

def invert(code, regs):                     # reverse-order, op-wise inverse
    r = list(regs)
    for _, op, a, b in reversed(disasm(code)):
        if   op == 'ADD':  r[a] = (r[a] - r[b]) & M
        elif op == 'ADDI': r[a] = (r[a] - b) & M
        elif op == 'XOR':  r[a] ^= r[b]
        elif op == 'XORI': r[a] ^= b & M
        elif op == 'ROL':  r[a] = ror(r[a], b)
        else: raise NotImplementedError(op)
    return r

def solve(P, succ):
    rounds, sid = [], P['start']
    sid = succ[sid][0xff]                              # prologue -> round0
    for _ in range(12):
        c0, c1 = succ[sid][0], succ[sid][1]
        rounds.append((sid, c0, c1))
        sid = succ[c0][0xff]                           # both consts converge
    C = verify_constants(P, sid)

    w = C[:4] + [0]*4
    for m, _, _ in reversed(rounds): w = invert(P['secs'][m]['code'], w)
    st, bits = w, []
    for m, _, _ in rounds:                             # forward -> branch bits
        st = execute(P['secs'][m]['code'], st)
        bits.append((st[P['secs'][m]['bitreg']] >> P['secs'][m]['bitidx']) & 1)

    s = [0, 0, 0, 0, C[4], C[5], 0, 0]                  # consts live in r4/r5
    for (m, c0, c1), b in reversed(list(zip(rounds, bits))):
        s = invert(P['secs'][c0 if b == 0 else c1]['code'], s)
    return b''.join(struct.pack('<I', x) for x in w[:4] + [s[4], s[5]])
```

Everything is driven over a single socket: `GET` → ~130 `MINT` calls → `RUN`.

## 9. Pitfalls hit along the way

* **Word endianness.** The first Z3 model used big-endian words and was unsat for a long time.
  GDB settled it in one shot: break at the executor, dump `[rsi + 4*i]` as `u32` and the memory at
  `rdx` — `reg[k]` is the **little-endian** word at bytes `4k..4k+3`.
  (`x/3gx $rdx` prints qwords in host byte order, i.e. `0x5f3001ee9e85961c` means bytes
  `1c 96 85 9e ee 01 30 5f` — easy to misread as big-endian.)
* **Registers are 4-byte slots**, not 8-byte; the GDB 8-byte view shows register *pairs*.
* **Seeding the wrong registers.** The constant-entry inversion must start from
  `r4 = C4, r5 = C5`; putting them in `r0/r1` produced a plausible-looking but wrong answer whose
  only symptom was `r4 = r5 = 0` at the verify section. Always confirm with the concrete emulator
  (must end in `EMIT`) before sending `RUN`.
* **The MAC layout** was only pinned down by brute-forcing field orders/lengths against a known key;
  assuming the decompiled "tag" byte is hashed leads to 0 valid records and a dead program.
* **Local validation.** The binary regenerates its program per process, so a captured image can't
  be replayed into a fresh run. A tiny pty harness (`GET` → solve → `RUN` in one process) is the
  only reliable way to test end-to-end before touching the remote.
* Z3 (`4.16.0`) with `LShR` for `SHR` works and is a good cross-check, but the closed-form
  inversion above is instant and needs no solver.

## 10. Files

* `vm.py` — image parser + disassembler.
* `hashing.py` — SipHash-2-4 (validated against the standard test vectors) and the transition MAC.
* `solve2.py` — MAC-validated live-graph construction, concrete VM, reachability pruning.
* `solveinv.py` — chain walk, constant extraction, inversion solver.
* `client.py` — one-connection driver: `GET` → `MINT` sweep → solve → `RUN`.
