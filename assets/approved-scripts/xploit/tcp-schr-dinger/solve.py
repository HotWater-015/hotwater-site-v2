import subprocess
import io
import zipfile

# Extract timestamp values and payloads using tshark
cmd = [
    "tshark", "-r", "tcp_schrodinger_mirror.pcap", "-T", "fields",
    "-e", "frame.number", "-e", "tcp.seq", "-e", "tcp.len",
    "-e", "tcp.options.timestamp.tsval", "-e", "tcp.payload"
]
raw_output = subprocess.check_output(cmd).decode().strip().split("\n")

valid_payloads = []
ts_recent = 200000  # Initialized during handshake

for line in raw_output:
    parts = line.split("\t")
    if len(parts) < 5 or not parts[4]:
        continue
    fnum, seq, length, tsval_str, payload_hex = parts[:5]
    tsval = int(tsval_str) if tsval_str else 0
    seq = int(seq)
    payload = bytes.fromhex(payload_hex)

    # Apply RFC 7323 PAWS Rule
    if tsval >= ts_recent:
        ts_recent = tsval
        valid_payloads.append((seq, payload))
    else:
        print(f"[-] Dropping stale segment: Frame {fnum} (seq={seq}, TSval={tsval} < TS.recent={ts_recent})")


# Reassemble in sequence order
print(valid_payloads)
valid_payloads.sort(key=lambda x: x[0])
stream = b"".join(p[1] for p in valid_payloads)
print(stream)
#tshark -r <capture.pcap> -Y "tcp.payload" -T fields -e tcp.payload
# De-encapsulate Zip Archive
byte_seq = stream
hex_str = byte_seq.hex()
print(hex_str)


