---
title: "Turning Chart — Reverse Engineering"
description: "It is a stripped, statically linked, 64-bit x86-64 ELF executable. This means there are no helpful function symbols, so the validation logic must be located by inspecting its control…"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/turning-chart.md"
---

## Challenge

> The survey ship's last chart was sealed by a navigation instrument whose needle never stays put. The crew kept the instrument, but lost the course that opened it. Recover the accepted course.
>
> Run the Linux x86-64 executable and enter a course when prompted. The retired dial shown by `?` is kept for the museum, not for navigation.

**Category:** Reverse Engineering  
**Artifact:** `turning_chart`  
**Flag format:** `isfcr{...}`

## Flag

```text
isfcr{3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n}
```

## 1. Initial reconnaissance

Identify the executable:

```bash
file turning_chart
```

It is a **stripped, statically linked, 64-bit x86-64 ELF** executable. This means there are no helpful function symbols, so the validation logic must be located by inspecting its control flow, data, and output strings.

Make it executable and inspect visible strings:

```bash
chmod +x turning_chart
strings -a turning_chart
```

Notable strings include:

```text
Course:
Course refused.
Museum dial (retired): 4 1 7 0 9 2 5 3 8 6
Chart opened. Course restored.
a chart is a record of motion, not of place
TCHRT04
```

The museum dial is explicitly described as retired. It is a clue/decoy, **not** the mapping to use for the current course.

## 2. Locate the validator

Open the binary in a disassembler such as Ghidra, Binary Ninja, IDA, or `objdump`:

```bash
objdump -d -M intel turning_chart > disassembly.txt
```

A productive approach is to start from the code that writes `Course refused.` and `Chart opened. Course restored.`, trace the branches backward, and identify the input validation routine. Follow its handling of the course characters and the state that controls the changing dial.

The accepted input has the form `isfcr{` + **32 course characters** + `}` (39 characters total). The interesting part is the 32-byte content inside the braces, not the fixed prefix and suffix.

## 3. Reverse the changing chart

The important insight is that the instrument's dial is **state-dependent**: treating it as a fixed substitution table, especially the displayed retired dial, will not recover the course.

The recovery approach is:

1. Identify the course-length/format checks and isolate the 32 variable characters.
2. Trace how the live dial state is initialized and updated.
3. Reconstruct the transformation schedule for all **320 rounds**.
4. Reverse the round operations in the opposite order, including the state-dependent substitutions and character rearrangements.
5. Wrap the recovered course bytes in `isfcr{...}` and submit them to the original binary.

A reversed candidate is not trustworthy merely because it resembles text. The executable's acceptance branch is the final test. In particular, reversing transformations in the wrong order or using the retired permutation can produce plausible-looking but rejected data.

The recovered 32-character course is:

```text
3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n
```

## 4. Verification

Run the supplied executable with the recovered flag:

```bash
printf '%s\n' 'isfcr{3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n}' | ./turning_chart
```

Actual output:

```text
Course: Chart opened. Course restored.
```

The original executable accepts this exact course, confirming the flag.

## Conclusion

This challenge hinges on distinguishing a retired, fixed dial from the **live, evolving transformation** used by the validator. Reverse the active transformation sequence and verify the recovered candidate against the program rather than relying on static strings or guesses.

**Final flag:** `isfcr{3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n}`
