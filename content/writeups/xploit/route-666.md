---
title: "Route 666"
description: "An insane-tier core-backbone incident: BGP route flapping between two peers on a transit edge gateway, with a hidden exfiltration target. The core trick is reconstructing route flap…"
event: "xploit"
category: "networking"
categoryLabel: "Networking"
tags: ["XploitX 2026","networking"]
date: "2026-10-22"
teammate: false
source: "xploit/xploit/networking/Route666/writeup.md"
---

An insane-tier core-backbone incident: BGP route flapping between two peers on a transit edge gateway, with a hidden exfiltration target. The core trick is reconstructing **route flap damping** windows from announce/withdraw events in the capture.

## Files

- `extracted/route_666_mirror.pcap`
- `CASE_BRIEF.txt`, `bgp_looking_glass.txt`, `arp_transit_cache.txt`, `ip_route_fib.txt`, `cisco_xr_core_dump.txt`, `junos_rfd_audit.txt`, `snmp_traps.log`
- `extracted/solve.py`

## Analysis

Two peers announce the same prefix:

- `A = 10.0.12.2` — announces, withdraws, re-announces repeatedly
- `B = 10.0.13.2` — same pattern on a different timer

BGP route-flap damping **suppresses** a route once its exponentially-decayed penalty exceeds a threshold, then **reuses** it when the penalty decays below a lower threshold. With a 30-second half-life:

```python
decay = lambda p, dt: p * 2 ** (-dt / HALFLIFE)

def suppress_window(ev):
    p, t, sup, start = 0.0, ev[0][0], False, None
    for i, (tt, _) in enumerate(ev):
        p = decay(p, tt - t); t = tt
        if i > 0:                     # first announce is not a flap
            p += 1000.0
            if p > SUPPRESS and not sup:
                sup, start = True, tt
    return start, start + HALFLIFE * math.log2(p / REUSE)
```

For the captured timeline the script prints `{'A': (19.9, 88.9), 'B': (49.9, 118.9)}` — the windows when each peer's route disappears from the FIB. Those windows are the signal: traffic to `198.51.100.0/24` silently shifts to the alternate path during suppression, which is where the exfil channel lives.

## Noise

The extracted folder is stuffed with decoy artefacts: SNMP traps, Cisco XR / Junos RPD audit strings and debug logs containing fake flags. The authoritative source is the pcap plus the damping math; every log claiming a flag is a decoy.

## Takeaway

BGP route-flap damping is a security-relevant state machine: suppressed prefixes are invisible to looking-glass output while still forwarded elsewhere. Reconstructing suppression windows from raw capture timing is how you prove an intentional routing detour rather than an accidental flap.

## Flag

Flag: not recovered in the writeup.
