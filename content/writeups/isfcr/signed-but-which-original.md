---
title: "signed, but which original?"
description: "The challenge asks us to identify the derivative matching the constraints in case.json, reconstruct its manifest ancestry all the way back to the original capture, and use six exact…"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/signed-but-which-original.md"
---

**Points:** 50  
**Author:** d3va  
**Likes:** 16 (100% liked)  
**Category:** Forensics / Cryptography  
**Flag format:** `isfcr{...}`  
**Challenge files:** `handout.zip` (`case.json`, `entries.bin`)

## Flag

```text
isfcr{29336738f5f44f4d2d1e3ac2}
```

## Challenge Description

> Find the derivative that satisfies `case.json`, and its ancestry. Evidence, six ASCII strings in this order: the derivative's asset SHA-256, its manifest_id, its ancestry's manifest_ids from capture to derivative joined with `>`, the capture's asset SHA-256, the target incident ID, and the tree_size of the checkpoint you relied on. Digests are lowercase hex.

## Challenge objective

The challenge asks us to identify the **derivative** matching the constraints in `case.json`, reconstruct its manifest ancestry all the way back to the original capture, and use six exact ASCII evidence strings to derive an AES-GCM key. A plausible filename or a matching operation name alone is insufficient: the intended chain must respect the signed-log checkpoint and parent/child ordering constraints.

The six evidence fields, in order, are:

1. Derivative asset SHA-256.
2. Derivative `manifest_id`.
3. Ancestry manifest IDs, from capture to derivative, joined by `>`.
4. Original capture asset SHA-256.
5. Target incident ID.
6. Tree size of the checkpoint used.

## 1. Inspect the archive and case constraints

Extract the archive:

```bash
unzip handout.zip
cat signed-but-which-original/case.json
```

The relevant case constraints are:

```json
{
  "capture_principals": ["capture-north"],
  "final_action": "redact",
  "intermediate_actions": ["crop", "resize"],
  "log_scope": "largest_valid_checkpoint",
  "manifest_encoding": "RFC8785",
  "max_chain": 4,
  "parent_logged_before_child": true,
  "target_incident_id": "incident-d7be9442cb"
}
```

`case.json` additionally supplies checkpoint candidates with tree sizes **33, 46, 50, 52, and 55**, their corresponding root hashes and signatures, and a root verification key. The checkpoint with the numerically largest tree size is **not automatically** the largest *valid* checkpoint. Signature and commitment validation matter.

The binary evidence is in `entries.bin`, which begins with the `ISFCRLOG` magic bytes. It is a structured log rather than a plain-text JSON list. The correct workflow is to decode entries according to the record format, check authenticated statements and checkpoint commitments, and only then resolve ancestry.

## 2. Establish the trusted log scope

Use the provided trust root to validate checkpoint signatures and the log/manifest authentication data. For this challenge, the selected **largest valid checkpoint** has:

```text
tree_size = 46
```

This bound matters. Entries beyond the authenticated checkpoint cannot be used as evidence merely because they happen to appear later in the supplied log. Similarly, a chain that satisfies the action sequence but has invalid signatures or broken parent references is not a valid candidate.

When evaluating candidate manifests, enforce all of the following:

- The capture principal is `capture-north`.
- The target incident is `incident-d7be9442cb`.
- The final operation is `redact`, preceded by `crop` and `resize` in that order.
- The chain has at most four manifests, from capture to derivative.
- Every child's parent is present and logged before the child.
- The manifest serialization used for verification is RFC 8785 canonical JSON.
- All selected records are covered by the trusted checkpoint.

## 3. Reconstruct the ancestry

The matching ancestry is:

```text
Capture  mf-326c47df321e
   |
   v
Crop     mf-95efb978da36
   |
   v
Resize   mf-57d2452e846e
   |
   v
Redact   mf-ee2392778137   <-- accepted derivative
```

The capture's SHA-256 is:

```text
5fe33137c48b34086ca6c2c19723b4916fb13732e465759be10b96dcef825bcf
```

The derivative's SHA-256 is:

```text
c40ac4a3268f0b30aac5a1e344e1e4016b82fbfb1171e86330a64c69e73d6cff
```

The joined ancestry string has **no spaces**:

```text
mf-326c47df321e>mf-95efb978da36>mf-57d2452e846e>mf-ee2392778137
```

## 4. Assemble the exact evidence

Order, spelling, and JSON serialization are critical. Use lowercase hex digests; the checkpoint size must be an **ASCII string** (`"46"`), not a JSON number.

```json
[
  "c40ac4a3268f0b30aac5a1e344e1e4016b82fbfb1171e86330a64c69e73d6cff",
  "mf-ee2392778137",
  "mf-326c47df321e>mf-95efb978da36>mf-57d2452e846e>mf-ee2392778137",
  "5fe33137c48b34086ca6c2c19723b4916fb13732e465759be10b96dcef825bcf",
  "incident-d7be9442cb",
  "46"
]
```

## 5. Derive the key and decrypt the flag

Install the needed package if necessary:

```bash
python3 -m pip install cryptography
```

Save the following as `decrypt.py` and run `python3 decrypt.py`:

```python
import hashlib
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

evidence = [
    "c40ac4a3268f0b30aac5a1e344e1e4016b82fbfb1171e86330a64c69e73d6cff",
    "mf-ee2392778137",
    "mf-326c47df321e>mf-95efb978da36>mf-57d2452e846e>mf-ee2392778137",
    "5fe33137c48b34086ca6c2c19723b4916fb13732e465759be10b96dcef825bcf",
    "incident-d7be9442cb",
    "46",
]

E = json.dumps(evidence, ensure_ascii=True, separators=(",", ":")).encode("ascii")

key = hashlib.scrypt(
    b"isfcr-forensics\x00" + E,
    salt=bytes.fromhex("df2fd39adb32a812294cfe264c4a0ddc"),
    n=131072,
    r=8,
    p=1,
    maxmem=2**28,
    dklen=32,
)

nonce = bytes.fromhex("d2705557b11d25f6a1607cfd")
ct_and_tag = bytes.fromhex(
    "7bad7e996d62c88b017ef105997ca1235e513b8b24a724eb88a5204d1771614af"
    "735db56d5d02cc8177133b8d79101"
)
aad = b"signed-but-which-original"

flag = AESGCM(key).decrypt(nonce, ct_and_tag, aad)
print(flag.decode("ascii"))
```

Expected output:

```text
isfcr{29336738f5f44f4d2d1e3ac2}
```

AES-GCM also authenticates the plaintext. If **any** evidence string is wrong—such as a different original capture, a swapped manifest, an extra separator, or an incorrect checkpoint tree size—the derived key changes and decryption fails with an authentication error (`InvalidTag`).

## Key takeaway

The trick is **provenance**, not merely recognizing the last transformation. The question “which original?” is answered by following authenticated parent references backward from a `redact` derivative through `resize` and `crop` to the `capture`, while respecting the *largest valid* signed checkpoint. That precise ancestry becomes part of the cryptographic key.

**Final flag:** `isfcr{29336738f5f44f4d2d1e3ac2}`
