---
title: "H7 Passport — Legacy Attestation Path for Enterprise Tier"
description: "For H7CTF 2026 this web-style challenge is a WebAuthn/FIDO2 Relying Party (\"H7 Passport\") with a twist: it accepts three attestation formats (packed, tpm, android-key), but only…"
event: "h7ctf"
category: "web"
categoryLabel: "Web"
tags: ["H7CTF 2026","web"]
date: "2026-10-22"
teammate: false
source: "H7CTF/test/writeup-passport.md"
---

For H7CTF 2026 this web-style challenge is a WebAuthn/FIDO2 Relying Party ("H7 Passport") with a twist: it accepts **three** attestation formats (`packed`, `tpm`, `android-key`), but only credentials enrolled at the *enterprise* tier may drive the privileged action behind `/assert/finish`. The intended bug, as far as I reconstructed it, is in the legacy attestation path for unregistered ("air-gapped") authenticators and the bespoke authenticator-policy X.509 extension it consults.

## Enrollment flow

`GET /register/begin` costs one Ledger credit and returns `rpId`, `origin`, a 32-byte challenge, tier list, and the pinned `pubKeyAlg` (-7 = ES256). `POST /register/finish` then trusts the client to supply a correct CBOR `attestationObject` with `fmt`, `attStmt`, and `authData`. My artifact `passport_client.py` builds the WebAuthn structures entirely by hand: `authData` is standard (`rpIdHash(32) || flags(1) || signCount(4) || aaguid(16) || credIdLen(2) || credId || COSE_EC2_key`), with the user-present (`0x01`), user-verified (`0x04`), and attested-credential (`0x40`) bits set:

```python
flags = 0x01 | 0x04 | 0x40
auth_data = build_auth_data(rp_id, flags, b"\x00" * 16, cred_id, cose)
signature = key.sign(auth_data + client_hash, ec.ECDSA(hashes.SHA256()))
att = {"fmt": "packed", "attStmt": {"alg": -7, "sig": signature}, "authData": auth_data}
```

`build_auth_data` uses CBOR minimal-enc length headers built by hand in `cbor_head`, so everything fits in one artifact with no `fido2` library.

## The dispatch

The RP consults its pinned MDS3 blob (`mds_blob.json`): if the credential's AAGUID is listed there, a real certificate chain is required and verified to `attestationRootCertificate` for that entry — no shortcut there. But a **legacy self-enrolled enterprise path** exists for authenticators "whose AAGUID is not present in the metadata store". That path is what I targeted: it predates MDS and now only consults a custom policy extension on the leaf cert.

## The policy extension

The internal OID is `1.3.6.1.4.1.61387.2.7.4`, and its `AuthenticatorPolicy` ASN.1 shape (`SPEC.md`) is:

```
AuthenticatorPolicy ::= SEQUENCE {
    version INTEGER, aaguidCount INTEGER,
    aaguids SEQUENCE OF OCTET STRING,
    elevated [7] BOOLEAN OPTIONAL, ...
}
```

The internal parser changelog (v2.1) states that policy fields moved from positional decoding to explicit context-tag numbering, with "the tag assigned to the trailing policy flags derived relative to the aaguid section" — i.e. derived from `aaguidCount`, not hard-coded. `elevated` is exactly the field the enterprise console gates on; consumer authenticators ship `elevated = FALSE`.

## The attack

`test/solve.py` forges the whole thing over a self-generated P-256 key: builds a self-signed `packed` attestation leaf, embeds a hand-rolled DER `AuthenticatorPolicy` inside an `UnrecognizedExtension` on the POLICY_OID, and claims `aaguidCount = 4` while supplying only one AAGUID octet string:

```python
aaguids = der(0x30, der(0x04, aaguid))
elevated = der(0x8B, b"\xff")    # context tag [7] primitive, value 0xff
policy = der(0x30, integer(1) + integer(4) + aaguids + elevated)
```

`der(0x8B, ...)` is tag `0x8B` = context-specific, constructed, tag number 11 (`0x80 | 0x20 | 0x0B`). The mismatch between the *claimed* count (4) and the sequence's single member is where the parser's `7 + aaguidCount` counting logic desynchronizes from the real DER layout, which is the precise reason real attestations wouldn't trip it. A random 16-byte AAGUID guarantees "not present in the metadata store," steering the RP down the legacy path. With the enterprise tier granted, `/assert/begin` + `/assert/finish` with user-verified flags (`aflags = 0x01 | 0x04`) triggers the privileged action.

## Flag

Flag: not recovered in the writeup. The scripts print HTTP statuses for `register/finish` and `assert/finish` only; no flag string is present in the artifacts.
