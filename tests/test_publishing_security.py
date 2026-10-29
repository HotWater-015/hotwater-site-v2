import copy,importlib.util,json,shutil,tempfile,unittest
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('publish_audit',SITE/'scripts/check-public.py')
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
class PublishingSecurity(unittest.TestCase):
 def test_real_output(self):self.assertEqual(check.audit(SITE/'public')['approved_sources'],19)
 def test_ambiguous_manifest_paths(self):
  for path in ['Projects/ctf/%2e%2e/private.py','Projects//ctf/test.py','Projects/./ctf/test.py','Projects/ctf/file.py?file=../../secret','Projects/ctf/a.py#fragment','Projects/ctf/a.py\x00','C:/secret.py']:
   with self.subTest(path=repr(path)),self.assertRaises(ValueError):check.policy.safe_path(SITE.parent,path)
 def mutated(self,name,content=b'not published',symlink=False):
  with tempfile.TemporaryDirectory() as tmp:
   target=Path(tmp)/'public';shutil.copytree(SITE/'public',target)
   file=target/name;file.parent.mkdir(parents=True,exist_ok=True)
   if symlink:file.symlink_to(SITE/'hugo.toml')
   else:file.write_bytes(content)
   with self.assertRaises(ValueError):check.audit(target)
 def test_unapproved_script(self):self.mutated('approved-scripts/xploit/related-messages/debug.py')
 def test_modified_approved_script(self):self.mutated('approved-scripts/xploit/related-messages/solve.sage')
 def test_hidden_file(self):self.mutated('.env')
 def test_nested_hidden_file(self):self.mutated('writeups/.git/config')
 def test_private_config(self):self.mutated('writeups/hugo.toml')
 def test_source_map(self):self.mutated('js/main.js.map')
 def test_private_directory(self):self.mutated('Projects/ctf/evidence.json')
 def test_symlink(self):self.mutated('js/leak.js',symlink=True)
 def test_worker_backend(self):self.mutated('_worker.js')
 def test_key_file(self):self.mutated('images/private.pem')
 def test_missing_404(self):
  with tempfile.TemporaryDirectory() as tmp:
   target=Path(tmp)/'public';shutil.copytree(SITE/'public',target);(target/'404.html').unlink()
   with self.assertRaises(ValueError):check.audit(target)
if __name__=='__main__':unittest.main()
