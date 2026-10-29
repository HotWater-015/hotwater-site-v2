---
title: "Borrowed Address — Recovering the Closing Batch"
description: "The recovered batch is recovered.fld2: 167 rows, 6,688 bytes."
event: "cryovault"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CryoVault Finals 2026","forensics"]
date: "2026-10-26"
teammate: false
source: "cryovault/forensic/10/writeup.md"
---

## Result

The recovered batch is [`recovered.fld2`](recovered.fld2): **167 rows, 6,688 bytes**.

```text
SHA-256: b681cb45b3720f023d1c5a025850f7beae363b46de069bc129e1c830755c2696
Flag: isfcr{b681cb45b3720f023d1c5a025850f7beae363b46de069bc129e1c830755c2696}
```

The recovery combines three sources: Java compiler metadata, suspended virtual-thread stacks, and historical SQLite WAL snapshots. The final routing results were checked against the supplied native implementation.

## 1. Inspect the incident bundle

Extract the archive and decompress the core:

```bash
unzip -q borrowed-address.zip
gzip -dk borrowed-address/incident/core.gz
```

The relevant files are:

- `incident/core`: the stopped JVM's memory image.
- `incident/receipt.json`: acknowledges request **731**, in `closing` status.
- `rootfs/srv/ledger/service.jar`: Java orchestration and eligibility rules.
- `rootfs/srv/ledger/libservice.so`: native routing and tariff calculations, with embedded SQLite.
- `rootfs/srv/ledger/state/`: four routing databases (`r0`–`r3`) and four tariff databases (`p0`–`p3`), including WAL and shared-memory files.
- `rootfs/srv/ledger/runtime/`: the matching Java 21 runtime and Serviceability Agent tools.

`FORMAT.txt` defines the exact bytes to hash. All fields are big-endian, with no padding:

| Field | Size |
|---|---:|
| ASCII `FLD2` | 4 bytes |
| Row count | 4 bytes |
| Each row: ordinal, route position | 4 + 4 bytes |
| Each row: destination account, token high, token low | 8 + 8 + 8 bytes |
| Each row: signed amount in cents | 8 bytes |

Each row is 40 bytes. Rows must be sorted by `(ordinal, route position)`, with no trailer or newline.

## 2. Recover the eligibility rules from Java bytecode

Disassemble the service:

```bash
javap -p -c -classpath borrowed-address/rootfs/srv/ledger/service.jar \
  ledger.Service > service.javap
```

The key method is `publish(Entry)`. In pseudocode:

```java
Leg authority = entry.authority;
assert authority == entry.debit || authority == entry.credit;
if (authority.account != entry.book.current) return;
if (entry.book.request != 731) return;

long amount = authority == entry.debit
    ? authority.cents
    : -authority.cents;

long[] postings = settle(entry.book.context, entry.ordinal,
                         authority.high, authority.low, amount);
```

These comparisons use **object identity**. Both current and retired accounts can contain the same account number, so comparing their numeric fields would include ineligible entries.

The four entry constructors establish these relationships:

| Calling method | Constructor | Authority | Eligible account identity? |
|---|---|---|---|
| `debit` | `incoming` | Debit leg, current account | Yes |
| `credit` | `outgoing` | Credit leg, current account | Yes |
| `amend` | `cancelled` | Credit leg, retired account | No |
| `reverse` | `replaced` | Debit leg, retired account | No |

Request filtering still applies to the first two cases. Books whose index is divisible by five belong to request 806 and must be excluded.

The worker lifecycle also matters. Each worker first runs a deeper recursive task while `publishing` is false, then runs the pending task and parks. At the crash, the static fields show `passed = 1` and `publishing = false`. The main thread has reached the checkpoint before enabling publication. Consequently, the pending recursive calls contain the entries needed to reconstruct the batch.

## 3. Why the heap dump is insufficient

Use the matching runtime and relocated filesystem, as directed by `RUNTIME.txt`:

```bash
chmod +x borrowed-address/rootfs/srv/ledger/runtime/bin/*
(
  cd borrowed-address
  export SA_ALTROOT="$PWD/rootfs"
  rootfs/srv/ledger/runtime/bin/jhsdb jmap \
    --binaryheap --dumpfile ../heap.hprof \
    --exe rootfs/srv/ledger/runtime/bin/java \
    --core incident/core
)
python3 parseheap.py
```

[`parseheap.py`](parseheap.py) parses the HPROF class and instance records, writing the ledger objects to `objects.json`. The heap contains the 16 books, their account objects, and worker lambda objects, but no materialized pending `Entry` or `Leg` instances.

The pending entries were **scalar-replaced** by the JIT compiler. Their individual fields survive in stack slots, and the compiled methods' debug metadata describes how to reconstruct their object relationships.

The suspended virtual threads have continuation objects whose `tail` fields point to frozen stack chunks. [`pcs.py`](pcs.py) obtains those chunks from the heap dump and scans their raw core memory for code addresses. [`coremem.py`](coremem.py) translates virtual addresses through the ELF core's `PT_LOAD` segments.

## 4. Decode scalar-replaced entries from frozen stacks

[`Scopes.java`](Scopes.java) uses the matching JVM's Serviceability Agent to look up each candidate program counter in the code cache. For compiled methods it prints:

- Native frame size.
- Java scope and bytecode index.
- Scalar-replaced object IDs and field values.
- Stack locations and register locations for those fields.

Run it with:

