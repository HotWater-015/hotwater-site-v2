---
title: "FlyWithHer.io"
description: "It fetches arbitrary URLs and returns their content, making it vulnerable to SSRF."
event: "noct"
category: "web"
categoryLabel: "Web"
tags: ["NOCT CTF 2026","web"]
date: "2026-09-26"
teammate: false
source: "NOCT/web/2/writeup.md"
---

## Flag

`NOCT{g00d_b0y_1_4m_n0t_j41e}`

## Reconnaissance

The site exposed a link-preview endpoint:

```text
/api/preview?url=<URL>
```

It fetches arbitrary URLs and returns their content, making it vulnerable to SSRF.

Testing localhost revealed internal services:

```text
http://127.0.0.1:3000/
http://127.0.0.1:5000/
```

Port `5000` exposed the Sayana toolkit and its documentation:

```text
/docs/mommy-codec
/docs/pilot-program
```

## DGA endpoint

The pilot-program documentation described the endpoint-generation algorithm:

```text
today = UTC date as YYYYMMDD
days  = (today - 2026-01-01).days
step1 = SHA256(today + "sayana_0wns_u_jaie")
step2 = SHA256(step1 + str(days))[:12]
endpoint = /api/submit/{step2}/jaie
```

For `2026-09-26`, `days` is `268`, producing:

```text
/api/submit/f2264764ec2e/jaie
```

## MOMMY codec

The endpoint requires a MOMMY-encoded result. The encoding process is:

1. XOR the UTF-8 bytes with rolling `MD5("sayana")` bytes.
2. Swap the high and low nibbles of every byte.
3. Base64 encode.
4. Insert `s` after every third Base64 character.
5. Wrap the result in `MOM[...]MOM`.

A valid beacon submission returned:

```json
{
  "gift": "MOM[egBs243sWEFsmHssDj4sgMBs9CCsd0ist0DsBtesDE6sehOs9A=s=]MOM",
  "status": "good_boy"
}
```

Reversing the MOMMY codec on the `gift` value yields the flag:

```text
NOCT{g00d_b0y_1_4m_n0t_j41e}
```
