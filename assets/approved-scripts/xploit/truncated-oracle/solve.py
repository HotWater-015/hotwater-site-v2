import re
from fpylll import IntegerMatrix, LLL, CVP

d = open('output.txt').read()
a = int(re.search(r'a\s*=\s*(\d+)', d).group(1))
c = int(re.search(r'c\s*=\s*(\d+)', d).group(1))
bits = int(re.search(r'bits\s*=\s*(\d+)', d).group(1))
leak_bits = int(re.search(r'leak_bits\s*=\s*(\d+)', d).group(1))
leaked = [int(x) for x in re.search(r'leaked\s*=\s*\[([^\]]*)\]', d).group(1).split(',')]
ct = bytes.fromhex(re.search(r'ciphertext\s*=\s*([0-9a-fA-F]+)', d).group(1))

M = 1 << bits
X = 1 << (bits - leak_bits)
n = len(leaked)
H = [h * X for h in leaked]

ai, ci = [1] * n, [0] * n
for i in range(1, n):
    ai[i] = (a * ai[i-1]) % M
    ci[i] = (a * ci[i-1] + c) % M
D = [(H[i] - ai[i] * H[0] - ci[i]) % M for i in range(1, n)]

m = n - 1
A = IntegerMatrix(m, m)
A[0, 0] = 1
for j in range(1, m):
    A[0, j] = pow(a, j, M)
for i in range(1, m):
    A[i, i] = M
LLL.reduction(A)
p = CVP.closest_vector(A, list(D))

t0 = (pow(a, -1, M) * int(p[0])) % M
s = H[0] + t0
states = []
ks = bytearray()
for _ in range(len(ct)):
    states.append(s)
    ks.append(s & 0xff)
    s = (a * s + c) % M
print("states =", states[:8])
print(bytes(x ^ y for x, y in zip(ct, ks)).decode('latin-1'))
