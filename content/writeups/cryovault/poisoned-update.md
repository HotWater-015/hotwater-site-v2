---
title: "Poisoned Update"
description: "The target is a shared VX-410 controller exposed through a JSON API. The intended path is to stage firmware into bank B, boot the trial, pass the boot diagnostic, and confirm the trial.…"
event: "cryovault"
category: "iot"
categoryLabel: "IoT"
tags: ["ISFCR CryoVault Finals 2026","iot"]
date: "2026-10-26"
teammate: false
source: "cryovault/iot/4/writeup.md"
---

## Flag

```text
isfcr{6f3944938016591a285bcf5359b97f69}
```

## Summary

The target is a shared VX-410 controller exposed through a JSON API. The intended
path is to stage firmware into bank B, boot the trial, pass the boot diagnostic,
and confirm the trial. At the time of this run, the shared controller was already
in the `confirmed` phase with a successful diagnostic trial from bank B. Calling
`/api/confirm` therefore returned the flag immediately. No reset or update was
required.

## Commands used

```bash
curl -sS -i -X POST --max-time 20 https://isfcrpesu-poisoned-update.chals.io/api/confirm | head -40; echo; curl -sS -i -X POST --max-time 20 -H 'Content-Type: application/octet-stream' --data-binary @/home/hotwater/isfcr/iot/4/approved-4.3.vxu https://isfcrpesu-poisoned-update.chals.io/api/update | head -60
```

## Output

```http
HTTP/1.0 200 OK
Server: VX-Service/4.2 Python/3.11.2
Date: Sat, 24 Oct 2026 22:21:41 GMT
Content-Type: application/json
Content-Length: 180
Connection: close

{"phase": "confirmed", "active_slot": "B", "epoch": 43, "diagnostic_ok": true, "observation": "unauthorized diagnostic firmware", "flag": "isfcr{6f3944938016591a285bcf5359b97f69}"}
HTTP/1.0 400 Bad Request
Server: VX-Service/4.2 Python/3.11.2
Date: Sat, 24 Oct 2026 22:21:42 GMT
Content-Type: application/json
Content-Length: 55
Connection: close

{"error": "reset the controller before another update"}
```

## Breaking down the curl commands

### 1. Confirming the booted trial

```bash
curl -sS -i -X POST --max-time 20 \
  https://isfcrpesu-poisoned-update.chals.io/api/confirm | head -40
```

| Part | Meaning |
| --- | --- |
| `curl` | Command-line HTTP client used to talk to the controller API. |
| `-sS` | `-s` hides the progress meter; `-S` still prints real curl errors. This keeps the output JSON clean while not silently swallowing connection failures. |
| `-i` | Include the HTTP response status line and headers in the output. This is useful for verifying the status (`200 OK`, `400 Bad Request`, etc.) and content type. |
| `-X POST` | Force the HTTP method to `POST`. `/api/confirm` is an action endpoint, so a `GET` would not perform the confirmation. |
| `--max-time 20` | Abort the request after 20 seconds. Useful on a shared/remote challenge service so a hung request does not block indefinitely. |
| `https://isfcrpesu-poisoned-update.chals.io/api/confirm` | Endpoint that confirms the currently booted trial bank and returns the result. |
| `| head -40` | Show only the first 40 lines. The relevant headers and compact JSON fit comfortably within that, and it avoids dumping a large response. |

The response was `200 OK`. The important fields were:

```json
{
  "phase": "confirmed",
  "active_slot": "B",
  "epoch": 43,
  "diagnostic_ok": true,
  "observation": "unauthorized diagnostic firmware",
  "flag": "isfcr{6f3944938016591a285bcf5359b97f69}"
}
```

`diagnostic_ok: true` means the booted bank B firmware produced the required
`VX/DIAG-OK:` response for the controller's nonce and epoch. Because the trial
was valid, the confirm endpoint released the flag.

### 2. Attempting an update afterward

```bash
curl -sS -i -X POST --max-time 20 \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @/home/hotwater/isfcr/iot/4/approved-4.3.vxu \
  https://isfcrpesu-poisoned-update.chals.io/api/update | head -60
```

| Part | Meaning |
| --- | --- |
| `-sS -i -X POST --max-time 20` | Same behavior as above: quiet but show errors, include response headers, use `POST`, and time out after 20 seconds. |
| `-H 'Content-Type: application/octet-stream'` | Tells the service the request body is raw binary data, which is required for a `.vxu` firmware package. Without this header the server may reject or mis-handle the upload. |
| `--data-binary @/home/hotwater/isfcr/iot/4/approved-4.3.vxu` | Reads the file exactly as-is and sends its bytes as the request body. `--data-binary` is important here instead of `-d`: `-d` may strip newlines or otherwise alter the payload, which would break the package CRC/format checks. |
| `https://isfcrpesu-poisoned-update.chals.io/api/update` | Endpoint that verifies and stages an update package. |
| `| head -60` | Limits output to the first 60 lines, enough for the status line, headers, and JSON error body. |

This request returned `400 Bad Request`:

```json
{"error": "reset the controller before another update"}
```

The controller was already in the `confirmed` phase at epoch 43. A normal update
consumes an epoch, so the service refuses another update until the controller is
reset back to the factory state (`epoch 42`, active bank A). Because the device is
shared across teams, performing a reset would affect everyone, and it was not
needed to obtain the flag in this run.

## API flow reference

For completeness, the full API sequence for a fresh controller state is:

1. Check the current controller state:

   ```bash
   curl -sS https://isfcrpesu-poisoned-update.chals.io/api/device
   ```

2. Optionally restore the factory state:

   ```bash
   curl -sS -X POST https://isfcrpesu-poisoned-update.chals.io/api/reset
   ```

3. Upload a candidate firmware package:

   ```bash
   curl -sS -X POST \
     -H 'Content-Type: application/octet-stream' \
     --data-binary @candidate.vxu \
     https://isfcrpesu-poisoned-update.chals.io/api/update
   ```

4. Boot the staged bank B image:

   ```bash
   curl -sS -X POST https://isfcrpesu-poisoned-update.chals.io/api/reboot
   ```

5. Confirm the booted trial and retrieve the flag:

   ```bash
   curl -sS -X POST https://isfcrpesu-poisoned-update.chals.io/api/confirm
   ```

## Notes on the shared controller

`/api/reset` is global: it restores the shared device state for every team.
Because the controller was already in a successful confirmed state, the safest
and sufficient action was simply to call `/api/confirm`. The later `/api/update`
attempt correctly failed with the "reset the controller before another update"
error, confirming that the controller was still in its confirmed trial state.
