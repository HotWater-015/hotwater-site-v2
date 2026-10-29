---
title: "Boneh-Durfee"
description: "A small-private-exponent RSA challenge placed just beyond Wiener's bound, so continued fractions alone fail. The private exponent is small enough for the Boneh-Durfee lattice attack…"
event: "xploit"
category: "crypto"
categoryLabel: "Crypto"
tags: ["XploitX 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/crypto/Boneh/writeup.md"
---

A small-private-exponent RSA challenge placed *just beyond* Wiener's bound, so continued fractions alone fail. The private exponent is small enough for the **Boneh-Durfee lattice attack** (bound ≈ `N^0.292`), which is what the supplied Sage script implements.

## Files

- `public.txt` — `N`, `e`, `c`
- `solve.sage`
- `README.md`

## Analysis

With `e·d - k·φ(N) = 1` and `φ(N) = N - p - q + 1`, write `A = N + 1` and `s = p + q`:

```
e·d - k·A ≡ -k·s (mod something small)
```

Boneh-Durfee builds a lattice from the bivariate polynomial

```
f(x, y) = x·(A + y) + 1    with small root (x, y) = (k, -s)
```

over the modulus `e`, using Coppersmith-style shifts up to a parameter `m` and extra `t` shifts. The script is a fairly faithful implementation including:

- `remove_unhelpful` pruning of the lattice basis (dimension reduction)
- unravelled linearisation with a monomial ordering
- `LLL` on the resulting integer matrix
- reconstructing two integer polynomials sharing the root, then resultant/GCD to extract `k` and `s`

Once `s = p + q` is known, factor `N` from `x² - s·x + N = 0`, compute `φ`, then `d = e⁻¹ mod φ` and decrypt.

## Effort

This is the "insane" tier for a reason: the lattice dimension needed to cross the `0.292` threshold is typically 30+ with careful parameter tuning (`m`, `t`, and the pruning strategy). Naïve `m` values either miss the root or explode the runtime. Expect minutes of LLL on a laptop for a well-tuned instance.

## Takeaway

Wiener's `N^0.25` is not the end of the line: Boneh-Durfee pushes small-`d` recovery to `N^0.292` via bivariate Coppersmith. Any `d` below roughly a third of the modulus size is considered unsafe. Standard key generation produces full-size `d` and sidesteps the whole family.

## Flag

Flag: not recovered in the writeup.
