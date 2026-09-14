/**
 * SEO — Phase 11.
 *
 * Read from the BUILT output, not from a browser: what a crawler receives is
 * what is on disk. Every route, both languages, every assertion grounded in
 * something that can be wrong.
 *
 * The facts suite (test:facts) already pins the school's name, address, phones,
 * email, founding year and the JSON-LD payload against the approved source.
 * This one checks the SEO *surface*: uniqueness, reciprocity, absoluteness,
 * the sitemap, robots, and the social card — including that the social card is
 * never a picture of the campus that does not exist yet.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pixel dimensions of a JPEG, read from its own SOF marker.
 *
 * Deliberately not a dependency: the only thing needed here is two 16-bit
 * numbers, and a test that checks the build should not need a library to do it.
 * Walks the segment chain and reads the first start-of-frame it meets.
 */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;     // not a JPEG
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    /* SOF0..SOF15, excluding DHT (c4), DAC (cc) and the RSTn range */
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

const DIST = process.argv[2] || 'dist';
const SCHOOL = 'Champions Schools Parakou';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

/* ---------- the site origin, read rather than repeated ----------
   This used to be a third hard-coded copy of the domain, alongside
   astro.config.mjs and public/robots.txt. That made the swap at deployment a
   three-place edit where the README described two, and a half-done swap would
   have surfaced as a confusing wall of SEO failures rather than as the one
   thing that was actually wrong. It is now read from the config, and the other
   copy is checked against it. */
const CONFIG_SITE = readFileSync('astro.config.mjs', 'utf8').match(/const SITE = '([^']+)'/)?.[1];
ok(!!CONFIG_SITE, 'astro.config.mjs no longer declares `const SITE` — this check cannot find the site origin');
const SITE = (CONFIG_SITE ?? '').replace(/\/$/, '');
ok(/^https:\/\/[^/]+$/.test(SITE), `astro.config.mjs site is "${SITE}" — expected an https origin with no path`);

const robotsSrc = readFileSync('public/robots.txt', 'utf8');
const robotsSitemap = robotsSrc.match(/^Sitemap:\s*(\S+)/m)?.[1];
ok(!!robotsSitemap, 'public/robots.txt declares no Sitemap line');
if (robotsSitemap) {
  ok(robotsSitemap.startsWith(SITE + '/'),
    `public/robots.txt points the sitemap at ${robotsSitemap}, but astro.config.mjs says the site is ${SITE} `
    + '— the domain was changed in one place and not the other');
}

/* ---------- collect every built page ---------- */
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html')) files.push(p);
  }
})(DIST);
files.sort();

const one = (h, re) => { const m = h.match(re); return m ? m[1] : null; };
const all = (h, re) => [...h.matchAll(re)].map((m) => m.slice(1));

const pages = files.map((f) => {
  const html = readFileSync(f, 'utf8');
  const route = '/' + f.slice(DIST.length + 1).replace(/index\.html$/, '');
  return {
    f, route, html,
    lang: one(html, /<html[^>]*\slang="([^"]*)"/),
    title: one(html, /<title>([^<]*)<\/title>/),
    desc: one(html, /<meta name="description" content="([^"]*)"/),
    robots: one(html, /<meta name="robots" content="([^"]*)"/),
    canonical: one(html, /<link rel="canonical" href="([^"]*)"/),
    hreflang: all(html, /<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g),
    og: Object.fromEntries(all(html, /<meta property="(og:[^"]*)" content="([^"]*)"/g)),
    ogAlts: all(html, /property="og:locale:alternate" content="([^"]*)"/g).map((x) => x[0]),
    tw: Object.fromEntries(all(html, /<meta name="(twitter:[^"]*)" content="([^"]*)"/g)),
    jsonLd: one(html, /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/),
    h1s: all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g).map((x) => x[0].replace(/<[^>]*>/g, '').trim()),
  };
});

const indexable = pages.filter((p) => !p.robots?.includes('noindex'));
const noindex = pages.filter((p) => p.robots?.includes('noindex'));

ok(indexable.length === 26, `expected 26 indexable pages, found ${indexable.length}`);
ok(noindex.length === 2, `expected 2 noindex pages (root redirect + 404), found ${noindex.length}`);

/* ---------- 1. titles ---------- */
const titles = new Map();
for (const p of indexable) {
  ok(!!p.title, `${p.route}: no <title>`);
  ok(p.title.includes(SCHOOL),
    `${p.route}: the title "${p.title}" does not carry the school's name`);
  /* Long enough to mean something, short enough not to be a keyword dump. */
  ok(p.title.length <= 75, `${p.route}: title is ${p.title.length} chars — "${p.title}"`);
  ok(!/(\b\w+\b)(?:[^\w]+\1\b){2,}/i.test(p.title.replace(SCHOOL, '')),
    `${p.route}: a word repeats three times in the title — "${p.title}"`);
  titles.set(p.title, [...(titles.get(p.title) ?? []), p.route]);
}
for (const [t, rs] of titles)
  ok(rs.length === 1, `duplicate title "${t}" on ${rs.join(', ')}`);

