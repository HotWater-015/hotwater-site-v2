---
title: "Mirror"
description: "mirror is a pwn challenge shipped as a PIE x86-64 ELF served over socat (handout/mirror/ Dockerfile EXPOSE 1337). The binary stores records in a global session structure with two record…"
event: "lunar"
category: "pwn"
categoryLabel: "Pwn"
tags: ["Lunar CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "lunar/pwn/1/writeup.md"
---

## Summary

`mirror` is a pwn challenge shipped as a PIE x86-64 ELF served over socat (`handout/mirror/` Dockerfile `EXPOSE 1337`). The binary stores records in a global session structure with two record formats (V1 "telemetry" and a V2 masked/legacy layout), and the interplay of a legacy copy source mismatch lets you leak a masked code pointer — then the running session token, XORed onto that pointer value, is used to swap a function pointer for the `admin_rescue_shell` symbol. All mechanics below are taken from the provided `solve.py`; no binary analysis beyond the symbols it touches is needed.

## Files

- `handout/mirror/mirror` — the target ELF (PIE).
- `handout.zip`, `Dockerfile`, `docker-compose.yml` — deployment, `flag.txt` copied to `/home/ctf/flag.txt` mode 444 as user `ctf`.
- `solve.py` — the pwntools exploit script.

## Analysis

### Stage 1 — masked pointer leak

The exploit uses the binary menu (> prompt):

- Menu 1 (`v1`): a V1 record (payload length sent after a `: ` prompt, then raw bytes).
- Menu 2 (`v2`): a V2 record, taking a `flags` integer and a payload length; its "legacy parser" misreads the record layout, so when flags is small the `[flags | length]` combination becomes an unintended 16-bit copy length.
- Menu 3 (`sync`), menu 4 (`view`): view prints `Mirrored Stream Content (N bytes):` followed by a fixed N bytes, essentially reading back the mirrored stream verbatim.

The exploit puts a V1 record in slot 0 and a V2 record in slot 1 with `flags=0xb7`. Under the legacy interpretation this copies `0x2b7` bytes, which reaches past the intended source and walks the session struct right up to the original "renderer" function pointer, depositing it in the mirrored stream at offset `0x105` (slot 1's data starts at `+0x132`, while the legacy parser's source for slot 1 lies at `+0x15b`). After `sync()`, `view()` yields a leak whose `_default` pointer is recovered as `masked_default = u64(leak[0x105:0x105+8])`.

`view` also prints a session token before the menu (`Session Token: 0x…`, read off menu 5's status), and the PIE base is simply `pie = masked_default ^ token`.

### Stage 2 — flipping the renderer pointer

A second V2 record with `flags=0x10`, `length=1` makes the legacy parser copy `0x110` bytes. The `0xd7` byte overlap between source and destination regions means destination offset `0x108` (i.e. `g_session + 0x340`, the stored renderer pointer slot) receives the bytes located at source offset 8 — so payload byte 7 onward lands directly on the pointer. The exploit therefore sends a 15-byte payload whose bytes `7:15` are `p64(token ^ (pie + elf.sym['admin_rescue_shell']))`, remasking the existing pointer with the XOR-difference between `default_telemetry_renderer` and `admin_rescue_shell`:

```python
target = pie + ADMIN
payload[7:15] = p64(token ^ target)
v2(io, 0x10, bytes(payload))
sync(io)
menu(io, 4)
io.interactive()
```

## Exploit

Running `solve.py` locally starts the binary with `process([elf.path], cwd=handout/mirror)`; against the challenge server the same pwntools logic applies remotely (socat `TCP-LISTEN:1337,reuseaddr,fork`). Selecting menu 4 after stage 2 invokes the swapped pointer, spawning the admin rescue shell as the `ctf` service account.

## Flag

Flag: not recovered in the writeup. `solve.py` ends in an interactive shell and does not capture the flag string.
