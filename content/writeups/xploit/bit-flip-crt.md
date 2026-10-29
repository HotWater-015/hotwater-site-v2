---
title: "Bit Flip CRT"
description: "Two RSA-CRT signatures over the same message, with a hardware glitch flipping a single bit in one signature's computation modulo q. That's the textbook setup for the Bellcore fault…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit-2/crypto/bit-flip-2/writeup.md"
---

Two RSA-CRT signatures over the same message, with a hardware glitch flipping a single bit in one signature's computation modulo `q`. That's the textbook setup for the **Bellcore fault attack**: faulty and correct signatures share the same `p`, so their difference is a multiple of `p` but not `N` — one `gcd` with the modulus splits the key.

## Files

- `output.txt` — `N`, `e`, message, `sig_1`, `sig_2`, ciphertext
- `solve.py`

## Analysis

With CRT signing, `s = m^d mod N` is computed as `s_p = m^(d mod p-1) mod p` and `s_q = m^(d mod q-1) mod q`, then recombined. If a fault corrupts only one half — here one bit inside the `q` side computation — then:

- the faulty signature is still correct mod `p`
- it is wrong mod `q`

So `sig_1 - sig_2 ≡ 0 (mod p)` but not mod `q`. Therefore `gcd(|sig_1 - sig_2|, N) = p`, and `q = N // p`.

## Exploit

```python
import math

p = math.gcd(abs(sig_1 - sig_2), N)
q = N // p

# fallback: verify with the public exponent if the direct difference fails
if p in (1, N):
    p = math.gcd(pow(sig_1, e, N) - message, N)
    q = N // p

phi = (p - 1) * (q - 1)
d = pow(e, -1, phi)

m = pow(ciphertext, d, N)
print(m.to_bytes((m.bit_length() + 7) // 8, "big").decode())
```

The direct difference worked — one `math.gcd` and the modulus falls apart, then standard RSA decryption with the recovered `d`.

## Takeaway

CRT speeds up signing but turns any single-half fault into a complete key compromise: the fault leaks the factor through the shared component. Mandatory countermeasure in practice is to verify the signature with `e` before releasing it.

## Flag

Flag: not recovered in the writeup.
