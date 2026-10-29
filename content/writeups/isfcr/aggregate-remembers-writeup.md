---
title: "The Aggregate Remembers"
description: "A federated linear regression model (16 features plus a bias term, every label equal to 1) was updated over many rounds. Each round mixed three clients with integer mix weights, and only…"
event: "isfcr"
category: "ml"
categoryLabel: "ML"
tags: ["ISFCR CTF 2026","ml"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/aggregate_remembers_writeup.md"
---

**Flag:** `isfcr{9b1aa6a53205a859c14cc5e4}`

**Answer submitted:**

```bash
python3 unlock.py '["07841f68cb73fe5aac5cbf66f113f992", "ff1247cd40f11a77f9495f7ba9648a20"]'
```

## Challenge summary

A federated linear regression model (16 features plus a bias term, every label equal to 1) was updated over many rounds. Each round mixed three clients with integer `mix` weights, and only the aggregated delta was published:

```
delta = -lr * (weighted_mean_gradient + weight_decay * weights)
```

with `lr = 1/8` and `weight_decay = 1/64`. The goal was to recover the two raw 16-byte records in the target client's batch (`6806bb153e`) from the `acquisition-A` cohort.

Features are built from raw bytes as `x[j] = (raw[permutation[j]] - center[j]) / scale[j]`, followed by a constant 1.

## Data

`data.json` contained:

- 6 checkpoints, each with a 17-dim weight vector
- 61 updates: 60 in `acquisition-A` (6 to 13 rounds per checkpoint) and 1 in `acquisition-B`, which I ignored
- Each update: a checkpoint id, 3 mix weights, and a 17-dim delta

## Approach

### 1. Undo the optimizer step

For each update, the weighted mean gradient is

```
g_mix = -delta / lr - weight_decay * w_checkpoint
```

### 2. Separate the clients

Within one checkpoint, the weights `w` are fixed, so each client's gradient `g_c` is fixed. Each round gives

```
g_mix = sum_c (mix_c / sum(mix)) * g_c
```

With 6 to 13 rounds of varying mixes per checkpoint, this is an overdetermined linear system with 3 unknown vectors. The system has full rank 3 and was solved by least squares.

- Using normalized mix weights, the residual was about 0.01 (the deltas carry a small amount of noise).
- Using raw, un-normalized weights, the residual was 28 to 57, so the mean is clearly normalized by the sum of mix weights.

This gives the target client's gradient at each of the 6 checkpoints.

### 3. Spot the rank-2 structure

For a client with batch `{x1, x2}` and mean squared error loss,

```
g(w) = 0.5 * sum_i (w . x_i - 1) * x_i
```

So every gradient lies in `span{x1, x2}`. The singular values of the 6 target gradients (stacked) were:

```
559.3, 52.8, 0.055, 0.036, 0.026, 0.019
```

Two large values followed by noise-level ones confirm a batch of exactly 2 examples.

### 4. Solve for the feature vectors

I fit `X` (2 x 17) by nonlinear least squares, minimizing

```
sum_k || g_k - 0.5 * (X w_k - 1)^T X ||^2
```

with a penalty pinning the last coordinate of each vector to 1. From 300 random starts, the best solutions all converged to the same cost (about 0.0029) and the same answer, up to swapping the two records.

### 5. Invert the preprocessing

For each feature `j`, set `raw[permutation[j]] = x[j] * scale[j] + center[j]`.

Every recovered byte was within about 0.2 of an integer, so rounding was unambiguous:

| Record | Raw bytes (before rounding, approx.) |
|---|---|
| 1 | 6.94, 132.03, 31.06, 103.96, 203.00, 115.07, 254.09, 89.99, 171.83, 92.02, 190.95, 101.99, 240.99, 18.99, 248.98, 146.05 |
| 2 | 254.95, 17.95, 70.98, 204.99, 63.99, 241.17, 26.10, 119.00, 248.92, 73.00, 94.94, 123.01, 169.09, 99.93, 138.04, 31.98 |

Rounded and hex-encoded, then ASCII-sorted:

```json
["07841f68cb73fe5aac5cbf66f113f992", "ff1247cd40f11a77f9495f7ba9648a20"]
```

## Result

`unlock.py` accepted the answer and printed `isfcr{9b1aa6a53205a859c14cc5e4}`.

## Takeaways

- Publishing only aggregates does not protect small batches. Once the mixing weights and checkpoints are known, per-client gradients can be separated by linear algebra.
- A gradient from a batch of `n` examples lives in an `n`-dimensional subspace. A clean rank drop in the singular values reveals the batch size, and with the loss form and labels known, the examples can be reconstructed.
- Noise on the deltas (about 0.01 here) was too small to matter. Rounding to the byte grid removed it entirely.
