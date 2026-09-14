# Champions Schools Parakou — website

Bilingual (French / English) static site. Built with Astro, static output, no
server, no third-party services, no environment variables.

**The site is not deployed.** No domain has been purchased and none is
connected. To deploy it, follow **[`DEPLOYMENT.md`](./DEPLOYMENT.md)** — it has
the pre-deployment checklist, the steps, the domain and HTTPS requirements, the
post-deployment verification list and the rollback notes.

Documentation lives in `../03-Project-Documentation/`:
Phase 1 discovery, Phase 2 architecture, Phase 3 design system, the phase
reports, and the authoritative brief clarifications.

## Requirements

| | |
|---|---|
| Node | **≥ 22.12.0** (Astro 7). Declared in `package.json` `engines`; `.nvmrc` pins major 22 |
| npm | ≥ 10 |
| Browser tests | Playwright — run `npx playwright install chromium` once |

## Commands

| Command | What it does |
|---|---|
| `npm install` (or `npm ci`) | Install dependencies |
| `npm run assets` | Derive web masters from `../02-School-Assets` (originals are read-only). **A local authoring step, not a build step** |
| `npm run dev` | Development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build on :4322 (the port every test suite defaults to) |
| `npm run check` | TypeScript and Astro diagnostics |
| `npm test` | Every suite below, in order (needs `npm run preview` in another terminal) |

Individual suites, all runnable on their own:

| Command | What it checks |
|---|---|
| `npm run test:pages` | Inner-page parity between the two languages |
| `npm run test:facts` | Every school fact against the approved source |
| `npm run test:links` | Internal, external, `tel:` and `mailto:` links |
| `npm run test:bilingual` | hreflang reciprocity, language parity, titles, sitemap |
| `npm run test:console` | Browser console, failed requests, horizontal overflow, every route |
| `npm run test:functional` | Every control does something; no decorative buttons |
| `npm run test:interaction` | Language switcher, submenus, mobile drawer, focus management |
| `npm run test:home` | Homepage content, truthfulness rules, fr/en parity |
| `npm run test:hero` | Hero sequence behaviour and its accessibility surface |
| `npm run test:responsive` | The homepage at 320–1600 px in both languages |
| `npm run test:pages-responsive` | Inner pages across the same widths |
| `npm run test:polish` | Spacing, rhythm and visual-polish rules |
| `npm run test:contrast` | WCAG contrast measured from the rendered page |
| `npm run test:hero-contrast` | Contrast of every hero frame, measured through glyph masks |
| `npm run test:a11y` | axe-core across the site |
| `npm run test:focus` | Every focus indicator against the ground it is drawn on |
| `npm run test:keyboard` | Keyboard reachability and order |
| `npm run test:seo` | Titles, descriptions, canonicals, Open Graph, social-card files, JSON-LD, sitemap, robots |
| `npm run test:security` | No input surface, no third-party load, no secrets, no disclosure |
| `npm run test:headers` | The real header policy applied to every route |
| `npm run test:qa` | The Phase 14 acceptance criteria |
| `npm run test:gallery` | The gallery grid and its full-screen viewer |
| `npm run test:weight` | Measured page transfer size against the budget |

`npm run dev` and `npm run build` run `astro sync` first. That rebuilds Astro's
content store from the loaders, so a collection can never be served from a
stale cache — the failure that broke the homepage after Phase 5 landed.

`npm run test:qa` additionally hashes `../02-School-Assets/Events` when that
folder is present, to confirm every supplied photograph is published exactly
once. It skips that group when the folder is absent, so the suite still runs in
CI from the repository alone.

## Environment variables

**There are none.** No `.env` file exists and none is needed — the codebase
contains no read of `import.meta.env`, `process.env` or any `PUBLIC_` variable.
`.gitignore` blocks `.env`, `.env.*` and the usual credential file shapes so
that one cannot be committed by accident if a later phase adds one.

## Things that are deliberate

- **`site` in `astro.config.mjs` is `https://champions-schools-parakou.invalid`.**
  `.invalid` is the RFC 2606 reserved TLD for placeholders. No domain has been
  purchased and none is invented. It must be replaced in **two** places at
  deployment — that value and the `Sitemap:` line in `public/robots.txt` — and
  `npm run test:seo` fails if only one of them is changed. No test hard-codes
  the domain; the suite reads it out of the config.
- **Images never come from a file path.** They come from
  `src/content/media/media.yaml` through the `SchoolImage` component. The schema
  in `src/content.config.ts` fails the build if a future-campus concept is
  missing its label, its prefixed alt text, or is filed outside its category.
  This is the brief's central rule, enforced by the compiler.
- **`src/i18n/routes.ts` is the single source of truth** for routes, the language
  switcher, hreflang, the sitemap and navigation. Adding a page is one row. A
  page cannot exist in one language only — the build iterates locales.
- **`../02-School-Assets/` is read-only.** `scripts/prepare-assets.mjs` opens
  originals for reading and writes derived masters into `src/assets/`. Where a
  derived master is retouched or cropped, the manifest entry has to say why —
  see `retouchReason` and `cropReason` in `src/content.config.ts`.
- **`public/_headers` and `public/_redirects`** are copied verbatim into the
  build. They are the Netlify / Cloudflare Pages convention; a host that does
  not read them ignores them harmlessly, and `13-SECURITY.md` §12 lists the
  equivalent rules for that case. The HSTS line in `_headers` is commented out
  on purpose — see `DEPLOYMENT.md` §4.
- **The site ships no JavaScript bundle.** The hero sequence, the sticky-header
  sentinel, the mobile drawer and the gallery viewer are inline in the HTML,
  which is why the CSP carries `'unsafe-inline'` on `script-src` and why there
  is nothing for a bundler to split.
