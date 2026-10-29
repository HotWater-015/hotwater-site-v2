---
title: "Lossless Not Harmless"
description: "The supplied mosaic_0417.png is a 256 × 300 indexed-color PNG. It contains a palette, two text chunks, nine IDAT chunks, and no data after IEND. The picture looks like colorful noise."
event: "isfcr"
category: "forensics"
categoryLabel: "Forensics"
tags: ["ISFCR CTF 2026","forensics"]
date: "2026-10-10"
teammate: false
source: "isfcr/writeups/lossless-not-harmless.md"
---

## Flag

```text
isfcr{ch0ic3s_th3_d3c0d3r_n3v3r_s33s}
```

## Inspecting the PNG

The supplied `mosaic_0417.png` is a 256 × 300 indexed-color PNG. It contains a palette, two text chunks, nine `IDAT` chunks, and no data after `IEND`. The picture looks like colorful noise.

The text chunks provide two leads:

```text
Software: dfl-stitch 2.3 (equivalent-match mode, flush=sync)
Comment:  aXNmY3J7bm9wZV9ub3RfdGhpc19vbmV9
```

The comment decodes from Base64 to `isfcr{nope_not_this_one}`, a decoy. The software string points toward the compressed representation: DEFLATE can encode the same output using different back-references, and sync flushes introduce stored-block alignment padding.

Concatenating the `IDAT` payloads gives one zlib stream. Decompression produces 77,100 bytes: 300 scanlines, each containing one PNG filter byte and 256 palette indices. A custom DEFLATE parser reveals 87 blocks and 5,852 length/distance matches.

## Channel 1: equivalent match distances

A DEFLATE match copies `length` bytes from `distance` bytes earlier in the output. Several distances can reproduce the same bytes. Choosing among those distances changes the compressed stream while preserving the image.

For every match at output position `p` with length `L`, enumerate distances `d` in the preceding 32 KiB for which:

```text
raw[p-d : p-d+L] == raw[p : p+L]
```

Overlapping copies are valid, so candidate sources may extend past `p`. Using the fully decoded output allows those candidates to be checked too.

The crucial condition is that equivalent distances include **both parities**. Merely selecting matches with more than one candidate introduces unwanted bits, because two candidates can both be even or both be odd.

For each match with an even and an odd equivalent distance, extract the actual distance's least significant bit. Pack these bits in encounter order, most significant bit first. The recovered channel starts with:

```text
44 46 4c 38 00 fd
 D  F  L  8
```

`DFL8` is followed by the two-byte big-endian payload length, `0x00fd` (253). Read only those 253 bytes; later extracted bytes are outside the framed payload. The payload consists of a textual hint, a NUL separator, and a 53-byte encrypted blob.

The hint is:

```text
key: 128 pad bits discarded by decoder (stored-block header..byte boundary), stream order, MSB first. ks_i=SHA256(key|nonce|u32be(i)); ct=pt^ks; tag=HMAC-SHA256(key,nonce|ct)[:8]. blob=nonce8|ct|tag8
```

## Channel 2: discarded padding bits

Each DEFLATE block begins with a one-bit final-block marker and a two-bit block type. Stored blocks then align to the next byte boundary. A decoder ignores the intervening padding bits, making them another channel that does not affect the decoded image.

Collect these padding bits from every stored block in stream order, then pack them most significant bit first. There are exactly 128 bits, giving the 16-byte key:

```text
2814c69217b303ec00c6280fa2c50286
```

## Decrypting and verifying

Split the 53-byte blob into an 8-byte nonce, 37-byte ciphertext, and 8-byte authentication tag:

```text
nonce: 29b48205aad636f0
ct:    350c60a48d94d531a819a606db1463956fc993d81a916868065e4ce9956ee60ee161ca839b
tag:   d1a4e1e496fd119b
```

Following the hint, generate keystream blocks with SHA-256, starting the counter at zero:

```text
ks_i = SHA256(key || nonce || uint32_big_endian(i))
plaintext = ciphertext XOR (ks_0 || ks_1 || ...)
```

The first eight bytes of `HMAC-SHA256(key, nonce || ciphertext)` match the supplied tag, confirming the recovered key and ciphertext. Decryption yields the flag above.

Both channels depend on compressed-stream choices that a normal image decoder discards. Inspecting only the pixels loses the back-reference choices and alignment padding.

## Reproducible solver

Save the following as `solve.py` beside `mosaic_0417.png` and run `python3 solve.py`. It uses only the Python standard library, parses the original compressed stream, and verifies its decoded output against zlib before extracting the message.

