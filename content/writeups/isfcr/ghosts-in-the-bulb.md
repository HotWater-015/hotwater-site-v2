---
title: "Ghosts in the Bulb"
description: "The capture is plain, unencrypted MQTT from 12 smart-home devices. Two devices hide data in covert channels:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/ghosts-in-the-bulb.md"
---

**Category:** Forensics (network / covert channels)
**Flag:** `isfcr{when_photons_and_seconds_both_carry_secrets_a7c3}`

## TL;DR

The capture is plain, unencrypted MQTT from 12 smart-home devices. Two devices hide data in covert channels:

| Channel | Device | Carrier | Carries |
|---|---|---|---|
| "photons" | Bedroom bulb `192.168.1.32` | LSB of the `bri` (brightness) field | AES-GCM encrypted blob |
| "seconds" | Robovac `192.168.1.40` | Gaps between messages | The key text |

Decode both, derive the key, decrypt the blob, get the flag.

## 1. Recon

Everything in `capture.pcap` is TCP to port 1883 (MQTT) toward the hub at `192.168.1.100`. IP/TCP headers, MACs and sequence numbers are all clean and match `topology.md`, so nothing is hidden at the packet level.

Reassembling each device's TCP stream and parsing the MQTT PUBLISH packets gives JSON like `{"on":true,"bri":..,"hue":..,"sat":..,"transition":..,"ts":..}`. Message counts stand out:

- Bedroom bulb: **952** messages, far more than any other bulb of similar type.
- Studio bulb: 720 (a "music-sync" bulb, so noisy by design, a decoy).
- Robovac: 249, but it reports `state: docked` and `battery: 100` in *every* message, so it should be boring and its timing should be regular.

## 2. Channel 1: bedroom bulb brightness LSB (the ciphertext)

Take the least significant bit of `bri` from each of the 952 messages, in order, and pack the bits MSB-first into bytes. That gives 119 bytes (952 / 8) with an obvious frame:

```
a5 5a a5 5a | 00 6d | <109 bytes ASCII> | f0 0d ca fe
 preamble     len=109     payload          trailer
```

The 109-byte payload uses only Base85 characters. Decoding it with `base64.b85decode` yields 87 bytes starting with the magic `GITB`, and the rest is high-entropy: encrypted. No simple XOR, compression or keys from `topology.md` opened it, so a key had to be hidden somewhere else.

(A trap I fell into: the `00 6d` is a 16-bit length, not "a flag byte followed by data". Including the `6d` in the Base85 payload gives a wrong decode that lacks the `GITB` magic.)

## 3. Channel 2: robovac inter-message timing (the key)

Other devices (thermostat, air-quality sensor) report at a fixed period with uniform random jitter, which is normal. The robovac is different: its gaps are not jitter around 60 s. After eight ordinary ~60 s gaps there is one long gap of about **137 s** (about 9 x 15 s), followed by gaps clustered near **30, 45, 60 and 75 s**, then ordinary ~60 s gaps again.

So the gaps are multiples of 15 s with a little jitter:

```
symbol = round(gap_seconds / 15)
9      -> start marker
2,3,4,5 -> data, 2 bits each (value = symbol - 2, MSB first)
```

Concatenate the 2-bit values after the marker and pack into bytes. At the right bit alignment (try all 8) the result is:

```
a5 | 4b 5a 37 57 4d 51 52 33 58 42 32 48 | aa aa aa ...
start   "KZ7WMQR3XB2H"                      idle fill (the repeating 60 s gaps = 0b10)
```

`KZ7WMQR3XB2H` is 12 characters from the Base32 alphabet (A-Z, 2-7), which is the key text.

## 4. Decrypting

The `GITB` container turned out to be AES-256-GCM:

```
GITB (4 bytes magic) | nonce (12) | ciphertext | tag (16)
key = SHA256("KZ7WMQR3XB2H")      # hash of the ASCII text, NOT of its Base32 decode
no AAD
```

The GCM tag verifies, which confirms the key and layout. Plaintext:

```
isfcr{when_photons_and_seconds_both_carry_secrets_a7c3}
```

The flag text refers to the two channels: light (the bulb) and time (the vacuum's reporting intervals).

## Why it's hard to spot

- Every message is individually plausible: valid JSON, sensible values, nothing strange per packet.
- The studio "music-sync" bulb makes heavy, fast bulb traffic look normal.
- The data and the key are split across two unrelated devices and two unrelated carriers (a payload bit and timing), so neither is decodable alone.
- A docked robovac is the least interesting device on the network, which is why its timing is a good hiding place.

## Dead ends worth knowing about

- Header-level channels (IP ID, TTL, TCP options, window): all clean.
- LSB streams of the other bulbs' fields and of the sensors: nothing structured.
- Brute-forcing the blob with keys derived from `topology.md`, MACs, hostnames and IPs: no hits.
- Thermostat and air-quality timing: uniform jitter, no information.

## Reproduce

```
pip install scapy pycryptodome
python3 solve.py capture.pcap
```

Output:

```
[+] bedroom blob: 87 bytes, magic b'GITB'
[+] robovac covert key text: KZ7WMQR3XB2H
[+] FLAG: isfcr{when_photons_and_seconds_both_carry_secrets_a7c3}
```
