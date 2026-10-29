---
title: "Welcome"
description: "We are provided with a packet capture file welcomecall.pcap."
event: "sun"
category: "forensics"
categoryLabel: "Forensics"
tags: ["SunshineCTF 2026","forensics"]
date: "2026-09-28"
teammate: false
source: "sun/forensic/welcome/writeup.md"
---

- **Category:** Forensics
- **File provided:** `welcomecall.pcap`
- **Flag:** `sun{thankyouforplaying}`

---

## 1. Initial Analysis

We are provided with a packet capture file `welcomecall.pcap`. 

Using `tshark` to check protocol conversations:

```bash
tshark -r welcomecall.pcap -q -z conv,udp -z rtp,streams
```

Output:
```text
========================= RTP Streams ========================
   Start time      End time     Src IP addr  Port    Dest IP addr  Port       SSRC          Payload  Pkts
     0.400000     15.940000      192.0.2.10  4000      192.0.2.20  4002 0x48271739            g711U   778
==============================================================
```

The capture contains:
- **SIP** signalling on UDP port 5060 establishing a VoIP voice call between `192.0.2.10` and `192.0.2.20`.
- **RTP** stream on port 4000 $\rightarrow$ 4002 carrying G.711 $\mu$-law (`PCMU` / `g711U`) encoded audio sampled at 8000 Hz.

---

## 2. Audio Extraction

### Method A: Command Line (tshark + ffmpeg)

Extract the raw payload hex bytes from the RTP packets and convert them to a standard WAV audio format:

```bash
# 1. Dump RTP payload bytes to a raw mulaw file
tshark -r welcomecall.pcap -Y "rtp" -T fields -e rtp.payload | tr -d '\n' | xxd -r -p > audio.raw

# 2. Convert raw G.711 mulaw to PCM WAV
ffmpeg -f mulaw -ar 8000 -ac 1 -i audio.raw audio.wav
```

### Method B: Wireshark GUI

1. Open `welcomecall.pcap` in Wireshark.
2. Navigate to **Telephony** $\rightarrow$ **VoIP Calls**.
3. Select the call and click **Play Streams** or go to **Telephony** $\rightarrow$ **RTP** $\rightarrow$ **RTP Streams** and click **Export**.

---

## 3. Audio Analysis & Solution

Listening to the extracted `audio.wav`, the voice is played in reverse. 

Reverse the audio track using `sox` or Audacity:

```bash
sox audio.wav audio_reversed.wav reverse
```

Playing `audio_reversed.wav`:

> *"Welcome to BSides Orlando. The flag that you are looking for is sun with a left curly bracket, thankyouforplaying, right curly bracket. All lowercase, no spaces. Thank you and have a good one."*

---

## 4. Flag

```text
sun{thankyouforplaying}
```
