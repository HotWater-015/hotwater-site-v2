---
title: "CryoVault Thaw Interlock (Firmware 4.3)"
description: "The vault thaws at a temperature of $2^{39}$. Four ordinary order requests can add less than $4\\cdot 2^{32}$, so they cannot reach that threshold. The maintenance override accepts a…"
event: "cryovault"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CryoVault Finals 2026","crypto"]
date: "2026-10-26"
teammate: false
source: "cryovault/crypto/9/writeup.md"
---

## Goal and constraints

The vault thaws at a temperature of $2^{39}$. Four ordinary `order` requests can add less than $4\cdot 2^{32}$, so they cannot reach that threshold. The maintenance `override` accepts a larger delta, but it requires a Schnorr signature under the session's P-256 seal point. The scalar behind that point is never sent directly.

The 4.2 source reveals a useful leak in `probe`. For a multiplier $a$, level $j$, and secret seal scalar $x$, it computes

$$
c(a,j)=\operatorname{SHA256}(\texttt{"cryovault/interlock/4.2/re-anchor"}\parallel j\parallel a)\bmod n,
\qquad
w=(ax-c(a,j))\bmod n.
$$

Here $j$ is one byte and $a$ is a 32-byte big-endian integer in the hash input.

It returns `FROST` when the centered representative of $w$ lies within $n/2^{j+1}$ of zero. The 4.3 release notes say that the anchor and tested band are unchanged. I used only the implication that a `FROST` reply supplies this interval constraint; the unreleased probe head did not have to behave exactly like 4.2 on `RIME` replies.

Level 9 costs one coolant unit and gives the narrowest interval. Let $B=n\mathbin{\gg}10$. A level-9 `FROST` at multiplier $a_i$ gives

$$
a_i x \equiv c_i+e_i\pmod n,\qquad -B<e_i<B,
$$

where $c_i=c(a_i,9)$. During live probing, `FROST` appeared roughly half as often as the simple 4.2 band would predict. Random probes alone were therefore a poor use of the 12,288-unit coolant budget.

## Making later probes informative

I first collected eight level-9 `FROST` replies at random multipliers $a_1,\ldots,a_8$. These give eight unknown, but bounded, errors $e_i$. For any small integer coefficients $k_i$, choose a new multiplier

$$
a=\sum_{i=1}^{8} k_i a_i\pmod n.
$$

Its unanchored product has a known approximate center:

$$
ax\equiv\sum_i k_i(c_i+e_i)\pmod n.
$$

The anchor $c(a,9)$ can be computed locally before sending the request. I generated many coefficient vectors offline and kept those whose predicted value was close to the anchor. This made a live `FROST` much more likely than it was for an independent random multiplier. Offline candidates cost no coolant.

To track the remaining uncertainty, set $y_i=e_i/B$, initially in $(-1,1)$. For a selected coefficient vector, choose the multiple of $n$ nearest the current prediction and write

$$
d=\sum_i k_i c_i-c(a,9)-qn.
$$

A `FROST` reply adds two linear inequalities:

$$
-1-\frac dB < \sum_i k_i y_i < 1-\frac dB.
$$

I ignored `RIME` replies. After several new `FROST` replies, linear programming minimized and maximized each $y_i$ over the accumulated inequalities. Those bounds gave a new center and width. As the widths shrank, I increased the coefficient size so that later probes continued to resolve the remaining error rather than repeating information already learned.

The [session client](live_base.py) collects the initial hits and sends requests in batches. The [adaptive probe script](adaptive_live.py) chooses the coefficient vectors and maintains the linear constraints.

## Recovering the scalar

In the successful session, the eight initial hits arrived after **5,760** probes, leaving **6,528** coolant units. Another **2,200** targeted probes produced **375** `FROST` replies. Linear programming reduced the largest error interval by about **23.63 bits** relative to its initial width. Each original congruence then located $a_i x\bmod n$ to roughly 33 bits, enough for eight congruences to identify the scalar.

For the final recovery I moved each original anchor to the center of its refined error interval, obtaining centers $C_i$, and used a scale $S\approx 1024/h$, where $h$ is the largest remaining half-width of the normalized errors. The lattice had rows

$$
(Sn,0,\ldots,0,0),\ldots,(0,\ldots,Sn,0),
\qquad (Sa_1,\ldots,Sa_8,1),
$$

with target $(SC_1,\ldots,SC_8,0)$. LLL, BKZ, and closest-vector search returned the scalar in the last coordinate. I accepted it only after checking that its P-256 public point equaled the session's advertised `seal`. The implementation is in [solve.py](solve.py).

The recovered scalar for the successful session was

```text
47588026688700503029701484438566288416155624736839417633871943328746351883488
```

## Signing the override

The signature rule in 4.2 is unchanged in 4.3. I set `delta` to $2^{39}=549755813888$, generated a fresh nonce $k$, and computed

$$
R=kG,\qquad
e=\operatorname{SHA256}(\texttt{"cryovault/interlock/4.2/override"}\parallel
\text{session}\parallel\text{seal}\parallel R\parallel\text{delta})\bmod n,
\qquad s=k+ex\pmod n.
$$

The hash input uses the 16-byte session ID, compressed 33-byte seal and $R$ points, and an 8-byte big-endian delta. The [signing script](sign.py) builds the request. It must be sent on the same connection: each new session has a different seal scalar. The vault accepted the override for session `4e9b4cfa407f15bb780fbc11f095e1d4` and replied with `"temperature":549755813888` and `"thawed":true`.

```text
isfcr{jzje2_fq93z2_saf4e_ww8dqs}
```
