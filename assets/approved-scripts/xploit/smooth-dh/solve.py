from sympy.ntheory.residue_ntheory import discrete_log

p = 1870283325551092163712001  
g = 2048
A = 82329171473187970720945   
N=p-1
print(N)
private_key_d = discrete_log(p, A, g)    
print(f"d = {private_key_d}")  
    # Verification
assert pow(g, private_key_d, p) == A
print("ok")



