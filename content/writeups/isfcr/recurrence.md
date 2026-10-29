---
title: "Recurrence"
description: "We are given a stripped 64-bit ELF binary chall. Running it:"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/recurrence.md"
---

> CTF reverse-engineering / crypto challenge
> **Flag:** `isfcr{p0hlig_h3llman_sm00th}`

We are given a stripped 64-bit ELF binary `chall`. Running it:

```
$ ./chall
need exactly 28 bytes of input
```

It wants **exactly 28 bytes**. Feeding 28 bytes returns `nope.` unless the input is the
correct one — the flag *is* the 28-byte input itself.

---

## 1. Reverse engineering

The binary is small enough to fully disassemble with `objdump -d`. Only a few functions
exist (plus glibc PLT stubs): the `main` at `0x4003c0`, and three helpers:

| Address   | Purpose                                                            |
|-----------|--------------------------------------------------------------------|
| `0x4007c0`| 256-bit modular **addition**: `C = (A + B) mod D` (with reduction) |
| `0x4008f0`| 256-bit modular **subtraction**: `C = (A − B) mod D`               |
| `0x400860`| 256-bit modular **multiplication**: `C = (P · A) mod D` via a bit-ladder that doubles / conditionally adds |

`main` is:

```
fread(stdin, 1, 28, buf)            ; read exactly 28 bytes into %rsp
if (rax != 28) die("need exactly 28 bytes of input")

; pack the 28 bytes into a 224-bit little-endian integer e
; (opening 4 qwords at rsp+0x20)

; state:
X0 = 2                             ; constant 0x401340  (k = 2)
Y0 = b                             ; constant 0x401300  (32 bytes)
bd = b                             ; "b" used in recurrences (0x401300)

; process bits from the highest SET bit down to bit 0
for bit = (bitlen(e)-1) downto 0:
    if bit of e == 0:  (X, Y) = (X*X - k,        X*Y - b)  mod D
    else:              (X, Y) = (X*Y - b,        Y*Y - k)  mod D

; success iff final X equals the target T at 0x4012e0
if (X[0..1] == 0xbb759965f1103100, 0x93fbd3872fadce56
 and X[2..3] == 0x87f2de8e6703998b, 0x0049e8add02e2a5b): CORRECT
else: nope.
```

Constants extracted from `.rodata` (all little-endian):

```
D = 0x0073aa13eee2ef5192e0fec9e2b046673f8e807ef0b6953c6ebab1bfc24cde17   (modulus, p)
b = 0x002e4407f92792ed6df3991d8de01c294c9f66992d15d54b5f7de0b31a8525a8   (Y0 / ladder constant)
T = 0x0049e8add02e2a5b87f2de8e6703998b93fbd3872fadce56bb759965f1103100   (target X)
k = 2
```

---

## 2. Finding the structure

The pair of recurrences with `k = 2`

```
bit 0:  (X, Y) → (X² − 2,  X·Y − b)
bit 1:  (X, Y) → (X·Y − b, Y² − 2)
```

is exactly the **Lucas-sequence / Chebyshev doubling formula**. With
`V_n(w) = wⁿ + w⁻ⁿ`, the identities

```
V₂ₙ = Vₙ² − 2
Vₘ₊ₙ = VₘVₙ − Vₘ₋ₙ
```

mean that if the state is `(X, Y) = (V_m, V_n)` with a fixed difference `|m − n| = d`,
then

```
bit 0:  (V_m, Vₙ) → (V₂ₘ, Vₘ₊ₙ)
bit 1:  (V_m, Vₙ) → (Vₘ₊ₙ, V₂ₙ)
```

so the index gap `d` is preserved. Because `Y inside the ladder is exactly b`, we have
`b = V_d`. Starting from `X0 = V_0 = 2`, the exponent ladder on the first component is

```
m ← 2m + d·bit
```

so after processing the input integer `e` (from its top set bit down to bit 0),
`m_final = d·e`. Since `b = V_1` here, the final state's first component is

```
X_final = V_e(b)  mod D          (i.e.  V_{d·e} = C_e(b))
```

Verification: implementing the exact ladder from the disassembly and comparing with a
fast Lucas computation for random inputs matches perfectly.

So the problem reduces to:

```
find e < 2²²⁴  such that  V_e(b) ≡ T  (mod p)
```

---

## 3. Discrete logarithm

`V_e(b) = zᵉ + z⁻ᵉ` where `z + z⁻¹ = b`, i.e. `z` is a root of `x² − bx + 1`.

Let `γ = zᵉ`. Then `γ + γ⁻¹ = T`, so `γ` is a root of `x² − Tx + 1`.

Computing in `F_p`:

```
b² − 4 ≡ 0 (mod p)   -> is a quadratic residue  ->  z ∈ F_p
T² − 4 ≡ 0 (mod p)   -> is a quadratic residue  ->  γ ∈ F_p
```

(Notably solving the first quadratic gives `z = 5⁻¹ mod p`, so the whole scheme is just
the Lucas sequence over the base `5 + 5⁻¹`.)

The discrete log is easy because **p − 1 is fully smooth**:

```
p − 1 = 2 · 997 · 1399 · 1931 · 2297 · 4003 · 5701 · 7103 · 10211
       · 12799 · 14551 · 46229 · 47279 · 48271 · 51263 · 52937
       · 53923 · 58771 · 59051
```

(max prime factor ≈ 59051). A **Pohlig–Hellman** discrete log (via `sympy.discrete_log`)
gives

```
e = 13207006284361456903106593959418730498679199957338452512214440375145
```

which is 223 bits — it fits in 28 bytes. Verify:

```
V_e(b) ≡ zᵉ + z⁻ᵉ ≡ T (mod p)   ✓
```

---

## 4. Flag

Encoding `e` as a 28-byte little-endian integer gives the input, which the binary
accepts:

```
$ python3 - <<'EOF'
e = 13207006284361456903106593959418730498679199957338452512214440375145
open('flag_input','wb').write(e.to_bytes(28,'little'))
EOF
$ ./chall < flag_input
CORRECT -- the flag is the input you just gave me.
```

```
flag: isfcr{p0hlig_h3llman_sm00th}
```

(hex: `69736663727b7030686c69675f68336c6c6d616e5f736d303074687d`)
