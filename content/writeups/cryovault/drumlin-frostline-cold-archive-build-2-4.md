---
title: "Drumlin — Frostline Cold Archive (Build 2.4)"
description: "201 {\"base\":\"https://.../s/ \",\"token\":\" \"} ```"
event: "cryovault"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CryoVault Finals 2026","web"]
date: "2026-10-26"
teammate: false
source: "cryovault/web/6/writeup.md"
---

**Status: solved.** `POST /release` returned
`isfcr{bay_seven_revision_7a9aa329b2}` after a future-chunk reissue/PATCH race.
This document records the confirmed behavior, predecessor exploit, and working attack.

- **Target:** `https://isfcrpesu-drumlin.chals.io/`
- **Category:** Web
- **Flag format:** `isfcr{...}`
- **Challenge author:** AJ (per CTFd metadata for challenge id 36; 0 solves while tested)
- **Attachments:** `README.md`, `client.py` (both copied in this directory)

---

## 1. Challenge summary

`POST /session` creates a private bucket:

```http
POST /session
Accept: application/json

201 {"base":"https://.../s/<token>","token":"<token>"}
```

Every route is under `base`:

| Route | Meaning |
|---|---|
| `GET /` | operator id, archive time, objects |
| `GET /whoami` | operator id (`op-xxxxxx`) |
| `GET /objects` | all objects including keeper's |
| `PUT /objects/<name>` | store 1–8192 bytes as a new object |
| `PATCH /objects/<name>?at=<offset>` | overwrite bytes inside an existing object |
| `GET /objects/<name>` | object record (size, chunk list, metadata) |
| `GET /objects/<name>/data` | object bytes |
| `DELETE /objects/<name>` | delete one of your objects |
| `GET /usage` | slot/object accounting |
| `POST /reissue` | keeper issues the next policy revision |
| `POST /release` | keeper opens bay 07 if the operator is listed |

The bucket starts with one keeper-owned object, `bay-07.policy`. Its data is JSON. The policy
lists keeper/operator ids under `release.to`; our `op-xxxxxx` id is never listed. `POST
/release` otherwise returns:

```json
{"error":"not_listed","detail":"op-xxxxxx is not on the bay policy's release list"}
```

Objects are stored as variable-size chunks. A chunk is deduplicated globally inside the bucket
and referenced as:

```json
{"slot": 9, "len": 311, "tag": "5b0f0c2a"}
```

`tag` is the bucket's 32-bit integrity tag of the chunk bytes. The policy record also has
`revision`, `issued`, and `seal`. `seal` is an HMAC over the policy record (revision, issue
time, chunk list) under a keeper-only key. Build 2.4 has **no whole-file `sum` field** anymore.

---

## 2. Predecessor challenge and why it matters

This challenge is a sequel to **Moraine** from the Cryovault 2026 Quals. The public Moraine
writeup is available at:

- `/tmp/opencode/cv1/web/moraine/README.md`
- `/tmp/opencode/cryo-writeups/web/moraine/README.md`

Moraine was solved by attacking the gap between **sealed metadata** and **unsealed bytes**:

1. The HMAC sealed the record (revision, Adler-32 `sum`, chunk list), not an immutable copy of
   the chunk bytes.
2. The tag was a bucket-seeded **CRC32C**, which is affine. A forged same-length chunk could
   therefore be made to have the original chunk tag without knowing the seed.
3. The whole-file Adler-32 could also be preserved while editing ignored JSON string fields.
4. The old server had a dedup refcount bug:
   - create an object containing the policy chunk repeated many times; creation counted the
     shared slot once;
   - delete that object; deletion decremented **every occurrence**;
   - the policy slot was over-decremented onto the free list even though the policy still
     referenced it.
5. Fill the bucket, churn uploads, reclaim the freed policy slot with a forged first chunk
   containing the attacker's operator id, then call `/release`.

Moraine's public flag (do **not** submit to DRUMLIN):
`isfcr{moraine_7d48_slot_e3f0955a_reclaimed}`

### Build 2.4 release notes

The current README says:

- tags are now **keyed per bucket**;
- deleting an object **no longer releases chunks that are still in use**;
- new `PATCH` and `POST /reissue` routes.

The old Moraine exploit does **not** transfer directly. The current tag is not CRC32C-affine,
the whole-file Adler-32 is gone, and the tested delete over-decrement is fixed.

