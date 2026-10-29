#!/usr/bin/env python3
"""Fail closed before deployment if public/ contains files outside the static publishing policy."""
import importlib.util,json
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_policy',SITE/'scripts/prepare-scripts.py')
policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
ROOT_FILES={'index.html','404.html','robots.txt','sitemap.xml','index.xml','index.json','manifest.webmanifest','_headers','_redirects'}
ROOT_DIRS={'about','achievements','approved-scripts','categories','ctfs','css','icons','images','js','search','tags','writeups'}
PUBLIC_EXTENSIONS={'.html','.xml','.json','.webmanifest','.css','.js','.png','.svg','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf'}
TEXT_EXTENSIONS={'.html','.xml','.json','.webmanifest','.css','.js','.svg'}
def audit(directory,manifest=None):
    directory=Path(directory)
    if directory.is_symlink() or not directory.is_dir():raise ValueError('Invalid public output directory')
    if manifest is None:manifest=json.loads((SITE/'curated-scripts.json').read_text())
    _,expected=policy.validate(manifest)
    found=set();files=0
    for p in directory.rglob('*'):
        relative=p.relative_to(directory);name=relative.as_posix()
        if p.is_symlink():raise ValueError('Symlink in public output: '+name)
        if any(part.startswith('.') for part in relative.parts):raise ValueError('Hidden file/directory in public output: '+name)
        if not p.is_file():continue
        files+=1
        if len(relative.parts)==1:
            if name not in ROOT_FILES:raise ValueError('Unexpected public root file: '+name)
        elif relative.parts[0] not in ROOT_DIRS:raise ValueError('Unexpected published directory: '+relative.parts[0])
        if relative.parts[0]=='approved-scripts':
            if name not in expected:raise ValueError('Unapproved source in public output: '+name)
            if p.read_bytes()!=expected[name]:raise ValueError('Approved source content mismatch: '+name)
            found.add(name)
        elif name not in ROOT_FILES and p.suffix.lower() not in PUBLIC_EXTENSIONS:
            raise ValueError('Forbidden public file type: '+name)
        # Articles contain intentional CTF credential/key demonstrations. Scan
        # application assets here; curated source is scanned by policy.validate.
        if relative.parts[0] in {'js','css'} and p.suffix.lower() in {'.js','.css'}:
            try:policy.check_secrets(p.read_text(encoding='utf-8'))
            except ValueError:raise ValueError('Potential secret in public output: '+name) from None
    if found!=set(expected):raise ValueError('Missing approved source files')
    if not (directory/'404.html').is_file():raise ValueError('404.html required; do not fall back to a successful homepage for unknown files')
    return {'files_checked':files,'approved_sources':len(found),'status':'passed'}
if __name__=='__main__':print(json.dumps(audit(SITE/'public')))
