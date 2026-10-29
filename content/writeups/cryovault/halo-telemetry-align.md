---
title: "Halo Telemetry Align"
description: "Requesting the endpoint returns a single ASCII bit:"
event: "cryovault"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CryoVault Finals 2026","web"]
date: "2026-10-26"
teammate: false
source: "cryovault/web/7/writeup.md"
---

**Challenge:** A telemetry alignment oracle  
**Target:** `https://isfcrpesu-halo.chals.io`  
**Flag format:** `isfcr{...}`

**Flag:**

```text
isfcr{n0isy_pr3f1x_0r4cl3_d3c0y_h4l0}
```

---

## 1. Reconnaissance

The root page describes a single endpoint:

```text
halo telemetry align
---------------------
GET /align?seq=<string> -> one bit: is <seq> a prefix of the live seal?
The channel is noisy, and planted seals read warm too. Recover the seal.
flag format: isfcr{...}
```

Requesting the endpoint returns a single ASCII bit:

```bash
$ curl 'https://isfcrpesu-halo.chals.io/align?seq=i'
1
```

The answer changes between requests, so this is not a deterministic prefix oracle. Repeatedly querying the same string reveals the noise rate.

For the known flag prefix `isfcr{`:

```text
isfcr{  ->  98 ones / 120 queries  = 0.817
```

For random strings:

```text
ktoupzpum  ->  30 / 100 = 0.30
gpvbhjsoa  ->  30 / 100 = 0.30
bfuaptpbv  ->  22 / 100 = 0.22
txhdqsxdk  ->  35 / 100 = 0.35
zzzzzzzz   ->  26 / 100 = 0.26
```

So the channel has a significant false-positive rate: even a completely wrong string reads `1` roughly 25–35% of the time.

## 2. Finding the planted seals

Walking the prefix character by character, the first branch appeared at `isfcr{n`:

- `isfcr{n0` was clearly positive.
- At the next position, **both** `i` and `t` read positive:

```text
isfcr{n0i   99 / 120 = 0.825
isfcr{n0t   83 / 120 = 0.692
```

Sampling both branches more heavily made the distinction clear:

```text
isfcr{n0i   199 / 250 = 0.796
isfcr{n0is  193 / 250 = 0.772
isfcr{n0t   163 / 250 = 0.652
isfcr{n0t_  162 / 250 = 0.648
isfcr{n0    200 / 250 = 0.800
isfcr{     198 / 250 = 0.792
```

This reveals the actual oracle model. There are three regimes:

| Query type | Approximate `P(response = 1)` |
|---|---:|
| Prefix of the **live** seal | **~0.80** |
| Prefix of a **planted/decoy** seal | **~0.65** |
| No matching seal | **~0.28** |

The planted seals are indeed "warm," but they are measurably cooler than the live seal. At a prefix shared by the live seal and a planted seal, such as `isfcr{n0`, the observed rate remains ~0.80, which is consistent with the live seal taking precedence.

This rate difference is the key: the oracle is not just a noisy yes/no membership test, it leaks **how strongly** a candidate matches.

## 3. Extraction strategy

Starting from the known prefix `isfcr{`, the live seal was recovered one character at a time.

For each position:

1. Query every candidate character from `a-z`, `0-9`, `_`, and `}` about 32 times.
2. Take the top candidates and resample them up to roughly 150 total observations.
3. Choose the candidate with the highest observed `1` rate.
4. Treat secondary candidates around 0.65 as planted-seal branches.
5. Stop when the chosen character is `}`.

With about 150 samples per final candidate:

- Standard error at `p = 0.80` is roughly `sqrt(0.8 * 0.2 / 150) ≈ 0.033`.
- The gap between the live rate (~0.80) and planted rate (~0.65) is therefore about 4–5 standard deviations.
- The gap to the background false-positive rate (~0.28) is even larger.

Several planted branches appeared along the way, each reading around 0.65 while the live path stayed near 0.80:

