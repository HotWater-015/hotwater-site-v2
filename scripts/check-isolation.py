"""Check preserved sources; also verify production immutability when its snapshot exists."""
import hashlib, json
from pathlib import Path
SITE = Path(__file__).resolve().parents[1]
snapshot = SITE / 'reports/phase0-source-snapshot.json'
if snapshot.exists():
    original = SITE.parent / 'site'
    baseline = json.loads(snapshot.read_text())
    current = {str(p.relative_to(original)): {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'mode': p.stat().st_mode, 'mtime_ns': p.stat().st_mtime_ns} for p in original.rglob('*') if p.is_file()}
    assert current == baseline, 'Original site changed since the Phase 0 snapshot'
    print(f'Original site unchanged: {len(baseline)} file hashes, modes and mtimes match.')
else:
    print('Original-tree check unavailable: machine-local snapshot absent. Checking preserved sources only.')
preserved = json.loads((SITE / 'tests/fixtures/phase0-preserved.json').read_text())
for name, digest in preserved.items():
    target = SITE / name
    assert target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == digest, f'Preservation mismatch: {name}'
print(f'{len(preserved)} preserved content/theme/config/importer files verified.')
