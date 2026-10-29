"""Integrity, allowlist security and generated-site checks; standard library only."""
import copy, hashlib, importlib.util, json, os, tempfile, unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
SITE=Path(__file__).resolve().parents[1]
BUILD=Path(os.environ.get('ARCHIVE_BUILD_DIR',str(SITE/'public')))
spec=importlib.util.spec_from_file_location('prepare', SITE/'scripts/prepare-scripts.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)
class Parser(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set();self.scripts=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id'in a:self.ids.add(a['id'])
        if tag=='a' and a.get('href'):self.links.append(a['href'])
        if tag=='script':self.scripts.append(a.get('src','inline'))
class Security(unittest.TestCase):
    def setUp(self):self.manifest=json.loads((SITE/'curated-scripts.json').read_text())
    def reject(self,mutation):
        m=copy.deepcopy(self.manifest);mutation(m)
        with self.assertRaises((ValueError,FileNotFoundError)):prepare.validate(m)
    def test_real_manifest(self):
        data,assets=prepare.validate(self.manifest);self.assertEqual(len(data),14);self.assertEqual(len(assets),19)
    def test_no_local_writeup_or_conventional_solver_name_required(self):
        m=copy.deepcopy(self.manifest);m['challenges']=[next(e for e in m['challenges'] if e['writeup']=='writeups/cryovault/floe.md')]
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp);site=repo/'site';entry=m['challenges'][0]
            writeup=site/'content'/entry['writeup'];writeup.parent.mkdir(parents=True);writeup.write_text('Existing writeup stored in website content')
            for script in entry['scripts']:
                source=prepare.REPO/script['path'];target=repo/script['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
            data,assets=prepare.validate(m,repo,site)
            self.assertEqual(len(assets),2);self.assertFalse((repo/entry['directory']/'writeup.md').exists());self.assertFalse((repo/entry['directory']/'solve.py').exists())
    def test_parent_traversal(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(path='../outside.py'))
    def test_absolute_path(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(path='/etc/passwd'))
    def test_backslash_traversal(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(path='Projects\\..\\outside.py'))
    def test_outside_directory(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(path=m['challenges'][1]['scripts'][0]['path']))
    def test_sensitive_extension(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(path=m['challenges'][0]['directory']+'/.env'))
    def test_missing_script(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(path=m['challenges'][0]['directory']+'/missing.py'))
    def test_changed_hash(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(sha256='0'*64))
    def test_duplicate_challenge(self):self.reject(lambda m:m['challenges'].append(m['challenges'][0]))
    def test_missing_evidence(self):self.reject(lambda m:m['challenges'][0]['scripts'][0].update(evidence=''))
    def test_duplicate_main(self):self.reject(lambda m:m['challenges'][0]['scripts'][1].update(role='main-solver'))
    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'source.py').write_text('source');(p/'link.py').symlink_to(p/'source.py')
            with self.assertRaises(ValueError):prepare.safe_path(p,'link.py')
    def test_secret_rejected(self):
        for value in ['-----BEGIN PRIVATE KEY-----','API_TOKEN = "this-is-a-real-looking-token"','AKIA'+'A'*16]:
            with self.assertRaises(ValueError):prepare.check_secrets(value)
    def test_unicode_and_long_lines(self):
        prepare.check_secrets('print("λ — 解")\n'+'#'+'a'*4000)
        self.assertEqual(prepare.safe_path(Path('/tmp'),'model (1).py'),Path('/tmp/model (1).py'))
class GeneratedSite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.redirects={}
        for line in (SITE/'static/_redirects').read_text().splitlines():
            if line and not line.startswith('#'):
                a,b,status=line.split();cls.redirects[a]=b
    def test_original_content_byte_exact(self):
        baseline=json.loads((SITE/'tests/fixtures/original-content-sha256.json').read_text())
        for name,value in baseline.items():self.assertEqual(hashlib.sha256((SITE/name).read_bytes()).hexdigest(),value,name)
    def test_original_urls_or_valid_redirects(self):
        for route in json.loads((SITE/'tests/fixtures/original-routes.json').read_text()):
            if (BUILD/route).is_file():continue
            url='/'+route.removesuffix('index.html');self.assertIn(url,self.redirects)
            self.assertTrue((BUILD/self.redirects[url].lstrip('/')/'index.html').is_file(),url)
    def test_all_internal_links(self):
        missing=set()
        for f in BUILD.rglob('*.html'):
            p=Parser();p.feed(f.read_text())
            for link in p.links:
                u=urlsplit(link)
                if u.scheme or u.netloc or not u.path:continue
                target=BUILD/unquote(u.path).lstrip('/') if u.path.startswith('/') else f.parent/unquote(u.path)
                if target.is_file() or (target/'index.html').is_file() or u.path in self.redirects:continue
                missing.add((str(f.relative_to(BUILD)),link))
        self.assertEqual(missing,set())
    def test_exact_approved_assets_only(self):
        _,assets=prepare.validate(json.loads((SITE/'curated-scripts.json').read_text()))
        actual={str(p.relative_to(BUILD)) for p in (BUILD/'approved-scripts').rglob('*') if p.is_file()}
        self.assertEqual(actual,set(assets))
        for name,raw in assets.items():self.assertEqual((BUILD/name).read_bytes(),raw,name)
    def test_unique_article_code_ids(self):
        # Original hook reused per-ordinal IDs; the new hook needs no global IDs.
        f=BUILD/'writeups/cryovault/rime/index.html';p=Parser();p.feed(f.read_text());self.assertTrue(p.ids)
    def test_reports_include_ambiguous_and_large_cases(self):
        r=json.loads((SITE/'tests/fixtures/script-analysis.json').read_text())
        self.assertEqual(len(r),177);self.assertTrue(any(not x['directory'] for x in r));self.assertTrue(any(x['python_files_analyzed']>=20 for x in r))
        floe=next(x for x in r if x['writeup']=='writeups/cryovault/floe.md');self.assertEqual(floe['python_files_analyzed'],39);self.assertEqual(len(floe['selected']),2)
    def test_no_runtime_challenge_sources(self):
        for f in BUILD.rglob('*.html'):
            p=Parser();p.feed(f.read_text());self.assertFalse(any('/approved-scripts/' in x for x in p.scripts))
if __name__=='__main__':unittest.main(verbosity=2)
