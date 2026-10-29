# UI/UX quality pass — 2026-10-28

Implemented exclusively in `site_v2`. Local preview: http://localhost:1314/writeups/. No deployment or production changes. This pass refines the existing cinematic design rather than replacing it with generic controls.

## Discovery interface

- CTF, category and sort controls now use custom dark/crimson popups. The native selects remain hidden state adapters for the established filtering code and progressive fallback; enabled pages do not expose native white dropdowns.
- Searchable CTF and category lists, current-selection marks, context-sensitive counts, menu empty states, keyboard navigation and focus return.
- Dialog, combobox, listbox and option semantics; accessible trigger names include the current value. Arrow keys navigate, Enter selects, Escape closes, Tab exits, and outside clicks dismiss.
- On small screens menus become full-width inset panels. Placement responds to the visual viewport without intentionally closing when its height changes. A short 375×500 viewport was also tested. Physical mobile keyboards were not tested.
- Removable selected-filter chips, interactive category shortcuts, synchronized counters, full-width search, and existing combined search/event/category/sort URL behavior.
- Filter changes still update the original Hugo cards immediately. The existing React/Motion listener provides content transitions; opening menus and hover states use small CSS transitions respecting reduced motion and the motion toggle.
- Filter controls align as three columns on tablet/desktop and stack on mobile.

## Reading and source inspection

- Existing flag values receive a styled copy control, including articles where Flag shares a paragraph with Category/Target. Original Markdown/frontmatter remains unchanged; copying uses the existing code element's exact text.
- Technical tables have full-width headers, refined rows and borders, keyboard-focusable horizontal scrolling, a mobile scroll hint and dark scrollbars. Filenames stay intact rather than breaking across lines.
- Sticky TOC/active-heading tracking, calm article body, reading progress and related links remain intact.
- Recognized Note/Tip and Warning/Caution blockquotes gain distinct visual treatments without rewriting their text or inventing warnings.
- Existing file tabs are the primary source selector. Redundant native file dropdowns are hidden only after tabs initialize.
- Main Solver tab markers, file size/language metadata, line numbers, exact copy/download actions and reduced-motion-safe transitions remain integrated with the existing approved files.
- Fixed a visually detected mobile bug where inherited styles forced Copy/Download controls into 32px squares, causing overlapping labels.

## Typography reliability

The visual test initially caught intermittent Google font-download errors. Manrope, Inter and JetBrains Mono are now self-hosted as variable WOFF2 assets, with all provided language subsets: **19 files / 359,092 bytes total**. Browsers request only the relevant subsets. SIL Open Font License notices are embedded in `static/css/fonts.css`; upstream URLs and SHA-256 hashes are recorded in `vendor-licenses/font-provenance.json`.

No runtime dependencies were added. Font Awesome remains an inherited external icon stylesheet. KaTeX was already self-hosted in Phase 1.

## Verification

- `npm run check`: JS/JSX and cinematic CSS syntax checks, Hugo production build, all **36 Python tests**, publication allowlist and preservation checks passed.
- Production build: **280 pages / 119 static files**. Publication audit: **418 files**, exactly **19 existing approved source downloads**.
- Original `site/`: **1,842 original file hashes/modes/mtimes unchanged**. **303 copied content/theme/config/importer/source files** match the preserved baseline.
- New discovery browser suite: **28 checks passed**, no console errors. Covers custom controls, accessible relationships, searchable options, keyboard selection, focus return, combined filters, counts, chips, sorting, empty states, flags and source metadata at **375, 768 and 1440 px**.
- Existing browser regression: **35 checks passed**, no console errors. Includes existing URLs, archive behavior, math, Markdown, source selection and byte-exact copy/download checks.
- Existing normal-motion regression: **17 checks passed**, no console errors.
- Actual reduced-motion browser profile: **6 checks passed**, no console errors. Additional targeted check confirmed custom menu entrance animation is disabled.
- HTTP check: **196 routes / 28 local referenced assets**, no missing original routes.
- Additional targeted checks: Vesper flag/table layouts, keyboard-focusable mobile table overflow, and short-mobile-viewport menu bounds.

Browser automation used Firefox. Physical mobile devices, screen-reader sessions, Safari and Chromium were not tested. Clipboard writes are mocked to verify exact payloads rather than OS permission prompts. No new solver discovery or dependency inference is claimed: the existing reviewed manifest and source files are preserved, and the publishing audit verifies their hashes. No CTF scripts were executed.

## Visual review and corrections

Captured and inspected actual browser screenshots of the homepage, archive, open CTF/category/sort menus, combined filters, empty state, article header, TOC, tables and source viewer. Reviewed desktop, tablet and mobile layouts. Rechecked after correcting mobile source actions, table margins/scrollbars, tablet control alignment and fonts. Homepage screenshots wait for the entrance sequence to settle.

- [Desktop archive, closed controls](reports/quality-archive-desktop.png)
- [Desktop CTF menu](reports/quality-ctf-menu-desktop.png)
- [Desktop category menu](reports/quality-category-menu-desktop.png)
- [Sorting menu](reports/quality-sort-menu-desktop.png)
- [Selected filters](reports/quality-combined-desktop.png)
- [Empty state](reports/quality-empty-desktop.png)
- [Mobile menu](reports/quality-menu-375.png)
- [Tablet menu](reports/quality-menu-768.png)
- [Desktop article and flag](reports/quality-article-1440.png)
- [Desktop table and active TOC](reports/quality-vesper-table-1440.png)
- [Mobile table](reports/quality-vesper-table-375.png)
- [Desktop source viewer](reports/quality-source-1440.png)
- [Mobile source viewer](reports/quality-source-375.png)
- [Desktop homepage](reports/quality-home-desktop.png)
- [Mobile homepage](reports/quality-home-mobile.png)

Machine-readable results: `reports/quality-browser.json`, `reports/browser-qa.json`, `reports/motion-browser-normal.json`, `reports/motion-browser-reduced.json`, and `reports/phase1-http.json` (the existing HTTP command's filename).

## Files and workflow

Changed/added application files:

- `layouts/writeups/list.html`
- `layouts/partials/{head,solution-scripts}.html`
- `layouts/_default/_markup/render-table.html`
- `static/js/discovery.js`, `static/js/enhancements.js`
- `static/css/cinematic.css`, `static/css/fonts.css`, `static/css/fonts/*.woff2`
- `vendor-licenses/font-provenance.json`
- `scripts/lint.mjs`, `tests/discovery-qa.mjs`, `package.json`

Run `npm run dev` for the local server. Run `npm run check` before browser tests so LiveReload does not interrupt a multi-step test. With Firefox BiDi on port 9222, run `npm run check:discovery`; `BIDI_PORT` can select another port. Existing `npm run check:browser` and `npm run check:http` remain available. The browser setup is documented in `UI_ENHANCEMENT_REPORT.md`.

All 177 writeups, 13 event archives, current routes and approved sources are preserved. No production deployment was performed.
