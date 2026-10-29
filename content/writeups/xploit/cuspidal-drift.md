---
title: "Cuspidal Drift"
description: "A custom \"elliptic curve\" cryptosystem with a = 0, b = 0 — the curve is"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-2/crypto/cuspidal-drift/writeup.md"
---

A custom "elliptic curve" cryptosystem with `a = 0`, `b = 0` — the curve is

```
y² = x³
```

which is singular. Singular curves are not elliptic curves at all: the point group degenerates into either the additive group of the field (a cusp) or the multiplicative group (a node). Here the singularity is a **cusp**, and the group law collapses to something the attacker can invert directly.

## Files

- `README.md` — parameters and ciphertext format
- `output.txt` — `p`, `a`, `b`, `G`, `Q = d·G`, encrypted ciphertext
- `solve.py`, `solve_2.py`

## Analysis

For `y² = x³` over `F_p`, the standard birational map to the multiplicative/additive group uses the ratio `t = x / y` (equivalently `x/y` depending on the chart). The map is a group isomorphism, so the discrete log `Q = d·G` becomes a **single modular division**:

```
t_G = Gx * Gy^-1 mod p
t_Q = Qx * Qy^-1 mod p
d   = t_Q * t_G^-1 mod p
```

No Pollard rho, no BSGS — the "hard" ECDLP evaporates because the curve isn't actually an elliptic curve.

The second script (`solve_2.py`) does the same thing from the singularity side: compute the double root and single root of `x³`, shift the curve, and map points through the node/cusp isomorphism before taking a discrete log in the target group.

## Decryption

The recovered scalar `d` is hashed and used as a repeating XOR key:

```python
import hashlib

d = (t_Q * pow(t_G, -1, p)) % p
key = hashlib.sha256(str(d).encode()).digest()
ct = bytes.fromhex(ciphertext_hex)

flag = bytes(b ^ key[i % len(key)] for i, b in enumerate(ct))
print(flag.decode())
```

## Takeaway

`4a³ + 27b² mod p == 0` must be checked when generating curve parameters. A singular curve has a small, invertible group structure regardless of the field size, so any scheme built on it is broken by construction.

## Flag

Flag: not recovered in the writeup.
