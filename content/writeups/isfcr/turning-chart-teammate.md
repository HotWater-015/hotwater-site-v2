---
title: "Turning_chart"
description: "It is tiny (~10 KB), static, stripped, and uses raw syscalls (no libc). Running it:"
event: "isfcr"
category: "rev"
categoryLabel: "Reverse"
tags: ["ISFCR CTF 2026","rev"]
date: "2026-10-11"
teammate: true
source: "isfcr/writeups/turning-chart-teammate.md"
---

**Category:** Reverse Engineering
**Flag:** `isfcr{3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n}`

> The survey ship's last chart was sealed by a navigation instrument whose needle never stays put.
> The crew kept the instrument, but lost the course that opened it. Recover the accepted course.

---

## 1. Recon

```console
$ file turning_chart
turning_chart: ELF 64-bit LSB executable, x86-64, statically linked, stripped
```

It is tiny (~10 KB), static, stripped, and uses raw `syscall`s (no libc). Running it:

```console
$ ./turning_chart
Course: test
Course refused.
```

Strings reveal the flavour text and a suspicious hint:

```
Course:
Course refused.
Museum dial (retired): 4 1 7 0 9 2 5 3 8 6
Chart opened. Course restored.
a chart is a record of motion, not of place
TCHRT04
```

Feeding it `?` prints the *museum dial* and exits:

```console
$ echo '?' | ./turning_chart
Museum dial (retired): 4 1 7 0 9 2 5 3 8 6
```

The prompt tells us this dial is *retired* — a decoy. The real "needle" is generated at runtime.

## 2. Input validation

The disassembly (`objdump -d -M intel`) shows the read loop stores the line in a 64-byte stack buffer, then validates it:

- total length must be `0x27` = **39**
- prefix `isfcr{`, suffix `}`
- bytes at indices `6..37` must each match `[a-z0-9_]`

So the flag body is exactly **32 characters**. The task reduces to recovering those 32 bytes.

## 3. The moving needle (dial + S-box)

The program seeds a PRNG:

```
ecx = FNV1a("a chart is a record of motion, not of place") ^ 0xe21f48c7
```

Then it builds two tables from that seed using a `xorshift32`-style generator and a Fisher–Yates shuffle:

- a **10-byte dial** (permutation of `0..9`),
- a **256-byte S-box** (permutation of `0..255`).

The dial printed by `?` is hard-coded fluff. The *actual* runtime dial is:

```
dial = [4, 1, 0, 5, 7, 8, 2, 6, 9, 3]
```

## 4. A tiny custom VM

After setup, the program runs a loop 320 times. Each iteration:

1. **Decodes a 5-byte instruction** from the `.rodata` blob at `0x40213c` (320 × 5 = 1600 bytes, exactly the leftover section size). Each raw byte is XORed with a byte drawn from a second `xorshift`-ish PRNG. The PRNG state (`edi`) evolves every instruction, independent of our input.
2. Looks up the first decoded byte in the **dial** to obtain an opcode index `op = dial.index(gen[0])`. (A decoded byte not in the dial ⇒ reject.)
3. Computes two operand indices `a`, `b` from the auxiliary registers `r8`, `esi` and the decoded operands.
4. Executes one of 8 byte operations on a 32-byte state that was initialised from the flag body:

| op | operation |
|----|-----------|
| 0 | rotate one 8-byte word (4 words) by a variable amount |
| 1 | rotate a 4-byte "column" (stride 8) |
| 2 | swap `state[a]`, `state[b]` |
| 3 | `state[b] += gen[3] + state[a]` |
| 4 | `state[b] ^= rol8(state[a], gen[3])` |
| 5 | `state[b] = S[state[b] ^ gen[3]]` |
| 6 | Feistel-like: `new[b]=old[a]; new[a]=old[b]^S[gen[3]+old[a]]` |
| 7 | reverse an 8-byte word |
| 8/9 | no-op on state (adjust `r8`) |

Crucially, the **operand indices depend only on `r8`/`esi`, which depend only on the decoded instructions — never on the input**. So the whole VM is a *fixed, input-independent permutation* `P` on 32-byte strings.

After the 320 instructions, `edi ^= 0xd06f27b5`, and a final loop compares the state against 32 target bytes at `0x40211c`, each XOR-masked with a keystream byte `(xorshift(edi) >> 24)`.

## 5. Inverting

Since `P` is a fixed bijection, we don't need brute force:

1. Reimplement the instruction generation + register/PRNG evolution to get the exact instruction schedule and the final `edi`.
2. Compute the required final state: `expected[i] = target[i] ^ keystream[i]`.
3. Invert every VM operation (each op above has an obvious inverse: inverse rotate, inverse column-rotate, swap, subtract, inverse S-box lookup, inverted Feistel, reverse) and apply them in **reverse order** to `expected`.

This yields the body directly.

## 6. Solver

