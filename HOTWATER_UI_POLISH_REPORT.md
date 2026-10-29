# Hotwater UI polish — 28 October 2026

## Implemented

Refined the existing Hugo/React site rather than replacing its architecture or content. All source changes are in `site_v2/`. Original `site/` remains unchanged (1,842 hashes, modes and modification times checked); 303 preserved content/theme/config/importer files also pass their preservation checks.

- Original Fractured HW identity: one faceted SVG master, used in navigation, shared footer, About closing and homepage identity panel. Generated favicon, Apple touch/PWA icons and 1200×630 social image share its geometry.
- Self-hosted **General Sans Medium 500**, scoped to navigation/brand and writeup-card titles. Navbar 14px desktop/15px mobile, wordmark 24px, card titles 24px desktop/23px mobile. Hero, About, article, code and supporting fonts retain their existing families.
- Cards now have continuous dark surfaces, clearer hierarchy, larger titles, crimson title illumination, pointer-position light, restrained 3px lift, animated arrows and visible keyboard focus. Existing links, metadata and filtering attributes remain intact.
- All 17 real categories have distinct original vector illustrations. Canonical mapping is centralized; unknown categories gracefully use puzzle geometry. Hover effects manipulate individual SVG groups instead of spinning every illustration.
- Homepage `{hw}` replaced with a layered emblem, shallow scroll parallax, existing section reveal and quiet hover perspective. Heading, description and About link unchanged.
- Navbar spacing, active underline, motion toggle and mobile menu refined. Existing cursor retained with a more transparent contextual ring so it no longer obscures titles.
- Fixed the footer's inherited flex-row collision. Branding, message, navigation, decorative wordmark and legal/back-to-top row now have deliberate separate space. One footer and one back-to-top action remain on About.

## Files and assets

Templates: `layouts/partials/header.html`, `footer.html`, `head.html`, `meta.html`, `components/brand-symbol.html`, `components/ctf-visual.html`, `layouts/index.html`, `layouts/index.webappmanifest`, and the existing closing lockup in `layouts/_default/about.html`.

Styling/motion: `static/css/premium-ui.css`, `ui/motion-effects.js`. New CSS is scoped; no article prose styles were rewritten.

Identity: `static/images/brand/fractured-hw.svg`, `hotwater-social.png`; `static/icons/fractured/{favicon-32,apple-touch-180,icon-192,icon-512}.png`. Old preserved identity assets remain on disk for compatibility but current templates use the new identity.

Category artwork: `static/images/categories/` contains these SVG files:

| Canonical category / filename | Original concept |
|---|---|
| ai | Neural lattice |
| binary-exploitation | Memory structures |
| boot2root | Root-access layers |
| cloud | Cloud infrastructure |
| cryptography | Intersecting cipher rings |
| devsec | Secure terminal |
| digital-forensics | Evidence magnifier / signal |
| hardware | Circuit microchip |
| iot | Embedded radio sensor |
| miscellaneous | Modular puzzle geometry |
| ml | Neural decision network |
| mobile | Smartphone circuitry |
| networking | Network globe / topology |
| osint | Intelligence eye |
| reverse-engineering | Deconstructed processor |
| steganography | Hidden image layers |
| web-exploitation | Browser / request geometry |

`data/category-visuals.yaml` is authoritative for the mapping; `scripts/generate-category-art.py` deterministically regenerates the collection. No screenshot backgrounds, stock graphics or copied reference assets are used. Inline SVGs have no IDs, avoiding collisions across repeated cards.

