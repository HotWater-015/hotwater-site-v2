---
title: "Redacted Minutes"
description: "redacted/XploitX_Stego03_Participants/extractions/NIGHTINGALE_memo_RESTRICTED.docx.extracted/0/word/document.xml 1. Zero-width chars in the RE: line → key. Map \\u200b=10, \\u200c=00,…"
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-09"
teammate: false
source: "xploit/xploit-5/steg/redacted/.read.md"
---

redacted/XploitX_Stego03_Participants/extractions/NIGHTINGALE_memo_RESTRICTED.docx.extracted/0/word/document.xml
1. Zero-width chars in the RE: line → key.
Map \u200b=10, \u200c=00, \u200d=11, \u2060=01, decode → n1ghting4le_0v3rwatch.
2. <w:del> / <w:delText> runs, keep only author J. Okafor (26 runs × 96 base64 chars).
Sort by w:date ascending, concatenate, base64-decode → nightingale.zip.
3. unzip -P 'n1ghting4le_0v3rwatch' nightingale.zip → notes.txt.
4. Trailing whitespace of each notes.txt line (40 lines × 8 chars): space=1, tab=0, MSB-first → flag.
Flag: XploitXβ{tr4ck3d_z3r0w1dth_sn0w_l4y3rs}
