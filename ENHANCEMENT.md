# hotwater archive enhancement report

Implemented in the existing Hugo project. No framework migration, database, new hosting project or dependency installation was performed. Deployed to the existing Cloudflare Pages project on 2026-10-26 following the owner’s deployment request.

## Architecture and preservation

- Hugo Extended 0.168.0, vendored `minimal-black` theme, existing compiled Tailwind CSS, vanilla JavaScript, Goldmark Markdown, and Chroma highlighting.
- 177 existing writeups across 13 event sections. Each article uses Markdown with YAML metadata (`event`, `category`, `categoryLabel`, `tags`, `date`, `description`, `source`, and optional teammate attribution). Section indexes use TOML.
- `source` identifies an original file under `../Projects/ctf`. Some sources are consolidated writeups, some are writeup-only mirrors, and others are inside working challenge directories. A local `writeup.md` is not required by the curated publishing system.
- All 193 original content files remain byte-identical, verified against `reports/original-content-sha256.json`. No original writeups were regenerated or rewritten.
- All 264 original generated index routes either still exist or have a validated redirect destination. `static/_redirects` preserves 38 historical challenge slugs, pagination URLs and a tag URL without creating duplicate articles.
- Existing Cloudflare Pages deployment and domain configuration remain in place. Live checks confirmed a historical 301 redirect and source download attachment, content-type and nosniff headers. See `reports/deployment-verification.json`.

## UI and reading experience

The shared design tokens use the requested black, dark gray and crimson palette. Actions use `#DC2626`; small red text and hover accents use the lighter `#EF4444` for contrast. Space Grotesk is used for headings and branding, Inter for body text and controls, and JetBrains Mono for source and technical labels. Fonts use Google Fonts preconnects, `display=swap`, and local fallbacks.

The homepage includes a discovery hero, six recent real writeups, event counts, category links and an introduction derived from the existing About content. Navigation includes Home, Writeups, CTFs, Categories, About and Search. Archive statistics remain linked at `/achievements/`.

Articles have a wide reading column, a desktop sticky TOC, native collapsible mobile TOC, heading anchors, reading progress, breadcrumbs, related articles, previous/next links, readable tables, safe image rendering, code language labels, exact-text copy controls, horizontal source scrolling and math rendering with KaTeX. Existing Markdown is unchanged. Mermaid fences show escaped diagram source rather than executing a diagram renderer on untrusted content.

The interface includes keyboard focus styles, a skip link, labeled controls, mobile menu expansion state and Escape handling, live result counts, native file selection and reduced-motion CSS.

## Filtering, search and sorting

`layouts/partials/archive-meta.html` centralizes metadata normalization. Equivalent categories such as Crypto/Cryptography, Forensic/Forensics/Digital Forensics, Rev/Reverse Engineering, Web/Web Exploitation and Pwn/Binary Exploitation map to one category. Unknown represented categories remain available. Existing metadata is not overwritten. Conventional `categories` arrays are accepted when the singular field is absent.

Event identity is resolved from metadata and event sections. Section names, folder keys and observed event tags provide aliases. No CTF competition list is hardcoded into the archive controller. The CTF and category selectors are populated from actual rendered cards, with counts reflecting the other selected facet and query. Root `/writeups/` includes the full collection; an existing event URL retains its event-specific collection.

Filtering intersects CTF, category and case-insensitive partial search. Search examines challenge titles, event labels, categories, tags and descriptions. It does not load complete article bodies into browser memory. Full article-body search is not included. Clear-search preserves other filters; Clear Filters resets the archive controls. Invalid combinations produce a useful empty state instead of silently discarding a category.

State persists through `event`, `cat`, `q` and `sort` query parameters. Old category query values remain accepted; display-name event queries are accepted. Refresh and browser history restore the controls. Sort orders include newest, oldest and alphabetical; a difficulty option appears only when metadata supplies difficulty. Unknown difficulty ranks last.

## Source discovery and curation

The read-only analyzer inventories the existing writeups, exact normalized source-body matches and explicit source paths. It skips vendored environments, package directories and generated build trees. It reads source only: no challenge Python imports, script execution, exploit launch, dependency installation or challenge-server connection occurs.

The inventory covers 289 Python candidates. 122 writeups have confident directory mappings; 55 mappings remain uncertain. Of the mapped writeups, 84 contain candidate source and 38 contain no candidate source under the analyzed directory. Candidate records include hashes, Python imports/functions/docstrings, local import dependencies, file literals, source references, capability indicators and exact duplicate references when present.

19 files are curated for 14 existing writeups. Selections are implementation-review decisions authorized by this task, not a separate claim of owner approval or successful solver execution. All selected source was compared with the article and inspected for embedded secrets. See:

- `curated-scripts.json`: authoritative reviewed selections, evidence, hashes and prerequisites.
- `reports/script-selection.md`: report for every existing writeup.
- `reports/script-analysis.json`: candidate-level inventory and exclusion/review reasons.
- `reports/script-review-queue.json`: unpublished, new or changed candidates and uncertain mappings.