```python
import zlib,collections
from pathlib import Path
import struct, hashlib, hmac, base64

png = Path('mosaic_0417.png').read_bytes()
assert png[:8] == b'\x89PNG\r\n\x1a\n'
idat = bytearray()
offset = 8
while offset < len(png):
    size = int.from_bytes(png[offset:offset + 4], 'big')
    kind = png[offset + 4:offset + 8]
    payload = png[offset + 8:offset + 8 + size]
    if kind == b'IDAT':
        idat.extend(payload)
    offset += size + 12

# This file has a two-byte zlib header, no dictionary, and an Adler-32 trailer.
b = bytes(idat)[2:-4]
class Bits:
 def __init__(self):self.pos=0
 def read(self,n):
  v=0
  for i in range(n):v|=((b[self.pos//8]>>(self.pos%8))&1)<<i;self.pos+=1
  return v
 def align(self):self.pos=(self.pos+7)//8*8
s=Bits()
def tree(lens):
 count=collections.Counter(lens); count[0]=0;code=0;nexts={}
 for i in range(1,max(lens)+1):code=(code+count[i-1])<<1;nexts[i]=code
 t={}
 for sym,n in enumerate(lens):
  if n:
   c=nexts[n];nexts[n]+=1;r=int(f'{c:0{n}b}'[::-1],2);t[n,r]=sym
 return t
def sym(t):
 v=0
 for n in range(1,16):
  v|=s.read(1)<<(n-1)
  if (n,v) in t:return t[n,v]
 raise ValueError(s.pos)
LB=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258]
LE=[0]*8+[1]*4+[2]*4+[3]*4+[4]*4+[5]*4+[0]
DB=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577]
DE=[0]*4+sum(([i]*2 for i in range(1,14)),[])
out=bytearray();matches=[];blocks=[]
while True:
 start=s.pos;final=s.read(1);typ=s.read(2);before=len(out)
 if typ==0:
  s.align();n=s.read(16);nn=s.read(16);assert n ^ nn == 0xffff
  for i in range(n):out.append(s.read(8))
 else:
  if typ==1:lt=tree([8]*144+[9]*112+[7]*24+[8]*8);dt=tree([5]*32)
  elif typ==2:
   nl=s.read(5)+257;nd=s.read(5)+1;nc=s.read(4)+4;cl=[0]*19
   for x in [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15][:nc]:cl[x]=s.read(3)
   ct=tree(cl);ls=[]
   while len(ls)<nl+nd:
    x=sym(ct)
    if x<16:ls.append(x)
    elif x==16:ls.extend([ls[-1]]*(s.read(2)+3))
    elif x==17:ls.extend([0]*(s.read(3)+3))
    else:ls.extend([0]*(s.read(7)+11))
   lt=tree(ls[:nl]);dt=tree(ls[nl:])
  else:raise ValueError('reserved')
  while True:
   p=s.pos;x=sym(lt)
   if x==256:break
   if x<256:out.append(x)
   else:
    l=LB[x-257]+s.read(LE[x-257]);dcode=sym(dt);d=DB[dcode]+s.read(DE[dcode]);matches.append((len(out),l,d,p,dcode))
    for i in range(l):out.append(out[-d])
 blocks.append((start,s.pos,typ,before,len(out)))
 if final:break

assert bytes(out) == zlib.decompress(bytes(idat))

def pack_msb(bits):
    return bytes(
        sum(bit << (7 - i) for i, bit in enumerate(bits[j:j + 8]))
        for j in range(0, len(bits) - 7, 8)
    )

# A distance carries a bit only if equivalent even AND odd distances exist.
message_bits = []
raw = bytes(out)
for pos, length, distance, _, _ in matches:
    target = raw[pos:pos + length]
    candidates = []
    start = max(0, pos - 32768)
    # Include overlapping copies: a source may extend beyond pos.
    source = raw.find(target, start, pos + length - 1)
    while 0 <= source < pos:
        candidates.append(pos - source)
        source = raw.find(target, source + 1, pos + length - 1)
    assert distance in candidates
    if {d & 1 for d in candidates} == {0, 1}:
        message_bits.append(distance & 1)

channel = pack_msb(message_bits)
assert channel[:4] == b'DFL8'
size = int.from_bytes(channel[4:6], 'big')
payload = channel[6:6 + size]
assert len(payload) == size
hint, blob = payload.split(b'\x00', 1)
print('Hint:', hint.decode())

# Stored blocks discard bits between their three-bit header and byte boundary.
padding_bits = []
for start, _, kind, _, _ in blocks:
    if kind == 0:
        first = start + 3
        boundary = (first + 7) // 8 * 8
        padding_bits.extend(
            (b[i // 8] >> (i % 8)) & 1
            for i in range(first, boundary)
        )
assert len(padding_bits) == 128
key = pack_msb(padding_bits)
nonce, ciphertext, tag = blob[:8], blob[8:-8], blob[-8:]
expected_tag = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()[:8]
assert hmac.compare_digest(tag, expected_tag)
keystream = b''.join(
    hashlib.sha256(key + nonce + struct.pack('>I', i)).digest()
    for i in range((len(ciphertext) + 31) // 32)
)
plaintext = bytes(a ^ b for a, b in zip(ciphertext, keystream))
print('Key:', key.hex())
print('HMAC verified:', tag.hex())
print('Flag:', plaintext.decode())
```

Expected final output:

```text
Key: 2814c69217b303ec00c6280fa2c50286
HMAC verified: d1a4e1e496fd119b
Flag: isfcr{ch0ic3s_th3_d3c0d3r_n3v3r_s33s}
```
