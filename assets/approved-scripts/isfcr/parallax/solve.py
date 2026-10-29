import json
from fpylll import IntegerMatrix, LLL
import sympy as s
D=json.load(open('observations (1).json')); p=int(D['prime']); y=list(map(int,D['samples'])); n=len(y)
B=IntegerMatrix(n+1,n+1)
for i in range(n): B[i,i]=1; B[i,n]=y[i]*2**20
B[n,n]=p*2**20
LLL.reduction(B)
rows=[[int(B[i,j]) for j in range(n)] for i in range(n+1) if B[i,n]==0]
print('relations',len(rows),[sum(v*v for v in r) for r in rows],flush=True)
json.dump(rows,open('relations.json','w'))
import z3
rels=rows[:26]
b=[z3.Int('b%d'%i) for i in range(n)]; sol=z3.Solver()
sol.add(*[z3.Or(v==0,v==1) for v in b]); sol.add(*[sum(a*v for a,v in zip(r,b))==0 for r in rels]); sol.add(sum(b)>0)
cols=[]
while sol.check()==z3.sat:
 m=sol.model(); c=[m[v].as_long() for v in b]; cols.append(c); print('column',len(cols),sum(c),flush=True); sol.add(z3.Or(*[v!=a for v,a in zip(b,c)]))
json.dump(cols,open('cols.json','w'))
