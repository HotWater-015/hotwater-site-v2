"""Read-only HTTPS validation of the exact site_v2 upload manifest."""
import concurrent.futures,hashlib,json,urllib.request,urllib.error,time,re,html
from urllib.parse import quote
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='https://hotwater-online.xyz/'
manifest=json.loads((root/'reports/deployment/upload-manifest.json').read_text())
def verify(item):
 path,expected=item
 if path.startswith('_'):return None
 route=path[:-10] if path.endswith('index.html') else path
 url=base+quote(route,safe="/")
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Hotwater-Deployment-Verification/1.0','Cache-Control':'no-cache'})
  try:
   with urllib.request.urlopen(req,timeout=40) as r:status=r.status;body=r.read();final=r.url
  except urllib.error.HTTPError as e:
   status=e.code;body=e.read();final=e.url
  raw_digest=hashlib.sha256(body).hexdigest()
  injected_beacon=False
  if path.endswith('.html'):
   clean=re.sub(rb'<script\b(?=[^>]*src="https://static\.cloudflareinsights\.com/beacon\.min\.js/)[^>]*\bdata-cf-beacon=[^>]*></script>\n?',b'',body)
   injected_beacon=clean!=body
   # Existing Cloudflare email protection rewrites email-like CTF strings.
   # Decode only its signed markup; compare the complete restored document.
   def restore_email(match):
    encoded=bytes.fromhex(match.group(1).decode())
    return html.escape(bytes(x^encoded[0] for x in encoded[1:]).decode('utf-8'),quote=False).encode()
   clean=re.sub(rb'<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="([a-f0-9]+)">.*?</a>',restore_email,clean)
   clean=re.sub(rb'<script data-cfasync="false" src="/cdn-cgi/scripts/[a-f0-9]+/cloudflare-static/email-decode.min.js"></script>',b'',clean)
   body=clean
  digest=hashlib.sha256(body).hexdigest()
  valid=status==200 or (path=='404.html' and status==404)
  return {'path':path,'url':url,'status':status,'https':final.startswith('https://'),'matches_upload':digest==expected,'byte_exact':raw_digest==expected,'cloudflare_analytics_injected':injected_beacon,'ok':valid and final.startswith('https://') and digest==expected}
 except Exception as e:return {'path':path,'ok':False,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=[r for r in pool.map(verify,manifest.items()) if r]
failures=[r for r in results if not r['ok']]
report={'origin':base,'checked':len(results),'passed':len(results)-len(failures),'failures':failures,'results':results}
(root/'reports/deployment/live-assets.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:report[k] for k in ['origin','checked','passed','failures']}))
if failures:raise SystemExit(1)