---

## 3. Confirmed build-2.4 behavior

All of the following was tested against live buckets.

### 3.1 Tags

- Tag is a deterministic function of **chunk bytes only** (same bytes in different objects or
  slots give the same tag).
- Changing data changes the tag.
- The tag is **not affine over GF(2)** in the data bits. A CRC/FNV-style differential attack
  does not work.
- Direct test on a policy chunk: for a one-byte flip, the tag difference did **not** equal the
  CRC32C difference.
- No match was found for simple keyed constructions using the public token/operator/keeper ids:
  - CRC32/CRC32C/Adler/FNV-1/FNV-1a/djb2;
  - xxHash32/64, MurmurHash3, MurmurHash2 with candidate/brute-forced 32-bit seeds;
  - SipHash-2-4 with token/raw-token/derived-key candidates;
  - HMAC-MD5/SHA1/SHA256/SHA512, BLAKE2b/2s, BLAKE3 with token/id-derived keys;
  - labelled key variants such as `tag:<token>`, `bucket:<token>`, etc.
- Tags are almost certainly a per-bucket secret keyed hash (e.g. HMAC/BLAKE/SipHash with a
  random server-side key). Treat tag preimage/collision as cryptographically hard unless the
  key/algorithm can be leaked.

### 3.2 PATCH semantics

- `PATCH` preserves object size and chunk layout.
- If the affected chunk is owned only by that object, PATCH updates it **in place**.
- If the chunk is shared with another object (including the keeper policy), PATCH performs a
  **copy-on-write** to a new slot.
- PATCH spanning two shared chunks COWs both chunks.
- PATCH out of range returns `416 out_of_range`; empty body returns `400 empty`; bad offset
  returns `400 bad_offset`.
- PATCH on the keeper policy returns `403 not_yours`.
- Repeated references within one object, partial patches, full patches, and patches followed by
  DELETE did not corrupt the policy or over-decrement its chunks.

### 3.3 DELETE/refcount behavior

- Normal DELETE of an object sharing a policy chunk does not free the policy chunk.
- DELETE of an object containing a policy chunk repeated many times did not over-decrement the
  policy slot (the old Moraine bug appears fixed).
- DELETE of an object containing repeated references to its own unique chunk did not produce a
  usable underflow.
- Duplicate-tag chunks at different slots (created via PATCH in place) do not steal the policy
  tag's dedup index.
- `usage` counters:
  - `slots` = total allocated slots (monotonic until reused);
  - `held_slots` behaves like a small quarantine (capped around 6);
  - `free_slots` are immediately reusable slots;
  - evicting a large object can spill old held chunks into `free_slots`.

### 3.4 Reissue behavior

- `POST /reissue` increments `revision`, updates `issued` (UTC minute), regenerates/re-chunks
  the policy, and writes a fresh seal.
- Only the dynamic prefix chunks change; later chunks (including the `release.to` area) are
  usually reused with the same slot/len/tag.
- `POST /reissue` body/query/header parameters (revision, issued, operator, release, etc.) are
  ignored.
- The next policy bytes are fully predictable: take the current policy data, replace the
  revision value with `R+1`, and replace the issued timestamp with the current server minute.
- **Pre-seeding works:** PUT that predicted next policy data as a user object *before*
  reissue. The keeper reissues byte-identical content and the new policy record shares all
  chunks with the seed object.
- Despite sharing, PATCHing a seed chunk (including a stable chunk containing `release.to`)
  still COWs. DELETE of the seed after reissue also leaves the policy safe. This shows reissue
  does increment/retain references for chunks it reuses from user objects.
- Deleting the seed *before* reissue does not make the keeper reuse the deleted dynamic chunk;
  it allocates a new slot for the future dynamic chunk while stable chunks remain from the old
  policy.

### 3.5 Capacity and slot cap

- `max_slots = 128`, `max_objects = 6`.
- At `slots = 128` with `free_slots = 0`:
  - PUT needing new chunks returns `409 bucket_full`;
  - PATCH requiring COW returns `409 bucket_full`;
  - reissue needing new chunks returns `409 bucket_full`;
  - policy record/data/usage remain byte-identical after the failed request.
- The server checks capacity atomically before mutating state in the tested failure cases; no
  obvious partial-allocation/wrap-to-live-slot bug was observed.

### 3.6 Names/ownership

