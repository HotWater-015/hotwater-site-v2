---
title: "Ghost Spooler — Forensics"
description: "FP02CF4.SHD — Windows print-job shadow/metadata file FP02CF4.SPL — spooled print data scan.png — scanned printed page with a faint tracking-dot pattern Tools: file, strings (including…"
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/ghost-in-the-spooler.md"
---

## Challenge Description

> A workstation got imaged late one night and three leftovers from its print spooler made it out before the drive was wiped. A scanner in the evidence room had a scan of what looks like the same page sitting on it. Prove the document was printed from that exact machine, then build the flag.
>
> The flag is not sitting in any file. You build it from three things you have to recover: the username that owned the print job (lowercased), the printer's 7 digit serial number, and the UTC timestamp of the print, formatted `YYYY-MM-DDTHH:MM:SSZ` (seconds are always `00`). The flag is then `isfcr{` followed by the first 16 hex characters of `SHA-256(username + "|" + serial + "|" + timestamp)` followed by `}`.
>
> You are given `FP02CF4.SHD`, `FP02CF4.SPL`, and `scan.png`. Everything you need to recover those three values is in those files.

**Challenge:** Ghost in the Spooler  
**Category:** Forensics  
**Points:** 50  
**Author:** SR

## Objective

Recover the lowercase job owner, seven-digit printer serial, and UTC print timestamp. Concatenate them with pipe separators, SHA-256 hash the resulting string, and use the first 16 hexadecimal characters inside `isfcr{...}`.

## Evidence and tools

- `FP02CF4.SHD` — Windows print-job shadow/metadata file
- `FP02CF4.SPL` — spooled print data
- `scan.png` — scanned printed page with a faint tracking-dot pattern
- Tools: `file`, `strings` (including Unicode strings), a binary/hex viewer, an image editor or Python image-processing tools, and Python's `hashlib`

## Step 1 — Examine the spooler metadata

The `.SHD` artifact holds metadata linking a queued job to its owner, printer, and workstation. Inspecting its strings and binary fields reveals:

| Field | Value |
| --- | --- |
| Print-job owner | `j.holbrook` |
| Workstation | `FIN-WKS-014` |
| Printer | `Xerox DocuColor 12 PS` |
| Document | `Q3-Compensation-Adjustments.docx` |
| Print time (UTC) | `2024-09-17T14:37:00Z` |

Useful initial commands:

```bash
file FP02CF4.SHD FP02CF4.SPL scan.png
strings -a FP02CF4.SHD
strings -a -el FP02CF4.SHD   # UTF-16 little-endian strings
xxd FP02CF4.SHD | less
```

Windows print-job timestamps may be stored as FILETIME values (100-nanosecond intervals since 1601-01-01 UTC). When identifying the correct timestamp field, convert it to UTC and preserve the challenge's required seconds precision.

The username used for the hash is **`j.holbrook`**.

## Step 2 — Correlate the spool data with the scan

The `.SPL` contains the content submitted to the printer. Its document data matches the memorandum on `scan.png`, connecting the scan to the recorded print job. The `.SHD` metadata then identifies the source workstation (`FIN-WKS-014`) and the queue/printer used.

This correlation matters: identifying a name or timestamp alone does not establish that the physical scanned sheet corresponds to this particular spool job.

## Step 3 — Decode the printer tracking dots

The scan includes faint yellow tracking dots. Xerox DocuColor printers are known to print machine-identification codes in repeated yellow-dot patterns. Enhance yellow-dot contrast and examine a complete repeated grid rather than a single isolated cluster.

The recovered grid values were:

```text
37, 14, 17, 9, 24, 8, 8, 4, 2, 0, 1, 3
```

The date/time-related entries agree with the spooler timestamp. The serial-number digits extracted from the tracking pattern are:

```text
8842013
```

The tracking code provides an independent link between the physical page and the printer identified by the spool files. Combined with the matching page content and workstation metadata, this supports attribution of the printed document to the imaged machine's print job.

For background on Xerox tracking-code decoding, see the EFF's research: https://www.eff.org/pages/list-printers-which-do-or-do-not-display-tracking-dots and https://www.eff.org/wp/investigating-machine-identification-code-technology-color-laser-printers

## Step 4 — Build and verify the flag

Recovered values:

```text
username  = j.holbrook
serial    = 8842013
timestamp = 2024-09-17T14:37:00Z
```

Concatenate them using literal pipe characters, with **no spaces or newline**:

```text
j.holbrook|8842013|2024-09-17T14:37:00Z
```

Reproduce the hash and flag with Python:

```python
import hashlib

username = "j.holbrook".lower()
serial = "8842013"
timestamp = "2024-09-17T14:37:00Z"

evidence = f"{username}|{serial}|{timestamp}"
digest = hashlib.sha256(evidence.encode("utf-8")).hexdigest()
flag = f"isfcr{{{digest[:16]}}}"

print("Evidence:", evidence)
print("SHA-256:", digest)
print("Flag:", flag)
```

Output:

```text
Evidence: j.holbrook|8842013|2024-09-17T14:37:00Z
SHA-256: e24d16be9d731cba62793f93bbd3cf637d1450862c06197e37473d026b6908bd
Flag: isfcr{e24d16be9d731cba}
```

## Final flag

```text
isfcr{e24d16be9d731cba}
```

## Key takeaway

The solution combines **Windows print-spool forensics** (`.SHD` metadata and `.SPL` content) with **physical printer tracking-dot analysis** (`scan.png`). Matching the content and timestamp provides corroboration; the username, serial, and UTC timestamp form the exact SHA-256 preimage required for the flag.
