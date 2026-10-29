---
title: "The Deletion Echo"
description: "A regression service claims a deletion request was fulfilled by exact retraining. We get:"
event: "isfcr"
category: "ml"
categoryLabel: "ML"
tags: ["ISFCR CTF 2026","ml"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/the_deletion_echo_writeup.md"
---

**Flag:** `isfcr{763c8479fac095a9e471ad3d}`

## Challenge

A regression service claims a deletion request was fulfilled by *exact retraining*. We get:

- `data.json` with a `contract`, 5 model `snapshots`, 140 `candidates` (raw feature vectors), 3 `ingest` batches (raw vectors, no labels), and 1200 oracle `queries` (240 per snapshot) returning `mean` and `predictive_variance`.
- `unlock.py`, which decrypts the flag if given the exact sorted list of `record-id:label` strings for every deleted record.

The model is ridge regression on features `x = (raw[perm] - center) / scale`, with no intercept:

```
H     = Σ x xᵀ + ridge·I
θ     = H⁻¹ Σ x y
mean  = qᵀθ                      (+ tiny noise)
var   = s² · (1 + qᵀ H⁻¹ q)      (× tiny noise)
```

`ridge` and `s²` are unpublished and differ per snapshot. Labels are integers in {0,1,2,3}.

## Key idea

The oracle leaks the model's sufficient statistics. Each snapshot's `H` and `b = Σ x y` can be recovered from its query outputs. Adding or removing a record changes `H` by `±x xᵀ` and `b` by `±x y`, so differences between snapshots expose which records were deleted and what their labels were.

## Step 1 — Recover `H` and `b` per snapshot

The predictive variance is linear in 79 unknowns:

```
var = s² + qᵀ (s² H⁻¹) q
```

So `a = s²` and `A = s² H⁻¹` (78 unique entries) come out of a weighted least-squares fit over 240 queries. Then `H = s² · A⁻¹`.

The means give `θ` by ordinary least squares on `mean = qᵀθ`, and `b = H θ`.

The fit residuals were about 1e-9, which is just the 12-significant-digit rounding, so the recovery is essentially exact. The recovered `s²` values were multiples of 1/64 (1.9375, 1.71875, 1.171875, 2.1875, 2.390625).

## Step 2 — Order the releases

For each ordered snapshot pair `(a → b)` and each ingest batch `B`, compute:

```
R = H_b − H_a − XBᵀ XB
```

If `B` was ingested between `a` and `b` and nothing was deleted, then `R = Δridge · I` (small, near-identity). If something was deleted, then `R = −Σ_del x xᵀ + Δridge · I`.

Scanning all pairs and batches gave this chain:

```
b5c2 ──+5798d74d──▶ d170 / e21c ──+e0449f2a, −deletion──▶ 720a ──+578b7698──▶ 83c2
                     (stale redeploy: same data, different ridge)
```

Only the `d170/e21c → 720a` step (batch `ingest-e0449f2a`) has a large residual, so that release contains the deletion.

## Step 3 — Identify the deleted records

For that step:

```
Σ_del x xᵀ = −(H_720a − H_prev − XeᵀXe) + δ·I
```

Stack the upper-triangular entries of every candidate's `x xᵀ` as columns and solve a bounded least squares with `z ∈ [0,1]^140` and a free `δ`. The solution came out **integral** (max distance from an integer about 3e-5), selecting exactly **26** candidates. Both `d170` and `e21c` as predecessor gave the same set.

## Step 4 — Recover the labels

Differences in `b` across the same step satisfy:

```
b_720a − b_prev = Xeᵀ y_e − Xdᵀ y_d
```

**Sanity check on other batches.** For the batches with no deletion (`5798d74d`, `578b7698`) the batch labels solve directly by least squares and came out as clean integers in {0..3}. This confirms that `b` is recovered precisely enough.

**The deletion step.** Unknowns are 10 ingested labels plus 26 deleted labels (36 total) against 12 equations. Multiplying row `j` by `scale_j` makes the coefficient matrix `M` integer-valued, and the right-hand side is within about 0.005 of an integer. The search space is `4^36 ≈ 5e21` while the equations constrain roughly `(10^6)^12` distinct outcomes, so the in-range solution should be unique. This is a low-density subset-sum problem, which lattice reduction handles well.

Substitute `v = 2y − 3 ∈ {±1, ±3}`, giving `M v = t'` with `t' = 2t − 3·M·1`. Build a Kannan embedding lattice:

```
rows i = 1..36 : [ e_i | W·M[:,i] | 0 ]
target row     : [ 0   | W·t'     | K ]      (W = 1e4, K = 3)
```

The short vector `(v, 0…0, ±K)` appears after LLL + BKZ-20. Six reduced vectors had zero in the constraint block; **exactly one** had all `y = (v+3)/2` in {0,1,2,3}. The first 10 entries are the ingested labels and the last 26 are the deleted records' labels.

## Step 5 — Submit

Pair each deleted record id with its label, sort the strings as ASCII, and dump as JSON:

```json
["record-0730706150:0", "record-28c0bbf813:2", "record-2e6662ecc6:3", "record-3de105d25d:3", "record-3ee76f33c8:2", "record-46126dd779:0", "record-473e486afd:0", "record-49aa7c51a4:2", "record-507645d5d9:2", "record-58fad90382:2", "record-5bc7d8554c:1", "record-66f65f5026:0", "record-71fb3e266c:2", "record-7796490f27:1", "record-77a4509144:1", "record-8f4b4073f9:1", "record-90769aad7a:1", "record-978b124800:1", "record-9cddf7a4fb:0", "record-9cfdc74744:3", "record-b9e67b6811:2", "record-cf44aec78a:2", "record-cf4fee237a:0", "record-d32fd7d5d5:1", "record-ebfb2ad09e:0", "record-ee9e7ec4d8:1"]
```

```bash
python3 unlock.py '[...]'
# isfcr{763c8479fac095a9e471ad3d}
```

## Takeaways

- Variance outputs of a ridge model reveal `H`. Mean outputs reveal `θ`, so together they give `b`. That is the full sufficient statistic for the training set.
- "Exact retraining" removes the record's *contribution* but does not hide that it existed, because comparing before and after snapshots leaves a rank-one echo `−x xᵀ` and `−x y` per deleted record.
- Unknown per-snapshot ridge only shifts the diagonal, so it is easy to absorb as a free scalar `δ`.
- Integer labels turn the label recovery into a lattice problem that is easy at this size.

## Tooling

Python with `numpy`, `scipy.optimize.lsq_linear`, and `fpylll` (LLL/BKZ).
