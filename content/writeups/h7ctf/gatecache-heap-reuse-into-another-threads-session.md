---
title: "GateCache — Heap Reuse Into Another Thread's Session"
description: "For H7CTF 2026's pwn/1 challenge, the target is gatecache (shipped inside keepalive.zip): a stripped PIE x86-64 C++ service, built on Ubuntu 22.04 / glibc 2.35, that listens on TCP 9006…"
event: "h7ctf"
category: "pwn"
categoryLabel: "Pwn"
tags: ["H7CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "H7CTF/pwn/1/writeup.md"
---

For H7CTF 2026's `pwn/1` challenge, the target is `gatecache` (shipped inside `keepalive.zip`): a stripped PIE x86-64 C++ service, built on Ubuntu 22.04 / glibc 2.35, that listens on TCP 9006 and dares you to type protocol commands. The process is threaded (it links `liburcu-memb`/`cds_lfht` for RCU-style lock-free maps and libsodium for detached signatures) and, critically, a detached worker thread leaves freed session objects behind, which is where the exploit steps in.

## Recon

The protocol is line-based. `connect` gives:

```
commands: RESOLVE ENROLL UPGRADE WHOAMI STORE RENDER PING QUIT
```

Two response formats matter:

```
role=%d handler=0x%lx session=0x%lx label=%s
```

and `OK upgraded role=1`. The `%lx handler=` field is a function pointer leak: `WHOAMI` reveals the address of the currently resolved principal's handler function inside the binary, which gives me the PIE base immediately (`old_handler - 0x2919` in `exploit.py`, and I calculated an `admin` code address at `base + 0x2bfc` from the same math).

## The Bug

Session state stored by `RESOLVE`/`ENROLL`/`UPGRADE` lives in `0x70`-byte heap objects. `STORE` writes into a per-principal byte vector that grows geometrically: seed it with 48 bytes (`STORE` on a fresh principal) and its *later* growth requests a `0x60`-byte allocation — same size class as the freed session object left behind by another thread's enrollment path. freed session memory is reused as vector storage, and the vector's contents are fully attacker-controlled, so the session object (which contains the principal's key and `role` and `handler`) is overwritten wholesale.

## Exploit

The exploit wires two connections together. Session A is seeded with `b'A' * 48` to shape its vector's growth; session B gets enrolled normally so its own session object gets allocated and freed by the detached worker. After A's vector grows into B's stale session chunk, I leak `WHOAMI` for the PIE base, then `STORE` a 96-byte vector payload that lands B's fields exactly where they matter:

```python
payload = bytearray(96)
struct.pack_into('<Q', payload, 0x20, kb)   # B's enrolled key
struct.pack_into('<I', payload, 0x28, 2)    # role = 2
struct.pack_into('<Q', payload, 0x30, admin)  # admin handler fn ptr
```

Then `RENDER` on session B — which reads its (now attacker-controlled) session record and dispatches through the handler at the elevated role — reads out the admin view and yields the flag.

## Flag

Flag: not recovered in the writeup. `exploit.py` prints B's post-overwrite `RENDER` output but never captured the flag text in the code I have here.
