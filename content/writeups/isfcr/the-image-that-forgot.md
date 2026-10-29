---
title: "The Image That Forgot"
description: "Recover the incident token belonging to the container instance serving dispatch-ac1af5608a at 2026-08-14 10:10:08.555 +05:30. The input archive contains:"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/the-image-that-forgot.md"
---

**Category:** Forensics / Containers / Cryptography  
**Flag format:** `isfcr{...}`  
**Flag:** `isfcr{57cfd556fca281af64d920ef}`

## Challenge objective

Recover the incident token belonging to the container instance serving `dispatch-ac1af5608a` at **2026-08-14 10:10:08.555 +05:30**. The input archive contains:

- `events.jsonl` — deployment, restart, migration, rollback, and mutable image-tag history.
- `images.tar` — an OCI image layout with multi-platform indexes, manifests, and filesystem layers.
- `vault.json` — candidate AES-256-GCM keys and encrypted incident-token notes.

The final flag is encrypted separately. It can be decrypted only after assembling the correct event ID, image manifest digest, service ID, key version, and recovered token.

## 1. Normalize the timeline

Convert the requested timestamp and all event timestamps to UTC before comparing them:

```text
Target: 2026-08-14T10:10:08.555+05:30
UTC:    2026-08-14T04:40:08.555Z
```

Inspect the events for the target service. In particular, the deployment history includes the following migration:

```json
{"action":"migrate","event_id":"deploy-9d1a1fd93d","node":"node-3dfc02","platform":"linux/amd64","service_id":"dispatch-ac1af5608a","time":"2026-08-14T13:36:41.756+09:00"}
```

That event occurred at **04:36:41.756Z**, before the target time. Its platform is `linux/amd64`. A later activation should not be mistaken for the running instance at the target moment; similarly, failed activations are not successful deployments. The relevant starting event is:

```text
deploy-9d1a1fd93d
```

## 2. Resolve the image actually running

The image reference is not necessarily a leaf manifest. `dispatch:stable` changes over time; tag-resolution events use millisecond Unix timestamps (`time_ms`). Furthermore, a digest referenced by an event may identify an OCI **image index**, which contains multiple architecture-specific manifests.

The correct procedure is:

1. Replay tag-resolution events in timestamp order, honoring when each tag mapping was in effect.
2. Follow the image reference associated with the instance's activation/migration history.
3. Open the relevant OCI index in `images.tar` and select its `linux/amd64` child manifest, matching the migrated instance platform.
4. Record the **child image-manifest digest**, not the index digest and not a layer/config digest.

The resolved image manifest is:

```text
sha256:154d6f1fa75464d02b6245a4e536f6efb187af4bf7266aff8ac9e2e21d4538f8
```

## 3. Reconstruct the effective filesystem

An OCI image is an ordered stack of filesystem layers. It is incorrect to select a plausible `key-version.json` from any layer without applying all later changes.

The selected manifest contains five layers. Among its files are:

```text
etc/service/key-version.json
opt/dispatch/templates/key-version.json
opt/dispatch/.state/b97e8564
etc/service/.wh..wh..opq
etc/service.bak/key-version.json
```

The important marker is:

```text
etc/service/.wh..wh..opq
```

This **opaque whiteout** hides files inherited from lower layers under `etc/service/`. Consequently, the earlier `etc/service/key-version.json` is not reliable evidence of the final image state. The `templates` file is for another service, and the backup file is not the effective service configuration.

The instance's state artifact contains:

```json
{"key_version":"key-e52be7cc57","service_id":"dispatch-ac1af5608a"}
```

Therefore the matching key version is:

```text
key-e52be7cc57
```

## 4. Authenticate and decrypt the incident token

Every entry in `vault.json` is encrypted using AES-256-GCM:

- `nonce` is 12 bytes, hex-encoded.
- `data` is the hex-encoded ciphertext **with its 16-byte GCM tag appended**.
- One of the entries in `keys` is the 32-byte encryption key.
- The associated authenticated data (AAD) is the **compact ASCII JSON** representation of:

