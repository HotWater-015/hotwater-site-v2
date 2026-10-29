---
title: "last packet — Forensics"
description: "We are provided with a network packet capture file challenge2.pcap. Using tshark, we inspect the HTTP requests and responses contained within the capture:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/last-packet.md"
---

## Challenge Overview
- **Category:** Forensics / Network Analysis
- **File Provided:** `challenge2.pcap`
- **Flag:** `isfcr{l33t_c0d3_tw0_sum_f0und}`

---

## 1. Initial Inspection

We are provided with a network packet capture file `challenge2.pcap`. Using `tshark`, we inspect the HTTP requests and responses contained within the capture:

```bash
tshark -r challenge2.pcap -Y "http" -T fields \
  -e frame.number -e ip.src -e ip.dst -e http.request.method -e http.request.uri -e http.response.code -e http.file_data
```

Among standard browsing and DNS queries, we identify activity against internal microservices:
1. `10.0.1.100:8080` (User/Profile service)
2. `10.0.1.200:9090` (`twosum-api.internal.corp`)

---

## 2. Analyzing the Microservice Traffic

In frames 56 and 58, the client queries the `twosum` microservice:

### Request (Frame 56):
- **Endpoint:** `POST /api/v1/twosum/solve`
- **Payload:**
  ```json
  {"nums": [24, 42, 7, 15], "target": 66}
  ```

### Response (Frame 58):
- **Payload:**
  ```json
  {
    "status": "ok",
    "result": [0, 1],
    "debug": {
      "internal_key": "4b7a456b495441354c6e46784e68306863695a7848545931636830784e7938644a4849334c43592f",
      "enc": "xor",
      "cache_hit": false,
      "exec_time_ms": 12,
      "node": "worker-3",
      "build": "twosum-api-v2.3.1-debug",
      "heap_mb": 247,
      "gc_pause_ms": 3
    }
  }
  ```

The debug information leaks an `internal_key` with the encoding specified as `xor`.

---

## 3. Decrypting the Secret

1. **Hex to Base64 String:**
   Decoding the hex string `4b7a456b495441354c6e46784e68306863695a7848545931636830784e7938644a4849334c43592f`:
   ```text
   KzEkITA5LnFxNh0hciZxHTY1ch0xNy8dJHI3LCY/
   ```

2. **Base64 Decoding:**
   Decoding the Base64 string gives raw bytes:
   ```text
   b'+1$!09.qq6\x1d!r&q\x1d65r\x1d17/\x1d$r7,&?'
   ```

3. **XOR Decryption:**
   Observing the request's target value `66` (or performing a single-byte XOR brute force matching `isfcr{`), the key is `66` (ASCII `'B'` / `0x42`):

```python
import base64

raw_hex = "4b7a456b495441354c6e46784e68306863695a7848545931636830784e7938644a4849334c43592f"
b64_data = bytes.fromhex(raw_hex)
encrypted_bytes = base64.b64decode(b64_data)

key = 66
flag = bytes([b ^ key for b in encrypted_bytes]).decode()
print("Flag:", flag)
```

**Output:**
```text
isfcr{l33t_c0d3_tw0_sum_f0und}
```

---

## Flag
`isfcr{l33t_c0d3_tw0_sum_f0und}`
