#!/usr/bin/env python3
"""Small read-only traversal regression check against the owner's static domain."""
import concurrent.futures,hashlib,http.client,json,ssl
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
PREFIX='/approved-scripts/xploit/related-messages/'
paths=[PREFIX+'solve.sage',PREFIX+'solve.sage?file=../../../../.env',PREFIX+'../../../../.env',PREFIX+'%2e%2e/%2e%2e/%2e%2e/%2e%2e/.env',PREFIX+'%252e%252e%252f%252e%252e%252f.env',PREFIX+'..%5c..%5c..%5c.env',PREFIX+'solve.sage%00/../../.env',PREFIX+'debug.py',PREFIX,'.env','/.env','/.git/config','/hugo.toml','/curated-scripts.json','/data/scripts.json','/reports/script-analysis.json','/scripts/prepare-scripts.py','/Projects/ctf/isfcr-finals/pwn/floe/canary.txt','/etc/passwd']
paths=list(dict.fromkeys(p if p.startswith('/') else '/'+p for p in paths))
expected=(SITE/'public/approved-scripts/xploit/related-messages/solve.sage').read_bytes()
def request(path):
 conn=http.client.HTTPSConnection('hotwater-online.xyz',timeout=25,context=ssl.create_default_context())
 try:
  conn.request('GET',path,headers={'User-Agent':'hotwater-security-verification/1.0','Cache-Control':'no-cache'})
  response=conn.getresponse();body=response.read(2_000_000)
  normal=path.startswith(PREFIX+'solve.sage') and '%00' not in path
  ok=response.status==200 and body==expected if normal else response.status in {400,403,404}
  return {'path':path,'status':response.status,'passed':ok,'body_sha256':hashlib.sha256(body).hexdigest(),'response_bytes':len(body)}
 finally:conn.close()
def main():
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(request,paths))
 report={'host':'hotwater-online.xyz','purpose':'Bounded owner-authorized static-file traversal regression; bodies are not logged','checks':results,'passed':all(x['passed'] for x in results)}
 (SITE/'reports/path-security-live.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
 if not report['passed']:raise SystemExit('Unexpected response: review statuses; never assume a 200 response is safe')
if __name__=='__main__':main()
