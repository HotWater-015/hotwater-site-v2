---
title: "Insanity Check 3 — CRYOVAULT 2026"
description: "The challenge pointed participants toward the CRYOVAULT 2026 competition rules. The clue was in Rule 2 — Flag Format, which appeared to show an ordinary example of the flag syntax."
event: "isfcr"
category: "misc"
categoryLabel: "Misc"
tags: ["ISFCR CTF 2026","misc"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/insanity-check-3.md"
---

**Category:** Sanity / Steganography / Unicode  
**Flag format:** `isfcr{...}`

## Challenge Description

The challenge pointed participants toward the CRYOVAULT 2026 competition rules. The clue was in **Rule 2 — Flag Format**, which appeared to show an ordinary example of the flag syntax.

## Initial Observation

On inspection, the text of Rule 2 contained numerous invisible Unicode characters mixed with the visible `isfcr{...}` example. The visible example was not the hidden payload. Copying the original text preserved those characters, even though they were not displayed as normal letters.

Four different invisible Unicode characters appeared repeatedly:

| Unicode code point | Character name | Base-4 digit |
| --- | --- | --- |
| `U+200C` | ZERO WIDTH NON-JOINER | `0` |
| `U+200D` | ZERO WIDTH JOINER | `1` |
| `U+202C` | POP DIRECTIONAL FORMATTING | `2` |
| `U+FEFF` | ZERO WIDTH NO-BREAK SPACE / BOM | `3` |

This suggested that the hidden data was encoded as base-4 digits.

## Exploitation / Decoding

1. Copy the entire original text of Rule 2 directly from Discord or the competition rules into a UTF-8 file named `rule2.txt`. Do not retype it or take a screenshot: doing so can remove the invisible code points.
2. Filter for the four characters listed above, ignoring all visible characters.
3. Replace them with `0`, `1`, `2`, and `3`, respectively.
4. Group the digit stream into chunks of eight base-4 digits. Each chunk encodes one character. Eight base-4 digits can represent values from 0 to 65535; in this challenge the decoded values are ASCII characters.
5. Convert each group from base 4 to an integer and then to its ASCII character.

For example, the first eight hidden characters are:

```text
\u200c \u200c \u200c \u200c \u200d \u202c \u202c \u200d
```

Using the mapping above:

```text
00001221 (base 4) = 105 (decimal) = 'i'
```

Continuing through the rest of the text reconstructs the entire flag.

## Solver Script

```python
from pathlib import Path

text = Path("rule2.txt").read_text(encoding="utf-8")

mapping = {
    "\u200c": "0",
    "\u200d": "1",
    "\u202c": "2",
    "\ufeff": "3",
}

digits = "".join(mapping[c] for c in text if c in mapping)
assert digits and len(digits) % 8 == 0, "Missing or incomplete hidden data"

flag = "".join(
    chr(int(digits[i:i + 8], 4))
    for i in range(0, len(digits), 8)
)

print("Hidden Unicode characters:", len(digits))
print("Decoded flag:", flag)
```

## Output

```text
Hidden Unicode characters: 296
Decoded flag: isfcr{1nv1s1bl3_but_n0t_und3t3ct4bl3}
```

The 296 base-4 symbols form 37 groups of eight, yielding 37 ASCII characters. The decoded result matches the required `isfcr{...}` flag format.

## Flag

```text
isfcr{1nv1s1bl3_but_n0t_und3t3ct4bl3}
```

## Conclusion

The key insight was to inspect the raw Unicode characters in Rule 2 instead of trusting the visible example. Four invisible code points represented base-4 digits; converting the digit stream into ASCII exposed the complete hidden flag. The decoding is reproducible offline with the supplied Python script and the original copied rules text.