```json
["dispatch-ac1af5608a","key-e52be7cc57","sha256:154d6f1fa75464d02b6245a4e536f6efb187af4bf7266aff8ac9e2e21d4538f8","deploy-9d1a1fd93d"]
```

Use the following snippet to recover the token (run from the directory containing `vault.json`):

```python
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

service_id = "dispatch-ac1af5608a"
key_version = "key-e52be7cc57"
manifest_digest = "sha256:154d6f1fa75464d02b6245a4e536f6efb187af4bf7266aff8ac9e2e21d4538f8"
event_id = "deploy-9d1a1fd93d"

with open("vault.json", encoding="utf-8") as f:
    vault = json.load(f)

aad = json.dumps(
    [service_id, key_version, manifest_digest, event_id],
    ensure_ascii=True, separators=(",", ":"),
).encode("ascii")

matches = []
for note in vault["notes"]:
    nonce = bytes.fromhex(note["nonce"])
    ciphertext_and_tag = bytes.fromhex(note["data"])
    for candidate in vault["keys"]:
        try:
            token = AESGCM(bytes.fromhex(candidate)).decrypt(
                nonce, ciphertext_and_tag, aad
            ).decode("ascii")
            matches.append(token)
        except (ValueError, UnicodeDecodeError):
            pass

if len(matches) != 1:
    raise RuntimeError(f"Expected one matching note, got {len(matches)}")

token = matches[0]
print("Recovered token:", token)
```

The authenticated plaintext is:

```text
e411af706f77101364ccdf6b0cb59e75eb8b3cc34342a94c
```

An invalid key, wrong image digest, wrong event ID, or incorrect AAD causes AES-GCM authentication to fail.

## 5. Construct the flag evidence

The challenge specifies the following **exact order**:

```python
evidence = [
    "deploy-9d1a1fd93d",
    "sha256:154d6f1fa75464d02b6245a4e536f6efb187af4bf7266aff8ac9e2e21d4538f8",
    "dispatch-ac1af5608a",
    "key-e52be7cc57",
    "e411af706f77101364ccdf6b0cb59e75eb8b3cc34342a94c",
]
```

Derive the flag-decryption key using scrypt, then decrypt the final AES-GCM payload:

```python
import hashlib
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

evidence = [
    "deploy-9d1a1fd93d",
    "sha256:154d6f1fa75464d02b6245a4e536f6efb187af4bf7266aff8ac9e2e21d4538f8",
    "dispatch-ac1af5608a",
    "key-e52be7cc57",
    "e411af706f77101364ccdf6b0cb59e75eb8b3cc34342a94c",
]

E = json.dumps(evidence, ensure_ascii=True, separators=(",", ":")).encode("ascii")
key = hashlib.scrypt(
    b"isfcr-forensics\x00" + E,
    salt=bytes.fromhex("8b57a161139a064a196625972f7e602d"),
    n=131072, r=8, p=1, maxmem=2**28, dklen=32,
)
flag = AESGCM(key).decrypt(
    bytes.fromhex("244cb048e982870d71f68dfe"),
    bytes.fromhex("02e462042292a430220d3959e46c379b7f96d44726c6c390338ed11b7ee9878875de07ad212f4dbbda1994c3e2574c"),
    b"the-image-that-forgot",
)
print(flag.decode("ascii"))
```

Expected output:

```text
isfcr{57cfd556fca281af64d920ef}
```

## Key takeaways

- Normalize **all** timestamps before ordering events; source timezone offsets differ.
- A mutable tag, OCI image index, and architecture-specific image manifest are distinct objects.
- Select the manifest matching the **running instance's platform**.
- Respect OCI whiteouts and layer ordering; old configuration files and backups are decoys.
- AES-GCM AAD is byte-exact: JSON field order, compact separators, and digest prefix matter.
- The final AES-GCM authentication tag provides a definitive check of the assembled evidence.

## Final flag

```text
isfcr{57cfd556fca281af64d920ef}
```
