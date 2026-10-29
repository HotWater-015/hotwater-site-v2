from Crypto.Util.number import inverse

# 1. Input your sequence from outputs.txt (provide at least 3 values)
X = [2502540577,3911300108,370008059,3252966686,1591687653,2788368896]  
m = 2**32

# 2. Solve for a and c
diff0 = (X[1] - X[0]) % m
diff1 = (X[2] - X[1]) % m

try:
    a = (diff1 * inverse(diff0, m)) % m
    c = (X[1] - a * X[0]) % m
    print(f"[+] Recovered a: {a}")
    print(f"[+] Recovered c: {c}")
except ValueError:
    print("[-] diff0 has no modular inverse. Try using a different pair of outputs where the difference is odd.")

# 3. Generate the remaining keystream needed for flag length
state = X[-1]
keystream = b""

# Assuming flag.enc contains the encrypted bytes
with open("flag.enc", "rb") as f:
    ciphertext = f.read()

for _ in range((len(ciphertext) + 3) // 4):
    state = (a * state + c) % m
    # Pack integer to bytes (adjust endianness to 'big' or 'little' if needed)
    keystream += state.to_bytes(4, byteorder='little')

# 4. XOR Decryption
flag = bytes([c ^ k for c, k in zip(ciphertext, keystream)])
print(f"[+] Decrypted Flag: {flag.decode(errors='ignore')}")

