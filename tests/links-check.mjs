/**
 * LINK GRAPH — Phase 7.
 *
 * Reads every built page and checks every href on it. This is a static audit of
 * `dist/`, so it sees links the browser suites would only reach by clicking:
 *
 *   - internal links must resolve to a page that was actually built
 *   - a link on a French page must not lead into the English tree, or vice
 *     versa — except the language switcher, which is the one link whose job is
 *     to cross (it is identified by hreflang, not by position)
 *   - tel: and mailto: must carry the school's approved contact details and
 *     nothing else
 *   - external links must be https, and must carry rel="noopener" when they
 *     open in a new tab
 *   - no href="#", no href="", no javascript: — a control that looks clickable
 *     and does nothing is a defect, not a placeholder
 *   - every page must be reachable from the homepage by following links
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const DIST = 'dist';
const fails = [];
const note = (m) => fails.push(m);

/* The approved contact details, read from the source of truth rather than
   retyped here — so this suite cannot drift from the school's own strings. */
const site = {
  fr: parse(await readFile('src/content/site/fr.yaml', 'utf8')),
  en: parse(await readFile('src/content/site/en.yaml', 'utf8')),
};
const digits = (s) => s.replace(/[^\d+]/g, '');
const ALLOWED_TEL = new Set(site.fr.phones.map((p) => `tel:${digits(p)}`));
const ALLOWED_MAIL = new Set([`mailto:${site.fr.email}`]);
const ALLOWED_WA = new Set(site.fr.phones.map((p) => `https://wa.me/${p.replace(/[^\d]/g, '')}`));

/* ---- collect every built page ---- */
async function walk(d, acc = []) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}
const files = (await walk(DIST)).map((f) => f.replaceAll('\\', '/')).sort();
const routeOf = (f) => '/' + f.replace(/^dist\//, '').replace(/index\.html$/, '');
const built = new Set(files.map(routeOf));

const ANCHOR = /<a\b([^>]*)>/gi;
const ATTR = (s, name) => s.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null;

let internal = 0, external = 0, tel = 0, mail = 0;
const graph = new Map();

for (const f of files) {
  const route = routeOf(f);
  const html = await readFile(f, 'utf8');
  const out = new Set();

  for (const m of html.matchAll(ANCHOR)) {
    const attrs = m[1];
    const href = ATTR(attrs, 'href');
    const where = `${route} → ${href}`;

    if (href === null) { note(`${route}: <a> with no href`); continue; }
    if (href.trim() === '' || href === '#') {
      note(`${route}: <a href="${href}"> — looks clickable, does nothing`); continue;
    }
    if (/^javascript:/i.test(href)) { note(`${route}: javascript: href`); continue; }

    if (href.startsWith('tel:')) {
      tel++;
      if (!ALLOWED_TEL.has(href)) note(`${where}: tel: is not one of the school's numbers`);
      continue;
    }
    if (href.startsWith('mailto:')) {
      mail++;
      if (!ALLOWED_MAIL.has(href)) note(`${where}: mailto: is not the school's address`);
      continue;
    }
    if (/^https?:\/\//i.test(href)) {
      external++;
      if (!href.startsWith('https://')) note(`${where}: external link is not https`);
      if (!ALLOWED_WA.has(href) && !href.startsWith('https://portail.championsschoolsparakou.com')) note(`${where}: unexpected external destination`);
      const target = ATTR(attrs, 'target');
      const rel = ATTR(attrs, 'rel') ?? '';
      if (target === '_blank' && !/noopener/.test(rel))
        note(`${where}: target="_blank" without rel="noopener"`);
      continue;
    }
    if (href.startsWith('#')) {
      // in-page anchor: the target must exist on this page
      const id = href.slice(1);
      if (!new RegExp(`id="${id}"`).test(html)) note(`${where}: anchor target not on the page`);
      continue;
    }

    internal++;
    if (!href.startsWith('/')) { note(`${where}: relative internal link`); continue; }
    if (!href.endsWith('/') && !/\.[a-z0-9]+$/i.test(href))
      note(`${where}: internal link without a trailing slash`);
    if (/\/\//.test(href.replace(/^https?:/, ''))) note(`${where}: malformed path (double slash)`);
    if (!built.has(href)) { note(`${where}: 404 — no such page was built`); continue; }
    out.add(href);

    /* language containment: every link except the switcher stays in its tree */
    const isSwitcher = /hreflang="/.test(attrs);
    if (!isSwitcher && route.startsWith('/fr/') && href.startsWith('/en/'))
      note(`${where}: French page links into the English tree`);
    if (!isSwitcher && route.startsWith('/en/') && href.startsWith('/fr/'))
      note(`${where}: English page links into the French tree`);
  }
  graph.set(route, out);
}

/* ---- reachability: can a visitor get everywhere from the homepage? ---- */
for (const root of ['/fr/', '/en/']) {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    for (const next of graph.get(queue.shift()) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  const tree = [...built].filter((r) => r.startsWith(root));
  const orphans = tree.filter((r) => !seen.has(r));
  if (orphans.length) note(`unreachable from ${root}: ${orphans.join(', ')}`);
}

console.log(`pages: ${files.length}  ·  internal links: ${internal}  ·  external: ${external}  ·  tel: ${tel}  ·  mailto: ${mail}`);
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall link checks passed');
process.exit(fails.length ? 1 : 0);
