import re
from sage.all import *

d = open('output.txt').read()
v = {k: int(x) for k, x in re.findall(r'(\w+)\s*=\s*(\d+)', d)}
n, e, T, D = v['n'], v['e'], v['T'], v['D']
C = [int(x) for x in re.search(r'C\s*=\s*\[([^\]]*)\]', d).group(1).split(',')]

R.<x> = PolynomialRing(Zmod(n))
A = power_mod(x, e, x^2 - T*x + D)
M = (Matrix(Zmod(n), 2, 2, C) - A[0]*identity_matrix(Zmod(n), 2)) \
        * inverse_mod(A[1], n)

vals = [int(M[i][j]) for i in range(2) for j in range(2)]
data = b''.join(v.to_bytes((v.bit_length()+7)//8, 'big') for v in vals)
print(data)