Representative selections:

| Existing writeup | Included files | Evidence |
|---|---|---|
| Floe | `exploit_final.py`, `brute_canary.py` | 39 Python candidates; exact documented ROP constants and canary producer/consumer match. Other candidates are unnecessary for this final chain. |
| Neve | `exploit_neve.py`, `brute_canary.py` | Documented stack leak, framed protocol, buffer placement and file reader match the source. |
| Rime | `solve.py`, `brute_canary.py` | Ret2flag layout and return address match; canary recovery supplies the required intermediate file. |
| Parallax | `recover.py`, `solve.py`, `model (1).py` | Column-recovery stage, CVP recovery stage and dynamically imported decoder are all necessary; original unusual filename retained. |
| Ground | `extract_pdf.py` | Exact HTML-unescape and base64 PDF extraction shown in the article; labeled as a helper, not a main exploit. |
| BGP From Hell / TCP Schrödinger | One documented reconstruction script each | Analysis stages are labeled as helpers. Partial or manual final steps are disclosed. |

Unselected code remains unpublished. There are 70 mapped writeups with candidate source but no curated selection. Some contain competing approaches, incomplete recovery, scripts inconsistent with the article, challenge implementation files rather than solvers, or source requiring additional logic/dependency review. For example, the available Orisond `exp.py` wrapper calls its own path; it was not published as a working solver. Broadcast Linear's candidate does not implement the affine-padding reversal described in its article. No replacement solver or repaired technical explanation was fabricated.

## Controlled publishing and viewer

`prepare-scripts.py` validates the complete manifest before staging anything. It requires repository-relative paths inside explicit `Projects/ctf` challenge directories, existing source files, an allowed language/extension, review evidence and unchanged SHA-256 hashes. Absolute paths, traversal, symlinks, unexpected extensions, missing files, duplicate selections, multiple main roles and obvious embedded secrets are rejected. Statically visible local Python imports must be selected too. Dynamic loads and non-code input requirements are reviewed and documented explicitly.

Only allowlisted, byte-exact files are staged under `assets/approved-scripts/`, then emitted by Hugo when used by a viewer. Entire challenge directories, evidence files, environments, credentials and unrelated files are never copied. Generated snapshots and `data/scripts.json` are derived artifacts; `curated-scripts.json` is the authority. New files discovered by the analyzer never modify it.

The Solution Scripts section appears only when a curated selection exists. A native accessible file selector switches files. A supported main solver appears first with a crimson header and Main Solver label; helper labels and prerequisites explain execution order. The viewer uses JetBrains Mono, Chroma tokens, preserved indentation, copy-source controls, download links, and independently scrolling code. Chroma rendering was checked for Python, Bash, JavaScript, TypeScript, C, C++, Rust, SageMath, SQL and Assembly in an isolated fixture.

Cloudflare `_headers` declares downloads as text attachments with `nosniff`. Source files are never loaded through script elements or executed by a build or visitor interaction. Existing unhosted local artifact links are rendered as labeled references instead of broken download links; curated references resolve to their approved assets. See `reports/local-artifact-references.json`.

## Verification

- Production `./scripts/build.sh --minify`: passed; Hugo emitted 280 pages in the final build with no build warnings.
- 23 Python integration/security tests: passed. Details: `reports/automated-tests.txt`.
- 35 Firefox WebDriver BiDi browser checks: passed, zero observed console errors. Details: `reports/browser-qa.json`.
- Browser checks cover combined filters, query persistence, old category aliases, event display-name queries, partial/case-insensitive search, empty/clear states, sort orders, index routes, desktop reading width, script selection/copy/download, math, progress, escaped payloads, and no page overflow at 375, 768 and 1440 pixels.
- Python tests cover all original content hashes and routes, every generated internal link, exact approved output assets, no runtime source execution, missing/changed source, path traversal, symlinks, secrets, Unicode/long lines, a directory with 39 Python candidates, and a fixture with no local `writeup.md` or conventional `solve.py`.
- Isolated rendering fixture covers images/captions, tables, blockquotes, math delimiters, heading anchors, ten code languages, long lines and hostile HTML/URL/Mermaid inputs. The real collection currently contains no Markdown images, so image rendering is fixture verification.
- JavaScript `node --check`, Python `py_compile` and shell `bash -n`: passed. No dedicated project lint script exists; no additional lint dependency was installed.
- The vendored theme's existing `npm test` fails with its pre-existing placeholder: `Error: no test specified`. It is not a functional test suite; the added tests are recorded separately.

Verification limits: copy checks mock the browser clipboard API to compare the exact payload; OS clipboard permission was not tested. Download response bytes and filenames were checked; an OS Save dialog was not exercised. Historical remote challenge availability and solver correctness were not tested by execution. Google Fonts and KaTeX are CDN dependencies with font fallbacks. Live deployment HTTP checks passed; no broad external-link crawl or automated accessibility scoring was performed.

## Add future writeups

