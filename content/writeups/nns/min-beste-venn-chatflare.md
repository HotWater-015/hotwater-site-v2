---
title: "min-beste-venn (Chatflare)"
description: "forensics_min-beste-venn hides a chat conversation inside a capture.pcap of requests to a Cloudflare-fronted web app. Every asset the pair of participants fetches goes through…"
event: "nns"
category: "forensics"
categoryLabel: "Forensics"
tags: ["NNS CTF 2026","forensics"]
date: "2026-10-22"
teammate: false
source: "NNS/forensic/forensics_min-beste-venn/writeup.md"
---

## Summary

`forensics_min-beste-venn` hides a chat conversation inside a `capture.pcap` of requests to a Cloudflare-fronted web app. Every asset the pair of participants fetches goes through Cloudflare's cache, so the caching layer becomes a covert channel: chunk URIs encode one *byte* of a conversation by naming a `<byte_index><bit_position>` on the MSB-side of that byte, and a `cf-cache-status: HIT` response line marks the bits that carry a `1`. The `solve.py` decoder uses `tshark` to pull the response headers and URIs and reconstructs the dialogue.

## Files

- `capture.pcap` — HTTP request/response pair capture.
- `solve.py` — the tshark-based decoder described below.

## Analysis

### Evidence layout

The URI format used in the capture is:

```text
/cf<session_id>/d/<role>/<msg_id>/<chunk>.css
```

- `<role>` — `h` for Host messages, `c` for Client messages.
- `<msg_id>` — the message's sequence number in that conversation.
- `<chunk>` — `<byte_index><bit_index>`, where the byte index is the leading digits and the final digit is one bit position of that byte, `0` = `0x80` down to `7` = `0x01`.

Only URIs whose response carries `cf-cache-status: HIT` count as set bits; misses simply don't appear in the bit-set for that (msg_id, role).

### Decoding

`solve.py` shells out to:

```bash
tshark -r capture.pcap -Y 'http.response' \
        -T fields -e http.response.line -e http.request.uri
```

and for each row with a `cf-cache-status: HIT` line, splits the URI on `/` and asserts `uparts[2] == 'd'` before bucketing `chunk` strings into `msg_hits[(msg_id, role)]`.

For each message, bytes are reassembled byte index outer, bit set inner:

```python
val = sum(1 << (7 - b) for b in bits)   # MSB-first: bit 0 = 0x80 … bit 7 = 0x01
```

The first recovered byte is a length prefix, and the next `length` bytes decode to UTF-8 — the message body. The script then prints `[{msg_id}] {Host|Client}: {payload}` sorted by `(msg_id, role)`, which reconstructs the whole chat, with the two participants label-swapped the same way (`role == "h"` → Host) as they appear in the URI.

## Exploit

The one thing worth being careful about in the case is that `int(c[:-1])` on the chunk name treats all but the last digit as the byte index — so chunk names like `07` are one-byte-index, and `.byte7` would not decode; the naming is strictly `<digits><single bit digit>`. Messages shorter than 128 bytes use only one-digit byte indices; the `max(by_idx.keys()) + 1` and `range(length)` bounds keep partial conversations consistent.

## Flag

Flag: not recovered in the writeup. The decoded chat contents are not persisted anywhere by `solve.py`.
