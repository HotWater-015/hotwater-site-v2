---
title: "Q.E.D. — Prove the Impossible"
description: "We are given qedvm, a static Rust proof checker for a small intuitionistic propositional logic called QPL. The goal is to submit a module whose exported definition has formula bot…"
event: "cryovault"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CryoVault Finals 2026","rev"]
date: "2026-10-26"
teammate: false
source: "cryovault/rev/4/writeup.md"
---

## Challenge summary

We are given `qedvm`, a static Rust proof checker for a small intuitionistic
propositional logic called QPL. The goal is to submit a module whose exported
definition has formula `bot` (falsehood).

The logic itself is sound: there is no axiom and no constructor for `bot`.
The bug is in an optimization inside the checker: successful checks of large
`case` terms are memoized, and the cache key does not contain the full local
context. By priming the cache with a valid proof in one context and then
reusing the same term in a different context, the checker accepts an invalid
`case` term and therefore accepts `bot`.

Flag:

```text
isfcr{5h4p3_15_n07_c0n73n7_00799bea4d4f3d183abe0ee7}
```

## Environment

Files:

```text
qedvm         stripped static PIE Rust binary, the exact server checker
LANGUAGE.md   QPL reference
README.txt    usage notes
examples/     valid example modules
```

The examples are valid but export non-`bot` formulas, so they produce
`REJECT_TARGET`. Offline the nonce is not secret and can be set to any
32-hex string.

## Finding the checker

The binary is a stripped static-pie Rust executable. After loading it into
Ghidra/objdump, the relevant code is easy to locate:

- `0x166f0`: parse the whole module and run the checker
- `0x14400`: parse formulas
- `0x151a0`: parse terms
- `0x124b0`: the term checker, roughly
  `check(state, ctx, term_id, expected_formula_id)`
- `0x15ae0`: hash-cons/intern an AST node
- `0x13250`: hash a key for the `case` memoization table

The AST arenas are structurally interned:

- formula nodes use a 12-byte record
- term nodes use a 24-byte record
- each term has a size/score in a parallel array

The parser accepts all the documented syntax, and the ordinary rules
(`tt`, `var`, `ref`, `lam`, `app`, `pair`, `fst`, `snd`, `inl`, `inr`,
`case`, `abort`) are implemented in the checker.

## The bug: unsound `case` memoization

A `case` term is interned with tag `10`. In the checker, before performing the
normal `case` check, the engine looks at the term's precomputed size. If the
size is at least `0xb = 11`, it tries a memoization cache.

The cache key is built from, approximately:

```text
(has_context,
 context_first_formula,
 has_context,
 context_last_formula,
 term_id,
 expected_result_formula,
 context_length)
```

The important omission is that only the **first and last** formulas of the
local context are included. The assumptions in the middle of the context are
not part of the key.

The checker also inserts entries only after a successful check. On a cache
hit, it immediately returns success without checking the term again.

So the attack is:

1. Construct a large `case` term `U` that genuinely proves `bot` in a context
   such as `[top, bot, top]`.
2. Let the checker verify it once. This stores a cache entry for
   `(term_id(U), expected = bot, context length = 3, first = top, last = top)`.
3. Reuse the same interned term `U` in the context `[top, top, top]`.
   The middle assumption `bot` is gone, so `U` is no longer valid, but the
   cache key is identical because only the first and last assumptions and the
   context length matter.
4. The memoization lookup returns success, so the invalid `U` is accepted.

## Making `U` valid in `[top, bot, top]`

With the context `[top, bot, top]` (innermost assumption first), the de Bruijn
indices are:

```text
var 0 : top
var 1 : bot
var 2 : top
```

Define `U` as:

```lisp
(case bot top
  (inl (var 1))                         ; subject : bot or top
  (app bot (lam bot (var 0)) (var 0))   ; left branch, assumption bot
  (app bot (lam bot (var 0)) (var 2)))  ; right branch, assumption top, var 2 is bot
```

- The subject `(inl (var 1))` proves `bot or top`, since `var 1 : bot`.
- In the left branch the branch assumption is `bot`, so `(var 0)` proves
  `bot`. It is wrapped as an `app` to make the term large enough to trigger
  the cache (size at least 11).
- In the right branch the branch assumption is `top`, but the outer context
  still contains `bot` at index 2, so `(var 2)` proves `bot`.

Because `U` has size exactly 11, it uses the memoization path. Checking it in
the helper context stores the poisoned cache entry.

## Reaching a matching context at the top level

The final exported term must have formula `bot` in the empty context. We cannot
simply wrap `U` in lambdas, because that would change the exported formula to
an implication. Instead, build nested `case` terms that add `top` assumptions
one at a time.

Each level is:

```lisp
(case top top
  (inl tt)             ; subject : top or top
  BRANCH
  BRANCH)
```

The subject is always valid, and both branches are checked under an extended
context containing an extra `top`.

Starting from the empty context:

- level 0 is checked in `[]`
- its branches are checked in `[top]`
- level 1 branches are checked in `[top, top]`
- level 2 branches are checked in `[top, top, top]`

The innermost branch is the same interned term `U` from the helper. Its cache
key is now:

```text
term_id = U
expected = bot
context_length = 3
first = top
last = top
```

This exactly matches the entry created while validating the helper under
`[top, bot, top]`. Therefore the invalid `U` under `[top, top, top]` is
accepted from the cache, all enclosing `case` terms check, and the whole term
proves `bot` in the empty context.

Definitions are checked top to bottom, so the helper definition is placed
before the exploit definition. The exported definition is the exploit.

## Final module

Replace `NONCE` with the 32-hex nonce from the server banner.

```lisp
(module qed1 NONCE
 (def helper (imp top (imp bot (imp top bot)))
   (lam top (lam bot (lam top
     (case bot top (inl (var 1))
       (app bot (lam bot (var 0)) (var 0))
       (app bot (lam bot (var 0)) (var 2)))))))
 (def exploit bot
   (case top top (inl tt)
     (case top top (inl tt)
       (case top top (inl tt)
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2)))
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2))))
       (case top top (inl tt)
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2)))
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2)))))
     (case top top (inl tt)
       (case top top (inl tt)
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2)))
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2))))
       (case top top (inl tt)
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2)))
         (case bot top (inl (var 1))
           (app bot (lam bot (var 0)) (var 0))
           (app bot (lam bot (var 0)) (var 2)))))))
 (export exploit))
```

Offline test:

```sh
./qedvm --nonce 00000000000000000000000000000000 exploit.qed
# ACCEPT
```

Remote test:

```text
ACCEPT
isfcr{5h4p3_15_n07_c0n73n7_00799bea4d4f3d183abe0ee7}
```
