---
title: "MURMUR v1.2 Mesh Control Protocol"
description: "MURMUR is the control channel used between gateways and guest nodes in the Halcyon industrial mesh. This note is the fielded v1.2 profile. It is enough to read a link if you already hold…"
event: "h7ctf"
category: "crypto"
categoryLabel: "Crypto"
tags: ["H7CTF 2026","crypto"]
date: "2026-09-26"
teammate: false
source: "H7CTF/crypto/MURMUR-1.2.md"
---

MURMUR is the control channel used between gateways and guest nodes in the
Halcyon industrial mesh. This note is the fielded v1.2 profile. It is enough to
read a link if you already hold a tap position on one.

## 1. Handshake

MURMUR runs a Noise `XKpsk3` handshake with the `25519_ChaChaPoly_BLAKE2s`
suite. The gateway is the responder and carries a fixed static key. Guest nodes
are the initiator and bring a fresh ephemeral key for every session, so link
transcripts are never reusable across sessions.

Gateway static public key (baked into every node image):

```
15e8896ef9b0d92253ba8e4f8b96d8600648a4b4f2f299ae1a4ece8c6db71b16
```

The suite hash is a self contained BLAKE2s. It is shipped inline in
`murmur_crypto.py`; treat that file as the reference for every primitive on the
wire. The handshake is three messages:

```
-> e, es
<- e, ee
-> s, se, psk
```

After the second message both peers hold the same transcript hash `h2`. `h2` is
a function of public transcript bytes only (protocol name, the gateway static
public key, both ephemeral public keys, and the two handshake ciphertexts), so a
passive observer can recompute it without any key material. See
`SymmetricState` and `Handshake` in `murmur_crypto.py`.

## 2. Framing

Transport runs after the handshake. Each frame is:

```
[ masked_len : 2 bytes LE ] [ body : masked_len bytes ]
body = [ type : 1 byte ] [ AEAD(payload) ]
```

`masked_len` is the true body length XOR a per frame 16 bit mask:

```
mask_i = LE16( BLAKE2s( h2 || "MURMUR-len" || LE32(i) ) )
```

`i` counts frames from zero, independently per direction. A frame body is never
visible in the clear without `h2` and the suite BLAKE2s, so a stock Noise stack
cannot even find frame boundaries on this profile.

Frame types:

- `0x00` DATA
- `0x01` CONTROL

The AEAD is standard ChaCha20-Poly1305 (RFC 8439). The additional data is the
single type byte. The nonce is `0x00000000 || LE64(counter)` where `counter` is
the per direction message counter. Under the v1.2 profile the counter advances
once per transport message. Payloads are followed by a variable run of zero
padding whose length is chosen by the sender and is not signalled in the clear.

## 3. Telemetry (DATA)

Guest nodes and gateways both emit a fixed status blob as a DATA payload. Layout
is 64 bytes:

```
offset  size  field
0       7     magic  "MURMUR\x12"
7       4     seq            LE u32
11      8     uptime         LE u64
19      2     link_rssi      LE i16
21      2     queue_depth    LE u16
23      16    node_id  "NODE-GUEST-0001\x00"
39      25    reserved (zero)
```

See `build_telemetry` in `murmur_crypto.py`.

## 4. CONTROL

A CONTROL frame with an empty payload is a keepalive. A CONTROL frame with a
payload carries a command:

```
[ opcode : 1 ] [ role : 1 ] [ cmd_len : 2 LE ] [ cmd : cmd_len ]
```

- opcode `0x01` PROVISION
- role `0x00` guest, `0x01` admin

The gateway stores a provisioning secret and returns it, as the payload of a
CONTROL response, only when it accepts an authenticated PROVISION command with
role admin. The response payload is:

```
[ opcode 0x02 ] [ secret_len : 2 LE ] [ secret ]
```

Guest nodes never request provisioning.

## 5. Tap interface

Your tap speaks newline delimited JSON over TCP.

On connect you receive, one JSON object per line:

- `{"event":"session", ...}`
- `{"event":"wire","dir":"n2g"|"g2n","data":"<hex>"}` for each chunk seen on the
  link. `n2g` is node to gateway, `g2n` is gateway to node. Chunks are raw wire
  bytes, not pre split into frames.
- `{"event":"ready"}` once the opening traffic has been mirrored.

You may then send commands, one JSON object per line:

- `{"cmd":"inject","data":"<hex>"}` splices raw bytes toward the gateway as its
  next inbound frame. The gateway replies on the `g2n` feed if the frame is
  accepted and triggers a response.
- `{"cmd":"step"}` releases the next buffered node frame toward the gateway.
- `{"cmd":"close"}` ends the session.

Sessions are per team and short lived. Fresh ephemeral keys every time.
