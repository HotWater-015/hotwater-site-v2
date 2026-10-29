---
title: "Sensor Logs"
description: "Unzipping the archive gives a second zip with four logs. Three of them (auth.log, network.log, system.log) each have a flag-looking string, but they're all decoys."
event: "xploit"
category: "steg"
categoryLabel: "Stego"
tags: ["XploitX 2026","steg"]
date: "2026-10-09"
teammate: false
source: "xploit/xploit-5/steg/logs/.read.md"
---

**Flag:** `XploitXβ{s1l3nt_0rb1t_c4rr13s_th3_3ncrypt3d_3ch0_1n_th3_fr4m3}`

Unzipping the archive gives a second zip with four logs. Three of them (`auth.log`, `network.log`, `system.log`) each have a flag-looking string, but they're all decoys.

The interesting file is `sensor_07.log`. It starts out as text, then turns into binary after a `--LOG_PAYLOAD--` marker. The binary part is a simple container where each entry is a 3-letter tag, a 4-byte length, then the data. It holds a PNG, a WAV, and a short `TXT` entry with `_c4rr13s_th3_3ncrypt3d`.

The WAV is just noise with a 58 Hz hum, and I found nothing in it. The PNG is a plain star field, but the red-channel LSBs in its top four rows carry data. Reading every third pixel gives:

```
XploitXβ{s1l3nt_0rb1t|_3ch0_1n_th3_fr4m3}|FAKE=XploitXβ{l0g_1s_cl34n}
```

The part after `FAKE=` is another decoy. The `|` in the real flag is a gap, and the `TXT` entry fits it: "silent orbit carries the encrypted echo in the frame."

```python
import numpy as np
from PIL import Image

im = np.array(Image.open("a.png").convert("RGB")).astype(int)
bits = (im[:4, ::3, 0] == 13).astype(int).flatten()
data = bytes(int("".join(map(str, bits[i:i+8])), 2) for i in range(0, len(bits) - 7, 8))
print(data.decode("utf-8", "ignore"))
```

The `|` gap and the `TXT` entry filling it is my reading, so I haven't confirmed it against the checker. If it's rejected, try `XploitXβ{s1l3nt_0rb1t_3ch0_1n_th3_fr4m3}`.
