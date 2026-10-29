#!/usr/bin/env python3
"""Validate an explicit allowlist, then stage byte-exact source assets. No source execution."""
import ast, hashlib, json, re, shutil, tempfile
from pathlib import Path, PurePosixPath
SITE=Path(__file__).resolve().parents[1]
REPO=SITE.parent
LANGUAGES={'.py':'python','.sage':'sage','.sh':'bash','.js':'javascript','.ts':'typescript','.c':'c','.cpp':'cpp','.rs':'rust','.sql':'sql','.asm':'nasm'}
def safe_path(root,relative):
    if not isinstance(relative,str) or not relative: raise ValueError('Missing path')
    # Repository paths are literal filenames, never URL input. Reject alternative
    # spellings that could acquire a different meaning when emitted as URLs.
    if any(ord(c)<32 or ord(c)==127 for c in relative) or any(c in relative for c in '%?#:'):
        raise ValueError('Encoded or ambiguous path')
    p=PurePosixPath(relative)
    if p.as_posix()!=relative:raise ValueError('Noncanonical path')
    if p.is_absolute() or '..' in p.parts or '\\' in relative or any(x.startswith('.') for x in p.parts):raise ValueError('Unsafe path')
    candidate=root/relative
    if not candidate.resolve().is_relative_to(root.resolve()):raise ValueError('Path escapes approved root')
    if any(x.is_symlink() for x in [candidate,*candidate.parents] if x.is_relative_to(root)):raise ValueError('Symlink not permitted')
    return candidate

def check_secrets(text):
    patterns=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',r'gh[pousr]_[A-Za-z0-9]{30,}',r'\bsk-[A-Za-z0-9_-]{30,}',r'''(?im)^\s*(?:API_KEY|API_TOKEN|PASSWORD|ACCESS_TOKEN|CLIENT_SECRET)\s*=\s*["'][^"'\n]{8,}["']''']
    if any(re.search(p,text) for p in patterns):raise ValueError('Potential embedded secret; manual review required')

def validate(manifest,repo=REPO,site=SITE):
    if manifest.get('version')!=1:raise ValueError('Unsupported manifest version')
    output={};snapshots={}
    for entry in manifest['challenges']:
        key=entry['writeup'];writeup=safe_path(site/'content',key)
        if not key.startswith('writeups/') or not writeup.is_file():raise ValueError('Unknown writeup')
        if key in output:raise ValueError('Duplicate challenge mapping')
        directory=safe_path(repo,entry['directory'])
        if not directory.resolve().is_relative_to((repo/'Projects/ctf').resolve()) or not directory.is_dir():raise ValueError('Unapproved challenge directory')
        if not entry['scripts']:raise ValueError('Empty selection')
        scripts=[];seen=set();mains=0
        for script in entry['scripts']:
            p=safe_path(repo,script['path'])
            if not p.resolve().is_relative_to(directory.resolve()):raise ValueError('Script outside approved directory')
            if p.suffix not in LANGUAGES or script['language']!=LANGUAGES[p.suffix]:raise ValueError('Unsupported source type')
            if p.name in seen:raise ValueError('Duplicate filename')
            seen.add(p.name)
            if script['role'] not in {'main-solver','required-helper'}:raise ValueError('Unknown script role')
            mains+=script['role']=='main-solver'
            if not all(script.get(k) for k in ['label','evidence','secret_review']):raise ValueError('Missing review evidence')
            raw=p.read_bytes()
            if len(raw)>1_000_000:raise ValueError('Oversized script')
            if hashlib.sha256(raw).hexdigest()!=script['sha256']:raise ValueError('Source changed; review hash before publication: '+script['path'])
            text=raw.decode('utf-8');check_secrets(text)
            asset='approved-scripts/'+key.removeprefix('writeups/').removesuffix('.md')+'/'+p.name
            # Original filenames and exact source bytes are retained.
            snapshots[asset]=raw
            scripts.append({**script,'filename':p.name,'asset':asset})
        if mains>1:raise ValueError('Multiple main solvers')
        # Check statically visible local Python imports; dynamic loads need explicit review evidence.
        for script in entry['scripts']:
            p=repo/script['path']
            if p.suffix=='.py':
                tree=ast.parse(p.read_text())
                for n in ast.walk(tree):
                    names=[a.name for a in n.names] if isinstance(n,ast.Import) else [n.module or ''] if isinstance(n,ast.ImportFrom) else []
                    for name in names:
                        dep=p.parent/(name.split('.')[0]+'.py')
                        if dep.is_file() and str(dep.relative_to(repo)) not in {x['path'] for x in entry['scripts']}:raise ValueError('Unapproved local dependency')
        scripts.sort(key=lambda x:x['role']!='main-solver')
        output[key]={'scripts':scripts,'requirements':entry.get('requirements',[])}
    return output,snapshots

def main():
    manifest=json.loads((SITE/'curated-scripts.json').read_text())
    data,snapshots=validate(manifest)
    # Validate all entries before replacing any published snapshots.
    directory=SITE/'assets/approved-scripts'
    if directory.exists():shutil.rmtree(directory)
    for asset,raw in snapshots.items():
        target=SITE/'assets'/asset;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    (SITE/'data').mkdir(exist_ok=True)
    (SITE/'data/scripts.json').write_text(json.dumps(data,indent=2)+'\n')
    print(f'Validated {len(snapshots)} explicit source files for {len(data)} writeups. No code executed.')
if __name__=='__main__':main()
