#!/usr/bin/env python3
"""Read-only static inventory. Never imports or executes challenge code; never approves files."""
import ast, hashlib, json, os, re
from pathlib import Path
SITE = Path(__file__).resolve().parents[1]
REPO = SITE.parent
CTF = REPO / 'Projects/ctf'
SKIP = {'target','build','dist','venv','.venv','node_modules','pylibs','cryopy','site-packages','__pycache__','.git','tools','lib','lib64','usr'}
EXT = {'.py','.sage','.sh','.js','.ts','.c','.cpp','.rs','.sql','.asm'}
def digest(f): return hashlib.sha256(f.read_bytes()).hexdigest()
def body(text):
    text = re.sub(r'\A(?:---\n.*?\n---|\+\+\+\n.*?\n\+\+\+)\s*', '', text, flags=re.S)
    return re.sub(r'\A#\s+[^\n]*\n+', '', text).strip()
def meta(text,key):
    m=re.search(r'^'+key+r':\s*"(.*)"$',text,re.M)
    return json.loads('"'+m[1]+'"') if m else ''
def source_files(root):
    for current,dirs,files in os.walk(root,followlinks=False):
        dirs[:]=sorted(d for d in dirs if d not in SKIP and not (Path(current)/d).is_symlink())
        for name in sorted(files):
            f=Path(current)/name
            if not f.is_symlink() and f.suffix in EXT and f.stat().st_size < 1_000_000: yield f

def analyze(f, text):
    code=f.read_text(errors='replace'); refs=sorted(set(re.findall(r'[\w./-]+\.(?:py|sage|sh|js|ts|c|cpp|rs|sql|asm)', text)))
    result={'path':str(f.relative_to(REPO)),'sha256':digest(f),'lines':len(code.splitlines()),'referenced':any(Path(r).name==f.name for r in refs),'imports':[],'functions':[],'local_dependencies':[],'file_literals':[],'status':'unreviewed; unpublished'}
    if f.suffix=='.py':
        try:
            tree=ast.parse(code)
            result['docstring']=ast.get_docstring(tree) or ''
            result['imports']=sorted({n.names[0].name if isinstance(n,ast.Import) else n.module or '' for n in ast.walk(tree) if isinstance(n,(ast.Import,ast.ImportFrom))})
            result['functions']=[n.name for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]
            result['file_literals']=sorted({n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str) and len(n.value)<150 and re.fullmatch(r'[\w./-]+\.(?:py|sage|txt|json|bin|csv|db)',n.value)})
            for imp in result['imports']:
                dep=f.parent/(imp.split('.')[0]+'.py')
                if dep.is_file():result['local_dependencies'].append(str(dep.relative_to(REPO)))
        except (SyntaxError,ValueError):result['parse_note']='Cannot parse with host Python; manual inspection required'
    result['capabilities']=[label for label,pattern in [('network','socket|requests\\.|remote\\('),('process','subprocess|os\\.system|popen'),('decoding','decode|decrypt|unpad'),('recovery','recover|solve|brute'),('file-output','write_text|write_bytes|[\\\"\\\']w[b]?[\\\"\\\']')] if re.search(pattern,code)]
    result['review_reason']='Referenced by writeup; requires logic/dependency review' if result['referenced'] else 'No explicit writeup reference; no evidence of necessary role'
    return result

