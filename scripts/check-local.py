"""HTTP verification of local routes/assets; never visits production or challenge URLs."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,quote
from urllib.request import urlopen
import json
SITE=Path(__file__).resolve().parents[1]
BASE='http://localhost:1314'
class Assets(HTMLParser):
 def __init__(self):super().__init__();self.urls=[];self.canonical=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ('img','script') and a.get('src'):self.urls.append(a['src'])
  if tag=='link' and a.get('rel') in ('stylesheet','icon','apple-touch-icon','manifest'):self.urls.append(a['href'])
  if tag=='link' and a.get('rel')=='canonical':self.canonical=a['href']
routes=sorted({'/','/ctfs/','/categories/','/about/','/search/'}|{'/'+str(p.relative_to(SITE/'public')).removesuffix('index.html') for p in (SITE/'public/writeups').rglob('index.html')})
assets=set()
for route in routes:
 with urlopen(BASE+quote(route),timeout=10) as r:
  assert r.status==200,route
  page=Assets();page.feed(r.read().decode())
  assert page.canonical and page.canonical.startswith(BASE+'/'),f'Non-local canonical: {route}'
  for u in page.urls:
   full=urljoin(BASE+route,u)
   if urlsplit(full).netloc=='localhost:1314':assets.add(full)
for path in (SITE/'static/js/chunks').glob('*.js'):assets.add(BASE+'/js/chunks/'+path.name)
for url in assets:
 with urlopen(quote(url,safe=':/?=&%'),timeout=10) as r:assert r.status==200,url
old={str(p.relative_to(SITE.parent/'site/public')) for p in (SITE.parent/'site/public').rglob('index.html')}
new={str(p.relative_to(SITE/'public')) for p in (SITE/'public').rglob('index.html')}
assert not old-new, f'Missing routes: {old-new}'
result={'routes_checked':len(routes),'local_assets_checked':len(assets),'missing_original_routes':sorted(old-new),'status':'passed'}
(SITE/'reports/phase1-http.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
