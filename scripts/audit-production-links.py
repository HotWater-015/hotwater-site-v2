"""Validate generated URLs without treating CTF code examples as site configuration."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote, urljoin
import json, hashlib
root=Path(__file__).resolve().parents[1]
public=root/'public'; origin='https://hotwater-online.xyz'
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.canonical=[];self.metadata=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ['a','img','script','link','source']:
   for key in ['href','src']:
    if a.get(key):self.links.append(a[key])
   if a.get('srcset'):self.links.extend(v.strip().split()[0] for v in a['srcset'].split(','))
  if tag=='link' and a.get('rel')=='canonical':self.canonical.append(a.get('href',''))
  if tag=='meta' and a.get('content'):self.metadata.append(a['content'])
missing=[];bad=[];count=0;canonicals=0
for f in public.rglob('*.html'):
 rel=f.relative_to(public).as_posix();route='/'+rel.removesuffix('index.html');base=origin+route
 p=Links();p.feed(f.read_text())
 for value in p.canonical:
  canonicals+=1
  if not value.startswith(origin+'/'):bad.append([rel,'canonical',value])
 for value in p.links+p.metadata:
  if value.startswith(('http://localhost','http://127.0.0.1','https://localhost')):bad.append([rel,'local URL',value])
 for value in p.links:
  u=urlsplit(urljoin(base,value))
  if u.scheme not in ['http','https'] or u.netloc!=urlsplit(origin).netloc:continue
  target=public/unquote(u.path).lstrip('/')
  if target.is_dir():target=target/'index.html'
  if not target.exists():missing.append([rel,value])
  count+=1
report={'links_checked':count,'canonicals_checked':canonicals,'missing':missing,'bad_metadata_or_urls':bad}
(root/'reports/deployment/output-links.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'links_checked':count,'canonicals_checked':canonicals,'missing':len(missing),'bad_urls':len(bad)}))
if missing:print(json.dumps(missing[:15]))
if bad:print(json.dumps(bad[:10]))
if missing or bad:raise SystemExit(1)
files={p.relative_to(public).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in public.rglob('*') if p.is_file()}
(root/'reports/deployment/upload-manifest.json').write_text(json.dumps(files,indent=2))
