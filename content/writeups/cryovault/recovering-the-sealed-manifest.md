---
title: "Recovering the Sealed Manifest"
description: "The repository was \"tidied up\" through a history rewrite: old branches were force-pushed, the pre-rewrite history was left unreachable, and a deleted .env.local was removed from the…"
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/3/writeup.md"
---

## Summary

The repository was "tidied up" through a history rewrite: old branches were
force-pushed, the pre-rewrite history was left unreachable, and a deleted
`.env.local` was removed from the visible history. However, the old objects
were still present in the object database and in the reflog, and an employee's
handoff bundle contained an additional hidden fragment.

The offline DR keychain seed was split into five position-labelled fragments
(`frag-0` … `frag-4`). Reassembling them in order produced the passphrase for
the age-encrypted `.secrets/flag.age` file.

**Flag:**

```text
isfcr{n0_c0mm1t_1s_3ver_truly_g0ne_a91c7f0d}
```

---

## Artifacts

| Artifact | Purpose |
| --- | --- |
| `rewritten/acme-dr.git` | Bare repository copy retained by Security |
| `rewritten/dr-handoff.bundle` | Git bundle left on the USB stick |
| `acme-dr.git/refs/private/backup/legacy/keychain` | Sealed manifest commit |
| `acme-dr.git/refs/private/keychain-anchor` | Annotated tag containing fragment 4 |
| `acme-dr.git/refs/notes/security-audit` | Audit note containing fragment 1 |
| `acme-dr.git/logs/HEAD` | Reflog exposing the "botched force-push" commit |
| `dr-handoff.bundle` → `refs/hidden/drops/final` | Hidden handoff commit containing fragment 3 |

---

## 1. Inspect the repository and bundle

Start by examining the refs and the hidden bundle ref:

```bash
unzip -o rewritten.zip
cd rewritten

git --git-dir=acme-dr.git for-each-ref
git bundle list-heads dr-handoff.bundle
```

The bundle advertises one hidden ref:

```text
7868a27602b5aabefc94b584738d93f038abbc85 refs/hidden/drops/final
```

The repository's `packed-refs` also contains non-obvious private/notes refs:

```text
b2c2df2fe872c4839614ceb0f30fdae4bf4a8c05 refs/heads/develop
b2c2df2fe872c4839614ceb0f30fdae4bf4a8c05 refs/heads/main
b2c2df2fe872c4839614ceb0f30fdae4bf4a8c05 refs/heads/release/1.4
7e695f75573404e869824ab76db11a0cf00dab20 refs/notes/security-audit
677ce95af6de9ec34a1250043b78b1eef0466086 refs/private/backup/legacy/keychain
b8cdf7f2935ef527b376e0df50e272856e4f1df6 refs/private/keychain-anchor
^f35d3e699238c4c137dfff24badaa7aeb2bc1432
```

The sealed manifest lives in:

```text
refs/private/backup/legacy/keychain
  → 677ce95af6de9ec34a1250043b78b1eef0466086
    .secrets/flag.age
    README.txt
```

`README.txt` confirms that decryption requires "the reassembled 5-fragment
seed".

---

## 2. Recover the pre-rewrite history

`git fsck` and the reflog reveal the discarded history:

```bash
git --git-dir=acme-dr.git fsck --full --unreachable --dangling
cat acme-dr.git/logs/HEAD
```

The reflog shows:

```text
b2c2df2... e55a32b... botched force-push (rollback pending)
e55a32b... b2c2df2... restore: point main back to filtered history
```

The old pre-rewrite chain is still present:

```text
78151aa  chore: initial import of DR tooling
16b610f  chore: ignore local dev fixtures
fa1badf  docs(security): keychain rotation manifest
bd33f8a  docs: development notes and deprecated fragment trace
c652757  feat(keychain): scaffold offline keychain adapter
6ccd472  docs: placeholder for DR handoff bundle
ecb1443  chore(config): restore dev fixture for legacy tests
```

The initial commit `78151aa` still contains the deleted `.env.local`, because
the pack was never garbage-collected:

```bash
git --git-dir=acme-dr.git ls-tree -r 78151aa
git --git-dir=acme-dr.git cat-file -p 9aa7b0bc75e10604f9c663955b3fb6801ceef370
```

It contains fragment 0:

```text
[frag-0] a4bbdcca657dfb87
```

The force-pushed commit `e55a32b` also still exists. Its commit message
contains an old `X-Audit-Fragment` trailer, which in this case is fragment 2:

```bash
git --git-dir=acme-dr.git cat-file -p e55a32b
```

```text
X-Audit-Fragment: 83a0a368a0a4f8de
```

---

## 3. Read the notes and tag payloads

