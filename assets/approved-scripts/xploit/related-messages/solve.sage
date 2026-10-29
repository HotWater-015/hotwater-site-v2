import re
from sage.all import *

d = open('public.txt').read()
v = {k: int(x) for k, x in re.findall(r'(\w+)\s*=\s*(\d+)', d)}
N, e, c1, c2, alpha = v['N'], v['e'], v['c1'], v['c2'], v['alpha']

R.<x> = PolynomialRing(Zmod(N))
g1 = x^e - c1
g2 = (x + alpha)^e - c2

def gcd_poly(a, b):
    while b:
        a, b = b, a % b
    return a.monic()

g = gcd_poly(g1, g2)
assert g.degree() == 1
m1 = int(-g[0] / g[1])
print("m1 =", m1)
print(bytes.fromhex(format(m1, 'x')).decode('latin-1'))
