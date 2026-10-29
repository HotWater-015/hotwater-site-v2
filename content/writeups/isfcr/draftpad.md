---
title: "Draftpad"
description: "The application loads its document data from:"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/draftpad.md"
---

## Target

`https://isfcrpesu-draftpad.chals.io/`

## Discovery

The application loads its document data from:

```text
GET /api/document
```

The page also displays the published output from:

```text
GET /api/export/public
```

The document uses pinned positions for the private range. The document API showed the private start and end pins, but the private block between them was not correctly protected. In particular, inserted blocks had shifted the document's linearized indexes while the pins retained their original positions.

Requesting the public export exposed the confidential content directly:

```text
GET /api/export/public
```

The response contained:

```text
release flag: isfcr{merge_shifts_the_wall_not_the_window}
```

## Flag

`isfcr{merge_shifts_the_wall_not_the_window}`
