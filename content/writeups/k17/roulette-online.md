---
title: "Roulette Online"
description: "The program starts with a balance of 10 and lets us place roulette wagers. A successful spin doubles the wager, while a losing spin subtracts it from the balance. The flag is printed…"
event: "k17"
category: "web"
categoryLabel: "Web"
tags: ["K17 CTF 2026","web"]
date: "2026-09-11"
teammate: false
source: "K17/beginner/roulette/writeup.md"
---

## Challenge

The program starts with a balance of `10` and lets us place roulette wagers. A successful spin doubles the wager, while a losing spin subtracts it from the balance. The flag is printed when the final balance is greater than `999999999`.

The relevant code is:

```c
*balance -= wager;

int lotto = (rand() % 36) + 1;

if (lotto == 1)
    *balance += 2 * wager;
```

The program seeds libc's PRNG with the current Unix timestamp:

```c
srand(time(NULL));
```

## Stack write primitive

Before the game starts, `SNAPSHOT()` prints the stack. For example:

```text
0x7fffaceacf50: ... <-- rsp [game]
...
0x7fffaceacfc0: ... <-- rbp [game]
```

The program asks for an address and performs a one-byte write:

```c
scanf("%lx", &addr);
...
*(unsigned char *)addr = (unsigned char)value;
```

The check only rejects addresses greater than `&wager`, so an address from the displayed stack region, such as the game frame's `rsp`, is valid. Writing zero there is harmless and allows execution to continue.

The write is not needed to modify the balance directly; its main use is to provide the intended debugging/stack interaction while we exploit the predictable roulette roll.

## PRNG prediction

Because the seed is `time(NULL)`, the first `rand()` result can be reproduced for nearby timestamps using the same libc implementation. We repeatedly connected to the service, estimated the server's seed from the local time, and only submitted the large wager when one of the nearby seeds produced:

```c
rand() % 36 + 1 == 1
```

The successful attempt used a predicted winning seed and submitted:

```text
1
<valid address from SNAPSHOT>
0
1000000000
0
X
```

On a win, the balance becomes:

```text
10 - 1000000000 + 2 * 1000000000
= 1000000010
```

This passes the final check.

## Flag

```text
K17{th1s_minib0lt_guy_must_b3_rlly_lucky_huh}
```