Font: `static/css/fonts/GeneralSans-Medium.woff2` (unaltered official file, about 22KB); license retained in `licenses/General-Sans-FFL.txt`. Downloaded from [Fontshare's General Sans package](https://api.fontshare.com/v2/fonts/download/general-sans); official CSS confirmed weight 500. Self-hosting is permitted by the supplied license. No external font request is required by visitors.

Tooling: `scripts/render-brand-assets.mjs`, `tests/premium-ui-qa.mjs`, `tests/browser-qa.mjs`, `scripts/lint.mjs`, `package.json`, `package-lock.json`. Playwright is a development dependency only; no new visitor-facing animation libraries were added. Existing production link/live-asset audit scripts were used; the HTTPS comparison now narrowly restores Cloudflare's existing email-obfuscation markup before comparing complete HTML.

## Skills actually used

- **design-taste-frontend**: before/after browser inspector, source lint, screenshot critique focused on hierarchy, edges, spacing, type and mobile composition.
- **emil-design-eng** and **animate**: restrained property-specific transitions, interruptible CSS hover, immediate focus, reduced motion, cleanup and animation purpose.
- **Playwright**: actual Chromium rendering, screenshots, hover/focus, viewport, font and reduced-motion checks. Firefox BiDi supplied additional existing functional regression coverage.
- Figma was not used: no relevant design file was supplied, and the reference screenshots already established the direction.

| Before | After | Why |
|---|---|---|
| Boxed `hw.` and literal braces | Shared faceted vector identity | Consistent silhouette across sizes and surfaces |
| Small navigation/card typography | Scoped General Sans and improved spacing | Matches the reference hierarchy without changing reading typography |
| Ten categories reuse fallback geometry | Seventeen distinct illustrations | Categories become visually recognizable |
| Footer rows squeezed side by side | Explicit block container and responsive row layouts | Removes clipping and scattered alignment |
| Opaque contextual cursor over titles | Translucent ring | Retains feedback while preserving readability |
| Broad illustration rotation | Small category-specific group transforms | More purposeful, less distracting feedback |

## Visual iteration and findings

Before screenshots/measurements: `reports/ui-polish/before/` at 1440, 768 and 390px.

| Measured property | Before | After |
|---|---:|---:|
| Desktop navbar label | 12px | 14px |
| Desktop challenge title | 20px | 24px |
| Distinct category illustrations available | 7 | 17 |
| Homepage horizontal overflow at 1440 / 768 / 390 | 0 / 0 / 0px | 0 / 0 / 0px |
| Homepage height at 1440 | 4,222px | 4,408px |
| Homepage height at 390 | 5,973px | 6,218px |

The modest height increase accommodates readable cards and the footer's restored rows; no content sections were added.

Round 1: `reports/ui-polish/iteration-1/`. Reviewed navbar, cards, category grid, homepage emblem, footer and mobile navigation. Found the AI symbol too radial and the contextual cursor too opaque.

Round 2: `reports/ui-polish/iteration-2/`. Added lattice connections, reduced cursor fill and rechecked the compositions. Retained natural article and achievement layouts. Replaced the old menu glyph with a simple SVG control.

Final exact-output screenshots: `reports/ui-polish/final/` from the built `public/` site at localhost:1315. Includes homepage, navbar default/hover, archive, card default/hover/focus, all-category grid, category hover, About graphic, footer, mobile navigation and reduced-motion states. Widths tested: 1440, 768, 390 and 320px. No horizontal overflow or browser/resource errors in these checks. Existing Firefox About screenshots also confirm the seven-event gallery and updated closing lockup on desktop/mobile.

The Taste inspector is **not reported as passing**: its unadjusted before/after house-style gate returned 19 failures/7 warnings and 19 failures/6 warnings. These include its bans on gradients, outlined cards, monospace labels, multiple fonts, three-line hero headlines and SVG-only imagery, which conflict with this explicit brief or preserved content. Its decorative footer-wordmark contrast finding concerns `aria-hidden` typography, not reading text. Small metadata and technical labels remain part of the requested reference direction. No attempt was made to disguise these results or replace the requested design to satisfy generic rules. Source-lint house-style findings are likewise retained in `reports/ui-polish/taste-source-lint.log`.

## Build and tests

- `npm run check`: frontend/Hugo production build, publishing policy, **41 Python tests passed**, original/preserved source checks passed.
- Final `npm run build`: **467 output files**, **19 approved source files**, successful Hugo production generation with `https://hotwater-online.xyz/` base URL.
- Final `npm run lint`: passed.
- `scripts/audit-production-links.py`: **12,426 links**, **199 canonicals**, zero missing assets/links or incorrect URLs.
- Existing Firefox suites on production output: **35 browser checks**, **17 motion checks**, **28 discovery checks** across desktop/tablet/mobile, **28 About checks** passed, no console errors.
- Firefox OS reduced-motion suite: **6 checks passed**.
- Playwright final exact-output suite: **18 checks passed**, zero errors. Verified General Sans loading, 17 distinct symbols, crimson hover title, footer geometry, mobile layouts and reduced motion.
- All seven achievements, five confirmed photographs, two procedural fallbacks and placements **06 / 00 / 01** preserved. Writeup text was not edited. No challenge scripts were executed.

Motion adds no continuously running category animation. Hover uses transform/opacity/color transitions, scroll depth runs only while the home emblem is visible, and listeners/observers/RAF clean up when motion is disabled. Mobile disables complex emblem parallax. Reduced-motion and motion-off fallbacks remain functional.

## Known non-critical notes

- Hugo still emits the pre-existing `.Site.Data` deprecation warning; build succeeds.
- `npm audit` reports one existing low-severity KaTeX advisory (GHSA-238p-pmpm-9mq7). No unrelated major dependency migration was performed during visual polish; report retained at `reports/ui-polish/npm-audit.json`.
- Browser testing covers Chromium and Firefox desktop engines with emulated responsive widths, not physical phone hardware.

## Deployment

Production project verified from Cloudflare API: **hotwater-online**, branch **main**, custom domains `hotwater-online.xyz` and `www.hotwater-online.xyz` active. Existing direct-upload workflow reused. No DNS, domain, project or Git deployment-branch settings changed. The disabled `deploy.sh` was inspected and not executed.

Command: `npx --yes wrangler pages deploy public --project-name=hotwater-online --branch=main --commit-dirty=true --commit-message='Polish Hotwater identity, typography, category artwork and responsive UI'`.

Rollback target recorded before publishing: **66d9cbc5-2694-4d4e-9083-0adcc85b6523**, https://66d9cbc5.hotwater-online.pages.dev. Dashboard/API rollback instructions: `reports/ui-polish/deployment/ROLLBACK.md`.

### Published result

Successful production deployment: **21d972cd-146f-466c-821c-5aa5de1be6e2**.

- Deployment URL: https://21d972cd.hotwater-online.pages.dev
- Live domain: https://hotwater-online.xyz/
- Cloudflare deployment completed: 2026-10-28 08:59:27 UTC.
- Wrangler uploaded 226 changed files and reused 239 existing files, plus `_headers` and `_redirects`.
- No rollback was needed; the recorded prior deployment remains available.

### Live verification

Playwright on the custom domain: **18 checks passed, zero errors**. Screenshots in `reports/ui-polish/live/` were captured and reviewed, including the homepage, category collection, mobile About emblem and footer.

HTTPS audit: **465/465 published resources passed**. 266 non-HTML assets match byte-for-byte; 199 HTML pages match after narrowly undoing the existing Cloudflare beacon/email-protection transformations. This includes the actual font, logo, category SVGs, photographs, article pages and approved script assets. `_headers` and `_redirects` are deployment configuration, not public routes.

Verified routes include `/`, `/writeups/`, `/categories/`, `/ctfs/`, `/search/`, `/about/`, and individual writeups such as `/writeups/cryovault/vesper-missed-handover-recovery/` and script-bearing articles selected by the regression tests. Canonical production URLs and HTTPS remain correct.

Initial Firefox live run reported two aborted Inter font requests during rapid test navigation (NS_BINDING_ABORTED); the affected assets independently returned HTTP 200 and matched the upload. The test now waits for `document.fonts.ready` before navigating away, rather than ignoring these errors. Initial log retained for transparency. Final rerun results are recorded in `reports/ui-polish/deployment/live-browser.log`.

Cloudflare metadata: `reports/ui-polish/deployment/{before,after}.json`. Upload log: `reports/ui-polish/deployment/wrangler-deploy.log`. Full live asset results: `reports/ui-polish/deployment/live-assets.json`.


Final live Firefox rerun: **35 browser + 17 motion + 28 discovery + 28 About checks passed**, no console errors. Together with the **18 Playwright checks**, this is **126 passing live browser checks**. The font-ready test correction resolved the navigation-abort report; no production font or asset change was needed. No critical production issues remain and no rollback was performed.
