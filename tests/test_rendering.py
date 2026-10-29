"""Isolated Hugo fixture checks; original content is never modified."""
import shutil, subprocess, tempfile, unittest
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
class Rendering(unittest.TestCase):
 def test_safe_markdown_and_language_support(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'site'
   shutil.copytree(SITE,root,ignore=shutil.ignore_patterns('public','.dev-public','resources','reports','.wrangler','__pycache__','node_modules'))
   page=root/'content/writeups/render-fixture.md'
   fixture='''---
title: "Render fixture"
event: " cryovault "
category: " Forensic "
date: "2026-10-26"
---
## A heading
<script>window.unsafeExecuted = true</script>
[Unsafe](javascript:alert%281%29)
![Unsafe](data:text/html,boom)
![Test caption](/icons/favicon.svg "Caption text")

| Test | Value |
|---|---|
| Safe | Table |

> A readable blockquote.

$$E = mc^2$$

'''
   for lang in ['python','bash','javascript','typescript','c','cpp','rust','sage','sql','asm']:
    fixture+='```'+lang+'\n# preserve λ and tabs\n\t'+'x'*500+'\n```\n\n'
   fixture+='```mermaid\n</pre><script>window.mermaidUnsafe = true</script>\n```\n'
   page.write_text(fixture)
   subprocess.run([str(Path.home()/'.local/bin/hugo'),'--source',str(root),'--destination',str(Path(tmp)/'build')],check=True,capture_output=True)
   html=(Path(tmp)/'build/writeups/render-fixture/index.html').read_text()
   self.assertNotIn('<script>window.',html)
   self.assertNotIn('href="javascript:',html)
   self.assertNotIn('src="data:',html)
   self.assertIn('&lt;script&gt;',html)
   self.assertIn('Digital Forensics',html)
   self.assertIn('ISFCR CryoVault Finals 2026',html)
   self.assertIn('Caption text',html)
   self.assertIn('<table>',html)
   self.assertIn('<blockquote',html)
   self.assertIn('id="a-heading"',html)
   self.assertEqual(html.count('data-copy-code'),10)
if __name__=='__main__':unittest.main()
