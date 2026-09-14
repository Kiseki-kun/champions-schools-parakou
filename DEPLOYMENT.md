# Deployment — Champions Schools Parakou

Everything needed to put this site on the internet, written so that someone who
has never seen the project can follow it.

**Status at the time of writing (13 September 2026): the site is NOT deployed.**
No domain has been purchased, no domain has been connected, no hosting account
has been created, and no host has been chosen. Nothing in this file claims
otherwise. Where something depends on a decision nobody has made yet, it says so.

---

## 1. What this site is, in deployment terms

| | |
|---|---|
| Type | **Static**. Astro `output: 'static'`, no adapter, no server bundle, no serverless function |
| What is deployed | The contents of `dist/` — plain HTML, CSS, images and fonts |
| Runtime on the server | **None.** The host only has to serve files |
| JavaScript shipped | No JS bundle at all. The few behaviours (hero sequence, mobile drawer, gallery viewer) are inline in the HTML |
| Third-party requests at runtime | **None** — no analytics, no tag manager, no font CDN, no embed, no external image |
| Databases, APIs, secrets | **None** |
| Forms / user input | **None.** Enquiries go to the school's own email and telephone |

The build is self-contained: it was verified to complete with the
`../02-School-Assets/` source-photograph folder absent, because the derived web
masters live in `src/assets/` and are part of the repository. A CI runner needs
only this folder.

---

## 2. Environment requirements

### Environment variables

**There are none.** This is not an omission — the codebase was searched for
`import.meta.env`, `process.env` and `PUBLIC_` across `src/`, `scripts/` and
`astro.config.mjs`, and there is not a single read. The site has no API keys, no
analytics ID, no form endpoint and no backend.

Consequently there is **no `.env` file and no `.env.example`**, and none should
be invented. `.gitignore` already blocks `.env`, `.env.*`, and the usual
credential file shapes, so that the day one is genuinely needed it cannot be
committed by accident.

If a future phase adds one — an analytics ID, say — the rule is: anything read
in client-side code must be prefixed `PUBLIC_` and is therefore **not** a
secret; anything genuinely secret cannot be used by a static site at all and
would require re-architecting.

### Runtime

| | |
|---|---|
| Node | **≥ 22.12.0** — required by Astro 7. Declared in `package.json` `engines` and in `.nvmrc` (`22`), which Netlify, Cloudflare Pages and Vercel all read |
| npm | ≥ 10 |
| Build machine | Needs `sharp` to install. It ships prebuilt binaries for Linux x64/arm64, which every mainstream CI image is |
| Build memory | The image pipeline processes 64 masters into 1,121 variants. A 1 GB build container is tight; 2 GB is comfortable |

### Build

| | |
|---|---|
| Install | `npm ci` (preferred in CI) or `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Build time | ~4 s with a warm `node_modules/.astro` image cache; **~7 min 40 s cold**, because every image variant is generated |
| Do **not** run | `npm run assets` in CI. It reads `../02-School-Assets/`, which is not in the repository, and writes into `src/assets/`. It is a local authoring step, not a build step |

### Measured output

| | |
|---|---|
| Pages | 28 HTML files — 26 indexable routes + `/index.html` (root redirect stub) + `/404.html` |
| Total files | 1,167 |
| Total size | ~106 MB, almost all of it image variants (jpg 67.3 MB, webp 22.2 MB, avif 11.5 MB) |
| Largest single file | ~0.9 MB |
| Heaviest page over the wire | `/fr/vie-scolaire/galerie/` at 372 KB |

Those two numbers — **1,167 files** and **~106 MB** — are the ones to check
against a host's limits before choosing it. They are comfortably inside the
published limits of the common static hosts, but check the limits of whichever
host is actually chosen rather than trusting this sentence.

---

## 3. The domain placeholder — the one thing that MUST change

The site is built with a deliberately fake domain:

```
https://champions-schools-parakou.invalid
```

`.invalid` is the RFC 2606 reserved TLD for exactly this purpose. It is not a
typo and it is not a real domain. It appears in **two** places, both of which
must be changed together:

| File | What to change |
|---|---|
| `astro.config.mjs` | `const SITE = 'https://champions-schools-parakou.invalid';` |
| `public/robots.txt` | the `Sitemap:` line |

Changing one and not the other is caught: `npm run test:seo` reads the origin
out of `astro.config.mjs` and fails with the message *"the domain was changed in
one place and not the other"* if `robots.txt` disagrees. No test hard-codes the
domain any more.

Changing it regenerates, on the next build, every canonical URL, every
`hreflang` alternate, `og:url`, `og:image`, `twitter:image`, the JSON-LD `url`
and `logo`, the sitemap and the robots `Sitemap:` line. Nothing else needs
touching.

**Pick the canonical hostname before building.** Apex (`example.com`) or `www`
— one of them, consistently, with the other 301-redirecting to it. Building
with one and serving on the other produces canonicals that point at a hostname
the visitor is not on.

---

## 4. HTTPS

**HTTPS is required.** Not configured, not verified, not claimed — required.
The site ships `public/_headers`, whose policy assumes a secure origin, and its
HSTS line is **deliberately commented out**:

```
# Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Leave it commented until the real domain is serving valid HTTPS on the apex
**and on every subdomain that will ever exist**. A browser that sees this header
remembers it for two years, and on a domain whose certificate is not yet right
that is a self-inflicted outage no visitor can clear. Uncomment it only after
step 6.4 below passes.

