---
title: "Toxic Waste"
description: "The challenge provides chall.py and output.json. A trusted setup samples a secret integer tau and builds a structured reference string (SRS) containing successive powers of the secret in…"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/toxic-waste.md"
---

**Category:** Cryptography  
**Flag:** `isfcr{ch30n_8f_th3_c0mpr3ss3d_srs}`

## Challenge description

> Trusted setup done, secret burned. We kept the two ends and binned the middle to save on disk.

The challenge provides `chall.py` and `output.json`. A trusted setup samples a secret integer `tau` and builds a structured reference string (SRS) containing successive powers of the secret in an order-`q` multiplicative subgroup of `GF(P)`. Instead of publishing the entire SRS, the system keeps only:

\[
A=g^{\tau}\pmod P,\qquad B=g^{\tau^d}\pmod P.
\]

The flag is encrypted with AES-256-GCM using `SHA256(str(tau))` as the key. Our goal is to recover `tau` from the two published endpoints.

## Inspecting the generator

The important lines in `chall.py` are:

```python
DBITS = 44
d = 1 << DBITS
q = d * m + 1                  # m and q are prime

tau = rng.randrange(2, q - 1)
A = pow(g, tau, P)
B = pow(g, pow(tau, d, q), P)

key = sha256(str(tau).encode()).digest()
cipher = AES.new(key, AES.MODE_GCM, nonce=b"toxic-waste-")
ct, tag = cipher.encrypt_and_digest(FLAG)
```

The instance in `output.json` has:

```text
q = 197421955852454159089401857
d = 17592186044416 = 2^44
m = (q - 1) / d = 11222138928841
q - 1 = 2^44 * 11222138928841
```

The key weakness is **not** the size of the prime field `P`; it is the special relationship **`d | (q - 1)`** and the simultaneous disclosure of both `g^tau` and `g^(tau^d)`.

## Vulnerability: Cheon's auxiliary-input discrete logarithm attack

A generic discrete-log attack in the subgroup would require about `sqrt(q)` work. Cheon's attack exploits the auxiliary value `g^(tau^d)` when `d` divides `q - 1`, reducing the workload to roughly

\[
O\!\left(\sqrt{(q-1)/d}+\sqrt d\right).
\]

Here both terms require only a few million steps:

- `sqrt(m)` is about 3.35 million.
- `sqrt(d) = 2^22` is about 4.19 million.

The attack works **in the order-`q` subgroup**, so it does not need to solve a conventional 88-bit discrete logarithm.

### Step 1: Recover an exponent modulo `m`

Let `omega` be a primitive root modulo `q`. Because `tau` is nonzero modulo `q`, we can write

\[
\tau\equiv\omega^x\pmod q.
\]

Then

\[
B=g^{\tau^d}=g^{(\omega^d)^x}\pmod P.
\]

Since `omega^d` has order `m` in `GF(q)*`, recover `x0 = x mod m` by a baby-step giant-step search for this *exponent-in-the-exponent* relationship.

For a search order `N`, define `s = ceil(sqrt(N))`. Precompute baby steps

\[
T_i=g^{h^i}\pmod P\qquad(0\leq i<s),
\]

and compare them with giant steps

\[
Y_j=B^{h^{-sj}}\pmod P,
\]

where `h = omega^d mod q` and exponents on `h` are reduced modulo `q`. A match `T_i = Y_j` gives `x0 = i + s*j (mod m)`.

### Step 2: Recover the remaining exponent modulo `d`

Write `x = x0 + m*k`. From the other endpoint,

\[
A=g^{\omega^{x_0+mk}}.
\]

Raise `A` to `omega^(-x0)` modulo `q`:

\[
A'=A^{\omega^{-x_0}}=g^{(\omega^m)^k}\pmod P.
\]

Now `omega^m` has order `d`, so apply the same search to `A'` to recover `k` modulo `d`.

Finally reconstruct

\[
\boxed{\tau=\omega^{x_0+mk}\bmod q}.
\]

## Reproducible exploit

