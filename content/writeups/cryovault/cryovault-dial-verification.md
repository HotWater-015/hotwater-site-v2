---
title: "CryoVault Dial Verification"
description: "I read CHART_NOTES.txt first. Its marking convention identifies a verified reading by a ring around one hex character with two lines beneath it. The number beside the ring gives the…"
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/9/writeup.md"
---

## Method

I read `CHART_NOTES.txt` first. Its marking convention identifies a verified reading by a **ring around one hex character with two lines beneath it**. The number beside the ring gives the character's position in the sixteen-character set. A ring with only one underline records a remote reading and does not count.

I inspected the scanned charts for rings, then checked the marks on each candidate at full resolution. Twenty-four charts have ringed readings: sixteen have two underlines and eight have one. The eight single-underlined rings were excluded regardless of the character or position written beside them. In particular, some share positions with verified readings, so sorting every ringed chart by position would give an incorrect result.

## Verified readings

| Position | Chart | Character |
| ---: | --- | :---: |
| 1 | [2020-07-14 21:54](cold-archive/charts/ds_20200714-2154.png) | `7` |
| 2 | [2024-09-03 11:26](cold-archive/charts/ds_20240903-1126.png) | `d` |
| 3 | [2022-01-27 02:04](cold-archive/charts/ds_20220127-0204.png) | `2` |
| 4 | [2025-09-23 19:22](cold-archive/charts/ds_20250923-1922.png) | `b` |
| 5 | [2025-02-28 15:58](cold-archive/charts/ds_20250228-1558.png) | `9` |
| 6 | [2026-02-07 13:01](cold-archive/charts/ds_20260207-1301.png) | `e` |
| 7 | [2024-12-25 09:40](cold-archive/charts/ds_20241225-0940.png) | `4` |
| 8 | [2022-12-07 05:54](cold-archive/charts/ds_20221207-0554.png) | `a` |
| 9 | [2024-05-16 21:48](cold-archive/charts/ds_20240516-2148.png) | `f` |
| 10 | [2020-03-25 10:41](cold-archive/charts/ds_20200325-1041.png) | `6` |
| 11 | [2023-01-19 01:13](cold-archive/charts/ds_20230119-0113.png) | `1` |
| 12 | [2024-09-16 08:25](cold-archive/charts/ds_20240916-0825.png) | `c` |
| 13 | [2021-05-15 17:52](cold-archive/charts/ds_20210515-1752.png) | `3` |
| 14 | [2020-08-21 05:25](cold-archive/charts/ds_20200821-0525.png) | `0` |
| 15 | [2020-04-21 14:31](cold-archive/charts/ds_20200421-1431.png) | `8` |
| 16 | [2024-07-13 00:16](cold-archive/charts/ds_20240713-0016.png) | `5` |

Reading those characters in position order gives `7d2b9e4af61c3085`.

**Flag:** `isfcr{7d2b9e4af61c3085}`
