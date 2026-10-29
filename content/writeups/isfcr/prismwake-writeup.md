---
title: "Prismwake"
description: "observations.json holds 6000 pairs (multiplier mᵢ, observation oᵢ) with"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/prismwake_writeup.md"
---

**Flag:** `isfcr{pr0j3ct1v3_sh4d0ws_c0nc34l_gr0up_l4w}`

## Challenge

`observations.json` holds 6000 pairs (multiplier mᵢ, observation oᵢ) with

    oᵢ = (A·x([mᵢ]K) + B) / (C·x([mᵢ]K) + D)   (mod p)

on `E: Y² = X³ + b` over F_p. The point K (order n) and the matrix (A,B;C,D) are secret.
The seal key is `SHA256("prismwake-v1\0" || x(K) || u || v || w)`, where
`x = (u·o + v)/(w·o + 1)` is the inverse Möbius map. The goal is to recover x(K), u, v, w.

## 1. Parameters

- p ≡ 2 (mod 3), so E is supersingular and #E(F_p) = p + 1 = 6n with n prime (~93 bits).
- Discrete log in the order-n group is out of reach (~2^46 work), so the attack must not need it.
- Key observation: if (u, v, w) were known, then x(K) is trivial. Lift x₀ = N(o₀) to a point P₀ and take K = m₀⁻¹·P₀.
- So everything reduces to recovering the three Möbius parameters.

## 2. Looking for structure in the multipliers

- No small-ratio relations (checked with lattice/Gauss reduction on all pairs).
- No 3-term relations mᵢ ± mⱼ = ±mₖ.
- No hidden small scalar, geometric, arithmetic or LCG pattern.
- **4-term relations exist.** Hashing all pairwise sums and differences ±(mᵢ ± mⱼ) gave 210 collisions. A random set would give ~10⁻¹³.
- The 210 collisions are 70 disjoint "parallelograms" mₐ + m_d = m_b + m_c, 3 relations each, covering 280 indices.

## 3. From relations to equations

For points P, Q with x-coordinates x₁, x₂ on `y² = x³ + b`, the values x(P+Q) and x(P−Q) are the roots of

    (x₁−x₂)²·T² − (2x₁x₂(x₁+x₂) + 4b)·T + ((x₁x₂)² − 4b(x₁+x₂)) = 0

A relation mᵢ ± mⱼ = ±(mₖ ± mₗ) means these quadratics for (i,j) and (k,l) share a root.
So their resultant vanishes: this is Semaev's S₄ condition.

Substitute xᵢ = (u·oᵢ + v)/(w·oᵢ + 1) and clear denominators. Each of the 70 quadruples gives one polynomial of degree 16 in (u, v, w). The formulas were sanity-checked on a synthetic key (resultant = 0 on true data).

## 4. Solving the system

- Gröbner basis over Z/p (Singular, `ring (integer, p)`).
- The raw system is positive-dimensional because of a degenerate component, the singular matrices with u = v·w, where all xᵢ coincide. Adding `t·(u − v·w) − 1` saturates it away.
- The result is zero-dimensional. A lex basis gives a quartic in w that factors as 1 + 1 + 2 over F_p, so there are two rational roots.
- Back-substituting gives two (u, v, w) candidates. Two solutions are expected, because translation by the rational 2-torsion point is itself a Möbius map of the x-line that preserves the relations.

## 5. Picking the right candidate and decrypting

- For each candidate, lift N(oᵢ) to a curve point and test [n]P = O. Only one candidate maps the observations into the order-n subgroup (the other lands in the 2-torsion coset).
- Compute K = m₀⁻¹·P₀ and verify x(mᵢK) = N(oᵢ) on further observations.
- Decrypt the ChaCha20-Poly1305 seal with `open_seal`.

## Recovered secrets

| value | |
|---|---|
| u | 34559716604220687612953322102 |
| v | 48772199007751653754816185446 |
| w | 22589791273467761145953217267 |
| x(K) | 32469388776030518256910525566 |

## Takeaway

The Möbius mask hides the x-coordinates, but planted additive relations among the multipliers expose the group law through low-degree polynomial constraints. No discrete log is needed, only a small Gröbner computation.
