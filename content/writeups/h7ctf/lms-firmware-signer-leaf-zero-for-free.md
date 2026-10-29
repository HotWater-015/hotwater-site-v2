---
title: "LMS Firmware Signer: Leaf Zero for Free"
description: "The H7CTF 2026 crypto target in this folder is a firmware-signing service built as an LMS-style hash signature scheme: WOTS one-time leaves wrapped in a Merkle tree (TREE_H = 4, 16…"
event: "h7ctf"
category: "crypto"
categoryLabel: "Crypto"
tags: ["H7CTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "H7CTF/crypto/3/writeup.md"
---

The H7CTF 2026 crypto target in this folder is a firmware-signing service built as an LMS-style hash signature scheme: WOTS one-time leaves wrapped in a Merkle tree (`TREE_H = 4`, 16 leaves), with the *operational* flaw that the server's leaf counter resets on demand, so leaf 0 signs everything. The scheme itself (`lms.py`) is shipped "so the scheme is known" and is explicitly stated to be self-consistent; the vulnerability is entirely service-side. This writeup covers my solve for the leaf-reuse exploit and is related to nothing in `crypto/MURMUR-1.2.md` (that challenge is a Noise XKpsk3 mesh tap; different primitives).

## Running the exploit locally

`lms.py` exposes the `Signer` class with a fatal footgun: `sign(msg, leaf=...)` lets the caller pick the leaf, including one already used:

```python
def sign(self, msg, leaf=None):
    q = self.ctr if leaf is None else leaf
    sig = {"leaf": q, "wots": wots_sign(self.sk[q], msg),
           "path": auth_path(self.levels, q)}
```

By signing two different messages under the same leaf (through the service reset path), the WOTS forgery becomes trivial, and it's exactly the same attack I later turned into the live-exploit script - except I wanted to work from the *service semantics* (rollback, root retrieval, deploy gating) rather than from the toy signer's internals. That first version never left my sandbox because I kept stalling on the containment rule (below) before getting any forged signature accepted by the `verify` function in the same file. I ported the leftover signatures into the online solver only after confirming they were closer to arbitrary-string targets than random `maintenance-build-*` firmwares.

## Server recon and the containment rule

The live service is a HTTPS API. In its default state, `GET /root` returns the Merkle tree root; `POST /sign` signs a firmware string; `POST /deploy` accepts a firmware plus signature. The flattened digit format that every endpoint agrees on (from `digits` in `exploit.py` and `msg_digits` in `lms.py`) has `LEN = 64 + 3 = 67` entries, and the `deploy` check ultimately reduces to querying memberships of the form "is a signature from a prior firmware a valid suffix chain for the target firmware?" For H7CTF 2026's service my answer was: not exactly - the practical containment rule is per-digit tiered, `sd[k] <= want` for each digit `k`:

```python
choices = [(sd[k], sig["wots"][k]) for sd, sig in samples if sd[k] <= want]
```

if a target digit `want[k]` is less than every previously-seen sample's digit at that position, no chain can reach it, so a target firmware is forgeable only if **every digit index k has at least one prior sample whose digit is less than or equal to want[k]** - practically guaranteed by the second half of the sequence (digits are 0-15 and the checksum varies).

## Forging

The collection phase signs 160 reset-and-sign rounds (each `POST /rollback` bumps the counter back so the next signature is leaf 0 again):

```python
for i in range(160):
    post("/rollback", {})
    fw = "maintenance-build-%03d" % i
    samples.append((digits(fw), post("/sign", {"firmware": fw})["sig"]))
```

Then for a random target `BACKDOOR-<20 alnum>`, each digit picks the closest prior sample digit, and the WOTS chain is extended forward until it matches:

```python
have, val = max(choices, key=lambda x: x[0])
forged.append(chain(bytes.fromhex(val), want - have).hex())
sig = {"leaf": 0, "wots": forged, "path": samples[0][1]["path"]}
```

Because `sig["leaf"]` is 0 and the auth path indexes are derived from `sig["leaf"]`, every sample's `path` is the same, so `samples[0][1]["path"]` is valid for any forged signature leaf 0. The signature verifies against the true root, and `/deploy` accepts.

## Takeaways

- No math weakness anywhere in the primitives; SHA-256 chains and a Merkle root are nailed shut.
- The Merkle auth path stays valid forever for a given leaf index, so reusing leaf 0 makes signature forgery only need *enough samples* (I aimed for 160; the Winternitz checksum over randomized 20-char aliment targets is what kept it tractable).
- The containment rule (target digits must be reachable by chaining forward) is what makes the forge possible at all: had the service only signed values "in the past" of the target, no chain would reach it.

## Flag

Flag: not recovered in the writeup. No flag string appears in `lms.py` or `exploit.py`; the deploy response was not persisted in these files.
