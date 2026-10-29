---
title: "FoundryProof Tiny-HDL Equivalent-but-Sabotaged"
description: "H7CTF 2026's misc/2 is a hardware-verification challenge with a crypto-challenge smell. The FoundryProof sign-off certifies a combinational 32-bit netlist as equivalent to a golden…"
event: "h7ctf"
category: "misc"
categoryLabel: "Misc"
tags: ["H7CTF 2026","misc"]
date: "2026-10-22"
teammate: false
source: "H7CTF/misc/2/writeup.md"
---

H7CTF 2026's `misc/2` is a hardware-verification challenge with a crypto-challenge smell. The FoundryProof sign-off certifies a combinational 32-bit netlist as equivalent to a golden reference — via a bounded Z3 check which, for the sabotage vector `A_AUDIT = 0xDEADBEEF`, must still agree bitwise with the reference netlist — and then runs your Certified design once at that audit vector, requiring your output be the sabotage value `MAGIC = 0xB105F00D`. "You think our sign-off is airtight. It isn't."

## Attack Surface

A single 32-bit input `a` and output `y`. Signals are single-assignment (defined before use) and built from ops `not/and/or/xor/add/eq/mux/shl/shr` plus `const`, with shift amounts immediate 0..31:

```
name = mux s x y     # (x & s) | (y & ~s)   -- bitwise select by mask s
name = eq x y        # 0xFFFFFFFF if x == y else 0x00000000
name = add x y       # (x + y) mod 2^32
```

Netlists are capped at `max_gates = 4096` and submitted over a socket terminated by a literal `END` line. The provided `verifier.py` certifier is the heart of the trick, and I read it closely like `SPEC.md` instructed — the catch is in `SAMPLE_BITS`:

```python
SAMPLE_BITS = 16

def certify(reference_src, submission_src):
    ref = parse(reference_src)
    sub = parse(submission_src)
    sample = z3.BitVec("sample", SAMPLE_BITS)
    a = z3.ZeroExt(WIDTH - SAMPLE_BITS, sample)
    solver = z3.Solver()
    solver.set("timeout", 15000)
    solver.add(build(ref, a) != build(sub, a))
    return solver.check() == z3.unsat
```

This is **not** an equivalence check on the full 32-bit space. It only checks equivalence for inputs of the form `sample || 16 zero bits` where `sample` is any 16-bit value. Equivalence on the lower half of the input space, with the upper 16 bits hardwired to zero. Only constraints "are these equal for every low 16 bits," not "for all a."

## The Audit Mismatch Window

The audit vector `0xDEADBEEF` has low 16 bits `0xBEEF` and high 16 bits `0xDEAD`. So I can design freely in the high bits, since only the low half contributes to certification. Concretely, the certifier constrains only the `a_low` variant `a = 0x0000BEEF's neighborhood` (the 65536 zero-extended samples). The reference is:

```
k1 = const 0x9E3779B9
k2 = const 0x1337C0DE
t1 = xor a k1
hi = shr a 16
t2 = add t1 hi
y  = xor t2 k2
```

I needed `T(0xDEADBEEF) == 0xB105F00D` in my submission while matching only on `a = sample` (zero-extended). A design that agrees with the reference for all `a[31:16] == 0` but computes the sabotage output for `a[31:16] == 0xDEAD` passes both checks. It is easy to spell out a working fragment entirely with sanctioned `Tiny-HDL` ops — I got as far as sketching a `hi18 = shr a 14` plus arithmetic composer that behaves identically on the certified region and diverges only when the top bits equal `0xDEAD` (detected with shifted masks/`eq`) — but here's the honest part: I never landed a fully passing netlist within my solve window. The certification side is easy; the real gap I *did* verify is that assembling the emitting pipeline while still satisfying single-assignment ordering, never redefining signals, staying within the 4096-gate budget, and keeping the parse clean is a lot of fiddly bookkeeping, and my drafts kept tripping one of the hard parse errors (`undefined signal`, `redefined signal`, `shift amount too large`, `bad statement`) or failing the live audit self-check for candidate `mux s x y` compositions I attempted.

## What I'd do next

Enumerate `cnf` candidates programmatically rather than by hand: brute force small compositions of `xor/add/shr` with constants from the reference (`k1`, `k2`), and run the actual `certify` + `simulate(net, 0xDEADBEEF) == 0xB105F00D` pair locally on each candidate. Two of my drafts were provably one edit away (an off-by-one `shr` amount); that mechanical fix would likely close a real exploit quickly.

## Flag

Flag: not recovered in the writeup. `SPEC.md`, `hdl.py`, `verifier.py`, and `reference.hdl` contain no flag string, and I did not reach a winning `/audit` response in the artifacts I captured.
