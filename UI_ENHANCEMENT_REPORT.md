# HOTWATER — Phase 1 cinematic UI

Implemented locally in `site_v2`. Preview: **http://localhost:1314/**. Production `site/`, its configuration, content and deployment project remain unchanged. No deployment, DNS change, Git push, importer run, source restaging, or challenge-script execution occurred.

## Completed design

- Black/crimson token system, Manrope headings/navigation, Inter body text, JetBrains Mono technical text.
- Rounded cinematic hero with staggered BREAK / ANALYZE / DOCUMENT typography, original cipher-core sculpture, grid/particles, crimson illumination, working floating category links and two clear archive CTAs.
- Real totals: **177 writeups / 13 CTF events**. All counts, titles, descriptions, dates, difficulties and teammate labels remain content-derived.
- Six recent Hugo-rendered cards; six event previews linking to the full event index; seven illustrated category families plus an all-categories link; an archive-purpose section; a full navigation footer.
- Featured section is conditional on actual `featured: true` metadata. None currently exists, so no posts were invented or promoted arbitrarily.
- Consistent illustrated challenge cards across homepage/archive, pointer-reactive lighting, restrained perspective, READ cursor label and animated arrows.
- Redesigned search/select/sort/count/empty-state surfaces retaining the existing combined-filter behavior and legacy URL aliases.
- Refined article headings, metadata, breadcrumbs, calm prose, tables, screenshots, code surfaces, sticky TOC (collapsed initially on mobile), reading progress, related articles and previous/next links.
- Existing approved source viewer now has filename tabs, crimson active indicators, keyboard arrow/Home/End support, native selector synchronization, decorative line numbers, and preserved exact copy/download contents. No source files were added to the approved collection.
- Responsive navigation with native category disclosure, Escape/focus handling, mobile menu and visible keyboard focus.

## Reference study

