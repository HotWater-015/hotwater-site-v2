---
title: "Web Hacker 2"
description: "A beginner web exploitation challenge focusing on IDOR (Insecure Direct Object Reference) vulnerabilities."
event: "nns"
category: "web"
categoryLabel: "Web"
tags: ["NNS CTF 2026","web"]
date: "2026-09-05"
teammate: false
source: "NNS/web/web-hacker-2/writeup.md"
---

## Challenge

A beginner web exploitation challenge focusing on **IDOR (Insecure Direct Object Reference)** vulnerabilities.

## Reconnaissance

The landing page at `https://web-hacker2-90ff1ba4af22.chall.nnsc.tf/intro?page=1` hints that the `page` query parameter can be abused.

## Step 1: IDOR on Query Parameter

Changing `?page=1` to `?page=2` reveals the second step, which explains IDOR and provides a link to the boarding pass challenge:

```
https://web-hacker2-90ff1ba4af22.chall.nnsc.tf/intro?page=2
```

The page mentions that the `admin` user may have something interesting.

## Step 2: IDOR on API Endpoint

The boarding pass page (`/boarding-pass`) loads data via JavaScript from:

```
/api/boarding-pass/john
```

This is a classic IDOR — the server does not verify whether the requesting user is authorized to access another user's boarding pass. Changing the username in the API call from `john` to `admin`:

```
https://web-hacker2-90ff1ba4af22.chall.nnsc.tf/api/boarding-pass/admin
```

Returns the admin's boarding pass data, which contains the flag in the `toName` field.

## Flag

```
NNS{Y0u_4re_NoW_1337_hacKer_1ndeed}
```

## Takeaway

IDOR vulnerabilities occur when an application exposes internal object references (like usernames, IDs) without proper access control. Always validate that the authenticated user is authorized to access the requested resource.
