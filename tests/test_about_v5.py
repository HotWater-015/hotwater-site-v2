"""Owner-supplied achievement facts and unpublished-photo boundary."""
import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

class AboutV5(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / 'public/about/index.html').read_text()

    def test_exact_owner_records(self):
        expected = [('XploitX CTF', '13–14 March 2026'), ('InCTF Hardware', '8 August 2026'), ('Drestein Cyber Heist', '11 September 2026'), ('Nullcore CTF 2.0', '26 September 2026'), ('Lunar CTF', '3–4 October 2026'), ('Cyber Carnival CTF', '7 October 2026'), ('Cryovault CTF', '24–25 October 2026')]
        names = re.findall(r'<h3>(.*?)</h3>', self.html)
        self.assertEqual(names, [n for n, _ in expected])
        for _, date in expected:
            self.assertIn(date, self.html)
        self.assertEqual(self.html.count('data-event-id='), 7)
        self.assertEqual(self.html.count('av-result-1'), 6)
        self.assertEqual(self.html.count('av-result-3'), 1)

    def test_authoritative_totals(self):
        data = (ROOT / 'data/achievements.yaml').read_text()
        for k, v in [('first', 6), ('second', 0), ('third', 1)]:
            self.assertRegex(data, rf'{k}: {v}\b')
        for label in ['1st place: 6 CTFs', '2nd place: 0 CTFs', '3rd place: 1 CTFs']:
            self.assertIn(label, self.html)

    def test_supplied_originals_unchanged(self):
        for entry in json.loads((ROOT / 'reports/about-v5-original-assets.json').read_text()):
            if entry['path'].endswith(('.jpg', '.png')):
                self.assertEqual(hashlib.sha256((ROOT / entry['path']).read_bytes()).hexdigest(), entry['sha256'])

    def test_old_review_copy_never_published(self):
        self.assertNotIn('candidate', self.html)
        self.assertNotIn('review_photos', self.html)
        self.assertFalse((ROOT / 'public/review_photos').exists())
        self.assertFalse(list((ROOT / 'public').rglob('*unconfirmed*')))
        self.assertEqual(self.html.count('ORIGINAL ABSTRACT ARTWORK'), 2)

    def test_single_footer(self):
        self.assertEqual(self.html.count('<footer'), 1)
        self.assertEqual(self.html.count('Back to top'), 1)
        self.assertNotIn('av-award-number', self.html)
