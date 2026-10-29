exec(open('solve.py').read().split('import z3')[0])
cols=sorted(json.load(open('cols.json')),key=sum)
M=s.Matrix(n,14,lambda i,j:cols[j][i]);
def modsolve(A,b):
 mat=[[(int(v)%p) for v in list(A.row(i))+[b[i]]] for i in range(A.rows)]; piv=[]; r=0
 for j in range(A.cols):
  k=next((k for k in range(r,len(mat)) if mat[k][j]),None)
  if k is None: continue
  mat[r],mat[k]=mat[k],mat[r]; inv=pow(mat[r][j],-1,p); mat[r]=[v*inv%p for v in mat[r]]
  for k in range(len(mat)):
   if k!=r:
    t=mat[k][j]; mat[k]=[(a-t*b)%p for a,b in zip(mat[k],mat[r])]
  piv.append(j); r+=1
 return [mat[i][-1] for i in range(A.cols)]
at=modsolve(M,y); json.dump(at,open('atoms.json','w'))
Q=D['quad']; B=IntegerMatrix(24,24)
for i in range(14):
 B[i,i]=1
 for j in range(10): B[i,14+j]=(Q[i][j]%p)*2**50
for j in range(10): B[14+j,14+j]=p*2**50
LLL.reduction(B)
rel=[[int(B[i,j]) for j in range(14)] for i in range(24) if all(B[i,14+j]==0 for j in range(10))]
print('quad rel',len(rel),[sum(v*v for v in r) for r in rel],flush=True)
json.dump(rel,open('qrels.json','w'))
from fpylll import CVP
A=[[sum(r[j]*int(D['linear'][j][i]) for j in range(14))%p for i in range(4)] for r in rel]
t=[sum(r[j]*(at[j]-int(D['constant'][j])) for j in range(14))%p for r in rel]
scale=2**130
B=IntegerMatrix(12,12)
for i in range(4):
 B[i,i]=scale
 for j in range(8): B[i,4+j]=A[j][i]
for j in range(8): B[4+j,4+j]=p
LLL.reduction(B)
v=CVP.closest_vector(B,[0]*4+t)
x=[int(v[i])//scale for i in range(4)]; print('limbs',x)
import importlib.util
spec=importlib.util.spec_from_file_location('model','model (1).py'); model=importlib.util.module_from_spec(spec); spec.loader.exec_module(model)
print('errors',[(at[j]-model.polynomial(D,j,x)+p//2)%p-p//2 for j in range(14)])
print('seal',model.open_seal(D,x))
payload=b''.join(((x[i]-int(D['limb_offset'][i]))*pow(int(D['limb_multiplier'][i]),-1,int(D['modulus']))%int(D['modulus'])).to_bytes(7,'little') for i in range(4));print('payload',payload)
