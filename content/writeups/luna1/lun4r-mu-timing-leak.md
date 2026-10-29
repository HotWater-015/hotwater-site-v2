---
title: "LUN4R-MU Timing Leak"
description: "The moonchace hardware challenge exposes a tiny VM (\"LUN4R-MU\") over TCP (103.49.131.90:31337) whose debugger accepts load $rN , load $rN 0($r0), batch … end, reset, and quit commands,…"
event: "luna1"
category: "hardware"
categoryLabel: "Hardware"
tags: ["Luna CTF 2026","hardware"]
date: "2026-10-22"
teammate: false
source: "luna1/hardware/moonchace/writeup.md"
---

## Summary

The `moonchace` hardware challenge exposes a tiny VM ("LUN4R-MU") over TCP (`103.49.131.90:31337`) whose debugger accepts `load $rN <imm>`, `load $rN 0($r0)`, `batch … end`, `reset`, and `quit` commands, echoing per-operation execution times in nanoseconds. Loading an address inside the protected range `0xA1–0xFF` silently speculatively caches a value; a subsequent `load` of a byte candidate then runs fast (≈20 ns) if the candidate equals the cached byte and slow (≈40 ns) otherwise. Two solver scripts implement a Flush+Reload-style byte oracle against that protected memory and recover its ASCII contents NUL-terminated into `flag.txt`.

## Files

- `sol.py` — compact single-shot oraper, 4 attempts per byte.
- `solve_lunar.py` — hardened version with a candidate alphabet, vote counting, and rerun hints.
- `flag.txt` — the recovered secret, captured output of the runs below.

## Analysis

### The oracle

`sol.py`'s `leak_byte` issues one connection containing, per candidate `c`:

```text
reset
batch
load $r0 0xA1          # protected victim address ( enumeration starts at 0xA1)
load $r1 0($r0)
end
batch
load $r2 <c>
end
```

for every `c` in `[0, 32..126]`, then `quit`. Every candidate therefore has two echoed timings; `[index*2+1]` is the probe timing. Since a *cached* probe completes in ~20 ns and an uncached one in ~40 ns, the script flags each candidate whose probe timing is `< 32` ns. Exactly one candidate hits, because only the value that maps to the speculatively-cached byte finds its location warm. Sibling value loads with a shared line make false positives possible, so `leak_byte` retries up to 4 times and requires that at most one candidate matched, raising otherwise for manual investigation.

### Hardening in `solve_lunar.py`

The second solver trims and stabilizes the attack:

- The candidate set is reordered to a realistic flag alphabet, `Lun4C{}abcdefghijklmnopqrstuvwxyz_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ` plus printable ASCII, deduped with `dict.fromkeys`.
- Per address it runs up to 9 independent `--votes` rounds, tuples `(candidate, timing)`, and accepts a hard `timing < 32` single-hit; on ambiguity, it falls back to the global minimum if that is `< 35`.
- `Counter(...).most_common(1)` majority-votes the byte, and anything weaker than `--min-majority 3` prints a rerun suggestion (`--start 0x<addr> --votes 15`).
- The outer loop scans from `--start 0xA1` to `0x100`, appending bytes until a `0` terminator or the closing `}` (which also stops early via `ord("}")`).

## Exploit

Both drivers stream the same protocol shape; a full run is a single connection of hundreds of command lines, well under the 15-second response timeout. The recovered secret in `flag.txt` is:

```text
Lun4R{c0sm1c_b4rr13rs_br0k3n_4nd_h4v0k_s3cur3d}
```

## Flag

```text
Lun4R{c0sm1c_b4rr13rs_br0k3n_4nd_h4v0k_s3cur3d}
```

Note this is the byte-level secret leaked from addresses `0xA1–0xFF`, which the solver wrote to `flag.txt` on success.