- Names: `[a-z0-9][a-z0-9._-]{0,63}`.
- Uppercase names rejected.
- `bay-07.policy`, `bay-07.policy.`, `bay-07.policy..`, `bay-07-policy`, etc. are distinct
  objects.
- Percent-encoded names resolve normally; `%2f` produces 404; NUL/space rejected.
- PATCH/DELETE of the keeper object is owner-checked.
- `/whoami` ignores query/header/cookie operator overrides.

### 3.7 Hidden routes

Only `/`, `/session`, `/guide`, `/healthz` and the documented bucket routes were found. No
debug/pprof/metrics/source endpoints were exposed.

### 3.8 Follow-up probes (2026-10-25)

- The previously interrupted multi-reissue test is complete. A seed containing the exact
  predicted revision 42 policy was PUT; reissue shared all eight seed chunks. Through revisions
  42–47, six different seed chunks that were still shared with the current policy were PATCHed.
  Every PATCH COWed to a new slot; the policy record and bytes remained unchanged. The first
  seed's original revision-specific chunks ceased to be shared after the next reissue, as
  expected. Script: `refcount_probe.py`.
- At `slots=128`, `free_slots=2`, `held_slots=6`, reissue returned `409 bucket_full`.
  Usage, policy record, and policy bytes were identical before and after. This checks a partial
  capacity situation. At the revision 99→100 digit boundary, a bucket with `slots=128` and
  `free_slots=3` reissued successfully. Usage stayed identical, the policy remained readable,
  and `/release` still returned `not_listed`. A failing 99→100 attempt with fewer than three
  available slots was not tested.
- The known same-length 16-bit tag-suffix collision (`7d3f5ede`, `01155ede`, both 243 bytes)
  was applied by PATCH to two shared chunks with identical layout. The results occupied distinct
  slots (25 and 38) and both objects read back correctly. This rules out 16-bit-only matching in
  the PATCH COW path. Re-PUT of the complete patched objects re-chunked the target bytes, so
  this does not yet establish how PUT dedup compares canonical chunks. Script:
  `truncation_probe.py`.
- A PATCH crossing two shared chunks at `free_slots=1` returned `409 bucket_full`. Neither
  chunk moved or changed, and `free_slots` stayed at one. Thus that tested partial COW failure
  is atomic.
- A canonical PUT test found two different 8-byte chunks with tags `bb9a1f9c` and `f2131f9c`.
  Their low 16 bits match, but PUT stored them in separate slots (11 and 12). Thus the PUT path
  also does not dedup solely on that 16-bit suffix. Script: `put_collision_probe.py`.
- A 250-operation randomized PUT/PATCH/DELETE/reissue probe reached the 128-slot cap and
  found no unexpected policy mutation.
- Twenty cycles of concurrent `{POST /reissue, PATCH shared seed release id}` both succeeded
  without making the operator appear in the policy. Each cycle copied the then-current policy
  into a seed object, raced the two requests, checked policy bytes, and deleted the seed.
  Script: `race_probe.py`. This tested an already-shared current-policy chunk; it did not test
  the vulnerable case below.

### 3.9 Working future-chunk race

The successful probe is `future_chunk_race.py`. Each cycle predicts the **next** policy bytes
from the current revision and server UTC minute, then PUTs those bytes as `future-seed`. It
locates the first `release.to` id in the seed and checks that the containing chunk's slot is
absent from the **current** policy record. Such a chunk is unique to the seed until reissue.
It races `POST /reissue` against a same-length PATCH replacing that id with our `op-xxxxxx`.

If PATCH wins completely, reissue can generate safe content separately; if reissue wins
completely, PATCH normally COWs. The observed successful interleaving made the newly issued
policy contain the operator id while keeping a readable, sealed record. The exact internal
window is inferred from the result; the server source is unavailable.

The first successful run occurred on cycle 55, during revision 141→142. `GET` showed
`release.to` ids `['op-g6xvb3', 'kp-atpap3']`, and a second `POST /release` independently
returned HTTP 200:

```json
{"flag":"isfcr{bay_seven_revision_7a9aa329b2}","operator":"op-g6xvb3","released":true}
```

The race is nondeterministic. Re-run the script against a fresh bucket if a cycle limit is
reached. A false `unique` check skips that revision because its target chunk is already shared
with the old policy and PATCH would COW normally.

---

