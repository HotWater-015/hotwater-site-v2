import struct, hashlib

d = open('ixp_border_bgp_stream.pcap', 'rb').read()
off, pk = 24, []
while off < len(d):
    cl = struct.unpack('<I', d[off+8:off+12])[0]; off += 16
    pk.append(d[off:off+cl]); off += cl

bgp = lambda p: p[54:]                    
opn = bgp(pk[5])                          
ups = [bgp(p) for p in pk[7:15]]          # 8 UPDATEs from 192.0.2.66

def attrs(u):
    al = struct.unpack('>H', u[21:23])[0]
    a, i, out = u[23:23+al], 0, []
    while i < len(a):
        fl, tc = a[i], a[i+1]
        if fl & 0x10: l, h = struct.unpack('>H', a[i+2:i+4])[0], 4
        else:         l, h = a[i+2], 3
        out.append((tc, a[i:i+h+l], a[i+h:i+h+l])); i += h + l
    return out

S, out = hashlib.sha256(opn).digest(), b''
for u in ups:
    at   = attrs(u)
    rest = b''.join(x[1] for x in at if x[0] != 8)
    com  = next(x[2] for x in at if x[0] == 8)
    S    = hashlib.sha256(S + rest).digest()
    out += bytes(a ^ b for a, b in zip(com, S))
print(out)

