# Hotwater About V5

Local preview: http://localhost:1314/about/

## Delivered

The existing cinematic introduction is retained with the exact headline **TRUST IS A VULNERABILITY.** The page now tells four connected chapters: About Me, Positions Secured, CTF Victories, and one closing footer. No project, education, certification, skills, or writeup-list sections were added.

- Podium: **06 gold / 00 silver / 01 crimson**, independent of image availability. Metallic gradients, platform entrances, once-per-page count animation, reversible scroll lighting, and pointer-responsive highlights.
- Victories: seven chronological records from `data/achievements.yaml`. The duplicated placement-summary carousel is removed.
- Desktop: native scrolling through a sticky gallery, horizontal event transitions, image scale/perspective, independent title movement, and an accessible seven-stop timeline. Scroll distance derives from the data count.
- Tablet/mobile: normal vertical reading order, naturally proportioned photographs, compact sticky event navigation, and no long pinned sequence.
- Footer: one contained `hotwater.` wordmark, closing phrase, minimal links, copyright, and one Back to Top control. Other routes retain their existing footer.

## Authoritative records

| Competition | Supplied date | Place | Public visual |
| --- | --- | --- | --- |
| XploitX CTF | 13–14 March 2026 | 3rd | Owner-confirmed follow-up photograph |
| InCTF Hardware | 8 August 2026 | 1st | Supplied hardware-awards photograph |
| Drestein Cyber Heist | 11 September 2026 | 1st | Supplied First Prize Winner photograph |
| Nullcore CTF 2.0 | 26 September 2026 | 1st | Original abstract artwork |
| Lunar CTF | 3–4 October 2026 | 1st | Supplied team/prize-board photograph |
| Cyber Carnival CTF | 7 October 2026 | 1st | Original abstract artwork |
| Cryovault CTF | 24–25 October 2026 | 1st | Supplied portrait photograph |

The ZIP originally marked the XploitX association **unconfirmed**. The owner subsequently confirmed the attached photograph as the XploitX third-prize photo. That exact PNG is now used. The old candidate JPEG remains in the ignored, non-public `review_photos/` directory. Nullcore and Cyber Carnival still have no supplied photographs; their visuals are explicitly captioned “Original abstract artwork.” No event, date, rank, or documentary photograph was fabricated.

## Photography and permissions

The four supplied JPEGs and the confirmed XploitX PNG are preserved byte-for-byte. SHA-256 checks are recorded in `reports/about-v5-original-assets.json` and tested. Responsive WebP derivatives were resized without cropping; originals remain available through accessible full-photo links. Images have explicit aspect ratios, dimensions, descriptive non-identifying alt text, lazy loading, and `object-fit: contain`. Cryovault keeps its portrait orientation and complete prize board.

The asset README requests publication-permission review for photographs containing other attendees. The package does not document those permissions. The owner authorized this local integration; permission review remains a pre-deployment item. Nothing was deployed.

## Reference inspection

The live Protexy About page was inspected in Firefox at 1440px and 390px widths, at multiple scroll positions. Captures and DOM observations are retained as `reports/about-reference-*.png` and `reports/about-reference-observations.jsonl`.

Directly observed: oversized Inter Tight headings (68px desktop hero), a dark technical-grid introduction, a large photographic composition, a light editorial biography area, profile compositions, full-width dark award rows, FAQ, and closing CTA. Mobile stacks the composition. Sampled frames show image tile effects and blurred text reveal states. No CSS-sticky elements were detected in that sampled DOM. Exact animation curves, full timing, or reference-equivalent fidelity are not claimed. Hotwater uses its established Manrope/Inter/JetBrains Mono typography and original artwork rather than copying Protexy assets.

## Implementation and files

