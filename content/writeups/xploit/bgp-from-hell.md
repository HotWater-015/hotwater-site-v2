---
title: "BGP From Hell"
description: "A core-network forensics challenge: an IXP border router's BGP session is captured, and the exfiltrated flag is smuggled inside BGP COMMUNITY attributes of eight UPDATE messages. Each…"
event: "xploit"
category: "networking"
categoryLabel: "Networking"
tags: ["XploitX 2026","networking"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/networking/BGP/writeup.md"
---

A core-network forensics challenge: an IXP border router's BGP session is captured, and the exfiltrated flag is smuggled inside **BGP COMMUNITY attributes** of eight UPDATE messages. Each community is XORed with a hash chain over the remaining path attributes, so the payload only appears when the UPDATEs are processed in order.

## Files

- `ixp_border_bgp_stream.pcap`
- `CASE_BRIEF.txt`, `SHA256SUMS.txt`
- `extracted/solve.py`

## Analysis

BGP runs over TCP/179; payloads begin with the 19-byte BGP header, and on top of the capture the TCP/IP headers are 54 bytes. The session of interest is the OPEN from the border router followed by eight UPDATEs from `192.0.2.66`.

Each UPDATE's path attributes are parsed (flags, type, length), then split into:
- **type 8 (COMMUNITIES)** — carries the ciphertext bytes
- **everything else** — feeds the running hash state

The first state is `SHA256(open_message)`. For every UPDATE:

```python
S = hashlib.sha256(S + rest).digest()
out += bytes(a ^ b for a, b in zip(com, S))
```

So each community XORs against the digest of the previous state plus that UPDATE's other attributes — a hash-chain keystream. Decoding in capture order yields the flag.

## Parsing notes

- The 16-byte marker + length + type header identifies BGP messages; OPEN is the 6th packet, UPDATEs follow.
- Attribute parsing must handle both extended-length (flag `0x10`) and normal attributes — the script checks the extended-length bit per attribute.
- Only type 8 is treated as ciphertext; ORIGIN, AS_PATH, NEXT_HOP, etc. are the chain input.

## Takeaway

BGP is an unauthenticated-by-default protocol, and community attributes are free-form 32-bit values. Combined with a hash chain, they make a covert channel that looks like ordinary routing policy at a glance. RPKI and route-policy auditing don't inspect communities for payloads — out-of-band integrity checking does.

## Flag

Flag: recovered only as a partially garbled byte string in the solve output (the hash chain drifts on a few attribute boundaries); not stated here.
