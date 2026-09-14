/**
 * INNER-PAGE PARITY — Phase 6.
 *
 * verify-bilingual.mjs checks the BUILT html: same number of pages, correct
 * hreflang, one h1. That cannot see a page whose French version quietly has
 * three blocks where the English has seven — both still build, both still
 * have an h1, and the French visitor gets half a page.
 *
 * This suite reads the SOURCE instead, and fails when:
 *   - a page exists in one language and not the other
 *   - the two languages do not have the same sequence of block types
 *   - a block's repeated parts (points, items, images, chips) differ in count
 *   - an image id is not in the media manifest
 *   - a cta/feature link points at a page key the route map does not have
 *   - a string is identical in both languages where it must be translated
 *     (titles and leads — a copied English title is the exact failure the
 *      brief names: "Do not leave English-only content inside the French
 *      homepage.")
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const PAGES = 'src/content/pages';
const fails = [];
const note = (m) => fails.push(m);

/* ---- the route map, read as text so this test needs no TS build ---- */
const routesSrc = await readFile('src/i18n/routes.ts', 'utf8');
const routeBlock = routesSrc.match(/export const ROUTES[\s\S]*?\n};/)[0];
const PAGE_KEYS = [...routeBlock.matchAll(/^\s*'([a-z-]+)':\s*\{/gm)].map((m) => m[1]);

/* ---- the media manifest ---- */
const manifest = parse(await readFile('src/content/media/media.yaml', 'utf8'));
const MEDIA = new Set(manifest.map((m) => m.id));
const CONCEPTS = new Set(manifest.filter((m) => m.status === 'concept').map((m) => m.id));

/* ---- load every page file ---- */
const files = (await readdir(PAGES)).filter((f) => f.endsWith('.yaml'));
const docs = new Map(); // "page" -> { fr, en }
for (const f of files) {
  const m = f.match(/^(.+)\.(fr|en)\.yaml$/);
  if (!m) { note(`${f}: filename must be <pageKey>.<locale>.yaml`); continue; }
  const [, page, loc] = m;
  const data = parse(await readFile(join(PAGES, f), 'utf8'));
  if (data.page !== page) note(`${f}: declares page "${data.page}"`);
  if (data.locale !== loc) note(`${f}: declares locale "${data.locale}"`);
  if (!PAGE_KEYS.includes(page)) note(`${f}: "${page}" is not in the route map`);
  if (!docs.has(page)) docs.set(page, {});
  docs.get(page)[loc] = data;
}

/* ---- every non-home route needs a file in both languages ---- */
for (const key of PAGE_KEYS.filter((k) => k !== 'home')) {
  const d = docs.get(key);
  if (!d) { note(`${key}: no content files at all`); continue; }
  if (!d.fr) note(`${key}: missing ${key}.fr.yaml`);
  if (!d.en) note(`${key}: missing ${key}.en.yaml`);
}

/* ---- image + link validity, and structural parity ---- */
const imagesOf = (b) => [
  b.image, b.lead, ...(b.support ?? []), ...(b.images ?? []),
  ...(b.items ?? []).map((i) => i.image),
].filter(Boolean);

const countsOf = (b) => ({
  points: b.points?.length ?? 0,
  items: b.items?.length ?? 0,
  images: imagesOf(b).length,
  chips: b.chips?.length ?? 0,
  body: Array.isArray(b.body) ? b.body.length : b.body ? 1 : 0,
});

for (const [page, d] of docs) {
  for (const [loc, doc] of Object.entries(d)) {
    const where = `${page}.${loc}`;
    for (const id of [doc.hero?.image].filter(Boolean)) {
      if (!MEDIA.has(id)) note(`${where}: hero image "${id}" is not in the media manifest`);
    }
    doc.blocks.forEach((b, i) => {
      for (const id of imagesOf(b)) {
        if (!MEDIA.has(id)) note(`${where} block ${i} (${b.type}): image "${id}" is not in the manifest`);
        // A concept image may only appear inside a concepts block, which is
        // the one composition that states what it is showing.
        if (CONCEPTS.has(id) && b.type !== 'concepts')
          note(`${where} block ${i}: concept image "${id}" used in a "${b.type}" block`);
      }
      for (const link of [b.cta, b.primary, b.secondary].filter(Boolean)) {
        if (!PAGE_KEYS.includes(link.page))
          note(`${where} block ${i}: link to unknown page "${link.page}"`);
      }
    });
  }

  if (!d.fr || !d.en) continue;

  if (!!d.fr.hero.image !== !!d.en.hero.image)
    note(`${page}: one language has a hero photograph and the other does not`);
  if (d.fr.hero.image !== d.en.hero.image)
    note(`${page}: hero images differ (${d.fr.hero.image} / ${d.en.hero.image})`);

  const fr = d.fr.blocks, en = d.en.blocks;
  if (fr.length !== en.length) {
    note(`${page}: ${fr.length} blocks in fr, ${en.length} in en`);
  } else {
    fr.forEach((b, i) => {
      if (b.type !== en[i].type)
        note(`${page} block ${i}: "${b.type}" in fr, "${en[i].type}" in en`);
      else {
        const a = countsOf(b), z = countsOf(en[i]);
        for (const k of Object.keys(a)) {
          if (a[k] !== z[k]) note(`${page} block ${i} (${b.type}): ${a[k]} ${k} in fr, ${z[k]} in en`);
        }
      }
    });
  }

  /* ---- translated, not copied ---- */
  for (const field of ['title', 'lead']) {
    if (d.fr[field] === d.en[field]) note(`${page}: ${field} is identical in both languages`);
  }
  const prose = (doc) => doc.blocks.flatMap((b) => [
    b.title, b.quote, b.intro, ...(Array.isArray(b.body) ? b.body : [b.body]),
  ].filter((s) => typeof s === 'string' && s.length > 60));
  const pf = prose(d.fr), pe = prose(d.en);
  const shared = pf.filter((s) => pe.includes(s));
  // The motto is deliberately identical in both languages; nothing else may be.
  const allowed = shared.filter((s) => !/Godliness/.test(s));
  if (allowed.length) note(`${page}: ${allowed.length} long string(s) identical in fr and en — e.g. "${allowed[0].slice(0, 60)}…"`);
}

const pageCount = docs.size;
console.log(`inner pages: ${pageCount}  ·  files: ${files.length}  ·  media ids: ${MEDIA.size}`);
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall inner-page parity checks passed');
process.exit(fails.length ? 1 : 0);