- `data/achievements.yaml`: reviewed merge of the supplied authoritative totals and seven stable-ID records; XploitX updated after confirmation. `records` is the only event source.
- `data/portfolio.yaml`: concise public biography, sourced from existing About content.
- `layouts/_default/about.html`: Hugo-rendered chapters, data-driven dates, accessible gallery, responsive photographs, and closing footer.
- `layouts/_default/baseof.html`: suppresses the shared footer only on the About layout.
- `layouts/partials/head.html`: About-only stylesheet inclusion.
- `layouts/partials/about-artifact.html`: original static hero fallback.
- `layouts/partials/about-event-art.html`: original procedural event artwork.
- `static/css/about-v4.css`: the existing About stylesheet, refined in place for V5; gold/crimson podium, contained photo layouts, responsive gallery, and footer.
- `ui/main.jsx`: lazy About enhancement within the existing React motion island.
- `ui/components/AboutExperience.jsx`: scroll measurements, reversible scene transforms, responsive navigation, count-up, podium lighting, footer reveal, cleanup.
- `ui/about-scene.js`: original fragmented-metal Three.js hero with bounded rendering and SVG fallback.
- `ui/motion-effects.js`: cancellation fix for a shared Firefox animation error when filters hide an animating element.
- `static/images/achievements/`: five unchanged originals and responsive WebP derivatives.
- `.gitignore`: excludes `review_photos/`.
- `scripts/lint.mjs`: includes About CSS validation.
- `tests/about-v5-qa.mjs`, `tests/about-v5-reduced-qa.mjs`, `tests/test_about_v5.py`: browser, reduced-motion, facts, asset integrity, and publication-boundary checks.
- `tests/bidi.mjs`: closes the test-owned tab after each run.
- `package.json`: adds `npm run check:about`.

Generated motion chunks are rebuilt by the existing pipeline. No dependency was added. Existing Motion, React, and Three.js are reused; CSS sticky positioning supplies the pinning, with scroll-synchronized transforms managed by the React enhancement. No wheel/touch handlers intercept scrolling. Hidden desktop events are inert; all events remain readable in static/reduced-motion layouts.

Three.js is loaded separately, capped at 30fps and DPR 1–1.5, paused offscreen/in hidden tabs, and disposed on teardown. Scroll work is coalesced through requestAnimationFrame with cached measurements and ResizeObserver updates; React state is not updated every frame.

## Visual QA and fixes

Rendered Firefox screenshots were captured and reviewed for the hero, transition, podium, all seven desktop events, mid-gallery movement, tablet layout, mobile gallery, portrait photo, and footer. Files use the `reports/about-v5-*.png` prefix.

The review caught and corrected oversized intrinsic grid tracks that clipped photos inside the pinned scene, a portrait frame sizing error, overlapping event typography during crossfades, and missing reserved image ratios. Event transitions now move sideways without superimposed titles. Photo frames are explicitly tested to stay inside the desktop viewport region. The footer wordmark is contained and the duplicated navigation/footer is removed.

## Verification

- `npm run check`: Hugo/frontend build, JS/JSX and CSS syntax validation, **41 Python tests**, publishing audit, and preservation checks passed.
- `npm run check:about`: **28 browser checks**, including all seven events, correct colors/totals, photo mapping, frame containment, responsive layouts, motion toggle, and no browser errors.
- `BIDI_PORT=9224 node tests/about-v5-reduced-qa.mjs`: **9 checks** under a real reduced-motion browser preference; no decorative WebGL or pinned scenes, all records accessible, and no overflow at 320/390/768/1280px.
- `npm run check:browser`: **35 functional + 17 motion checks** passed across the existing homepage/archive/article flows.
- `npm run check:discovery`: **28 discovery checks** passed, including dark menus, filters, flag copying, and real script tabs.
- `npm run check:http`: **196 routes and 38 local assets** passed after the confirmed XploitX photo was added.
- Original production `site/`: **1,842 file hashes, modes, and mtimes match** the baseline. **303 preserved content/theme/config/importer files** match.

An earlier regression attempt lost its headless browser session; it was not counted as a pass. A fresh browser run completed the checks above.

## Local commands

From `site_v2/`:

```sh
npm run dev
npm run build
npm run check
npm run check:about
```

The browser command expects the existing local Firefox BiDi test endpoint on port 9222. Reduced-motion QA uses the separate configured profile on port 9224. The local Hugo server remains at port 1314. No deployment commands are part of this workflow.