Studied the actual [Protexy website](https://protexy.framer.website/) in Firefox at desktop/mobile sizes, scrolled through its sections and inspected its article page and computed typography. Its primary headings use **Inter Tight Regular** (68 px homepage / 54 px section and article headings in the inspected desktop layout), with Manrope/Inter also present in its CSS. Adapted the generous spacing, rounded controls, geometric grid, large typographic hierarchy and staged entrances. Our implementation uses the requested Manrope/Inter/JetBrains Mono combination.

The structure, branding, source implementation and graphics are original. No Protexy graphics or code were incorporated. The previous Siegepal screenshot was not attached in this session; the supplied written direction informed crimson lighting, edge glows and technical overlays. Reference screenshots are inspection artifacts in ignored `reports/`.

## Components and architecture

Hugo still owns all content, metadata, article HTML, archive cards, links and routes. React enhances designated decorative mounts and the motion-toggle portal; no Markdown hydration or client-side routing was added.

| Component / module | Responsibility |
| --- | --- |
| `ui/components/HeroScene.jsx` | Intersection/media-gated dynamic loading and cleanup |
| `ui/hero-scene.js` | Original Three.js sculpture, lighting, pointer response, visibility pause, disposal |
| `ui/components/CustomCursor.jsx` | Trailing crimson ring, central point, READ/VIEW labels, magnetic CTAs, card light/tilt |
| `ui/components/CyberBackground.jsx` | Adaptive Canvas particles, connections, proximity effects and static fallback |
| `ui/motion-effects.js` | Staggered heading entrance, section/card reveals, filter and source transitions |
| `layouts/partials/components/ctf-visual.html` | Reusable original category artwork |
| `static/js/enhancements.js` | Native navigation, copy, reading progress, source tabs and keyboard behavior |

Motion remains opt-in to device suitability, honoring the existing persistent toggle and OS reduced motion. Native cursors are retained; the decorative overlay never intercepts input and hides over article text, source and form fields. No scroll interception or artificial page loading screen was introduced.

## Dependencies and assets

Added exact dependencies:

- **Three.js 0.186.1**: loaded only for the visible, motion-enabled desktop hero with a fine pointer.
- **KaTeX 0.16.22**: the same renderer/version already used through a CDN, now pinned and self-hosted. An uncached regression run exposed an intermittent CDN failure; local bundling removes that math-rendering dependency. Licenses are retained in served JS/CSS comments.

Retained React, React DOM, Motion and esbuild. No GSAP, React Three Fiber, Vite, router or extra animation framework was necessary.

Eight original SVGs in `static/images/ctf/`, reproducible with `python3 scripts/create-visuals.py`:

- `cipher-core.svg`: faceted artifact and orbital rings; responsive/no-WebGL/reduced-motion fallback.
- `cryptography.svg`: nested cipher geometry.
- `reverse-engineering.svg`: deconstructed chip layers.
- `digital-forensics.svg`: signal/evidence inspection.
- `binary-exploitation.svg`: memory-stack structure.
- `web-exploitation.svg`: endpoint network.
- `osint.svg`: relationship graph.
- `miscellaneous.svg`: puzzle geometry; also the abstract fallback for other existing categories.

SVG was appropriate for resolution-independent procedural artwork; no stock imagery or raster generation was needed. Total original artwork: **32,880 bytes raw / 4,975 bytes gzip**. Live 3D geometry uses no downloaded model or texture.

Google Fonts and inherited Font Awesome remain external presentation dependencies. The site is not claimed to be entirely offline. Math JS/CSS/fonts are now local under `/js/katex/` and `/css/katex/`.

## Performance decisions

- Main React/Motion island: **237.8 KiB raw / 74.5 KiB gzip**, plus a 577-byte shared chunk (358 bytes gzip).
- Lazy Three.js/scene chunk: **533.8 KiB raw / 134.3 KiB gzip**. It is not requested by article/archive pages, mobile/coarse pointers, save-data clients, or reduced-motion users.
- New cinematic CSS: **27,147 bytes raw / 7,263 bytes gzip**.
- Scene rendering capped at 30 paints/sec and DPR 1.5. Pauses offscreen/in hidden tabs; geometries, materials, renderer, observers and listeners disposed on teardown.
- Background particles retain adaptive counts and bounded connections. No React state changes per animation frame. Pointer bounds are cached and invalidated on resize/scroll rather than measured every pointer event.
- Cursor animation settles instead of maintaining an idle loop. Text/forms preserve native behavior.
- SVGs reserve dimensions; category/card artwork is lazy-loaded. Hero keeps a fixed illustration area and static fallback during loading.
- esbuild ESM splitting and stable loader entry preserve production paths. Successful builds prune stale owned chunks. Generated chunks/vendor assets are Git-ignored and recreated by dev/build commands.
- Development assets use `Cache-Control: no-store` to prevent stale local previews. Production configuration is unchanged.
- No Lighthouse score or universal hardware FPS guarantee is claimed; the evidence here is bundle measurement and functional browser testing.

## Verification performed

Final successful results:

| Check | Result |
| --- | --- |
| `npm run lint` | Syntax checks passed for 22 JS/JSX files plus cinematic CSS |
| `npm run check` | Build, 36 Python tests, publishing audit and preservation checks passed |
| Hugo production build | 280 pages, 98 static files |
| Publishing allowlist audit | 397 files checked; exactly 19 existing approved downloads |
| Original site integrity | All 1,842 original file hashes, permissions and mtimes match Phase 0 snapshot |
| Preserved content/theme/config/importer | 303 files match the copied baseline |
| `npm run check:http` | 196 local route checks, 26 referenced/local JS assets, no missing original routes |
| Site browser regression | 35 checks passed, zero console errors |
| Normal-motion regression | 17 checks passed, zero console errors |
| Real OS reduced-motion profile | 6 checks passed, zero console errors |
| New desktop interaction suite | 17 checks passed, zero console errors |
| Visual/responsive suite | 20 checks passed across 375, 768 and 1440 px |

The interaction suite verifies real WebGL rendering, magnetic buttons, READ/VIEW states, offscreen pause, disable/resume cleanup, native input/text behavior, disclosure focus, source-tab selection and keyboard behavior, mobile menu bounds, no heavy mobile download, and unavailable-WebGL fallback. A separate reduced-motion probe confirms no WebGL canvas, cursor or heavy scene request and a disabled motion override.

The source copy/download test verifies exact contents, including after decorative line numbers were added. No original content, frontmatter, slugs or URLs were rewritten. Existing source selection was exercised but no downloaded CTF script was executed.

During development, checks caught a cursor exclusion that also hid VIEW labels over decorative code, a transition timing mismatch in the test, stale browser assets, and a rendering-fixture copy that included live Firefox profile locks. These were resolved; fixtures now omit generated reports/profiles. Browser tests bypass cache. Run build checks before browser suites: a simultaneous Hugo LiveReload rebuild can interrupt a multi-step interaction test.

### Screenshots

Captured and visually inspected:

- [Desktop hero with real WebGL](reports/phase1-home-desktop.png)
- [Mobile homepage / SVG fallback](reports/phase1-home-mobile.png)
- [Latest writeup cards](reports/phase1-latest-desktop.png)
- [Category collection](reports/phase1-categories-desktop.png)
- [Desktop archive](reports/phase1-archive-desktop.png)
- [Mobile archive](reports/phase1-archive-mobile.png)
- [Desktop article](reports/phase1-article-desktop.png)
- [Mobile article](reports/phase1-article-mobile.png)
- [Source viewer](reports/phase1-code-desktop.png)
- [Reduced-motion fallback](reports/phase1-reduced-desktop.png)

A final targeted browser check also passed mobile TOC collapse/expansion, overflow, and category styling.

Machine-readable evidence lives in `reports/browser-qa.json`, `motion-browser-normal.json`, `motion-browser-reduced.json`, `phase1-browser.json`, `phase1-interactions.json`, `phase1-reduced.json`, `phase1-http.json`, and `motion-bundle.json`. Other inherited reports describe previous work and are not evidence of a deployment in this phase.

## Development commands

```bash
cd /home/jarvis/domain/site_v2
npm ci --ignore-scripts
npm run dev                 # http://localhost:1314/
# Separate terminal, with no browser suite running during rebuild:
npm run check
npm run check:http          # requires the local server
npm run check:browser       # requires Firefox BiDi at 9222
BIDI_PORT=9223 npm run check:visual
BIDI_PORT=9223 npm run check:interactions
BIDI_PORT=9224 MOTION_EXPECT_REDUCED=1 node tests/motion-browser-qa.mjs
```

Firefox headless may report no fine pointer by default. For desktop interaction checks, create a profile under ignored `reports/firefox-desktop/` with `user.js`:

```js
user_pref("ui.primaryPointerCapabilities", 6);
user_pref("ui.allPointerCapabilities", 6);
user_pref("webgl.force-enabled", true);
user_pref("webgl.disabled", false);
```

Launch with `firefox --headless --no-remote --profile /home/jarvis/domain/site_v2/reports/firefox-desktop --remote-debugging-port 9223`. For reduced-motion tests use a separate profile/port and `user_pref("ui.prefersReducedMotion", 1);`. Stop test browsers after use. The setup guide retains the simpler 9222 instructions. Build and dev prepare pinned local math assets automatically; neither deploys nor imports Markdown.

## Modified files

New design/application files:

- `layouts/index.html`
- `layouts/partials/footer.html`
- `layouts/partials/components/ctf-visual.html`
- `static/css/cinematic.css`
- `static/images/ctf/*.svg` (eight files)
- `ui/components/HeroScene.jsx`, `ui/components/CustomCursor.jsx`, `ui/hero-scene.js`
- `scripts/create-visuals.py`, `scripts/vendor.mjs`, `scripts/lint.mjs`, `scripts/check-local.py`
- `tests/bidi.mjs`, `tests/cinematic-qa.mjs`, `tests/interactions-qa.mjs`, `tests/inspect-reference.mjs`
- `UI_ENHANCEMENT_REPORT.md`

Updated:

- `layouts/partials/home/{hero,posts,events}.html`
- `layouts/partials/{head,header,category-links,solution-scripts}.html`
- `layouts/partials/components/writeup-card.html`, `layouts/_default/baseof.html`
- `ui/main.jsx`, `ui/motion-effects.js`, `ui/components/CyberBackground.jsx`
- `static/js/{motion-loader,enhancements}.js`
- `scripts/{local,motion-options,build-motion}.mjs`
- `package.json`, `package-lock.json`, `.gitignore`, `config/development/hugo.toml`
- `tests/{browser-qa,motion-browser-qa}.mjs`, `tests/test_rendering.py`
- `SITE_V2_SETUP.md`

Generated outputs include the main island/chunks, local KaTeX files/fonts, public builds and ignored reports. Existing `hugo.toml`, theme source, content, importer, curated source manifest and approved source assets remain unchanged.

## Limits and Part 2

No known failing checks remain. Browser verification covers Firefox, including actual WebGL, but not Safari, Chromium, physical mobile hardware or a deployed Cloudflare edge. OS clipboard permission is mocked; exact copy payload and downloads are checked. Fonts/icon CDN availability is still external. Reduced-motion/mobile/save-data fallback is intentional. The original-tree snapshot is machine-local as documented in Phase 0.

Part 2 remains reserved for enhanced search/filter logic and intelligent solver discovery, disambiguation, metadata and selection. This phase preserves existing filtering and approved sources and upgrades their presentation only. No additional sensitive challenge files were scanned for inclusion or published. External deployment still requires a later explicit instruction.

## Subsequent quality pass — 2026-10-28

See [UI_UX_QUALITY_REPORT.md](UI_UX_QUALITY_REPORT.md) for the custom searchable filter menus, active-filter chips, flag-copy controls, table/source-viewer refinements, and mandatory visual QA. That report supersedes this Phase 1 report's statements about Google Fonts being external: Manrope, Inter and JetBrains Mono are now self-hosted. The underlying content, theme and approved sources remain unchanged.
