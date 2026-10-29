---
title: "One pound fish"
description: "The challenge required identifying a location from an image and submitting the associated market name as the flag."
event: "isfcr"
category: "osint"
categoryLabel: "OSINT"
tags: ["ISFCR CTF 2026","osint"]
date: "2026-10-12"
teammate: false
source: "isfcr/writeups/one-pound-fish.md"
---

## Challenge Overview

The challenge required identifying a location from an image and submitting the associated market name as the flag.

## Solution

1. Perform a reverse image search on the challenge image.
2. Find an identical image in the search results, linked to an article about a building.
3. Read the article and look for nearby landmarks.
4. The article mentions **Russell Market** as a market near the building.
5. Convert the market name to lowercase and replace the space with an underscore to form the flag.

## Flag

```text
Iscfr{russell_market}
```

## Conclusion

The key was using reverse image search to locate the original article, then extracting the nearby market name from its description.

*Note: This writeup records the provided solution path; the original image and article URL were not supplied for independent verification.*
