import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const DIST = 'dist';
async function walk(d, acc = []) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name === 'index.html') acc.push(p);
  }
  return acc;
}
const files = (await walk(DIST)).sort();
const pages = new Map();
let fails = [];
for (const f of files) {
  const html = await readFile(f, 'utf8');
  const route = '/' + f.replace(/^dist\//, '').replace(/index\.html$/, '');
  const lang = html.match(/<html lang="([^"]+)"/)?.[1] ?? null;
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1] ?? null;
  const hreflangs = [...html.matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
  const desc = html.match(/name="description" content="([^"]*)"/)?.[1] ?? null;
  const h1 = (html.match(/<h1[^>]*>/g) || []).length;
  const skip = /class="skip-link"/.test(html);
  const jsonld = /application\/ld\+json/.test(html);
  pages.set(route, { lang, canonical, hreflangs, title, desc, h1, skip, jsonld, html });
}
const content = [...pages.entries()].filter(([r]) => r !== '/' && r !== '/404.html/');
console.log(`pages built: ${pages.size}`);

for (const [route, p] of content) {
  const expect = route.startsWith('/en/') ? 'en' : 'fr';
  if (p.lang !== expect) fails.push(`${route}: html lang="${p.lang}", expected "${expect}"`);
  if (!p.canonical?.endsWith(route)) fails.push(`${route}: canonical mismatch (${p.canonical})`);
  if (p.hreflangs.length !== 3) fails.push(`${route}: ${p.hreflangs.length} hreflang links, expected 3 (fr, en, x-default)`);
  const codes = p.hreflangs.map(h => h[0]).sort().join(',');
  if (codes !== 'en,fr,x-default') fails.push(`${route}: hreflang codes ${codes}`);
  if (p.h1 !== 1) fails.push(`${route}: ${p.h1} <h1> elements, expected 1`);
  if (!p.skip) fails.push(`${route}: no skip link`);
  if (!p.title?.trim()) fails.push(`${route}: empty title`);
  if (!p.desc?.trim()) fails.push(`${route}: empty meta description`);
  if (!p.jsonld) fails.push(`${route}: no JSON-LD`);
  // reciprocity: the counterpart must point back at this page
  const self = p.hreflangs.find(h => h[0] === expect)?.[1];
  if (!self?.endsWith(route)) fails.push(`${route}: not self-referencing in hreflang`);
  const otherCode = expect === 'fr' ? 'en' : 'fr';
  const otherHref = p.hreflangs.find(h => h[0] === otherCode)?.[1];
  const otherRoute = otherHref?.replace(/^https?:\/\/[^/]+/, '');
  const other = pages.get(otherRoute);
  if (!other) fails.push(`${route}: counterpart ${otherRoute} not built`);
  else {
    const back = other.hreflangs.find(h => h[0] === expect)?.[1]?.replace(/^https?:\/\/[^/]+/, '');
    if (back !== route) fails.push(`${route}: counterpart ${otherRoute} does not link back (got ${back})`);
  }
}
// pairing completeness
const fr = content.filter(([r]) => r.startsWith('/fr/')).length;
const en = content.filter(([r]) => r.startsWith('/en/')).length;
console.log(`fr pages: ${fr}   en pages: ${en}`);
if (fr !== en) fails.push(`language trees differ: ${fr} fr vs ${en} en`);

// unique titles & descriptions per language
for (const lang of ['fr', 'en']) {
  const set = content.filter(([r]) => r.startsWith(`/${lang}/`));
  for (const field of ['title', 'desc']) {
    const seen = new Map();
    for (const [r, p] of set) {
      const v = p[field];
      if (seen.has(v)) fails.push(`duplicate ${field} in ${lang}: ${r} and ${seen.get(v)}`);
      else seen.set(v, r);
    }
  }
}
// sitemap
const sm = await readFile('dist/sitemap-0.xml', 'utf8').catch(() => '');
console.log(`sitemap urls: ${(sm.match(/<loc>/g) || []).length}, xhtml alternates: ${(sm.match(/xhtml:link/g) || []).length}`);
if (!sm.includes('hreflang="fr"') || !sm.includes('hreflang="en"')) fails.push('sitemap missing hreflang alternates');

console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall bilingual checks passed');
