---
title: "Ghost in the Wire"
description: "A network-forensics challenge whose answer is hidden in plain sight as a Base85 string in the incident artefacts. Decode it and the flag falls out."
event: "xploit"
category: "networking"
categoryLabel: "Networking"
tags: ["XploitX 2026","networking"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/networking/Ghost-in-the-wire/writeup.md"
---

A network-forensics challenge whose answer is hidden in plain sight as a **Base85 string** in the incident artefacts. Decode it and the flag falls out.

## Files

- `CASE_BRIEF.txt`, `auditd_syscall.log`, `bgp_routing_table.txt`, `iptables.rules`, `nginx_proxy.conf`, `netstat_active_conns.txt`, `core_switch_vlan10_stp.pcap`

## Analysis

The brief frames this as a TCP ACK-state-machine tracker incident with a large pile of logs. Most of it is noise; the payload is a text blob:

```
Sa57_X>?f5vU_x6a9=cIYhQD8G;}jxZ8T$OF>W(obaFIfYcq0RIXE&geE
```

The character set (letters, digits, punctuation like `>?`, `$`, `&`) matches **Base85** (RFC 1924 / Ascii85 alphabet), not Base64. The alphabetical range and the `~`-less alphabet point at Python's `base64.b85encode` variant.

## Decoding

```python
import base64

data = b"Sa57_X>?f5vU_x6a9=cIYhQD8G;}jxZ8T$OF>W(obaFIfYcq0RIXE&geE"
print(base64.b85decode(data).decode())
```

Output:

```
XploitXβ{tcp_4ck_st4t3_m4ch1n3_tr4ck3r_9821}
```

The decoded string is UTF-8 with a literal `β` (two bytes, `\xce\xb2`), matching the challenge's flag format note.

## Takeaway

"Ghost in the wire" attacks leave a state-machine fingerprint rather than a log line — but in this case the flag was encoded, not hidden semantically. Always run `strings`/encoding detection over every artefact: Base85 looks like line noise until you notice the alphabet and try the right decoder.

## Flag

`XploitXβ{tcp_4ck_st4t3_m4ch1n3_tr4ck3r_9821}`
