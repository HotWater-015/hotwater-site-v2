---
title: "Floe"
description: "The service starts with floe stream open. and a floe> prompt. It accepts a two-byte big-endian length followed by that many payload bytes:"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/floe/writeup.md"
---

**Category:** pwn, black box  
**Target:** `nc 0.cloud.chals.io 27813`  
**Flag:** `isfcr{l3ngth_pr3f1x_fr4m1ng_bl1nd_br0p_fl0e_9d2e74}`

## Protocol and overflow

The service starts with `floe stream open.` and a `floe> ` prompt. It accepts a
two-byte **big-endian** length followed by that many payload bytes:

```text
[ u16 length ][ payload ]
```

A safe frame gets `logged N.\nfloe> `. The frame handler copies the payload
into an 88-byte stack buffer without enforcing that size. By sending frames
of lengths 89, 90, and so on, the response becomes a byte-at-a-time oracle for
the stack canary: a correct prefix survives and prints the prompt; an incorrect
byte kills the connection before the response.

The recovered layout is:

| Payload offset | Contents |
| ---: | --- |
| 0–87 | Frame buffer |
| 88–95 | Stack canary |
| 96–111 | Padding |
| 112–115 | Live value that must remain `4` |
| 116–127 | Padding |
| 128–135 | Saved RBP |
| 136–143 | Saved return address |
| 144 onward | ROP chain data |

The service forks for connections, so its canary remains stable across
connections but rotates when the parent restarts. `brute_canary.py` recovers it
one byte at a time and writes `canary.txt`. During the successful run it was
`00e27369977fcbd0`.

## Decoys and the memory leak

A first return-address scan found `isfcr{...}` strings around `0x400580`, but
each string explicitly said `d3c0y`. Continuing the scan found several more.
The files named `flag` and `flag.txt` also contain decoy strings. Stopping at
the first flag-shaped output gives a false answer.

Returning to `0x4007a2` takes a branch in a file-reading routine that writes
stack bytes to the socket. This exposed a libc return address ending in
`0x2a1ca`. It matches the instruction after the call to `main` in Ubuntu 24.04
glibc 2.39, so `libc_base = leaked_return - 0x2a1ca`. The leaked base was page
aligned, and libc `ret` and `pop rdi; ret` gadgets were verified by chaining
them into a known decoy function.

The socket is descriptor 4. With libc gadgets, a direct `write(4, addr, len)`
became an arbitrary memory read. Since there was no convenient `pop rdx; ret`,
the chain loaded `rdx` from a controlled four-byte value using a libc gadget
`mov edx, [rax]; mov eax, edx; ret`. A 4 KiB length placed in the input buffer
let us dump the mapped executable from `0x400000` onward. The stack buffer
address was found by reading nearby stack memory and searching for a marker in
the sent payload.

The dump showed a non-PIE ELF. Its strings include `flag.enc`, the decoy paths,
and **`floe.rec` at `0x401770`**. Disassembly revealed a routine at `0x400760`
which takes a pathname in `rdi`, opens it read-only, reads up to `0xb0` bytes,
and sends the bytes to the socket. The same binary has `pop rdi; ret` at
`0x400570`.

## Final ROP chain

We only need to supply the pathname argument and jump to the file-reading
routine. The payload retains the canary and the live `4` at offset 112:

```python
filler = b"\x00" * 16 + struct.pack("<I", 4) + b"\x00" * 20
payload = b"A" * 88 + canary + filler
payload += struct.pack("<QQQ", 0x400570, 0x401770, 0x400760)
frame = struct.pack(">H", len(payload)) + payload
```

After the saved return address is used, `pop rdi; ret` places the address of
`"floe.rec"` in `rdi`. The next return enters the open/read/send routine, which
returns the record contents directly to our socket. No shell or output parsing
trick is needed.

```text
$ python3 exploit_final.py
isfcr{l3ngth_pr3f1x_fr4m1ng_bl1nd_br0p_fl0e_9d2e74}
```

If the canary has rotated, run `printf '00' > canary.txt` followed by
`python3 brute_canary.py`, then rerun `python3 exploit_final.py`.