Save the following as `solve.py` in the same directory as `output.json`.

**Requirements:** `pip install pycryptodome`. The two searches build tables with millions of entries, so allow substantial memory (potentially over 1 GB with Python dictionaries) and processing time.

```python
#!/usr/bin/env python3
import json
from hashlib import sha256
from math import isqrt
from Crypto.Cipher import AES

with open("output.json", "r") as f:
    data = json.load(f)

P, q, g, d = (data[k] for k in ("P", "q", "g", "d"))
m = (q - 1) // d
assert d * m == q - 1


def primitive_root_for_instance():
    # q - 1 = 2^44 * m, where m is prime.
    # Thus its only distinct prime divisors are 2 and m.
    for w in range(2, 1000):
        if pow(w, (q - 1) // 2, q) != 1 and \
           pow(w, (q - 1) // m, q) != 1:
            return w
    raise RuntimeError("No primitive root found in search range")


def special_bsgs(target, h, order):
    """Find x mod order such that target == g^(h^x) mod P.

    h has exact multiplicative order 'order' modulo q.
    """
    step = isqrt(order)
    if step * step < order:
        step += 1

    # Baby steps g^(h^i), i = 0, ..., step-1.
    table = {}
    exponent = 1
    for i in range(step):
        table.setdefault(pow(g, exponent, P), i)
        exponent = (exponent * h) % q

    # Giant steps target^(h^(-step*j)).
    jump = pow(pow(h, step, q), -1, q)
    multiplier = 1
    for j in range((order + step - 1) // step):
        value = pow(target, multiplier, P)
        if value in table:
            x = (j * step + table[value]) % order
            if pow(g, pow(h, x, q), P) == target:
                return x
        multiplier = multiplier * jump % q
    raise ValueError("No match")


omega = primitive_root_for_instance()
h1 = pow(omega, d, q)        # order m
x0 = special_bsgs(data["B"], h1, m)
print("x mod m:", x0)

adjustment = pow(omega, -x0, q)
adjusted_A = pow(data["A"], adjustment, P)
h2 = pow(omega, m, q)        # order d
k = special_bsgs(adjusted_A, h2, d)

x = x0 + m * k
tau = pow(omega, x, q)

assert pow(g, tau, P) == data["A"]
assert pow(g, pow(tau, d, q), P) == data["B"]

key = sha256(str(tau).encode()).digest()
cipher = AES.new(key, AES.MODE_GCM,
                 nonce=bytes.fromhex(data["flag_nonce"]))
flag = cipher.decrypt_and_verify(
    bytes.fromhex(data["flag_ct"]),
    bytes.fromhex(data["flag_tag"])
)

print("tau:", tau)
print("Flag:", flag.decode())
```

### Recovered secret

The two endpoint equations are satisfied by:

```text
tau = 53372121991905014611291611
```

For an immediate independent check, the recovered secret can also be inserted into this short verification/decryption script:

```python
import json
from hashlib import sha256
from Crypto.Cipher import AES

j = json.load(open("output.json"))
tau = 53372121991905014611291611
assert pow(j["g"], tau, j["P"]) == j["A"]
assert pow(j["g"], pow(tau, j["d"], j["q"]), j["P"]) == j["B"]
key = sha256(str(tau).encode()).digest()
c = AES.new(key, AES.MODE_GCM, nonce=bytes.fromhex(j["flag_nonce"]))
print(c.decrypt_and_verify(bytes.fromhex(j["flag_ct"]),
                           bytes.fromhex(j["flag_tag"])).decode())
```

The authentication tag also checks that the decrypted plaintext was produced with the correct AES key and nonce.

## Flag

```text
isfcr{ch30n_8f_th3_c0mpr3ss3d_srs}
```

## Takeaway

Discarding the middle of the SRS did not preserve the intended discrete-log security. The endpoints leaked related powers of the same toxic-waste secret, and the degree was deliberately chosen as a large divisor of `q - 1`. Cheon's auxiliary-input attack exploited that algebraic structure to recover the secret far faster than generic discrete logarithm would allow.
