---
title: "Neve"
description: "Neve (ISFCR CTF 2026) is a noisy-channel statistical inference challenge against the SHARD-24's NEVE sounding head: you hand it symbols 0–15 and it answers with a single biased bit, the…"
event: "isfcr"
category: "crypto"
categoryLabel: "Crypto"
tags: ["ISFCR CTF 2026","crypto"]
date: "2026-10-22"
teammate: false
source: "isfcr/writeups/neve.md"
---

Neve (ISFCR CTF 2026) is a noisy-channel statistical inference challenge against the SHARD-24's NEVE sounding head: you hand it symbols 0–15 and it answers with a single biased bit, the bias being a per-cell calibration grade that you must infer. The deliverable in the field challenge is the AES-256-GCM recovery bundle, whose key is just HKDF-SHA256 over all 512 grades — so the whole exploit reduces to reconstructing the calibration table within a fixed sounding budget.

## The Setup

The head has a 32-row by 16-cell table, every cell holding a grade 0–7. Each grade is a flip probability:

```text
p = 0.18 + 0.64 * g / 7
```

so grades 0 and 7 are near-0.18 and near-0.82 behaviors, and the middle grades are softer. Rows are chained: row 1 is open from the start, and a row opens only once the row before it is CHECKPOINT-confirmed. A wrong checkpoint costs 4,096 of the 1,250,000 budget.

## The Bench Model

`neve_bench.py` implements firmware NV-3.4.2 as a local stand-in for the field head, and doubles as the client (`Link`). The sounding rule in `BenchSession.sound` is the actual leak channel:

```python
def draw(self, t):
    return int.from_bytes(hashlib.sha256(self.coin_key + t.to_bytes(8, "big")).digest()[:4], "big")

def sound(self, row, syms):
    thr = [GRADE_T[g] for g in self.rows[row - 1]]
    out = []
    for b in syms:
        if self.draw(self.t) < thr[(b - self.prev) & 15]:
            self.bit ^= 1
        self.prev = b
        out.append("1" if self.bit else "0")
        self.t += 1
```

Two details matter. First, a fresh pseudo-random draw is used per symbol, but the comparison threshold is indexed by `(b - self.prev) & 15` — the expected outcome depends on the **difference between consecutive symbols**, not the symbol alone. Second, the bit only toggles when the draw lands below the threshold, so one can read grade information as a per-transition flip rate rather than an absolute value.

## The Recovery Bundle

From the challenge README:

```text
bundle = nonce (12) || ciphertext || tag (16)          AES-256-GCM
key    = HKDF-SHA256(IKM  = the 512 grades, one byte each,
                        salt = the 16-byte session token,
                        info = "NV4 recovery bundle")
aad    = the 16-byte instance id || the 16-byte session token
```

The bench exposes exactly the same protocol over plain JSON-lines or WebSocket (`ws://`/`wss://` upgrade on the same port), including a factory replay mode:

```bash
python neve_bench.py serve --port 19640          # random-table bench head
python neve_bench.py serve --port 19640 --seed 7 # replayable head
python neve_bench.py factory                     # replay factory_session.jsonl bit for bit
```

`factory_session.jsonl` re-verifies bit-for-bit on the bench session and prints the bundle's plaintext, which announces `bench heads seal no recovery data` — the real payload only exists on the live field head you are issued.

## Recovering Grades

No source solve script ships with the folder, but a leftover compiled module (`__pycache__/solve.cpython-314.pyc`) shows the intended approach. Its `recover` routine loops rows 1..32, harvests sounding samples to a target of 16 per cell, applies a maximum-likelihood estimate (`estimate`) of grades against the eight candidate flip probabilities, and calls `checkpoint`. On an `EMISS` it doubles the sample target for that row and resamples — trading budget for confidence. Once all 32 rows confirm, it rebuilds the grade list, runs the manual HKDF expansion:

```python
prk = hmac.new(salt, ikm, hashlib.sha256).digest()
key = hmac.new(prk, nb.BUNDLE_INFO + b"\x01", hashlib.sha256).digest()
```

and decrypts `blob[12:]` with AESGCM using `aad = instance + session`.

The structure that makes maximum likelihood work is the transition design in `BenchSession.sound`: sounding the right symbols gives you a directly interpretable flip-rate estimate per cell, and 16 samples is usually enough to separate neighboring grades; the doubling-on-miss rule absorbs the cases where the estimate is off by one grade.

## Exploit

```bash
python neve_bench.py serve --port 19640    # rehearse offline
./cvconnect.py -l 9000 wss://HOST/ws/TOKEN # bridge the field head to TCP
# then drive Link("127.0.0.1", 9000) with the same recover-row/estimate/checkpoint loop
```

## Flag

Flag: not recovered in the writeup. The bundle contents are per-session and are only revealed by the live field head after the table is fully confirmed; no captured decryption is present in the folder.
