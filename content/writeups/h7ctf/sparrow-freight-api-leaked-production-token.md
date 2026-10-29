---
title: "Sparrow Freight API — Leaked Production Token"
description: "A Sparrow Freight developer insisted the production carrier token never made it into a commit, and that the history was spotless. It was — the repository was pulled before anyone had a…"
event: "h7ctf"
category: "web"
categoryLabel: "Web"
tags: ["H7CTF 2026","web"]
date: "2026-09-26"
teammate: false
source: "H7CTF/misc/1/sparrow-freight-api/writeup.md"
---

**Flag:** `H7CTF{116f8522b35663cde2ce}`

## The claim

A Sparrow Freight developer insisted the production carrier token never made it
into a commit, and that the history was spotless. It was — the repository was
pulled before anyone had a chance to tidy it further, so nothing had been
rewritten, filtered, or garbage collected away.

The claim is also irrelevant. `git log` only shows you commits that a **ref**
points to. It says nothing about the rest of the object database. Git writes a
blob to `.git/objects` the moment a file is `add`ed — long before any commit
exists, and it stays there after a ref stops pointing at it.

> Never committed is not the same as never there.

## The surface (all checked, all clean)

| Source | Result |
| --- | --- |
| `git log --all --stat` (4 commits) | nothing |
| `git log -p` across every commit | nothing |
| `git stash list` | empty |
| `git reflog --all` | empty |
| `git show-ref -d` | single ref, `refs/heads/main` |
| `git notes list` | empty |
| tracked files on disk | clean |

The working tree corroborates the story, which is what makes it convincing.
`README.md` says "Do NOT commit secrets - use the vault", `.gitignore` was
added deliberately in `a22d386`, and `app/config.py` holds only a base URL:

```python
CARRIER_API_BASE=https://api.carrier.example
```

`app/main.py:10` even carries a TODO pointing at the vault for the credential
that is nowhere to be found:

```python
# TODO: wire up the carrier API using the token from the vault
```

Every deliberate signal says "no secret in this repo." That is the trap: the
evidence is all *absence* evidence, and absence of evidence in the ref graph is
not absence of the object.

## The find

`git fsck` walks the object database rather than the commit graph, and reports
objects that exist but are unreachable from any ref:

```
$ git fsck --lost-found --unreachable --dangling
unreachable blob c3d46ca9c0a373e94eae205cfad3e7ba7718e150
unreachable blob 698e3c6c553b697a80b4b44d7c29f1f345ceea21
```

Two orphaned blobs, 147 and 61 bytes, no commit, no tree, no ref. Reading one
is a plain object read:

```
$ git cat-file -p c3d46ca9c0a373e94eae205cfad3e7ba7718e150
# production carrier credentials - DO NOT COMMIT
CARRIER_API_TOKEN=H7CTF{116f8522b35663cde2ce}
CARRIER_API_SECRET=b7f3c1a9e2d84f6b90care1a2b3c4d5e
```

The first blob is the leak: a live production `CARRIER_API_TOKEN` and a
companion `CARRIER_API_SECRET`, sitting in a file whose own first line says
`DO NOT COMMIT`. The comment is the developer's intent, not a control git
enforces — nothing stops a blob from existing because of how it was labelled.

## The decoy

The second blob is a trap for anyone who stops at the first hit:

```
$ git cat-file -p 698e3c6c553b697a80b4b44d7c29f1f345ceea21
CARRIER_API_TOKEN=H7CTF{this_token_was_rotated_not_the_flag}
```

It is self-describing bait — a later, rotated, non-production token that would
be easy to submit. Two findings means you enumerate **all** of them and reason
about which is which, rather than grabbing whichever resolves first. Ordering
from `fsck` is not significance.

## How objects get stranded

`git add` writes a loose blob immediately. Every one of these leaves the data
in place, and every one looks identical from the outside — an innocent
`git log`:

- `git add secrets.env` then `git reset` / `git checkout -- secrets.env` — the
  usual culprit, and what `.gitignore` was retrofitted to prevent *after* the
  fact
- an amend (`git commit --amend`) that dropped the file
- a dropped `git stash`, or `git stash pop`ped with conflicts then discarded
- a `git rebase` / cherry-pick whose intermediate state was discarded
- a branch deleted with `git branch -D` rather than `-d`

Blobs are only reclaimed by an explicit `git prune` / aggressive
`git gc --prune=now` after the grace period expires, so on a repo that was
pulled and not yet tidied, the window is wide open.

## Fixes for the real world

Detection, in rough order of how much they catch:

```bash
git fsck --unreachable --no-reflogs        # orphaned blobs
git rev-list --objects --all | git cat-file --batch-check   # known objects
trufflehog git file://.                    # or gitleaks detect --source=.
```

`git log -p` is the weakest of these and is the one people reach for first,
because it only inspects history you can already see.

Remediation, in order — rotation first, since object deletion is worthless
against anyone who already cloned:

1. **Rotate `CARRIER_API_TOKEN` and `CARRIER_API_SECRET` immediately.** Treat
   both as compromised. The token is not salvaged by cleaning the repo.
2. **Revoke at the carrier**, and audit access logs for use of the leaked
   secret outside the expected service.
3. **Purge locally** — `git reflog expire --expire=now --all && git gc
   --prune=now --aggressive` — if history must be scrubbed. This only helps
   clones you control; assume every existing clone still has the blob.
4. **Move the secret to the vault** it was already supposed to be in, and load
   it at runtime from the environment. `os.environ` is already imported in
   `app/main.py` for `PORT`, so the pattern was already there.
5. **Block at the gate** — a pre-commit secret scanner, so `.gitignore` is
   enforced rather than aspirational.

`.gitignore` is worth calling out as the wrong lesson. It was added in
`a22d386` as if the problem were an oversight, and it does stop *future* adds.
It does nothing about a blob that is already on disk, which is exactly the
state this repo was in.

## Note

`git fsck --lost-found` writes copies of every unreachable object to
`.git/lost-found/`, which materialises the secret as a plaintext file outside
the object store. The copies are removed from this repo and the directory
cleaned up, but it's a good habit to know about: in a real incident,
`--unreachable` on its own gives you everything you need without duplicating
secrets to disk.