```python
data = open('turning_chart','rb').read()
RO_OFF, RO_VA = 0x2000, 0x402000
ro = data[RO_OFF:RO_OFF+0x77c]
def rb(va): return ro[va - RO_VA]

M = 0xffffffff
def u32(x): return x & M
def rol8(v,c): c &= 7; return ((v<<c)|(v>>(8-c)))&0xff if c else v

def xorshift(ecx):
    eax = (ecx << 13) & M
    eax ^= ecx
    eax ^= eax >> 17
    ecx = (eax << 5) & M
    return ecx ^ eax

# seed
a = 0x4020c0; phrase = b""
while rb(a) != 0:
    phrase += bytes([rb(a)]); a += 1
ecx = 0x811c9dc5
for c in phrase:
    ecx = ((ecx ^ c) * 0x1000193) & M
ecx ^= 0xe21f48c7

# dial + sbox (Fisher-Yates)
dial = list(range(10)); esi = 10
for i in range(9, 0, -1):
    ecx = xorshift(ecx); edx = ecx % esi; esi -= 1
    dial[i], dial[edx] = dial[edx], dial[i]

sbox = list(range(256)); esi = 0x100
for i in range(255, 0, -1):
    ecx = xorshift(ecx); edx = ecx % esi; esi -= 1
    sbox[i], sbox[edx] = sbox[edx], sbox[i]
inv_sbox = [0]*256
for i, v in enumerate(sbox): inv_sbox[v] = i

# decode 320 instructions + track r8/esi/edi
r8, esi, edi = 0xb, 2, 0x73b59a26
instrs = []
for r11 in range(0x140):
    gen = []; run = 5*r11
    for k in range(5):
        eax = edi >> 24
        edi = (edi * 0x19660d) & M
        r9d = u32(13*r8 + 29*esi)
        g = (eax ^ rb(0x402100 + 0x3c + run) ^ r9d) & 0xff
        gen.append(g)
        edi = (run + edi + 0x3c6ef35f) & M
        run += 1
        edi = (edi + g*0x101) & M
    g0, g1, g2, g3, g4 = gen
    op = dial.index(g0)
    b = (r8 + (((0x11*esi) ^ g1) & M)) & 0x1f
    a = ((((3*r8) ^ g2) + 8*esi) & M) & 0x1f
    if a == b: a = (b + 1) & 0x1f
    instrs.append(dict(op=op, a=a, b=b, g2=g2, g3=g3, esi=esi, r14=(r8+g1) & 3))

    # auxiliary-register tail
    ebx_t = (((g2 >> 5) & 0xff) + esi) & M
    if op == 8:
        r8 = (r8 + (g1 & 3) + (g3 & 7) + 1 + esi) & 0x1f; extra = 0
    else:
        r8 = (r8 + (g1 & 3) + 1 + esi) & 0x1f
        extra = (g3 & 3) if op == 9 else 0
    esi = (extra + ebx_t) & 3
    r9d = ((r8 << 16) | op | (esi << 8)) & M
    cnt = (r11 % 7) + 1
    val = ((r9d << cnt) | (r9d >> (32-cnt))) & M
    val ^= edi
    edi = (g4*0x10101 + val) & M

E0 = edi ^ 0xd06f27b5
target = [rb(0x40211c + i) for i in range(32)]
ks = []; e = E0
for _ in range(32):
    e = xorshift(e); ks.append((e >> 24) & 0xff)
expected = [target[i] ^ ks[i] for i in range(32)]

# invert the VM
st = list(expected)
for ins in reversed(instrs):
    op, a, b, r14, g3, g2 = ins['op'], ins['a'], ins['b'], ins['r14'], ins['g3'], ins['g2']
    if op == 0:
        base = r14*8; s = (1 + g3 % 7) & 7; old = st[:]
        for j in range(8): st[base+j] = old[base + ((j+s) & 7)]
    elif op == 1:
        block = (ins['esi'] + g2) & 7; start = (g3 % 3) + 1; old = st[:]
        for k in range(4): st[block+8*k] = old[block + 8*((k+start) & 3)]
    elif op == 2:
        st[a], st[b] = st[b], st[a]
    elif op == 3:
        st[b] = (st[b] - ((g3 + st[a]) & 0xff)) & 0xff
    elif op == 4:
        st[b] ^= rol8(st[a], g3 & 7)
    elif op == 5:
        st[b] = inv_sbox[st[b]] ^ g3
    elif op == 6:
        olda = st[b]; oldb = st[a] ^ sbox[(g3 + olda) & 0xff]
        st[a], st[b] = olda, oldb
    elif op == 7:
        base = r14*8
        for i in range(4): st[base+i], st[base+7-i] = st[base+7-i], st[base+i]

body = bytes(st)
print("isfcr{" + body.decode() + "}")
```

Output:

```
isfcr{3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n}
```

## 7. Verification

```console
$ echo 'isfcr{3v3ry_r0ut3_r3m3mb3rs_1ts_0r1g1n}' | ./turning_chart
Course: Chart opened. Course restored.
```

## 8. Notes / gotchas

- The printed "museum dial" is a red herring; the real dial (`[4,1,0,5,7,8,2,6,9,3]`) is generated at runtime from the FNV seed.
- The `.rodata` byte blob starts at `0x40213c` (right after the target array at `0x40211c`); 320 × 5 = `0x640` bytes lands exactly at the section end (`0x40277c`).
- The VM operand indices are input-independent, which is precisely why the transform is a fixed bijection and can be inverted instead of searched.
- During development the first attempts desynced after instruction 0; tracing `r11`/`edi`/`r8`/`esi` with GDB exposed an off-by-one/provider bug (program bytes were being read with a stride of 2 due to a double-counted index). Once fixed, a forward re-simulation matched the expected final state byte-for-byte.