1. Add Markdown to `content/writeups/<event-key>/<stable-slug>.md`, with a title, real date, event key, category, tags and a description when available. Omit unknown difficulty. Retain the slug once published.
2. For a new event, add `content/writeups/<event-key>/_index.md` with its actual title. Metadata and cards feed the selectors automatically; do not edit a JavaScript CTF list.
3. Keep `source` as the existing path relative to `Projects/ctf` when available. The writeup can live exclusively in Hugo content. Explicit curated mappings can point to challenge directories without local Markdown.
4. `node scripts/import.mjs` is now additive: it skips existing source mappings and preserves existing articles and section metadata. It retains the original importer's configured event/source discovery; direct new Hugo content needs no importer change.
5. Refresh candidate reports with `python3 scripts/analyze-scripts.py`. Reports are local and are not published as website assets.

## Add or update curated scripts

1. Compare the real source with the existing explanation. Inspect final output, imports, dynamic loads, subprocesses, required data and secrets. Do not execute untrusted scripts as part of review.
2. Add an explicit entry to `curated-scripts.json` using the existing schema: content-relative `writeup`, repository-relative `directory`, requirements, source path, supported language, role, label, selection evidence, secret-review note and SHA-256. Select the smallest complete dependency set. Use a helper role unless a main role is supported.
3. Retain original filenames, including spaces. Record execution order in the labels and requirements. Do not publish captured evidence or private configuration to satisfy a source dependency.
4. Compute SHA-256 without execution, for example `sha256sum 'Projects/ctf/<event>/<challenge>/<filename>.py'` from the workspace root. A changed hash requires another source review; never auto-accept it.
5. Run `python3 scripts/prepare-scripts.py`, then `./scripts/build.sh --minify`. The production deployment script also runs preparation before a normal build. `SKIP_BUILD=1` retains its existing deploy-prebuilt behavior and should only be used with a validated build.
6. Run `python3 -m unittest discover -s tests -p 'test_*.py' -v`. Browser QA requires a local server on port 4173 and Firefox with a temporary profile and `--headless --remote-debugging-port 9222`; run `node tests/browser-qa.mjs` from `site/`. Collection-specific expected counts in tests must be intentionally updated as content grows.
7. Deploy using the existing `./deploy.sh` workflow when ready. The production output in `public/` was published to https://hotwater-online.xyz. Deployment: https://e7cc0cc4.hotwater-online.pages.dev.

## Files created and modified

Modified existing source/configuration:

- `hugo.toml`
- `deploy.sh`
- `scripts/import.mjs`
- `static/css/custom.css`
- `static/js/archive.js`
- `static/icons/favicon.svg`
- `layouts/writeups/list.html`
- `layouts/writeups/single.html`
- `layouts/partials/components/writeup-card.html`
- `layouts/partials/home/posts.html`
- `layouts/partials/home/events.html`

Created application files:

- `content/ctfs.md`, `content/search.md`
- `layouts/_default/baseof.html`, `ctfs.html`, `search.html`, `terms.html`
- `layouts/_default/_markup/render-codeblock.html`, `render-codeblock-mermaid.html`, `render-blockquote-mermaid.html`, `render-link.html`, `render-image.html`, `render-table.html`
- `layouts/partials/head.html`, `header.html`, `archive-meta.html`, `category-links.html`, `solution-scripts.html`, `home/hero.html`
- `static/js/enhancements.js`, `static/css/syntax.css`, `static/_headers`, `static/_redirects`
- `curated-scripts.json`, `data/scripts.json`
- `scripts/analyze-scripts.py`, `scripts/prepare-scripts.py`, `scripts/build.sh`
- `tests/test_archive.py`, `tests/test_rendering.py`, `tests/browser-qa.mjs`
- `ENHANCEMENT.md` and report/QA files under `reports/`
- 19 byte-exact snapshots under `assets/approved-scripts/`; exact paths are listed in `reports/changed-files.json`.

Generated output in `public/` was rebuilt; stale duplicate HTML was removed by Hugo's clean build and historical paths are preserved through redirects. Vendored theme files and original challenge directories were not modified.

## Download path security hardening

Following the owner’s URL traversal concern, all builds and deployments now run `scripts/check-public.py`; prebuilt deployments cannot skip this audit. Literal manifest paths reject ambiguous encodings and controls. 36 tests pass, including 13 new publishing-security tests, and 18 read-only live URL checks found no file disclosure. Details and verification limits: `reports/path-security.md` and `reports/path-security-live.json`. Approved script URLs and contents are unchanged.

## Phase 19 motion system

Added an optional React island and Motion animation layer without replacing Hugo or changing original content. Hero and archive headers have region-scoped `CyberBackground` effects; article headers are static. The system includes a persistent motion control, system reduced-motion support, Canvas fallback, visibility/offscreen pauses, bounded mobile density and lightweight result/script/copy transitions. Original 177 writeups and 19 curated source downloads are preserved. Production build, 36 integration/security tests and 58 browser checks pass. Details: `reports/motion-system.md`.
