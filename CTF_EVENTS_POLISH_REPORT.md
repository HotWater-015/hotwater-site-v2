# CTF events refinement

Local review only. **No deployment was performed.** Changes are confined to `site_v2/`; original `site/` remains unchanged.

## Design

The supplied screenshot guided the composition; it is not embedded in the website. Event names use the existing self-hosted General Sans Medium (500), 28–36px depending on viewport, with consistent crimson emphasis on “CTF.” Years occupy a quieter separate line. CryoVault's long title receives an editorial line break while its words still come from Hugo data.

Seven original SVG sculptures add depth: fractured peaks, eclipsed sphere, monolith, crossed planes, cipher rings, folded geometry and a horizon. These are abstract decorative artwork, not official event logos. They are lazy-loaded, small vector assets and require no additional frontend dependency.

Cards have dark layered surfaces, controlled crimson light, stronger title placement, aligned writeup metadata, refined arrows and signal marks. Hover brightens the title/accent/border, shifts the arrow, gently scales the artwork and lifts the card by 3px. Existing cursor coordinates supply restrained pointer lighting. Keyboard focus is clearly outlined; reduced motion and actual touch pointers suppress decorative transforms.

The original heading, index numbers, event order, names, years, counts and destinations are preserved. Homepage still shows six events; `/ctfs/` still shows thirteen. Counts are derived from real Hugo pages, not the reference image. Layout: three columns on desktop, two on tablet, one on small screens.

## Files

- `layouts/partials/home/events.html`: semantic card composition and data-derived title/year treatment.
- `layouts/partials/head.html`: load the scoped stylesheet only on homepage/CTF index.
- `static/css/ctf-events.css`: typography, layout, lighting and responsive/motion states.
- `data/event-visuals.yaml`: event-route to decorative-art mapping.
- `static/images/events/{cryovault,eclipse,monolith,fracture,cipher,fold,horizon}.svg`: original artwork.
- `scripts/generate-event-art.py`: deterministic vector generation.
- `ui/components/CustomCursor.jsx`: reuse existing pointer coordinates for event tiles.
- `scripts/lint.mjs`: include new CSS in syntax checks.
- `tests/ctf-events-qa.mjs`: Playwright checks and screenshots.

## Visual iteration

Taste and Emil interaction guidance reused from the preceding refinement. The existing design and supplied reference take precedence over generic skill preferences.

| Before | After | Why |
|---|---|---|
| Small, single-line titles with inline year | Larger Medium titles, selective red, separate year | Gives event names a clear hierarchy |
| Repeated generic background shape | Event-mapped dimensional SVG artwork | Makes the collection distinctive without competing with text |
| Uniform muted surface | Restrained directional lighting and hover feedback | Improves depth and link affordance |
| Two narrow cards on phones | One full-width tile | Preserves readable names and intentional composition |

Captured the original desktop/mobile section, reviewed the first implementation, softened the sphere's initially over-prominent crater marks and rechecked the final static build. Mobile capture was corrected to show the viewport naturally rather than stamping the fixed navbar over a tall element screenshot. Final screenshots capture settled entrance animation states.

Screenshots:
- [Desktop default](reports/ctf-polish/final/desktop-default.png)
- [Hovered card](reports/ctf-polish/final/card-hover.png)
- [Mobile](reports/ctf-polish/final/home-390.png)
- [Tablet](reports/ctf-polish/final/home-768.png)
- [Complete CTF index](reports/ctf-polish/final/all-events.png)
- [Keyboard focus](reports/ctf-polish/final/keyboard-focus.png)
- [Reduced motion](reports/ctf-polish/final/reduced-motion.png)

## Verification actually performed

- `npm run check`: successful frontend/Hugo production build, publishing policy and **41 Python tests**; all **1,842 original files** and **303 preserved content/theme/config/importer files** unchanged.
- Final production build: **475 output files**, 19 approved sources, no build errors. Existing Hugo `.Site.Data` deprecation warning remains unrelated to this change.
- Production-link audit: **12,447 links and 199 canonicals**, zero missing or incorrect URLs.
- Playwright against the final local static output on port 1315: **29 checks passed**, zero browser/resource errors. Includes exact six-event titles/counts, thirteen functioning event routes, General Sans 500, distinct artwork, pointer light, 3px lift, keyboard focus, 1440/1024/768/390/320px layouts, reduced motion and actual touch-context navigation.
- Existing Firefox browser/motion regression: **35 + 17 checks passed**, no console errors. Search, filters, sorting, source viewers and article rendering remain functional.

Review the development site at http://localhost:1314/ and http://localhost:1314/ctfs/. Production has not been updated by this task.

## Subsequent publication

Following explicit deployment approval, the event-grid refinement was deployed as `a5fd7ded-b6cb-405d-b790-3d7f86491bdc` (https://a5fd7ded.hotwater-online.pages.dev). The subsequent mobile refinement retains this grid; see `MOBILE_UI_REFINEMENT_REPORT.md` for the latest production reference.
