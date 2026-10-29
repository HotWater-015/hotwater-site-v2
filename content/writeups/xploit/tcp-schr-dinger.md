---
title: "TCP Schrödinger"
description: "An incident-response-flavoured networking challenge: a TCP stream crosses the 32-bit sequence-number boundary, and an attacker injects ghost duplicate segments on the wrapped sequence…"
event: "xploit"
category: "networking"
categoryLabel: "Networking"
tags: ["XploitX 2026","networking"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-2/networking/tcp-scrodinger/writeup.md"
---

An incident-response-flavoured networking challenge: a TCP stream crosses the 32-bit sequence-number boundary, and an attacker injects ghost duplicate segments on the wrapped sequence numbers. Off-the-shelf reassembly produces contradictory streams — the task is to apply **RFC 7323 PAWS** (Protect Against Wrapped Sequences) manually and get the one true payload.

## Files

- `tcp_schrodinger_mirror.pcap` — the capture
- `CASE_BRIEF.txt`, `kernel_tcp_audit.log`, `suricata_tcp_alerts.json`, `tcptrace_analysis.txt` — mostly decoy analyst noise
- `solve.py`

## Analysis

PAWS compares the TSval option of each segment against the highest timestamp seen so far (`TS.Recent`). A segment whose TSval is *older* than `TS.Recent` is stale — even if its sequence number looks plausible after the wrap — and must be dropped.

Dumping fields with tshark:

```bash
tshark -r tcp_schrodinger_mirror.pcap -T fields \
  -e frame.number -e tcp.seq -e tcp.len \
  -e tcp.options.timestamp.tsval -e tcp.payload
```

Then the reconstruction logic: keep segments whose `tsval >= ts_recent`, update `ts_recent`, sort the survivors by sequence number, and concatenate their payloads.

## Exploit

```python
ts_recent = 200000          # value from the handshake
valid = []
for line in raw_output:
    fnum, seq, length, tsval, payload_hex = line.split("\t")
    tsval, seq = int(tsval or 0), int(seq)
    if tsval >= ts_recent:
        ts_recent = tsval
        valid.append((seq, bytes.fromhex(payload_hex)))

valid.sort(key=lambda x: x[0])
stream = b"".join(p for _, p in valid)
```

The result is a ZIP archive embedded directly in the stream; extracting it yields the flag file.

## Decoys

The capture is seeded with misleading artefacts — Suricata alerts about "PAWS state violation" and kernel socket debug strings containing fake flags. They are noise; the only payload that survives the timestamp filter is the real one.

## Flag

`XploitXβ{tcp_p4ws_s3qu3nc3_wr4p_schrod1ng3r_8821}`