Every mainstream static host issues and renews a certificate automatically once
DNS points at it. That is a host feature, not something in this repository.

---

## 5. Routing, headers and redirects the host must honour

### Trailing slashes

`trailingSlash: 'always'` and `build.format: 'directory'`, so every route is a
directory containing `index.html`:

```
/en/about/            ->  dist/en/about/index.html
/fr/vie-scolaire/galerie/  ->  dist/fr/vie-scolaire/galerie/index.html
```

The host must:

1. serve `/path/` from `/path/index.html` — every static host does this;
2. **301 `/path` to `/path/`** — so the slashless form does not serve a page
   whose canonical points somewhere else. Netlify and Cloudflare Pages do this
   by default; on a bare S3/nginx setup it has to be configured.

### The root

`/` is a `noindex` redirect stub to `/fr/`. It is handled twice on purpose:

- `public/_redirects` — `/    /fr/    301` — a real 301 on hosts that read it;
- `dist/index.html` — a `<meta refresh>` plus `location.replace()` fallback with
  a visible link to both languages, for hosts that ignore rule files.

Either path works. Both are in the build.

### 404

`dist/404.html` sits at the root of the output. Netlify, Cloudflare Pages and
Vercel serve it for unmatched paths automatically. On nginx it is
`error_page 404 /404.html;`. The page is bilingual and offers a route back to
both language homepages.

### Security headers

`public/_headers` is copied verbatim into `dist/` and is read by **Netlify and
Cloudflare Pages**. It sets CSP, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, and a one-year immutable cache on `/_astro/*`.

A host that does not read `_headers` **ignores it silently** — the site still
works, but with no security headers at all. If the chosen host is in that
category, the same rules must be set in its own configuration;
`13-SECURITY.md` §12 lists them in a portable form.

### DNS

Nothing in this repository configures DNS. What will be needed, once a domain
and a host exist:

- an `A`/`AAAA` record or a `CNAME`/`ALIAS` at the apex, per the host's
  instructions;
- a `CNAME` for `www` pointing at the same place;
- a redirect between apex and `www` in whichever direction was chosen in §3;
- optionally `CAA` records restricting which CA may issue for the domain.

Exact record values come from the host. Do not guess them.

---

## 6. Deployment

### 6.1 Pre-deployment checklist

Run every item; each must pass before deploying.

- [ ] Node ≥ 22.12.0 (`node -v`)
- [ ] `npm ci`
- [ ] The domain has been purchased and the canonical hostname chosen (apex or `www`)
- [ ] `astro.config.mjs` `SITE` updated to the real `https://` origin, no trailing slash
- [ ] `public/robots.txt` `Sitemap:` line updated to the same origin
- [ ] `npx astro check` — 0 errors
- [ ] `npm run build` — 28 pages, no errors
- [ ] `npm run preview` in a second terminal, then `npm test` — all 23 suites pass
- [ ] `npm audit` — 0 vulnerabilities
- [ ] `grep -r "\.invalid" dist/` returns nothing
- [ ] `public/_headers` HSTS line still **commented out**
- [ ] No `.env` file exists and none is referenced

### 6.2 Deployment steps

1. Create the hosting project and connect it to the repository (or prepare to
   upload `dist/` directly).
2. Configure the build:
   - build command `npm run build`
   - output directory `dist`
   - Node 22 (from `.nvmrc`, or set `NODE_VERSION=22`)
   - no environment variables
3. Deploy once **without** the custom domain and note the host's temporary URL
   (`*.netlify.app`, `*.pages.dev`, `*.vercel.app`). Run §6.4 against it.
4. Add the custom domain in the host's dashboard.
5. Create the DNS records the host specifies. Wait for propagation.
6. Confirm the host has issued a certificate and that `https://` works on the
   apex and on `www`.
7. Confirm apex ↔ `www` redirects in the direction chosen in §3.
8. Only now, if desired, uncomment the HSTS line in `public/_headers`, rebuild
   and redeploy.