```text
isfcr{n0t_                          ~0.65   planted branch
isfcr{..._3_d                       ~0.75   live
isfcr{..._3_m                       ~0.68   planted
isfcr{..._3_t                       ~0.66   planted
isfcr{..._d3c0y_h                   ~0.86   live
isfcr{..._d3c0y_f                   ~0.68   planted
isfcr{..._d3c0y_h4l                 ~0.81   live
isfcr{..._d3c0y_h4z                 ~0.65   planted
isfcr{..._d3c0y_h4l0                ~0.77   live
isfcr{..._d3c0y_h4l1                ~0.64   planted
```

The recovered live path decodes from leetspeak as:

```text
n0isy_pr3f1x_0r4cl3_d3c0y_h4l0
noisy_prefix_oracle_decoy_halo
```

## 4. Verification

The full recovered string was queried repeatedly and compared against variants:

| Query | Ones / total | Rate |
|---|---:|---:|
| `isfcr{n0isy_pr3f1x_0r4cl3_d3c0y_h4l0}` | 161 / 200 | **0.805** |
| same string + `x` | 54 / 200 | 0.270 |
| same string without final `}` | 327 / 400 | 0.818 |
| same string + extra `}` | 51 / 200 | 0.255 |
| same string with final `0` changed to `O` | 65 / 200 | 0.325 |
| planted branch `isfcr{n0t_` | 129 / 200 | 0.645 |

The exact full flag stays at the live-seal rate (~0.80). Any extension or character change drops to the background rate (~0.27–0.33). This confirms both the contents and the termination at the closing brace.

## 5. Final flag

```text
isfcr{n0isy_pr3f1x_0r4cl3_d3c0y_h4l0}
```

---

## Appendix: Solver

The following is the core of the solver used for the live-seal extraction.

```python
import collections
import string
import time
from concurrent.futures import ThreadPoolExecutor

import requests

BASE = "https://isfcrpesu-halo.chals.io/align"
CHARSET = string.ascii_lowercase + string.digits + "_}"


def query(seq: str) -> str:
    for attempt in range(6):
        try:
            r = requests.get(BASE, params={"seq": seq}, timeout=10)
            if r.status_code == 200:
                return r.text.strip()
        except requests.RequestException:
            pass
        time.sleep(0.3 * (attempt + 1))
    raise RuntimeError(f"query failed for {seq!r}")


def sample(seq: str, n: int, workers: int = 15) -> collections.Counter:
    with ThreadPoolExecutor(max_workers=workers) as ex:
        bits = list(ex.map(lambda _: query(seq), range(n)))
    return collections.Counter(bits)


def rate(counter: collections.Counter) -> float:
    ones = counter.get("1", 0)
    total = sum(counter.values())
    return ones / total if total else 0.0


def main() -> None:
    prefix = "isfcr{"

    while not prefix.endswith("}"):
        scan = {ch: sample(prefix + ch, 32) for ch in CHARSET}

        ranked = sorted(
            CHARSET,
            key=lambda ch: rate(scan[ch]),
            reverse=True,
        )
        top = ranked[:6]

        refined = {}
        for ch in top:
            refined[ch] = scan[ch] + sample(prefix + ch, 120)

        best = max(top, key=lambda ch: rate(refined[ch]))
        best_rate = rate(refined[best])

        if best_rate < 0.62:
            raise SystemExit(f"no live continuation found at {prefix!r}")

        prefix += best
        print(f"{prefix!r:55} rate={best_rate:.3f}")

    print(f"FLAG: {prefix}")


if __name__ == "__main__":
    main()
```

### Notes

- Keep-alive HTTP sessions and moderate concurrency make sampling much faster.
- With a noisy channel, never trust a single query or a small majority vote; model the three rates and use enough samples to separate the live seal from the planted decoys.
- If the top two candidates are close, resample them further rather than committing early.