/* ---------- 2. descriptions ---------- */
const descs = new Map();
for (const p of indexable) {
  ok(!!p.desc, `${p.route}: no meta description`);
  ok((p.desc ?? '').length >= 40 && (p.desc ?? '').length <= 165,
    `${p.route}: description is ${(p.desc ?? '').length} chars`);
  descs.set(p.desc, [...(descs.get(p.desc) ?? []), p.route]);
}
for (const [d, rs] of descs)
  ok(rs.length === 1, `duplicate description on ${rs.join(', ')}`);

/* No superlative or ranking claim anywhere in the metadata. The school's
   approved information supports none of these, and a metadata claim is still
   a claim. */
const BANNED = [
  /\bbest\b/i, /\bnumber one\b/i, /\bn[°o]\s?1\b/i, /\bleading\b/i, /\btop\s+school\b/i,
  /\baward[- ]winning\b/i, /\bmeilleure?\b/i, /\bpremi[eè]re? école\b/i, /\bclassée?\b/i,
  /\bthe most\b/i, /\ble plus\b/i, /\brank(ed|ing)\b/i, /\baccredited\b/i, /\bagréée?\b/i,
];
for (const p of pages)
  for (const re of BANNED) {
    ok(!re.test(p.title ?? ''), `${p.route}: unsupported claim in the title — ${re}`);
    ok(!re.test(p.desc ?? ''), `${p.route}: unsupported claim in the description — ${re}`);
  }

/* The root is not a page: it is a 0-second redirect stub to the default
   locale, carrying two language links for anything that ignores the refresh.
   It has no heading and no structured data by design — but it does have to be
   noindex and it does have to point at the real homepage. */
const ROOT = '/';
const root = pages.find((p) => p.route === ROOT);
ok(!!root, 'no root redirect stub was built');
if (root) {
  ok(root.robots?.includes('noindex'), 'the root redirect stub is not noindex');
  ok(root.canonical === `${SITE}/fr/`, `the root stub canonicalises to ${root.canonical}`);
  ok(/http-equiv="refresh"/.test(root.html), 'the root stub has no meta refresh');
  for (const l of ['/fr/', '/en/'])
    ok(root.html.includes(`href="${l}"`), `the root stub offers no link to ${l}`);
}
const realPages = pages.filter((p) => p.route !== ROOT);

/* ---------- 3. exactly one H1 per real page ---------- */
for (const p of realPages)
  ok(p.h1s.length === 1, `${p.route}: ${p.h1s.length} <h1> elements`);

/* ---------- 4. canonical ---------- */
const canons = new Map();
for (const p of indexable) {
  ok(!!p.canonical, `${p.route}: no canonical`);
  ok(p.canonical?.startsWith('https://'), `${p.route}: canonical is not absolute https`);
  ok(p.canonical?.endsWith('/'), `${p.route}: canonical has no trailing slash — ${p.canonical}`);
  ok(p.canonical === SITE + p.route,
    `${p.route}: canonical points at ${p.canonical}, not at this page`);
  /* an English page must never canonicalise to French, or the reverse */
  const seg = p.route.split('/')[1];
  ok(p.canonical?.includes(`/${seg}/`),
    `${p.route}: canonical crosses language — ${p.canonical}`);
  canons.set(p.canonical, [...(canons.get(p.canonical) ?? []), p.route]);
}
for (const [c, rs] of canons)
  ok(rs.length === 1, `two pages canonicalise to ${c}: ${rs.join(', ')}`);
for (const p of noindex)
  ok(!p.hreflang.length, `${p.route} is noindex but still declares hreflang`);

/* ---------- 5. hreflang reciprocity ---------- */
const byUrl = new Map(indexable.map((p) => [SITE + p.route, p]));
for (const p of indexable) {
  const map = Object.fromEntries(p.hreflang);
  ok(!!map.fr && !!map.en, `${p.route}: missing an fr or en alternate`);
  ok(!!map['x-default'], `${p.route}: no x-default`);
  ok(map['x-default'] === map.fr,
    `${p.route}: x-default (${map['x-default']}) is not the default locale's URL`);
  /* the page must list itself */
  ok(map[p.lang] === SITE + p.route,
    `${p.route}: does not list itself as the ${p.lang} alternate`);
  /* and the other language must point back */
  const other = p.lang === 'fr' ? 'en' : 'fr';
  const twin = byUrl.get(map[other]);
  ok(!!twin, `${p.route}: its ${other} alternate ${map[other]} is not an indexable page`);
  if (twin) {
    const back = Object.fromEntries(twin.hreflang);
    ok(back[p.lang] === SITE + p.route,
      `${p.route}: ${twin.route} does not point back (it says ${back[p.lang]})`);
    ok(twin.lang === other,
      `${p.route}: its ${other} alternate is served as lang="${twin.lang}"`);
  }
  for (const [, url] of p.hreflang)
    ok(url.startsWith('https://') && url.endsWith('/'),
      `${p.route}: alternate ${url} is not an absolute URL with a trailing slash`);
}

