# Mobile UI refinement — 28 October 2026

## Scope and implementation

All work is in `site_v2/`. Original `site/` remains unchanged. No writeup text, competition data, routes or counts were altered.

The supplied message referenced two screenshots, but no new image attachments were available in this turn. The live site was audited directly using Playwright instead. Taste's composition/spacing review and Emil's restrained interaction guidance were reused from the preceding work.

| Issue observed | Implemented change |
|---|---|
| Unicode arrows can receive platform emoji presentation | One shared, currentColor SVG arrow partial replaces directional text icons across hero, cards, section/category links, footer, About, search and article navigation |
| Uneven narrow-screen hero CTAs; excessive height | Consistent gutters, responsive display typography, equal CTA sizing, intentional stacking at 320px, tighter art/text spacing; artwork retained |
| Cramped section heading/link rows | Stack heading and CTA below 760px; preserve readable title sizes |
| Tall cards with large decorative headers | Shorter art region, 22px General Sans Medium titles, two-line description clamp, tighter metadata/footer spacing |
| Loose mobile header and navigation | 69px measured header at 320px, 44px menu button, aligned identity, two-column solid dropdown with safe-area gutters and 46px links |
| Ambiguous open-menu icon/state | Close icon and accessible label, Escape/outside-click/link dismissal, breakpoint reset, no body scroll locking |
| Oversized event/category cards | Compact event proportions, consistent category art scale and spacing; responsive grids retained |
| Hover-only feedback | Touch press border/surface feedback; larger copy/filter actions; existing focus treatment maintained |

New styling is concentrated under the mobile breakpoint. The shared arrow change is intentionally cross-platform. Existing mobile particle caps, offscreen animation pausing, disabled coarse-pointer cursor tracking and reduced-motion behavior are retained. The artwork is not hidden to solve layout problems. No new animation dependency was introduced and no measured FPS claim is made.

## Measured before/after

Measurements compare the preceding live production build with the final local static build; see `reports/mobile/comparison.json`.

| Element | 320px before → after height | 1440px before → after height |
|---|---|---|
| Header | 78 → 69px | 85 → 85px |
| Hero | 898.1 → 778.9px | 690 → 690px |
| First writeup card | 386.1 → 308.2px | 398 → 398px |
| CTF event tile | 228 → 210px | 235 → 235px |

At 1440px, all four measured element widths also remain unchanged. Desktop screenshots were reviewed; this is not a claim of pixel identity because the icons changed and the hero is animated.

## Files changed

- New `static/css/mobile-refinement.css` and `layouts/partials/components/arrow.html`.
- `layouts/partials/head.html` includes the responsive stylesheet.
- Arrow replacements in `layouts/index.html`, `layouts/writeups/single.html`, `_default/{about,achievements,search}.html`, `_default/_markup/render-table.html`, and partials `header.html`, `footer.html`, `category-links.html`, `home/{hero,posts,events}.html`, `components/writeup-card.html`.
- `static/js/enhancements.js`: menu state, outside dismissal and breakpoint handling.
- `static/js/discovery.js`: textual keyboard hint uses “Arrow keys” rather than directional glyphs.
- `scripts/lint.mjs`: validates the new stylesheet.
- `tests/mobile-polish-qa.mjs`: repeatable screenshot/viewport/menu/reduced-motion checks.

## Visual QA and iteration

Before: `reports/mobile/before/`, captured from the live website. First after-pass: `reports/mobile/after/`. Final static-output pass: `reports/mobile/final/`.

Each pass covers homepage hero, latest writeups, events, categories, homepage identity and footer, plus `/writeups/`, `/ctfs/`, `/categories/`, `/about/`. Widths: **320, 375, 390, 430, 768, 1440px**. Landscape: **844×390**. Separate narrow article screenshot: `reports/mobile/article-320.png`.

Reviewed before/after screenshots and refined the menu to use an opaque surface and explicit close glyph after the first pass. Enlarged mobile copy/filter targets in the second pass. Final screenshots show settled animation states, not artificially hidden artwork.

Useful comparisons:
- [Before 320 hero](reports/mobile/before/320-home.png) / [After](reports/mobile/final/320-home.png)
- [Before 320 cards](reports/mobile/before/320-latest.png) / [After](reports/mobile/final/320-latest.png)
- [Final mobile menu](reports/mobile/final/390-menu.png)
- [Final desktop](reports/mobile/final/1440-home.png)

## Tests and limitations

- `npm run check`: **41 Python tests passed**, production frontend/Hugo build and publishing policy passed; 1,842 original files and 303 preserved files unchanged.
- Final build: **476 files**, including 19 approved source files. Existing Hugo `.Site.Data` deprecation warning remains.
- Final lint passed. Generated URL audit: **12,646 links, 199 canonicals; zero missing/bad URLs**.
- Playwright Chromium final static-output audit: **36 checks passed**, zero page errors, no horizontal overflow at any tested width; menu targets, Escape behavior, vector navigation and reduced motion checked.
- Chromium touch context: **3 checks passed** (open menu, navigate/close, no body scroll lock).
- Existing Firefox regression: **35 browser + 17 motion + 28 discovery checks passed**, including article bounds, flags, filters, sorting and script viewers.
- About suite: **28 checks passed**; seven events, five photographs and 06/00/01 placements preserved.
- WebKit was downloaded and launch was attempted, but it could not run: host lacks required libraries including libicu74, libxml2 and libflite1. **No Safari/WebKit testing is claimed.** Installation/launch logs: `reports/mobile-webkit-install.log`, `reports/mobile-webkit.log`. No physical-device test is claimed.

## Deployment

Existing project `hotwater-online`, production branch `main`, production directory `site_v2/public`. Cloudflare metadata and rollback target recorded in `reports/mobile/deployment/before.json`. No DNS or project changes. No production deployment scripts were run; Wrangler direct upload uses explicit project and branch.

Deployment command: `npx --yes wrangler pages deploy public --project-name=hotwater-online --branch=main --commit-dirty=true --commit-message='Refine mobile layout, touch navigation and SVG arrows'`.

Live results are appended after verification below.

Published deployment: **8b2ce7ae-01a7-4520-8494-87a3ea71428c**, https://8b2ce7ae.hotwater-online.pages.dev. Cloudflare reports `success`.

Rollback: **a5fd7ded-b6cb-405d-b790-3d7f86491bdc**, https://a5fd7ded.hotwater-online.pages.dev. Restore through Cloudflare Pages → hotwater-online → Deployments → this prior deployment → Rollback; DNS changes are unnecessary.

Live custom-domain verification completed: **36 Playwright checks passed**, zero page errors, no overflow at 320/375/390/430/768/1440 and landscape; menu and reduced-motion checks pass. Live screenshots in `reports/mobile/live/` were reviewed (320px hero, 390px menu, 375px cards).

HTTPS resource audit: **474/474 passed**. Assets match the upload byte-for-byte; HTML matches after undoing existing Cloudflare analytics/email-protection transformations. No rollback required. Live site: https://hotwater-online.xyz/.
