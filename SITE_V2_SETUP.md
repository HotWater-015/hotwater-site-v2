# site_v2 — Phase 0 local environment

`site_v2/` is an independent Hugo-first development copy. Production `../site/` is unchanged. No deployment, DNS change, Git push, importer execution, or challenge-script execution was performed. Phase 1 is now implemented; see [UI_ENHANCEMENT_REPORT.md](UI_ENHANCEMENT_REPORT.md) for current design, assets and verification. Part 2 remains deferred. The Phase 0 results below are historical.

## Start locally

Prerequisites: Hugo **extended**, Node.js with npm, Python 3. Verified here with Hugo 0.168.0 extended, Node 26.12.0, npm 12.2.1. `hugo` must be on PATH; optionally set `HUGO_BIN` to an absolute executable path.

```bash
cd /home/jarvis/domain/site_v2
npm ci --ignore-scripts
npm run dev
```

Open **http://localhost:1314/**. Hugo binds to loopback `127.0.0.1`, not the public network. Ctrl+C stops Hugo and esbuild. Install dependencies before starting the watcher. An offline clean install was also verified with `npm ci --ignore-scripts --offline --no-audit --no-fund` using the existing npm cache.

`npm run dev` compiles the React island before starting Hugo, watches its imports, and lets Hugo watch templates, content, CSS, and generated JS. Hugo LiveReload reloads updated pages; this is not React Fast Refresh. Compiler errors appear in the terminal, startup failures exit nonzero, and the asset watcher recovers on the next valid edit. The watcher was verified by changing and restoring `ui/main.jsx`.

## Commands

| Command | Result |
| --- | --- |
| `npm run dev` | Local server and esbuild watcher, port 1314; `.dev-public/` output |
| `npm run build` | Minified production-config build in `public/`, then publishing-policy audit; no upload |
| `npm run check` | Production build, 36 Python regression tests, source-preservation checks |
| `npm run build:motion` | Bundle existing React/Motion island; write bundle-size report |
| `npm run check:browser` | Firefox BiDi checks against the running local server; prerequisites below |

Build commands do **not** invoke `import.mjs`, `prepare-scripts.py`, or anything inside `Projects/ctf`. The publishing-policy audit and existing regression tests read only explicitly allowlisted challenge sources to check hashes and static Python imports. They never execute those sources. Retain the sibling `Projects/ctf` tree for this existing audit to run; absent or changed approved files cause a failure requiring review, not automatic restaging.

## Architecture and asset contract

Hugo renders Markdown, homepage content, cards, articles, event archives, navigation, metadata, canonical URLs, RSS, sitemap, search JSON and manifest. Existing article routes remain `/writeups/<event>/<challenge>/`. All writeup content is present in generated HTML without React.

Inspection found an existing working hybrid integration, so no new React framework or Vite dependency was introduced:

- `ui/main.jsx` mounts React only at `[data-cyber-background]` and portals its toggle into `#motion-control-slot`.
- `static/js/motion-loader.js` conditionally loads the island and retains static content if loading fails.
- `scripts/motion-options.mjs` shares one esbuild configuration between build and watch. It bundles React/Motion imports as ESM into `static/js/motion-system.js`, with automatic JSX and production React. No source maps are published.
- Hugo copies that bundle to `/js/motion-system.js`. CSS remains Hugo-served through the existing theme, `custom.css`, and `motion.css`; the current island does not import CSS.
- Existing lightweight `archive.js` handles filtering and sorting without replacing Hugo cards. Canvas motion, reduced-motion preferences and fallbacks remain intact.

Phase 1 adds a dynamically imported Three.js cipher-core island for suitable desktop devices, with SVG fallback. See the enhancement report before extending islands further. If future components import CSS, configure and link the resulting CSS bundle explicitly. If hashed files or dynamic chunks become necessary, introduce a manifest-aware template integration and update the publishing allowlist together. Current root-relative URLs target root-domain hosting, as production does; subdirectory hosting is not configured.

## Inspection findings and reusable pieces

- `hugo.toml`: production base URL, theme, menus, output formats, safe Markdown configuration and taxonomies preserved byte-for-byte.
- `scripts/import.mjs`: reads consolidated `Projects/ctf/isfcr/writeups/*.md` plus an explicit list of other source paths. Uses source IDs to skip existing articles; derives titles, summaries and new slugs for additions. Missing `writeup.md` files must not be assumed to exist: `dateOf()` can throw before the missing-source guard. Not run in Phase 0.
- Existing frontmatter includes title, description, event, category, categoryLabel, tags, date, teammate and source. Existing Markdown and frontmatter remain byte-identical.
- `layouts/writeups/list.html` renders all cards and accessible filter controls; `components/writeup-card.html` supplies searchable metadata and stable Hugo links. `archive-meta.html` normalizes display labels without rewriting frontmatter.
- `layouts/writeups/single.html` renders Markdown, TOC, breadcrumbs, related articles and curated downloads. Render hooks handle tables, code, links and images.
- `layouts/partials/home/` already renders hero text, recent writeups and event links. Existing theme, images, fonts, custom CSS and JavaScript were retained.
- The original site already contains enhanced filtering, React motion and approved solver assets. They are inherited functionality, not newly completed Part 1/2 work.
- `themes/minimal-black/` remains byte-identical except its nested Git administration directory was intentionally excluded. Its prebuilt CSS is already available; no separate Tailwind build is needed for Phase 0.
- Inspected deployment configuration is local configuration only: the original shell script builds and audits `public/`, then targets Cloudflare Pages project `hotwater-online`, branch `main`. `wrangler.jsonc` points at `public/`. No Cloudflare API, DNS or remote configuration was accessed.

