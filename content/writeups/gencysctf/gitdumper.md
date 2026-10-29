---
title: "GitDumper"
description: "The GenCyS CTF 2026 challenge folded into this folder is a story-driven intelligence exercise around TheSecureTrust Bank: a mission-kickoff email carrying a nested alert.eml attachment,…"
event: "gencysctf"
category: "misc"
categoryLabel: "Misc"
tags: ["GenCyS CTF 2026","misc"]
date: "2026-10-22"
teammate: false
source: "gencysctf/test/writeup.md"
---

The GenCyS CTF 2026 challenge folded into this folder is a story-driven intelligence exercise around TheSecureTrust Bank: a mission-kickoff email carrying a nested `alert.eml` attachment, and — the part that really pays — an exposed `.git` directory on a staging host. `gitdumper.py` is my tool for turning that exposure into the attacker's full source tree: it walks the loose Git object database over plain HTTPS and reconstructs a working tree, which is how `dump/SecureTrust_Crypto_Evidence.zip` came out.

## The Tool

The tool is a from-scratch Git client that only needs one HTTP GET per object, no Git installation:

```python
def obj_url(base, sha):
    return f"{base.rstrip('/')}/objects/{sha[:2]}/{sha[2:]}"
```

Usage is a single positional arg:

```bash
python3 gitdumper.py https://host/.git -o dump
```

## Bootstrapping from HEAD

Git exposes just enough text files to make this followable: `.git/HEAD` tells you the current branch, and the branch ref file tells you the tip commit SHA. `gitdumper.py` fetches both and, if `HEAD` points at a `ref:`, resolves the branch file directly:

```python
head = fetch(base + '/HEAD').decode(errors='replace').strip()
if head.startswith('ref: '):
    ref = fetch(base + '/' + head[5:]).decode(errors='replace').strip()
```

## Object Walking

Every loose object lives at `objects/ab/cdef...` and is just zlib-deflated `"<type> <len>\x00<data>"`. The downloader fetches one, sniffs it, and dispatches:

```python
def decompress_obj(raw):
    blob = zlib.decompress(raw)
    head, data = blob.split(b'\x00', 1)
    parts = head.split(b' ', 1)
    return parts[0].decode(), data
```

Commits are regex-mined for `tree <sha>` and `parent <sha>` lines:

```python
m = re.search(br'(?m)^tree ([0-9a-f]{40})', data)
for pm in re.finditer(br'(?m)^parent ([0-9a-f]{40})', data):
    stack.append(pm.group(1).decode())
```

Trees are the recursive heart. Each entry is `mode name \0 sha(20 raw bytes)`; mode `40*` routes to `write_tree` (recursion into a directory), anything else routes to `write_blob`. Symlinks, executables, and regular files are treated identically because the mode distinguishes only tree-vs-not:

```python
def parse_tree(data):
    while i < len(data):
        sp = data.index(b'\x00', i)
        mode, name = data[i:sp].split(b' ', 1)
        sha = data[sp+1:sp+21].hex()
        i = sp + 21
```

Blobs land on disk at their real relative path under the output directory, printing size as it goes:

```python
print('[+]', full, len(data), 'bytes')
```

The tool explicitly tolerates missing objects: anything unreachable (a deleted file, a submodule's commit-only "gitlink", garbage from a truncated pull) gets collected in `missing` rather than aborting the sweep, and the final line reports how many holes remain.

## What Came Out

Running it against the staged site's exposed `.git` produced the reconstructed tree under `dump/`, including:

```text
dump/SecureTrust_Crypto_Evidence.zip
```

Unzipping it yields `SecureTrust_Crypto_Evidence/` containing a mini archive of incident artifacts (`api_capture.pcap`, `key_exchange.log`, `certificate.pem`, `client_config.json`, `mobile_backup.dat`, `transaction_archive.enc`, `payment_receipt.pdf`, and so on) — the development snapshots of the attacker's own evidence bundle, not something reachable on the live site.

## Why This Works

The exposure is a misconfigured web root: anything below `document_root/.git/objects/` being web-reachable means anyone with the tip commit hash can replay the entire history — including files deleted from the checkout long ago, which is precisely the point (you can recover prior versions of code, credentials in old commits, and build artifacts that were never meant to ship). Standard mitigations: deny `.git` in the web server config, or stop shipping it at all.

## Flag

Flag: not recovered in the writeup. The dumped artifacts are present in `dump/`, but no flag string is contained in the tooling or stored artifacts.
