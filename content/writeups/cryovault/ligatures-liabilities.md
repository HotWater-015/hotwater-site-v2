---
title: "Ligatures & Liabilities"
description: "Inspecting site/index.html reveals a static client-side web page with no backend interaction:"
event: "cryovault"
category: "misc"
categoryLabel: "Misc"
tags: ["ISFCR CryoVault Finals 2026","misc"]
date: "2026-10-26"
teammate: false
source: "cryovault/misc/2/writeup.md"
---

## Challenge Overview

> **Description:** A law firm's licence portal says `REJECTED` to everyone, including the partners who built it. There is no backend. One key is valid. Find it.  
> You are given the portal (`site/`). Serve it locally and open it in Chromium or Firefox.  
> **Flag Format:** `isfcr{<licence key>}`

---

## 1. Initial Reconnaissance

Inspecting `site/index.html` reveals a static client-side web page with no backend interaction:

```html
<label for="key">Licence key</label>
<input id="key" type="text" autocomplete="off" maxlength="64" placeholder="…">
<div class="verdict"><div id="verdict" aria-live="polite"></div></div>

<script>
  const key = document.getElementById("key");
  const out = document.getElementById("verdict");
  function render() { out.textContent = "\u00AB" + key.value + "\u00BB"; }
  key.addEventListener("input", render);
  render();
</script>
```

When input is typed, JavaScript simply wraps it with guillemets (`«` and `»`) and inserts it into `#verdict`.

The styling for `#verdict` loads a custom web font:
```css
@font-face {
  font-family: "Ledger Sans";
  src: url("ledger.woff") format("woff");
  font-display: block;
}
#verdict {
  font-family: "Ledger Sans", monospace;
  font-size: 3.2rem;
  line-height: 1.3;
  letter-spacing: 0;
  white-space: nowrap;
  color: var(--ink);
}
```

Because there is no JavaScript validation logic and no backend server, the validation is performed entirely inside the font layout engine via OpenType GSUB (Glyph Substitution) ligatures and contextual rules.

---

## 2. Analyzing `ledger.woff`

Converting `ledger.woff` into a TrueType/XML format with `fontTools`:
```bash
ttx -d /tmp site/ledger.woff
```

Inspecting the font tables reveals:
- `cmap`: Maps valid characters (`a-z`, `0-9`, `_`) and punctuation (`«`, `»`, space) to glyph names. All alphanumeric characters map to their standard glyph representations.
- `GDEF`: Defines glyph classes:
  - Class 1 (`Base` glyphs)
  - Class 3 (`Mark` glyphs)
- `GSUB`: Contains 404 lookups grouped into 6 features:
  - `calt`: `[320, 401]`
  - `ccmp`: `[202, 241]`
  - `clig`: `[281]`
  - `dlig`: `[0, 39, 78, 79, 118, 158, 196, 199, 200, 201]`
  - `liga`: `[280, 398]`
  - `rlig`: `[360, 402, 403]`

### The Verdict Lookups

Looking at the terminal lookups reveals how `ACCEPTED` and `REJECTED` are displayed:
- **Lookup 400** (`SingleSubst`): Replaces `guillemotright` (`»`) with `glyph00010`.
- **Lookup 402** (`MultipleSubst`):
  - `guillemotright` (`»`) $\to$ `['R', 'E', 'J', 'E', 'C', 'T', 'E', 'D']`
  - `glyph00010` $\to$ `['A', 'C', 'C', 'E', 'P', 'T', 'E', 'D']`
- **Lookup 403** (`SingleSubst`): Wipes all input character glyphs into `glyph00146` (a zero-width, empty glyph).

If the input matches the target state by the time **Lookup 401** runs, `»` is turned into `glyph00010` (which later renders as `ACCEPTED`). Otherwise, `»` defaults to `REJECTED`.

---

## 3. Dissecting the Font Pipeline

Detailed analysis revealed two mirrored implementations within the font:

| Component | System 1 (in `dlig`) | System 2 (in `ccmp`/`liga`/`clig`/`calt`/`rlig`) |
| :--- | :--- | :--- |
| **Character Decomposition** | Lookup 0 (`MultipleSubst`) | Lookup 202 (`MultipleSubst`) |
| **Layer 1 (CBC on previous base)** | Lookup 39 (`ChainContextSubst`, Flag 8) | Lookup 241 (`ChainContextSubst`, Flag 8) |
| **Layer 2 (Mix with previous mark)**| Lookup 78 (`ChainContextSubst`, Flag 0) | Lookup 280 (`ChainContextSubst`, Flag 0) |
| **Layer 3 (Permutation)** | Lookup 79 (`SingleSubst`, Flag 0) | Lookup 281 (`SingleSubst`, Flag 0) |
| **Layer 4 (Lookahead next base)** | Lookup 118 (`ChainContextSubst`, Flag 8)| Lookup 320 (`ChainContextSubst`, Flag 8)|
| **Layer 5 (CBC on 2nd previous base)**| Lookup 158 (`ChainContextSubst`, Flag 8)| Lookup 360 (`ChainContextSubst`, Flag 8)|
| **Layer 6 (Mix with own mark)** | Lookup 196 (`ChainContextSubst`, Flag 0)| Lookup 398 (`ChainContextSubst`, Flag 0)|
| **Target Verification** | Lookup 199 (`ChainContextSubst`, Flag 8)| Lookup 401 (`ChainContextSubst`, Flag 8)|
| **Render Verdict** | Lookup 200 (`MultipleSubst`) | Lookup 402 (`MultipleSubst`) |
| **Blank Out Remaining Glyphs** | Lookup 201 (`SingleSubst`) | Lookup 403 (`SingleSubst`) |

### GDEF & Mark Skipping Magic

Every input character $c_i$ is decomposed into a pair:
$$c_i \longrightarrow (\text{base}_i, \text{mark}_i)$$
- All $\text{base}_i$ glyphs belong to **GDEF Class 1** (Base).
- All $\text{mark}_i$ glyphs belong to **GDEF Class 3** (Mark).

When a lookup has `LookupFlag = 8` (`IgnoreMarks`):
- Mark glyphs are completely transparent. In the sequence `base_0, mark_0, base_1, mark_1`, the lookup at `base_1` directly sees `base_0` as its preceding glyph.

When a lookup has `LookupFlag = 0`:
- Mark glyphs are taken into account. For instance, immediately preceding `base_1` in the physical buffer is `mark_0`. Immediately following `base_i` is `mark_i`.

---

## 4. Solving the Cipher with Z3

Because each layer operates as an invertible block/stream cipher across the 37 possible characters (`a-z`, `0-9`, `_`), the entire system can be modeled and solved using the Z3 SMT solver.

The script models the exact transformations:
1. Decomposing character $c_i \to (b_i^{(0)}, m_i)$.
2. $b_i^{(1)} = L_1(b_{i-1}^{(1)}, b_i^{(0)})$ (with $b_{-1}^{(1)} = \text{«}$).
3. $b_i^{(2)} = L_2(m_{i-1}, b_i^{(1)})$ (with $m_{-1} = \text{«}$).
4. $b_i^{(3)} = L_3(b_i^{(2)})$.
5. $b_i^{(4)} = L_4(b_{i+1}^{(3)}, b_i^{(3)})$ (with $b_{25}^{(3)} = \text{»}$).
6. $b_i^{(5)} = L_5(b_{i-2}^{(5)}, b_i^{(4)})$ (with boundary rules for $i = 0, 1$).
7. $b_i^{(6)} = L_6(m_i, b_i^{(5)})$.
8. Constraining $b_i^{(6)} = \text{Target}[i]$ for all $i \in [0, 24]$.

### Solver Script (`solve.py`)