/* ---------- 6. Open Graph and the social card ---------- */
for (const p of indexable) {
  ok(p.og['og:type'] === 'website', `${p.route}: og:type is ${p.og['og:type']}`);
  ok(p.og['og:title'] === p.title, `${p.route}: og:title differs from <title>`);
  ok(p.og['og:description'] === p.desc, `${p.route}: og:description differs from the meta description`);
  ok(p.og['og:url'] === p.canonical, `${p.route}: og:url is not the canonical`);
  ok(p.og['og:site_name'] === SCHOOL, `${p.route}: og:site_name is "${p.og['og:site_name']}"`);
  const wantLocale = p.lang === 'fr' ? 'fr_FR' : 'en_GB';
  ok(p.og['og:locale'] === wantLocale,
    `${p.route}: og:locale is ${p.og['og:locale']} on a lang="${p.lang}" page`);
  ok(p.ogAlts.length === 1 && p.ogAlts[0] !== wantLocale,
    `${p.route}: og:locale:alternate is ${p.ogAlts.join(',')}`);

  /* the card the site promises has to exist */
  const img = p.og['og:image'];
  ok(!!img, `${p.route}: no og:image, but twitter:card promises a large image`);
  ok(img?.startsWith('https://'), `${p.route}: og:image is not absolute — ${img}`);
  ok(!!p.og['og:image:alt'], `${p.route}: og:image has no alt text`);
  /* The declared size has to be the size of the FILE. Asserting a constant
     1200×630 here is what let three cards ship at 1080×630 and 1024×630 while
     still declaring 1200×630 — the assertion agreed with the markup instead of
     checking it against reality. Measured from the JPEG itself below. */
  const declW = Number(p.og['og:image:width']), declH = Number(p.og['og:image:height']);
  ok(Number.isFinite(declW) && Number.isFinite(declH),
    `${p.route}: og:image dimensions are not numbers — ${p.og['og:image:width']}×${p.og['og:image:height']}`);
  ok(Math.abs(declW / declH - 1200 / 630) < 0.02,
    `${p.route}: og:image is ${declW}×${declH}, ratio ${(declW / declH).toFixed(2)} — social cards are 1.91:1`);
  /* Facebook's documented minimum for a large card; below it the share falls
     back to a small thumbnail, which is not what twitter:card promises. */
  ok(declW >= 600 && declH >= 315,
    `${p.route}: og:image is ${declW}×${declH} — below the 600×315 minimum for a large card`);
  ok(p.tw['twitter:card'] === 'summary_large_image', `${p.route}: twitter:card is ${p.tw['twitter:card']}`);
  ok(p.tw['twitter:image'] === img, `${p.route}: twitter:image differs from og:image`);
  /* the file must actually be there — a card URL that 404s is worse than none —
     and it must be the size the page says it is */
  if (img) {
    const rel = img.replace(SITE, '');
    const file = join(DIST, rel);
    ok(existsSync(file), `${p.route}: og:image ${rel} does not exist in the build`);
    if (existsSync(file)) {
      const real = jpegSize(readFileSync(file));
      ok(real && real.w === declW && real.h === declH,
        `${p.route}: og:image declares ${declW}×${declH} but the file is `
        + `${real ? `${real.w}×${real.h}` : 'unreadable'} — a share would be laid out against the wrong box`);
    }
  }
  /* and it must never be a picture of the campus that is still being built */
  ok(!/campus-(entrance|classroom|playground|library|nursery-room)/.test(img ?? ''),
    `${p.route}: the social card is a future-campus CONCEPT image — a share would `
    + 'present a building that does not exist as though it did');
}

/* ---------- 7. structured data ---------- */
const FABRICATED = ['aggregateRating', 'review', 'ratingValue', 'reviewCount', 'award',
  'hasCredential', 'accreditation', 'starRating', 'bestRating'];
