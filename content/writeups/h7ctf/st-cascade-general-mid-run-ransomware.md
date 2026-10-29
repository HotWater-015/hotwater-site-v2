---
title: "St. Cascade General — Mid-Run Ransomware"
description: "Challenge Overview Category: Forensics / Memory Analysis Provided Files: - memory.lime.zst (Compressed LiME memory dump) - Q3_patient_records.pdf.locked (Encrypted document, 672 bytes)…"
event: "h7ctf"
category: "forensics"
categoryLabel: "Forensics"
tags: ["H7CTF 2026","forensics"]
date: "2026-09-27"
teammate: false
source: "H7CTF/forensic/4/writeup.md"
---

## Challenge Overview
- **Category:** Forensics / Memory Analysis
- **Provided Files:**
  - `memory.lime.zst` (Compressed LiME memory dump)
  - `Q3_patient_records.pdf.locked` (Encrypted document, 672 bytes)
- **Challenge Prompt:**
  > *At 03:14 the ransomware reached St. Cascade General, and by the time responders made the nurses' station it was still chewing through patient files. They froze the workstation where it stood and only then cut the power.*
  > *Catch a thief mid-reach and they are still holding what they grabbed.*

---

## Analysis & Investigation

### 1. Decompressing Artifacts
The memory dump was compressed using `zstandard`. We first decompressed `memory.lime.zst`:

```bash
unzstd -k memory.lime.zst -o memory.lime
```

This produced a full 16 GB physical memory dump (`memory.lime`).

---

### 2. Memory Forensics & Pattern Search
Searching memory for references to the encrypted file (`Q3_patient_records.pdf.locked`) and ransomware activity revealed residual process artifacts, including the attacker/stager scripts:

- Stager script: `ransomware_footprint.py`
- Verification/solver script: `solve.py`
- Bash staging execution command lines

#### Extracted Python Stager (`ransomware_footprint.py`)
```python
def minimal_pdf(body_text):
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>")
    stream = b"BT /F1 12 Tf 72 720 Td (" + body_text.encode() + b") Tj ET"
    objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = b"%PDF-1.4\n"
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n0000000000 65535 f \n"
    for off in offs:
        out += ("%010d 00000 n \n" % off).encode()
    out += b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF"
    return out

def main():
    ...
    plaintext = minimal_pdf(f"CONFIDENTIAL patient record. Recovery token: {FLAG}")
    key = os.urandom(32)
    iv = os.urandom(16)
    pad = 16 - (len(plaintext) % 16)
    ct = AES.new(key, AES.MODE_CBC, iv).encrypt(plaintext + bytes([pad]) * pad)
    with open(os.path.join(outdir, "Q3_patient_records.pdf.locked"), "wb") as f:
        f.write(iv + ct)
```

The stager embedded the plaintext format:
`CONFIDENTIAL patient record. Recovery token: {FLAG}`

---

### 3. Extracting the Plaintext / Flag
Because the memory capture occurred while the process was resident and active in memory (simulating a freeze before power cut), multiple artifacts were preserved in RAM:

1. **Process Environment Variables:**
   ```bash
   FLAG='H7CTF{bf3a8e98115450c654b4}' nohup python3 ~/ransomware_footprint.py /srv/incident >~/stager.log 2>&1 &
   ```

2. **Heap Memory Structure:**
   Searching for `Recovery token:` across the memory image located the pre-encryption PDF payload:
   ```text
   CONFIDENTIAL patient record. Recovery token: H7CTF{bf3a8e98115450c654b4}) Tj ET
   endstream
   endobj
   5 0 obj
   << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
   endobj
   xref
   0 6
   0000000000 65535 f 
   ```

---

## Flag

```
H7CTF{bf3a8e98115450c654b4}
```