### Fragment 1 — git notes

```bash
git --git-dir=acme-dr.git notes --ref=security-audit list
git --git-dir=acme-dr.git notes --ref=security-audit show fa1badf6ea6f64df9bf5cfd98522f6f3bbdc77a5
```

The note reads:

```text
security-audit: keychain rotation, phase 1/5

During the 2024-06 rotation of the offline DR keychain we split the new
seed into five position-labeled fragments and distributed them across
cold-storage channels. This note records fragment #1 attached to the
commit that introduced the new keychain manifest.

[frag-1] 063ee0665b4540f3
```

### Fragment 4 — annotated tag

```bash
git --git-dir=acme-dr.git cat-file -p b8cdf7f2935ef527b376e0df50e272856e4f1df6
```

The tag message says to follow through with `cat-file -p f35d3e6...`:

```text
object f35d3e699238c4c137dfff24badaa7aeb2bc1432
type commit
tag keychain-anchor
tagger Diego Fuentes <diego.fuentes@acme-dr.example> 1717597200 +0000

Offline anchor for keychain reassembly.
Follow-through: cat-file -p f35d3e699238...
```

Dereferencing the tag target yields `chain-4.txt`:

```bash
git --git-dir=acme-dr.git show f35d3e699238c4c137dfff24badaa7aeb2bc1432:chain-4.txt
```

```text
[frag-4] 80d5aba25b0824a6
```

---

## 4. Extract fragment 3 from the bundle

Clone/fetch the bundle and inspect its hidden ref:

```bash
git clone --mirror dr-handoff.bundle /tmp/dr-bundle
cd /tmp/dr-bundle
git log --all --oneline
git ls-tree -r 7868a27
```

The bundle contains:

```text
MANIFEST
chain-3.txt
```

`chain-3.txt` contains fragment 3:

```bash
git cat-file -p fb761c7abf8c78aaf0627e28cfc479ab70ba5c50
```

```text
# handoff bundle -- fragment 3 of 5
...
[frag-3] 6e417b054d09de89
```

---

## 5. Reassemble the seed

The five recovered fragments are:

| Fragment | Value | Source |
| --- | --- | --- |
| `frag-0` | `a4bbdcca657dfb87` | deleted `.env.local` in pre-rewrite commit |
| `frag-1` | `063ee0665b4540f3` | `refs/notes/security-audit` |
| `frag-2` | `83a0a368a0a4f8de` | `X-Audit-Fragment` trailer on `e55a32b` |
| `frag-3` | `6e417b054d09de89` | `chain-3.txt` in the bundle |
| `frag-4` | `80d5aba25b0824a6` | `chain-4.txt` via the annotated tag |

Concatenating them in position order gives the seed/passphrase:

```text
a4bbdcca657dfb87063ee0665b4540f383a0a368a0a4f8de6e417b054d09de8980d5aba25b0824a6
```

---

## 6. Decrypt the sealed manifest

`.secrets/flag.age` is an age passphrase-encrypted file using an scrypt
recipient:

```text
age-encryption.org/v1
-> scrypt on3bupgbKEe2FNVcIU+6zA 18
...
```

It can be decrypted with the reassembled seed as the passphrase, for example:

```bash
git --git-dir=acme-dr.git cat-file -p \
  feeac23ca891feddd006b2f1a49c65650cb08293 > /tmp/flag.age

# age reads the passphrase interactively
age -d /tmp/flag.age
```

The decrypted manifest is:

```text
acme-dr :: offline keychain :: recovered manifest
---------------------------------------------------
flag: isfcr{n0_c0mm1t_1s_3ver_truly_g0ne_a91c7f0d}

If you decrypted this file, the 5-of-5 fragment reconstruction
succeeded. Rotate the keychain immediately.
```

---

## Decoys

The repository intentionally contains several misleading fragment values:

- `docs/handoff-placeholder.txt`: `[frag-3] 446eaf1e127cfd67`
- `config/dev.yaml`: `backup_key_fragment: "3ddfb7834b18adb5"` labelled `[frag-4]`
- `docs/development.md`: `X-Audit-Fragment: b6ebffd070e820cb`

These are explicitly described as placeholders, legacy fixtures, or
"historical noise". Using them instead of the recovered fragment values does
not produce the correct seed.

---

## Conclusion

The engineer's history rewrite removed the old commits from the branches but
did not remove the underlying Git objects or reflogs. Combining the leftover
pre-rewrite objects, notes, annotated tag, and the separate handoff bundle
recovered all five seed fragments and unlocked the sealed manifest.

**Final flag:**

```text
isfcr{n0_c0mm1t_1s_3ver_truly_g0ne_a91c7f0d}
```