```bash
python3 pcs.py
bash runsa.sh > scopes.txt 2>&1
```

The four relevant return addresses identify compiled `debit`, `credit`, `amend`, and `reverse` calls, all suspended at bytecode index 18, immediately after their recursive `bridge` call. Their frames are 112 bytes.

The compiler describes the virtual entry as an ordinal, book reference, two virtual legs, and an authority reference. The authority points to the same virtual object ID as the appropriate debit or credit leg, preserving the identity test even though neither object was allocated.

For this core's compiled call sites, let `P` be the address of the saved compiled return PC in the chunk. The stack base used by the debug locations is `S = P + 40`; the ordinal is saved at `P - 8`. This layout is specific to these call sites and was checked against the decoded references and ordinals.

| Reconstructed field | Core location |
|---|---|
| Book reference | `S + 16`, 64-bit oop |
| Debit account reference | `S + 12`, narrow oop |
| Debit token high / low | `S + 24` / `S + 32` |
| Debit cents | `S + 48` |
| Credit account reference | `S + 44`, narrow oop |
| Credit token high / low | `S + 56` / `S + 64` |
| Credit cents | `S + 72` |

The reconstruction checks that:

- Each ordinal belongs to the expected book (`ordinal // 16`).
- The method agrees with the recursive dispatch rule, `(book index + ordinal % 16) & 3`.
- The two leg account references are the book's actual current and retired account objects.
- The selected authority references the current account.
- The book's request is 731.

After filtering, **33 entries** are eligible for native settlement. Some produce no rows because their bindings or tariffs are disabled.

## 5. Recover the database snapshot for each book

Opening the databases normally gives the latest committed state. That is insufficient: the books hold native contexts with connections pinned to different historical read snapshots. Routing and tariff connections can use different generations.

Each book's native `context` points to two SQLite connection pointers:

```text
context + 0: routing connection
context + 8: tariff connection
```

[`snapshots.py`](snapshots.py) follows each connection through its main `Btree`, shared B-tree, pager, and WAL object. The offsets were obtained from the supplied binary's disassembly and checked against the resulting database images:

```text
sqlite3 + 0x20 -> database array
main database entry + 0x08 -> Btree
Btree + 0x08 -> BtShared
BtShared + 0x00 -> Pager
Pager + 0xd8 -> database filename
Pager + 0x128 -> Wal
Wal + 0x58 -> snapshot mxFrame
Wal + 0x5c -> snapshot page count
```

For each distinct `(filename, mxFrame, page count)`:

1. Read the base database image.
2. Read the WAL page size from its header.
3. Apply WAL frames 1 through `mxFrame` in order, replacing each referenced database page.
4. Verify each applied frame has the WAL header's salts.
5. Truncate the reconstructed image to the snapshot's page count.
6. Run SQLite `PRAGMA integrity_check`.

All **32 distinct connection snapshots** pass the integrity check. `bookctx.json` records the correct routing and tariff image for each book.

For example, book 1 uses routing snapshot `r0.db` at frame 458 and tariff snapshot `p0.db` at frame 3. Using the latest databases for both would change the recovered batch.

```bash
python3 snapshots.py
```

## 6. Reproduce native settlement

The native service queries four tables:

```sql
SELECT root,enabled FROM bindings WHERE slot=?1;
SELECT position,child,weight FROM edges WHERE parent=?1 ORDER BY position;
SELECT account,product FROM terminals WHERE node=?1;
SELECT numerator,denominator,fee,rounding,enabled
FROM tariffs WHERE product=?1;
```

An entry's ordinal selects its binding. A disabled binding produces no postings. Otherwise, the service walks the routing graph recursively.

At an internal node, children are visited in edge-position order. For every child except the last:

```text
child amount = trunc_toward_zero(parent amount × child weight / total weight)
```

The final child receives the remainder after the preceding allocations. The route position is accumulated as:

```text
child route position = parent route position × 16 + edge position + 1
```

At a terminal node, the product selects a tariff. Disabled tariffs produce no row. Otherwise, multiply by the numerator, divide by the denominator using the selected rounding mode, and subtract the fee:

| Rounding value | Rule |
|---|---|
| 0 | Floor |
| 1 | Ceiling |
| 2 | Nearest, ties to even |

The entry's token high and low values are copied unchanged to each posting.

[`recover.py`](recover.py) implements these rules, including truncation toward zero for signed allocations. Python's `//` alone would be wrong for negative intermediate amounts.

As an independent check of the routing and arithmetic implementation, the script also loads `libservice.so` with `ctypes`, opens the reconstructed snapshots using its embedded SQLite, and calls its internal recursive routing routine at relative address `0xde20`. It compares every returned row with the Python result. All comparisons pass.

## 7. Serialize and hash the exact batch

Run the recovery:

```bash
python3 recover.py
sha256sum recovered.fld2
```

The script sorts the postings and serializes them as:

```python
raw = b'FLD2' + struct.pack('>I', len(rows))
raw += b''.join(struct.pack('>IIQQQq', *row) for row in sorted(rows))
```

The output has 167 rows:

```text
8 + 167 × 40 = 6,688 bytes
```

It also writes `eligible_entries.json` and `recovered_rows.json` for inspection.

```text
b681cb45b3720f023d1c5a025850f7beae363b46de069bc129e1c830755c2696  recovered.fld2
```

Therefore the flag is:

```text
isfcr{b681cb45b3720f023d1c5a025850f7beae363b46de069bc129e1c830755c2696}
```
