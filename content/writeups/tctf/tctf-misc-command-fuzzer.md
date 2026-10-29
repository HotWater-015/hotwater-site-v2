---
title: "TCTF Misc: Command Fuzzer"
description: "The TCTF 2026 challenge behind this folder presents a shell-like service on a remote host (TCP port 23, banner included) that ships with a very restricted command vocabulary. Without any…"
event: "tctf"
category: "misc"
categoryLabel: "Misc"
tags: ["TCTF 2026","misc"]
date: "2026-10-22"
teammate: false
source: "tctf/test/writeup.md"
---

The TCTF 2026 challenge behind this folder presents a shell-like service on a remote host (TCP port 23, banner included) that ships with a *very* restricted command vocabulary. Without any handout file naming the challenge, the practical first move is statistical: fuzz the command word. `solve.py` does exactly that — it collects a candidate word list from the local system plus challenge-shaped keywords, slams the service with one connection per candidate, and flags any response that doesn't match the boilerplate rejections.

## Summary

The script is a threaded, multi-connection command-name fuzzer against `10.80.137.245:23` (15 concurrent threads). It builds a candidate list from every binary name found in `/bin` and `/usr/bin`, layers on a curated set of shell/recon keywords (`help`, `ls`, `cat`, `tar`, `grep`, ...) plus challenge-specific guesses (`ex0rcist`, `exorcists`, `w4nn4d13`, `sandman`, `node99`, `archive`, `clearance`, `override`, `unlock`, `auth`, ...), then tests each candidate through a fresh TCP connection and records anything whose reply doesn't trip the standard "restricted" wording.

## Connection Behaviour

Each test is deliberately one-shot — connect, read the banner, send the candidate, read one reply, close:

```python
s = socket.create_connection((TARGET_IP, TARGET_PORT))
s.settimeout(2.5)
s.connect((TARGET_IP, TARGET_PORT))
s.recv(2048)                      # banner
s.sendall((cmd + "\n").encode())
res = s.recv(2048).decode(errors="ignore")
s.close()
```

The 2.5-second timeout keeps a hung worker from stalling the pool. Exceptions (refused connections, EOFs) are swallowed so a flaky remote can't bring the sweep down mid-run.

## Hit Detection

Because the service clearly has standard denials, the script treats only *non*-boilerplate output as a hit:

```python
if res and "is restricted" not in res and "is not an authorized" not in res and "CAUTION" not in res:
    hits.append((cmd, res.strip()))
    print(f"\n[+] HIT FOUND: {cmd}\n    --> {res.strip()}\n")
```

Anything not matching the "restricted" / "not authorized" / "CAUTION" phrasing means the candidate actually routed to real logic, and the response is printed immediately (not just collected at the end) so partial sweeps still yield results.

## Orchestration

The candidate universe is deduplicated and sorted, then driven by a `ThreadPoolExecutor` with a lock-guarded progress readout:

```python
with ThreadPoolExecutor(max_workers=THREADS) as executor:
    executor.map(test_cmd, all_commands)
```

A live `[tested/total] <pct>% | Current: cmd` line keeps the operator informed, and after the sweep the collected hits are dumped one per line.

## What It Revealed

The keyword list is the interesting artifact — it encodes guesses about the challenge's theme (an exorcist/sandman-style shell) that aren't in the local filesystem at all, mixing leetspeak spellings (`ex0rcist`) with plausible variations (`exorcists`, `node99`/`node-99`) so a fuzzy vocabulary isn't a dead end. The fuzzer itself stays generic: swap `TARGET_IP`/`TARGET_PORT` and the keyword list and it re-targets anything that answers a line-based shell-ish protocol on a TCP port.

## Exploit

```bash
python3 solve.py    # edit TARGET_IP/TARGET_PORT for the target instance
```

## Flag

Flag: not recovered in the writeup. The script's purpose is to discover valid command names (its output reports which commands escaped the boilerplate rejections); the subsequent read-and-exfiltrate step is not part of this script and no flag string is on disk.
