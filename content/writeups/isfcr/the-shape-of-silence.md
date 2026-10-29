---
title: "The Shape of Silence"
description: "The archive the_shape_of_silence.zip contains:"
event: "isfcr"
category: "ml"
categoryLabel: "ML"
tags: ["ISFCR CTF 2026","ml"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/the-shape-of-silence.md"
---

**Category:** Machine Learning / Reverse Engineering  
**Flag:** `isfcr{577027585a0778773aa949d9}`

## Challenge description

> A black-box model returns exact rational outputs. Submit its outputs for the 24 inputs in `data.json` under `targets`, in order, as a JSON list of reduced rational strings (for example `"-87/64"` or `"26"`). Then run:
>
> ```bash
> python3 unlock.py '["...", "...", ...]'
> ```
>
> Flag format: `isfcr{...}`

## Provided files

The archive `the_shape_of_silence.zip` contains:

- `data.json`: model metadata, observations, anchors, and the 24 target inputs.
- `unlock.py`: validates an **exact ordered list** of outputs by attempting authenticated decryption.

Unpack the files:

```bash
unzip the_shape_of_silence.zip
```

## 1. Inspecting the dataset

The JSON describes a six-dimensional model (`dimension: 6`) with the current version identifier `v-8fb4ff`. It includes:

- `captures`: 22 capture records, consisting of 18 from `v-8fb4ff` and 4 from the older version `v-41e59d`;
- `anchors`: 16 input/output examples;
- `targets`: 24 six-dimensional inputs for which exact outputs are needed.

Each observation supplies its input coordinates as rational strings and its scalar output `y` as a rational string. The inputs and answers therefore need to be handled exactly, not with floating-point approximations.

A quick inspection script:

```python
import json
from collections import Counter

with open("data.json") as f:
    data = json.load(f)

print("dimension:", data["dimension"])
print("current version:", data["model_version"])
print("targets:", len(data["targets"]))
print("anchors:", len(data["anchors"]))
print("capture versions:", Counter(c["model_version"] for c in data["captures"]))
```

## 2. Recovering the response function

The critical insight is to use the *structure* of the captures rather than fitting an arbitrary high-degree polynomial to the anchor points.

The captures contain groups of nearby inputs and their outputs. For each group, changes in output across small changes in the six coordinates reveal a **local gradient**. With exact rational arithmetic, these changes can be compared without rounding errors.

A useful starting point is to filter out the observations for the obsolete model version:

```python
from fractions import Fraction

version = data["model_version"]
observations = [
    (tuple(map(Fraction, point["x"])), Fraction(point["y"]))
    for capture in data["captures"]
    if capture["model_version"] == version
    for cloud in capture["clouds"]
    for point in cloud
]
```

Within a region in which a piecewise-linear model has no change of activation pattern, differences satisfy

\[
    f(x+\Delta x)-f(x) = g\cdot\Delta x,
\]

where `g` is a constant local gradient vector. Solving these linear equations using `Fraction`-based Gaussian elimination reveals the local gradients. Comparing gradients across capture regions exposes discrete changes consistent with **nine piecewise-linear components**.

The general reconstruction strategy is:

1. Group observations by their capture clouds and retain only the current model version.
2. Solve for local gradient vectors using exact rational differences.
3. Compare the gradients to identify changes in the active piecewise-linear terms.
4. Use the anchor inputs/outputs to constrain the overall offset and the remaining unknown parameters.
5. Validate the resulting function on observations not used for fitting, then evaluate `targets` in their original order.

**Note:** This section documents the recovery strategy rather than claiming a complete parameter-recovery implementation; the independently executable part of this writeup is the final-output verification below.

## 3. Exact outputs for the 24 targets

The following list is in the same order as `data.json["targets"]`. Every value is a reduced rational string:

```json
[
  "5441/64",
  "909/32",
  "8939/64",
  "1055/32",
  "6041/64",
  "1305/64",
  "4173/32",
  "4559/64",
  "1597/16",
  "1309/64",
  "3015/32",
  "423/4",
  "2145/64",
  "9475/64",
  "26",
  "2777/64",
  "-1437/64",
  "2969/64",
  "983/16",
  "5471/64",
  "4163/64",
  "5835/64",
  "2971/64",
  "2007/64"
]
```

## 4. Unlocking and verifying the flag

The verifier serializes the ordered answer list as compact ASCII JSON, prefixes it with `b'isfcr-ml\0'`, and hashes it using SHA-256 to obtain a 32-byte AES key:

```python
enc = json.dumps(answer, ensure_ascii=True, separators=(',', ':')).encode('ascii')
key = hashlib.sha256(b'isfcr-ml\0' + enc).digest()
```

It then performs AES-GCM decryption of the sealed ciphertext. The authenticated tag makes the check sensitive to every character and to the ordering of all 24 outputs. An incorrect answer produces `Rejected.`

To test the recovered values without manually typing a long shell argument, save this as `solve.py` alongside `unlock.py`:

```python
from unlock import unlock

answers = [
    "5441/64", "909/32", "8939/64", "1055/32",
    "6041/64", "1305/64", "4173/32", "4559/64",
    "1597/16", "1309/64", "3015/32", "423/4",
    "2145/64", "9475/64", "26", "2777/64",
    "-1437/64", "2969/64", "983/16", "5471/64",
    "4163/64", "5835/64", "2971/64", "2007/64",
]

print(unlock(answers))
```

Run:

```bash
python3 solve.py
```

**Verified output:**

```text
isfcr{577027585a0778773aa949d9}
```

## Key takeaways

- The old model version is a distraction: use version-matched captures.
- Nearby samples expose local linear behavior that can be analyzed using finite differences.
- Exact rational arithmetic prevents numerical errors in gradient recovery and target evaluation.
- The flag is not stored in plaintext in the challenge files: the correct 24-element answer list is needed to derive the AES-GCM key.

## Flag

```text
isfcr{577027585a0778773aa949d9}
```
