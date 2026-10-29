---
title: "Shadow Consent"
description: "Organization: Beacon Data Systems Incident Date: 2024-03-14 Analysis Date:** 2024-03-16"
event: "luna1"
category: "forensics"
categoryLabel: "Forensics"
tags: ["Luna CTF 2026","forensics"]
date: "2026-10-03"
teammate: false
source: "luna1/forensic/challenge/README.md"
---

## DFIR Challenge — Extreme Difficulty

**Organization:** Beacon Data Systems  
**Incident Date:** 2024-03-14  
**Analysis Date:** 2024-03-16  

---

## Case Brief

On March 14, Beacon's security team detected an OAuth token exchange at 14:37 UTC directed at a cloud service account (`svc-app02@beacon.local`). Sixteen minutes later, a legitimate-looking Kerberos service ticket request appeared on the domain controller. By 15:04, administrative credentials were extracted from memory on an internal application server.

The timeline is tight. The attackers moved fast. The evidence is fragmented across mail logs, workstation artifacts, Windows event logs, and network telemetry — and some of it contradicts itself.

Your job: reconstruct what actually happened, identify the attack chain, and derive the flag from your findings.

**Flag Format:** `Lun4R{...}`

---

## Environment

- **Domain:** beacon.local
- **Workstations:** WKS-DEV02 (developer), WKS-OPS09 (operator)
- **Servers:** DC-CORP01 (domain controller), SRV-APP02 (application server)
- **User Accounts:** jsmith (John Smith), dchen (Diana Chen), svc-app02 (service account)
- **Time Zone Context:** EST/EDT (UTC-5/-4); March 14 crosses DST boundary at 02:00 EDT

---

## Evidence Inventory

| ID | Source | Type | Description |
|----|--------|------|-------------|
| EV-01 | mail/phishing_campaign | Text | Phishing email with OAuth consent link |
| EV-02 | WKS-DEV02/mrt_scan | Text | MRT cache / Windows Defender log snippet |
| EV-03 | WKS-OPS09/local_logs | Text | Local Security Authority logs (raw format) |
| EV-04 | WKS-OPS09/xml_logs | XML | Same event logs exported in raw Event Viewer XML |
| EV-05 | WKS-DEV02/powershell_history | Text | PowerShell command history and console output |
| EV-06 | network/http_proxy | Text | HTTP proxy logs (OAuth callback, etc.) |
| EV-07 | DC-CORP01/event_4769 | Text | Kerberos TGS-REQ events (Event ID 4769) |
| EV-08 | WKS-OPS09/event_service_gap | Text | Event log service restart / gap indicator |
| EV-09 | network/dns_responses | Text | DNS queries and recursive resolution |
| EV-10 | SRV-APP02/auth_attempts | Text | Application-level auth logs (svc-app02 attempts) |
| EV-11 | SRV-APP02/memory_dump_strings | Text | `strings` output from memory dump (partial) |
| EV-12 | SRV-APP02/lsa_registry | Text | Registry export showing LSA secrets config |
| EV-13 | backup/scheduled_tasks | Text | Backup server's scheduled task execution log |
| EV-14 | WKS-DEV02/recon_script | Text | PowerShell script found on disk (deleted then recovered) |
| EV-15 | server/DC-CORP01/replication | Text | LDAP replication logs (secondary phishing vector) |
| EV-16 | auth/kerberos_tickets | Text | Kerberos ticket hashes for offline Kerberoasting |
| EV-17 | hashes/file_hashes | Text | SHA-256 hashes for verification |

---

## Investigation Questions

1. **Initial Access:** How did the attacker establish a foothold? Which user account was compromised first, and when?

2. **OAuth Abuse:** Identify the OAuth consent phishing email. What does the attacker's callback URL resolve to, and why is that significant?

3. **DST Ambiguity Trap:** One event log claims an activity at 01:30 on March 14. Is that before or after the DST transition? Why does this matter for the timeline?

4. **Kerberoasting Evidence:** Find the Kerberos TGS-REQ for `svc-app02`. What does the ticket request timestamp tell you about when the attacker had credentials?

5. **Credential Theft:** Identify the service account credentials that were stolen from memory. What hash/password construct links them to the Kerberos evidence?

6. **Lateral Movement:** Account `dchen` appears in multiple logs. Was she actually involved, or is she a decoy?

7. **False Hypothesis A:** One evidence file suggests a legitimate PowerShell recon script. How do you know it's not the attacker's tool?

8. **False Hypothesis B:** A memory dump snippet contains what looks like plaintext credentials. Are they real, or a red herring?

9. **Final Attribution:** Construct the flag from: patient-zero account, OAuth callback hostname, Kerberos service hash type, and a timestamp element that ties it all together.

---

## Rules

- **No AI Assistance:** Write-ups will be spot-checked. Using AI to solve this challenge violates CTF integrity policy and will result in disqualification.
- **Manual tools only:** binwalk, strings, grep, hashcat, Wireshark, event log viewers — standard IR tools. No automated machine-learning solvers.
- **Flag Submission:** Flags must be in format `Lun4R{...}`. Incorrect format or wrong components = no points.

---

## How to Use These Files

1. Extract all files from `evidence/`
2. Read each evidence file in numerical order (EV-01 through EV-17)
3. Build a timeline — note what contradicts what
4. Cross-reference between sources (mail ↔ event logs ↔ network logs)
5. Answer the 9 investigation questions
6. Construct the flag from your findings

Good luck. The first plausible-looking answer is almost certainly wrong.