### 6.3 Temporary preview deployment

This is safe to do now and does **not** require the final domain. A preview on
a host-provided subdomain lets the school see the real site on real
infrastructure before any domain is bought.

What it involves:

- Deploy `dist/` to any static host and use only the temporary URL it gives you.
- Leave `SITE` as the `.invalid` placeholder, **or** set it to the temporary URL
  for the duration. If it is left as `.invalid`, the pages render and navigate
  correctly — internal links are all root-relative — but canonicals, `og:` URLs
  and the sitemap will point at the placeholder. That is harmless on a preview
  and is the reason for the next point.
- Keep the preview **out of search engines**: either rely on the host's own
  "prevent indexing" switch, or serve `X-Robots-Tag: noindex` for the preview
  deployment. Do not edit `public/robots.txt` to `Disallow: /` and risk that
  edit reaching production.
- Do not attach the final domain, and do not describe the preview URL as the
  school's website address.

### 6.4 Post-deployment verification

Against the deployed URL, not against localhost.

**Routing**
- [ ] `/` redirects to `/fr/`
- [ ] All 26 routes load: 13 French, 13 English
- [ ] `/en/about` (no trailing slash) 301s to `/en/about/`
- [ ] A deliberately wrong path (`/nope/`) returns the bilingual 404 with HTTP 404
- [ ] The language switcher moves between the paired routes in both directions

**HTTPS and headers**
- [ ] `https://` works; `http://` redirects to it
- [ ] The certificate covers apex and `www`
- [ ] `curl -sI https://<domain>/fr/` shows `Content-Security-Policy`,
      `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
      `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
      `Cross-Origin-Resource-Policy`
- [ ] If any are missing, the host does not read `_headers` — set them in the
      host's configuration (`13-SECURITY.md` §12)
- [ ] `curl -sI https://<domain>/_astro/<any-hashed-file>` shows
      `Cache-Control: public, max-age=31536000, immutable`
- [ ] The browser console is clean on at least the homepage, the gallery and
      one inner page — in particular, no CSP violation

**SEO**
- [ ] `https://<domain>/robots.txt` names the correct sitemap URL
- [ ] `https://<domain>/sitemap-index.xml` loads and lists `sitemap-0.xml`
- [ ] `sitemap-0.xml` contains 26 URLs, all on the real domain, and does **not**
      list `/` or `/404`
- [ ] View source on any page: `<link rel="canonical">` is the real domain and
      the page you are on
- [ ] `hreflang` `fr`, `en` and `x-default` all point at the real domain
- [ ] Paste one French and one English URL into a social-card debugger and
      confirm the image, title and description appear
- [ ] Submit the sitemap in Google Search Console (a Phase 16 task, listed here
      so it is not forgotten)

**Content and assets**
- [ ] The gallery shows the full grid and the viewer opens, in both languages
- [ ] No broken image anywhere (`curl` the page and check for 404s, or use the
      browser network panel)
- [ ] `https://<domain>/_astro/campus-entrance*` returns 404 — the excluded
      photograph must not be reachable
- [ ] The future-campus page still labels every concept image as a concept

### 6.5 Rollback and recovery

The site is static, which makes recovery cheap.

| Situation | What to do |
|---|---|
| A bad deploy | Every mainstream host keeps previous deploys and can restore one in a click. Do that first; diagnose afterwards |
| No host rollback available | Rebuild from the last good commit and redeploy. `dist/` is fully reproducible from the repository — there is no database and no state to restore |
| The site is up but a page is wrong | Fix, rebuild, redeploy. There is no cache to purge beyond the host's CDN, which invalidates on deploy; `/_astro/*` filenames are content-hashed, so a changed asset is a new URL |
| **HSTS was enabled too early and HTTPS is broken** | This is the one expensive mistake. Visitors who already loaded the site cannot reach it over `http://` and cannot click past a certificate error for up to two years. The only real fix is to make HTTPS work correctly on the affected hostnames. `max-age=0` helps only visitors who load the site again afterwards. This is why §4 says to leave it commented |
| The domain was pointed at the wrong host | DNS change; expect propagation delay up to the TTL that was set |

Keep the previous good `dist/` or the commit it was built from until §6.4 has
passed on the new deploy.

---

## 7. What is NOT done, and is not claimed

- No domain purchased. No domain connected.
- No hosting provider chosen, created or configured.
- HTTPS, HSTS, TLS configuration, WAF, DNS security and CDN behaviour are
  **not** active and are not verified. They are host-level and belong to
  deployment.
- The site is not live anywhere.
- Google Search Console, Bing Webmaster Tools, analytics and uptime monitoring
  are not set up. They are Phase 16 work.