```python
from fontTools.ttLib import TTFont
import z3

tt = TTFont('site/ledger.woff')
gsub = tt['GSUB'].table

CHARS = [chr(c) for c in range(ord('a'), ord('z')+1)] + [str(d) for d in range(10)] + ['_']
cmap = tt.getBestCmap()

def solve_system(name, base_lk, l1_lk, l2_lk, l3_lk, l4_lk, l5_lk, l6_lk, target_lk):
    m_base = gsub.LookupList.Lookup[base_lk].SubTable[0].mapping
    char_to_bm = {c: m_base[cmap[ord(c)]] for c in CHARS}
        
    all_bases = sorted(list({b for b, m in char_to_bm.values()}))
    all_marks = sorted(list({m for b, m in char_to_bm.values()}))
    base_to_id = {b: i for i, b in enumerate(all_bases)}
    mark_to_id = {m: i for i, m in enumerate(all_marks)}
    
    l1_rules = {st.BacktrackCoverage[0].glyphs[0]: gsub.LookupList.Lookup[st.SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping for st in gsub.LookupList.Lookup[l1_lk].SubTable}
    l2_rules = {st.BacktrackCoverage[0].glyphs[0]: gsub.LookupList.Lookup[st.SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping for st in gsub.LookupList.Lookup[l2_lk].SubTable}
    l3_map = gsub.LookupList.Lookup[l3_lk].SubTable[0].mapping
    l4_rules = {st.LookAheadCoverage[0].glyphs[0]: gsub.LookupList.Lookup[st.SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping for st in gsub.LookupList.Lookup[l4_lk].SubTable}
    
    l5_subtables = gsub.LookupList.Lookup[l5_lk].SubTable
    l5_rules = {l5_subtables[i].BacktrackCoverage[1].glyphs[0]: gsub.LookupList.Lookup[l5_subtables[i].SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping for i in range(37)}
    l5_rule_i1 = gsub.LookupList.Lookup[l5_subtables[37].SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping
    l5_rule_i0 = gsub.LookupList.Lookup[l5_subtables[38].SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping
    
    l6_rules = {st.LookAheadCoverage[0].glyphs[0]: gsub.LookupList.Lookup[st.SubstLookupRecord[0].LookupListIndex].SubTable[0].mapping for st in gsub.LookupList.Lookup[l6_lk].SubTable}
    
    target = [st.InputCoverage[0].glyphs[0] for st in gsub.LookupList.Lookup[target_lk].SubTable][:25]
    target_ids = [base_to_id[g] for g in target]
    
    c_to_b = [base_to_id[char_to_bm[CHARS[i]][0]] for i in range(37)]
    c_to_m = [mark_to_id[char_to_bm[CHARS[i]][1]] for i in range(37)]
    
    table_l1 = [[base_to_id[l1_rules[all_bases[bt] if bt < 37 else 'guillemotleft'][all_bases[inp]]] for inp in range(37)] for bt in range(38)]
    table_l2 = [[base_to_id[l2_rules[all_marks[bt] if bt < 37 else 'guillemotleft'][all_bases[inp]]] for inp in range(37)] for bt in range(38)]
    table_l3 = [base_to_id[l3_map[all_bases[i]]] for i in range(37)]
    table_l4 = [[base_to_id[l4_rules[all_bases[la] if la < 37 else 'guillemotright'][all_bases[inp]]] for inp in range(37)] for la in range(38)]
    table_l5 = [[base_to_id[l5_rules[all_bases[bt]][all_bases[inp]]] for inp in range(37)] for bt in range(37)]
    table_l5_i0 = [base_to_id[l5_rule_i0[all_bases[inp]]] for inp in range(37)]
    table_l5_i1 = [base_to_id[l5_rule_i1[all_bases[inp]]] for inp in range(37)]
    table_l6 = [[base_to_id[l6_rules[all_marks[la]][all_bases[inp]]] for inp in range(37)] for la in range(37)]

    solver = z3.Solver()
    def make_table_fn(name, tbl, nrows, ncols):
        f = z3.Function(name, z3.IntSort(), z3.IntSort(), z3.IntSort())
        for r in range(nrows):
            for col in range(ncols):
                solver.add(f(r, col) == tbl[r][col])
        return f
        
    f_l1 = make_table_fn('l1', table_l1, 38, 37)
    f_l2 = make_table_fn('l2', table_l2, 38, 37)
    f_l4 = make_table_fn('l4', table_l4, 38, 37)
    f_l5 = make_table_fn('l5', table_l5, 37, 37)
    f_l6 = make_table_fn('l6', table_l6, 37, 37)
    
    f_c2b = z3.Function('c2b', z3.IntSort(), z3.IntSort())
    f_c2m = z3.Function('c2m', z3.IntSort(), z3.IntSort())
    f_l3 = z3.Function('l3', z3.IntSort(), z3.IntSort())
    f_l5_i0 = z3.Function('l5_i0', z3.IntSort(), z3.IntSort())
    f_l5_i1 = z3.Function('l5_i1', z3.IntSort(), z3.IntSort())
    
    for i in range(37):
        solver.add(f_c2b(i) == c_to_b[i], f_c2m(i) == c_to_m[i], f_l3(i) == table_l3[i])
        solver.add(f_l5_i0(i) == table_l5_i0[i], f_l5_i1(i) == table_l5_i1[i])
        
    c = [z3.Int(f'c_{i}') for i in range(25)]
    b0 = [z3.Int(f'b0_{i}') for i in range(25)]
    m = [z3.Int(f'm_{i}') for i in range(25)]
    b1 = [z3.Int(f'b1_{i}') for i in range(25)]
    b2 = [z3.Int(f'b2_{i}') for i in range(25)]
    b3 = [z3.Int(f'b3_{i}') for i in range(25)]
    b4 = [z3.Int(f'b4_{i}') for i in range(25)]
    b5 = [z3.Int(f'b5_{i}') for i in range(25)]
    b6 = [z3.Int(f'b6_{i}') for i in range(25)]
    
    for i in range(25):
        solver.add(c[i] >= 0, c[i] < 37)
        solver.add(b0[i] == f_c2b(c[i]), m[i] == f_c2m(c[i]))
        solver.add(b1[i] == f_l1(37 if i == 0 else b1[i-1], b0[i]))
        solver.add(b2[i] == f_l2(37 if i == 0 else m[i-1], b1[i]))
        solver.add(b3[i] == f_l3(b2[i]))
        solver.add(b4[i] == f_l4(37 if i == 24 else b3[i+1], b3[i]))
        if i == 0: solver.add(b5[i] == f_l5_i0(b4[i]))
        elif i == 1: solver.add(b5[i] == f_l5_i1(b4[i]))
        else: solver.add(b5[i] == f_l5(b5[i-2], b4[i]))
        solver.add(b6[i] == f_l6(m[i], b5[i]))
        solver.add(b6[i] == target_ids[i])
        
    if solver.check() == z3.sat:
        model = solver.model()
        key = ''.join([CHARS[model[c[i]].as_long()] for i in range(25)])
        print(f"Key for {name}: {key}")
        return key
    return None

solve_system("System 1 (dlig)", 0, 39, 78, 79, 118, 158, 196, 199)
solve_system("System 2 (active)", 202, 241, 280, 281, 320, 360, 398, 401)
```

Running the solver yields:
- **System 1 (dlig):** `0ld_l1cense_v1_d3precat3d`
- **System 2 (active):** `gsub_l00kups_run_th3_sh0w`

The key for System 1 clearly identifies itself as deprecated (`0ld_l1cense_v1_d3precat3d`), while System 2 is the active system supported by browser defaults.

---

## 5. Verification

Serving `site/` locally and opening it in Firefox with `gsub_l00kups_run_th3_sh0w`:

```bash
python3 -m http.server 8000 --directory site &
firefox --headless --screenshot verdict.png "http://localhost:8000"
```

Inspection of the rendered verdict shows the letters:
$$\mathbf{A\ C\ C\ E\ P\ T\ E\ D}$$

---

## Flag

```text
isfcr{gsub_l00kups_run_th3_sh0w}
```