for (const p of realPages) {
  ok(!!p.jsonLd, `${p.route}: no JSON-LD`);
  if (!p.jsonLd) continue;
  let data;
  try { data = JSON.parse(p.jsonLd); }
  catch { fails.push(`${p.route}: JSON-LD does not parse`); continue; }
  ok(data['@type'] === 'School', `${p.route}: JSON-LD @type is ${data['@type']}`);
  ok(data.name === SCHOOL, `${p.route}: JSON-LD name is "${data.name}"`);
  ok(data.address?.addressLocality === 'Parakou' && data.address?.addressCountry === 'BJ',
    `${p.route}: JSON-LD address is wrong`);
  ok(data.foundingDate === '2009', `${p.route}: JSON-LD foundingDate is ${data.foundingDate}`);
  ok(Array.isArray(data.inLanguage) && data.inLanguage.join(',') === 'fr,en',
    `${p.route}: JSON-LD inLanguage is ${JSON.stringify(data.inLanguage)}`);
  ok(typeof data.logo === 'string' && data.logo.startsWith('https://'),
    `${p.route}: JSON-LD has no absolute logo`);
  const flat = JSON.stringify(data).toLowerCase();
  for (const bad of FABRICATED)
    ok(!flat.includes(bad.toLowerCase()),
      `${p.route}: JSON-LD contains "${bad}" — the approved information supports no such claim`);
  ok(data.url?.startsWith(SITE), `${p.route}: JSON-LD url is ${data.url}`);
}

/* ---------- 8. sitemap ---------- */
const smIndex = join(DIST, 'sitemap-index.xml');
ok(existsSync(smIndex), 'no sitemap-index.xml in the build');
if (existsSync(smIndex)) {
  const idx = readFileSync(smIndex, 'utf8');
  const parts = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(parts.length >= 1, 'sitemap index lists no sitemaps');
  let locs = [];
  for (const part of parts) {
    const file = join(DIST, part.replace(SITE, ''));
    ok(existsSync(file), `sitemap index points at ${part}, which is not in the build`);
    if (!existsSync(file)) continue;
    const xml = readFileSync(file, 'utf8');
    ok(xml.startsWith('<?xml'), `${part} does not start with an XML declaration`);
    locs.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    for (const u of xml.matchAll(/<url>([\s\S]*?)<\/url>/g))
      ok((u[1].match(/xhtml:link/g) ?? []).length === 3,
        'a sitemap entry does not carry fr, en and x-default alternates');
  }
  ok(locs.length === new Set(locs).size, 'the sitemap lists a URL twice');
  ok(locs.length === indexable.length,
    `the sitemap lists ${locs.length} URLs but there are ${indexable.length} indexable pages`);
  for (const p of indexable)
    ok(locs.includes(SITE + p.route), `the sitemap is missing ${p.route}`);
  for (const p of noindex)
    ok(!locs.includes(SITE + p.route), `the sitemap lists the noindex page ${p.route}`);
  ok(!locs.some((l) => l.includes('/404')), 'the sitemap lists a 404 route');
  ok(locs.every((l) => l.endsWith('/')), 'a sitemap URL has no trailing slash');
}

/* ---------- 9. robots.txt ---------- */
const robotsPath = join(DIST, 'robots.txt');
ok(existsSync(robotsPath), 'no robots.txt in the build');
if (existsSync(robotsPath)) {
  const r = readFileSync(robotsPath, 'utf8');
  ok(/user-agent:\s*\*/i.test(r), 'robots.txt has no wildcard user-agent group');
  ok(!/^\s*disallow:\s*\/\s*$/im.test(r), 'robots.txt disallows the whole site');
  ok(/sitemap:\s*https?:\/\/\S+sitemap/i.test(r), 'robots.txt does not point at the sitemap');
  const sm = one(r, /Sitemap:\s*(\S+)/i);
  ok(sm?.startsWith(SITE), `robots.txt sitemap URL (${sm}) does not match the configured site`);
}

/* ---------- 10. internal links stay in their own language ---------- */
for (const p of pages) {
  const seg = p.route.split('/')[1];
  if (seg !== 'fr' && seg !== 'en') continue;
  const other = seg === 'fr' ? 'en' : 'fr';
  /* The WHOLE opening tag: the switcher writes hreflang and class after href,
     so matching only what precedes href reports every switcher link as a leak. */
  for (const m of p.html.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    const href = (tag.match(/href="(\/[^"#]*)"/) ?? [])[1];
    if (!href || !href.startsWith(`/${other}/`)) continue;
    ok(/hreflang=/.test(tag) || /lang__link/.test(tag),
      `${p.route} links to the other language at ${href} outside the language switcher: ${tag.slice(0, 90)}`);
  }
}

console.log(`SEO: ${pages.length} built pages — ${indexable.length} indexable, ${noindex.length} noindex`);
console.log(`  titles ${titles.size} distinct · descriptions ${descs.size} distinct · canonicals ${canons.size} distinct`);
console.log('  checked: titles, descriptions, H1s, canonicals, hreflang reciprocity, Open Graph,');
console.log('           social card files, Twitter cards, JSON-LD, sitemap, robots.txt, link language');
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall SEO checks passed');
process.exit(fails.length ? 1 : 0);
