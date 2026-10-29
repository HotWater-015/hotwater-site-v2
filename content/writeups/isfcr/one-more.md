---
title: "one-more — Blind Schnorr \"one-more\" forgery via ROS"
description: "server.py is a blind Schnorr signing service over secp256k1. On connect it sends its public key for that connection:"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/one-more.md"
---

**Target:** `wss://one-more.isfcr.xyz`
**Category:** crypto
**Flag:** `isfcr{r0s_1s_n0t_h4rd_f0r_l0g_p}`

## The service

`server.py` is a blind Schnorr signing service over secp256k1. On connect it
sends its public key for that connection:

```
X <128 hex>            # X = x*G, fresh per connection
```

Commands (one per WebSocket message):

| command          | reply                                  |
|------------------|----------------------------------------|
| `open`           | `id <k> R <128 hex>` where `R = r*G`, fresh random `r` |
| `sign <k> <c>`   | `s <int>` where `s = (r + c*x) mod n`  |
| `submit`         | then one JSON line `[[msg_hex, Rx, Ry, s], ...]` |
| `quit`           |                                        |

A signature `(R, s)` on message `m` is **valid** iff

```
s*G == R + H(R, m)*X,     H(R,m) = SHA256(x||y||m) mod n
```

`sign` removes the session, so each `open` yields exactly **one** signature —
and the challenge `c` is chosen entirely by the client. The win condition:

```python
out = [f"valid {good} answered {self.answered}"]
if good > self.answered:
    out.append(f"one more! {self.flag}")
```

So: hand back **more** valid signatures on **distinct** messages than the number
of challenges answered. Limits: `MAX_SESSIONS = 512`, `MAX_SUBMIT = 600`,
`MAX_CONCURRENT = 512`, `CONN_TIMEOUT = 1800`.

## Why it's breakable

The signer reveals its nonce commitment `R_i = r_i*G` *before* the client picks
the challenge `c_i`. That is exactly the concurrent blind-Schnorr setting, whose
"one-more unforgeability" reduces to the **ROS problem** (*Random inhomogeneities
in an Overdetermined Solvable system of linear equations*):

> Find affine functions `ρ_0,…,ρ_ℓ` and a vector `c = (c_0,…,c_{ℓ-1})` with
> `H_ros(ρ_i, aux_i) = ρ_i(c)` for all `i`, where `H_ros(ρ_i,aux) = H(Σ_j ρ_{i,j} R_j, m_i)`.

Benhamouda–Lepoint–Loss–Orsini–Raykova (2021) gave a **polynomial-time** ROS
solver whenever `ℓ > log2(p)`. Here `p ≈ 2^256`, and the service allows 512
sessions, so `ℓ = 260 > 256` is comfortably enough. (This is what the source
comment "ref attack ~220s over WAN" is hinting at.)

### The polynomial ROS attack

For `i = 0..ℓ-1` use the affine functions `ρ_i(x) = x_i` (i.e. the session itself).
Query two messages per session to obtain `c_i^0 = H(R_i, m_i^0)` and
`c_i^1 = H(R_i, m_i^1)`. Then define the linear functions

```
x_i' = (x_i - c_i^0) / (c_i^1 - c_i^0)          (so x_i'(c_i^b) = b)
ρ_ℓ = Σ_{i=0}^{ℓ-1} 2^i · x_i'
```

Query `c_ℓ = H(R_ℓ, m_ℓ)` where `R_ℓ = Σ a_{ℓ,i} R_i + βX` corresponds to `ρ_ℓ`
(`a_{ℓ,i} = 2^i/(c_i^1-c_i^0)`, `β = Σ 2^i c_i^0/(c_i^1-c_i^0)`). Because `2^ℓ > n`,
write `c_ℓ` in binary `c_ℓ = Σ 2^i b_i` and answer every session `i` with the
challenge `c_i = c_i^{b_i}`. Then

```
ρ_ℓ(c) = Σ 2^i·(c_i^{b_i}-c_i^0)/(c_i^1-c_i^0) = Σ 2^i b_i = c_ℓ = H(R_ℓ, m_ℓ)
```

so the combination `(R_ℓ, s_ℓ = Σ a_{ℓ,i} s_i)` is a valid signature on `m_ℓ`.
Together with the `ℓ` direct signatures we get `ℓ+1` signatures from `ℓ`
answers. `H` is computed exactly as the server does (`ser(P) = x32||y32`).

### Turning it into signatures

* For session `i`: `(R_i, s_i)` verifies on `m_i^{b_i}` because we sent
  `c_i^{b_i} = H(R_i, m_i^{b_i})`.
* The extra one: `R_ℓ = Σ a_{ℓ,i} R_i + βX`, `s_ℓ = Σ a_{ℓ,i} s_i`.
  Since `s_i = r_i + c_i x`,

  ```
  s_ℓ·G = Σ a_{ℓ,i} R_i + (Σ a_{ℓ,i} c_i)·X
        = (Σ a_{ℓ,i} R_i + βX) + (Σ a_{ℓ,i} c_i - β)·X
        = R_ℓ + ρ_ℓ(c)·X = R_ℓ + H(R_ℓ, m_ℓ)·X
  ```

Command budget: `260 opens + 260 signs + submit + json = 522 < 1088`, and
`261 <= MAX_SUBMIT`.

## Exploit

`ros_exploit.py` (run with a venv that has `websockets` + `ecdsa`):

```bash
python3 -m venv venv && ./venv/bin/pip install websockets ecdsa
./venv/bin/python ros_exploit.py wss://one-more.isfcr.xyz 260
```

It opens `ℓ` sessions, builds the ROS instance, sends the `ℓ` chosen challenges,
assembles `ℓ+1` signatures (after verifying them locally), and submits them.

Output:

```
[*] got pubkey, opening 260 sessions
[*] sessions open; building ROS instance
[*] target cL has 123 one-bits; signing 260 sessions
[*] 261 locally-valid signatures; submitting
[+] valid 261 answered 260
[+] one more! isfcr{r0s_1s_n0t_h4rd_f0r_l0g_p}
```

## Fix

Use a modified/dual ROS-resistant blind-Schnorr protocol (e.g. Fuchsbauer et al.
"Clause" scheme, or Fuchsbauer–Wolf), or cap concurrency below `log2(p)` — with
fewer than ~257 concurrent sessions the polynomial ROS solver no longer applies
and only Wagner's sub-exponential attack remains.