## Local versus production configuration

`config/development/hugo.toml` sets `http://localhost:1314/`, disables robots output, and sets `params.localDevelopment`. The head partial skips analytics in this environment even if production analytics are configured later. Local canonical links use localhost. `npm run build` selects production explicitly and preserves `https://hotwater-online.xyz/` canonical URLs in the build output only.

Google Fonts and Font Awesome remain external presentation dependencies; Phase 1 now bundles the pinned KaTeX renderer and fonts locally; this is not a completely offline browser experience. They are not analytics. No analytics is enabled for development.

The copied `deploy.sh` is a fail-closed stub. Original deployment script text is retained in ignored `deployment-reference/deploy.sh.txt` for inspection only. `scripts/build.sh` now delegates to the local build without restaging scripts. No npm command deploys anything. `wrangler.jsonc` is preserved as reference configuration, not a development entry point. Do not run Wrangler or deploy until explicitly authorized later.

The copy excludes `.wrangler`, nested `.git` directories, environment files, generated public/resources output, Python caches and Hugo lock files. Node dependencies were copied independently initially and then successfully reinstalled from the lockfile. `.gitignore` excludes generated builds, dependencies, reports, local credential files and deployment references. No parent Git metadata was modified.

## Browser checks

Start `npm run dev` in one terminal, then launch an isolated Firefox profile in another:

```bash
mkdir -p /tmp/site-v2-firefox
firefox --headless --no-remote --profile /tmp/site-v2-firefox --remote-debugging-port 9222
```

From `site_v2`, run `npm run check:browser`. Tests use Node's built-in WebSocket API and local Firefox BiDi. `SITE_V2_URL` optionally changes the local server URL. Stop Firefox with Ctrl+C afterward. Do not point these tests at production.

Reports: `reports/browser-qa.json`, `reports/motion-browser-normal.json`, `reports/phase0-http.json`; screenshots: `reports/phase0-home-desktop.png`, `reports/phase0-archive-mobile.png`. Other copied reports may describe earlier production work and are **not evidence of this phase's actions**. Durable test inputs are in `tests/fixtures/`, so ignored reports are not required for the regression suite.

## Verified results — 2026-10-27

- Clean dependency installation succeeded from the existing offline npm cache.
- Production build: 280 Hugo pages, 24 static files; publishing audit passed for 323 output files and 19 approved source downloads.
- `npm run check`: all 36 Python regression tests passed; original 1,842 file hashes/modes/mtimes unchanged; 303 copied content/theme/config/importer/approved-source files match their baseline.
- 177 writeups and 13 CTF events preserved; no missing original generated routes.
- Local HTTP crawl: 194 route requests and 12 unique referenced local assets succeeded; local canonical links verified.
- Firefox: 35 site checks and 17 normal-motion checks passed with zero console errors. Includes React mount, filtering, sorting, URL aliases, CTF links, article rendering, math, source download/copy behavior, motion controls and canvas fallback.
- Responsive checks passed at 375, 768 and 1440 px. Desktop homepage and mobile archive screenshots visually inspected.
- Watcher rebuilding and recovery observed. Clean reinstall temporarily produced visible missing-module errors in the running watcher, then recovered once dependencies returned; install with the watcher stopped in normal use.

The original-tree immutability snapshot is machine-local in ignored `reports/phase0-source-snapshot.json`. If absent in a fresh checkout, `check-isolation.py` explicitly reports that the original-tree comparison is unavailable and still checks the durable preserved-source baseline. Future intentional content/theme changes will require a reviewed update to preservation fixtures.

Limitations: Firefox only; actual OS clipboard permission is not exercised (copy payload is checked with a mock). Hugo does not apply Cloudflare `_headers`/`_redirects`; those are tested as files rather than through a deployed edge. No new reduced-motion browser run or production deployment was performed in Phase 0.

## Phase 1 workflow additions

`npm run lint`, `npm run check:http`, `npm run check:visual`, and `npm run check:interactions` are available. Browser suites require the profiles described in `UI_ENHANCEMENT_REPORT.md`. `npm run dev` and `npm run build` prepare local pinned KaTeX assets. ESM splitting emits lazy 3D chunks under `static/js/chunks/`; successful builds prune stale chunks. Generated bundles and vendor files are ignored. Development responses use `Cache-Control: no-store`. Run production-build checks before browser tests so LiveReload does not interrupt interactions.

## Discovery quality updates

Custom dark menus and `npm run check:discovery` are documented in `UI_UX_QUALITY_REPORT.md`. Manrope, Inter and JetBrains Mono are now local WOFF2 assets under `static/css/fonts/`, with license notices in `fonts.css` and provenance under `vendor-licenses/`. No font download is needed during dev/build. Font Awesome remains an external icon dependency.