def run():
    # Index original writeups for exact-body mapping, including files stored elsewhere.
    index={}
    for current,dirs,files in os.walk(CTF,followlinks=False):
        dirs[:]=[d for d in dirs if d not in SKIP and not (Path(current)/d).is_symlink()]
        for name in files:
            f=Path(current)/name
            if f.suffix.lower()=='.md' and not f.is_symlink() and f.stat().st_size<1_000_000:
                index.setdefault(hashlib.sha256(body(f.read_text(errors='replace')).encode()).hexdigest(),[]).append(f)
    manifest=json.loads((SITE/'curated-scripts.json').read_text()) if (SITE/'curated-scripts.json').exists() else {'challenges':[]}
    curated={x['writeup']:x for x in manifest['challenges']}
    records=[]
    previous_file=SITE/'reports/script-analysis.json'
    previous=json.loads(previous_file.read_text()) if previous_file.exists() else []
    previous_hashes={c['path']:c['sha256'] for r in previous for c in r['candidates']}
    for f in sorted((SITE/'content/writeups').rglob('*.md')):
        if f.name=='_index.md':continue
        text=f.read_text();src=meta(text,'source');key=str(f.relative_to(SITE/'content'))
        matches=index.get(hashlib.sha256(body(text).encode()).hexdigest(),[])
        dirs=sorted({m.parent for m in matches if m.parent.name!='writeups'})
        direct=CTF/src
        if direct.is_file() and direct.parent.name!='writeups':dirs=sorted(set(dirs+[direct.parent]))
        entry=curated.get(key)
        if entry:
            mapped=[REPO/entry['directory']];confidence='High: explicit curated mapping checked against writeup'
        elif len(dirs)==1:mapped=dirs;confidence='High: explicit source or identical writeup body'
        elif len(dirs)>1:
            # Content-only mirrors carry no candidate source; report them but prefer the unique directory containing code.
            withcode=[d for d in dirs if next(source_files(d),None)]
            mapped=withcode if len(withcode)==1 else []
            confidence='High: identical body, unique directory containing source' if mapped else 'Uncertain: multiple identical writeup locations'
        else:mapped=[];confidence='Uncertain: source is shared writeups folder or no exact challenge-directory match'
        candidates=[]
        for d in mapped:candidates += [analyze(p,text) for p in source_files(d)]
        selected={x['path'] for x in entry['scripts']} if entry else set()
        for c in candidates:
            if c['path'] in selected:c['status']='curated for publication';c['review_reason']=next(x['evidence'] for x in entry['scripts'] if x['path']==c['path'])
        by_hash={}
        for c in candidates:
            if c['sha256'] in by_hash:c['identical_to']=by_hash[c['sha256']]
            else:by_hash[c['sha256']]=c['path']
        records.append({'writeup':key,'title':meta(text,'title'),'ctf':meta(text,'event'),'source':src,'matched_directories':[str(d.relative_to(REPO)) for d in dirs],'directory':[str(d.relative_to(REPO)) for d in mapped],'mapping_confidence':confidence,'python_files_analyzed':sum(c['path'].endswith('.py') for c in candidates),'scripts_analyzed':len(candidates),'selected':list(sorted(selected)),'publication_status':'Curated by implementation review; not separately owner-approved' if selected else 'Unpublished: no curated selection','candidates':candidates})
    out=SITE/'reports';out.mkdir(exist_ok=True)
    queue=[]
    for r in records:
        pending=[c['path'] for c in r['candidates'] if c['path'] not in r['selected']]
        changed=[c['path'] for c in r['candidates'] if c['path'] in previous_hashes and c['sha256']!=previous_hashes[c['path']]]
        new=[c['path'] for c in r['candidates'] if c['path'] not in previous_hashes]
        if pending or changed or not r['directory']:
            queue.append({'writeup':r['writeup'],'reason':'Mapping needs review' if not r['directory'] else 'Static inventory is not publication approval; compare source logic and dependency closure with writeup','unpublished_candidates':pending,'new_candidates':new,'changed_candidates':changed,'action':'Review locally. Never auto-add to curated-scripts.json.'})
    (out/'script-review-queue.json').write_text(json.dumps(queue,indent=2)+'\n')
    (out/'script-analysis.json').write_text(json.dumps(records,indent=2)+'\n')
    lines=['# Script selection report','','Static analysis only. No challenge scripts were executed. Unreviewed candidates remain unpublished.','Selections marked curated were reviewed during implementation, not separately approved by the owner.','']
    for r in records:
        lines += ['## '+r['ctf']+' / '+r['title'],'','- Existing writeup: `'+r['writeup']+'`','- Directory: '+(', '.join('`'+d+'`' for d in r['directory']) or 'Uncertain; review required'),'- Mapping: '+r['mapping_confidence'],f"- Python files analyzed: {r['python_files_analyzed']}; source candidates: {r['scripts_analyzed']}",'- Selected: '+(', '.join('`'+p+'`' for p in r['selected']) or 'None'),f"- Unpublished candidates: {r['scripts_analyzed']-len(r['selected'])}. No necessary role established without further manual review.",'- Publication: '+r['publication_status'],'']
    lines+=['Candidate-level imports, functions, local dependencies, file references, hashes and reasons are in `script-analysis.json`.','New candidate files are inventory changes only; they never modify curated selections.']
    (out/'script-selection.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'writeups':len(records),'mapped':sum(bool(r['directory']) for r in records),'python_candidates':sum(r['python_files_analyzed'] for r in records),'curated_challenges':sum(bool(r['selected']) for r in records)}))
if __name__=='__main__':run()