## 4. Earlier attack analysis

To win, the policy bytes that the keeper reads must contain our `op-xxxxxx` id under
`release.to`. Since ids are all 9 characters (`kp-xxxxxx`, `op-xxxxxx`), an in-place replacement
of one release id is length-preserving.

There are only three plausible ways:

1. **Change bytes in a policy-referenced slot while preserving its tag and seal.**
   - Requires a tag collision/preimage, or a way to modify the slot without changing its stored
     tag.
   - Current tag appears keyed/cryptographic; old CRC differential does not work.

2. **Get the keeper to reseal modified policy bytes.**
   - If reissue reads the current policy bytes (rather than only the keeper template), then a
     slot-reuse/UAF primitive would let us modify the policy and have reissue bless it.
   - If reissue regenerates from the keeper template, modified bytes are overwritten.

3. **Get a new policy record that references a malicious chunk.**
   - Pre-seeding the exact next policy bytes makes the policy share our slots.
   - To make the future safe chunk resolve to a malicious chunk, dedup must see the malicious
     chunk as having the safe chunk's tag (collision/preimage), or a stale dedup index/slot
     alias must be created.
   - Stale-index tests after DELETE/reuse failed: re-PUT of old content allocated a new slot.

The missing primitive is therefore either:

- a **tag function/key leak** plus a 32-bit preimage search, or
- a **slot-free/reseal bug** in PATCH/reissue/refcount interaction.

---

## 5. Earlier hypotheses

### H1. Reissue/PATCH refcount drift over longer histories

Six successive reissues with a shared seed showed correct COW for every tested stable chunk.
A drift that takes a much longer history to manifest remains possible, but this lead is weaker.

### H2. Partial reissue failure at capacity

At `slots = 128`, reissue failed atomically with both zero and two free slots in tested buckets.
The revision digit boundary `99 -> 100` succeeded with three free slots and did not corrupt the
policy. A failing boundary attempt with fewer slots remains untested.

### H3. Tag/dedup truncation

`tagstats_big.json` contains 588 tags collected from PATCH rounds. There is one same-length
16-bit suffix collision:

```text
tag 7d3f5ede, len 243
tag 01155ede, len 243
```

Caveat: these came from PATCH-generated mid-object chunk boundaries. Extracting a middle chunk
and PUT-ing it standalone can re-chunk differently (the 243-byte example re-split as 240+3), so
the dedup test was invalid. To test truncation properly, compare chunks produced by complete
PUT preimages (or complete canonical chunk layouts), looking for two objects sharing a slot
despite different full tags.

PATCH COW did not alias two such colliding chunks. A later canonical one-chunk PUT test also
kept a different pair with matching low 16 tag bits in separate slots. The race in §3.9 made
tag preimage work unnecessary.

### H4. Tag key/algorithm recovery

If the key is derived from public bucket data or is only 32 bits, recover it and then search for
a 32-bit tag preimage offline. The exploit shape would be:

1. Predict next policy bytes and identify the dynamic chunk containing a release id.
2. Compute that safe chunk's tag `T`.
3. Find a same-length malicious chunk `M` containing `op-xxxxxx` with `tag(M) == T`.
4. PUT `M` before reissue so dedup registers `T -> M`.
5. Reissue, then release if the keeper uses the dedup slot.

Unresolved blocker: the tag is almost certainly a secret-keyed cryptographic hash.

### H5. Reissue/PATCH race (confirmed)

The earlier 20-cycle race used a copy of the **current** policy, so the target release chunk
already had two references before reissue. The successful probe pre-seeded the **next** policy
and selected a release-id chunk absent from the current policy, leaving a unique seed chunk for
the race. See §3.9.

---

## 6. Useful commands

`client.py` in this directory wraps the API:

```bash
python3 client.py open https://isfcrpesu-drumlin.chals.io/
python3 client.py "$BASE" whoami
python3 client.py "$BASE" ls
python3 client.py "$BASE" stat bay-07.policy
python3 client.py "$BASE" get bay-07.policy policy.json
python3 client.py "$BASE" usage
python3 client.py "$BASE" reissue
python3 client.py "$BASE" release
```

The bucket stays alive across the observed server restarts; tokens tested earlier remained
valid.

---

## 7. Flag

Verified twice with HTTP 200 from `POST /release`:

```
isfcr{bay_seven_revision_7a9aa329b2}
```
