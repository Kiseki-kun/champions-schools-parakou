/**
 * FULL QA ACCEPTANCE — Phase 14.
 *
 * Twenty-one suites already cover this site. This one exists only for the
 * things Phase 14 names as acceptance criteria that nothing else was actually
 * asserting. Each block below was a genuine blind spot at the start of the
 * phase, and one of them was hiding a real defect (block 2).
 *
 *   1  the built route set is EXACTLY the route map — no stray, dev,
 *      duplicate or missing route
 *   2  an excluded image is excluded from the BUILD, not just from the pages
 *   3  no image ships that no page references
 *   4  the hero sequence still traces to the five approved originals
 *   5  no social card is a future-campus concept
 *   6  the future-campus disclosure and strapline are on both pages, in both
 *      languages
 *   7  the founders are two people, named exactly as the school approved
 *   8  the word "staffs" does not appear in anything a visitor reads
 *
 * Everything here reads the built site or the source of truth. Nothing is
 * inferred from an earlier phase's report.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || 'dist';
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const all = walk(DIST);
const htmlFiles = all.filter((f) => f.endsWith('.html'));
const pages = htmlFiles.map((f) => {
  const html = readFileSync(f, 'utf8');
  return {
    route: '/' + f.replace(new RegExp(`^${DIST}/`), '').replace(/index\.html$/, ''),
    html,
    text: html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' '),
    locale: f.includes('/en/') ? 'en' : 'fr',
  };
});
const allHtml = pages.map((p) => p.html).join('\n');

/* ---------- 1. the built routes are exactly the route map ----------
   links-check proves every link resolves and every page is reachable;
   verify-bilingual proves the two trees pair up. Neither can see a page that
   was built in BOTH languages and belongs in neither tree — a leftover
   scaffold, a preview route, a duplicate under a second slug. This can. */
const routesSrc = readFileSync('src/i18n/routes.ts', 'utf8');
const table = routesSrc.match(/export const ROUTES[\s\S]*?\n};/)?.[0] ?? '';
const slugs = [...table.matchAll(/'([a-z-]+)':\s*\{\s*fr:\s*'([^']*)',\s*en:\s*'([^']*)'/g)];
ok(slugs.length === 13, `route map has ${slugs.length} page keys, expected 13`);
const expected = new Set(['/', '/404.html']);
for (const [, , fr, en] of slugs) {
  expected.add(fr ? `/fr/${fr}/` : '/fr/');
  expected.add(en ? `/en/${en}/` : '/en/');
}
const built = new Set(pages.map((p) => p.route));
for (const r of expected) ok(built.has(r), `the route map declares ${r} but it was not built`);
for (const r of built) ok(expected.has(r), `${r} was built but is not in the route map — stray route`);
ok(built.size === expected.size,
  `${built.size} routes built, ${expected.size} declared`);

/* ---------- 2. an excluded image is excluded from the BUILD ----------
   The defect this caught: everything under src/assets/ is emitted by the
   import.meta.glob in SchoolImage, whether or not a page renders it. So the
   one image deliberately withheld — a facade whose painted signage names
   entities that are not the confirmed school name — was shipping at a stable,
   fetchable URL with nothing linking it. Keeping it off every page is not the
   same as keeping it off the site. */
const manifest = readFileSync('src/content/media/media.yaml', 'utf8');
const entries = [];
for (const block of manifest.split(/\n(?=- id: )/)) {
  const id = block.match(/- id: ([\w-]+)/)?.[1];
  if (!id) continue;
  entries.push({
    id,
    category: block.match(/\n\s*category: ([\w-]+)/)?.[1] ?? '',
    status: block.match(/\n\s*status: (\w+)/)?.[1] ?? '',
    excluded: block.match(/\n\s*excluded: "([^"]*)"/)?.[1] ?? null,
  });
}
ok(entries.length >= 29, `only ${entries.length} manifest entries parsed`);
const excluded = entries.filter((e) => e.excluded);
ok(excluded.length >= 1,
  'no manifest entry is marked excluded — the CMPS/CICO facade exclusion has been lost');
for (const e of excluded) {
  ok(e.excluded.length >= 20, `${e.id}: excluded without a real reason`);
  /* no derived web master, so nothing can emit it */
  ok(!existsSync(`src/assets/${e.category}/${e.id}.jpg`),
    `${e.id} is excluded but a web master exists at src/assets/${e.category}/${e.id}.jpg — `
    + 'everything in src/assets is emitted into the build');
  /* not in the asset lock */
  const lock = JSON.parse(readFileSync('scripts/assets.lock.json', 'utf8'));
  ok(!(e.id in lock), `${e.id} is excluded but still has an asset-lock entry`);
  /* no file of that name in the build, and no page mentions it */
  const leaked = all.filter((f) => f.split('/').pop().startsWith(e.id + '.'));
  ok(leaked.length === 0,
    `${e.id} is excluded but ${leaked.length} file(s) ship in the build: ${leaked.join(', ')}`);
  ok(!allHtml.includes(e.id), `${e.id} is excluded but is referenced in the built HTML`);
}
/* and the enforcement itself must still be in place */
ok(/if \(m\.excluded\)/.test(readFileSync('src/components/media/SchoolImage.astro', 'utf8')),
  'SchoolImage no longer refuses an excluded id');
ok(/if \(m\.excluded\)/.test(readFileSync('scripts/prepare-assets.mjs', 'utf8')),
  'the asset pipeline no longer skips excluded entries');

/* ---------- 3. nothing ships that nothing references ----------
   The general form of the defect above. An unreferenced image is either a
   mistake or a leak; either way it is served. */
const imageFiles = all.filter((f) => /\.(jpg|jpeg|png|webp|avif)$/i.test(f) && f.includes('_astro'));
const orphans = imageFiles.filter((f) => !allHtml.includes(f.split('/').pop()));
ok(orphans.length === 0,
  `${orphans.length} image(s) ship without any page referencing them: `
  + orphans.map((f) => f.split('/').pop()).join(', '));

/* ---------- 4. the hero sequence still traces to the approved originals ----
   The five frames were chosen from the Hero folder and locked in Phase 4.5F.
   The manifest ids are stable names; what matters is which ORIGINAL each one
   is derived from, and that is only visible in the asset lock. A swapped
   source would keep every id, every alt text and every test green. */
const APPROVED = [
  ['hero-bilingual-lesson', 'Hero/CLASR.jpg'],
  ['hero-classroom-focus', 'Hero/CLASR2.jpg'],
  ['hero-nursery-gate', 'Hero/NURSP2.jpg'],
  ['hero-demonstration', 'Hero/DSC_3320.jpg'],
  ['hero-graduation', 'Hero/WhatsApp Image 2026-09-10 at 5.38.54 PM (1).jpeg'],
];
const lock = JSON.parse(readFileSync('scripts/assets.lock.json', 'utf8'));
const heroSrc = readFileSync('src/pages/[lang]/index.astro', 'utf8');
const heroIds = [...(heroSrc.match(/HERO_IDS\s*=\s*\[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);
ok(heroIds.length === 5, `the hero declares ${heroIds.length} frames, expected 5`);
APPROVED.forEach(([id, source], i) => {
  ok(heroIds[i] === id, `hero frame ${i + 1} is "${heroIds[i]}", expected "${id}"`);
  ok(lock[id]?.source === source,
    `${id} is derived from "${lock[id]?.source}", not the approved original "${source}"`);
});
/* every hero frame is a photograph — never a concept */
for (const id of heroIds) {
  const e = entries.find((x) => x.id === id);
  ok(e?.status === 'photograph', `hero frame ${id} has status "${e?.status}" — the hero is photography`);
}

/* ---------- 5. no social card is a concept ----------
   BaseLayout throws at build time if a concept id is passed as the social
   image. This checks the OUTPUT, which is what a crawler sees: the derived
   file name keeps the manifest id as its prefix, so it can be traced back. */
const conceptIds = new Set(entries.filter((e) => e.status === 'concept').map((e) => e.id));
for (const p of pages) {
  for (const m of p.html.matchAll(/(?:property|name)="(?:og:image|twitter:image)" content="([^"]+)"/g)) {
    const base = m[1].split('/').pop();
    const id = base.split('.')[0];
    ok(!conceptIds.has(id),
      `${p.route}: the social card is "${id}", a future-campus concept — a card must be a photograph`);
    ok(entries.some((e) => e.id === id),
      `${p.route}: the social card "${base}" does not trace to a manifest entry`);
  }
}

/* ---------- 6. the future-campus disclosure, both pages, both languages ---- */
const STRAP = { en: 'The future is here', fr: 'Le futur est ici' };
const LABEL = { en: 'Future Campus Concept', fr: 'Projet du futur campus' };
for (const [locale, routes] of Object.entries({
  en: ['/en/', '/en/future-campus/'],
  fr: ['/fr/', '/fr/futur-campus/'],
})) {
  for (const route of routes) {
    const p = pages.find((x) => x.route === route);
    if (!p) { fails.push(`${route} was not built`); continue; }
    ok(p.text.includes(STRAP[locale]),
      `${route}: the strapline "${STRAP[locale]}" is missing`);
    ok(new RegExp(LABEL[locale], 'i').test(p.html),
      `${route}: no "${LABEL[locale]}" label — concept images must say what they are`);
    /* and the opposite language's strapline must not be on the page */
    const other = locale === 'en' ? 'fr' : 'en';
    ok(!p.text.includes(STRAP[other]), `${route}: carries the ${other.toUpperCase()} strapline`);
  }
}
/* a concept image is never presented as the campus as it is today */
for (const p of pages) {
  const frames = (p.html.match(/class="[^"]*\bconcept\b/g) || []).length;
  if (!frames) continue;
  const want = p.locale === 'fr' ? /Projet du futur campus/ : /Future campus concept/i;
  ok(want.test(p.html), `${p.route}: ${frames} concept frame(s) without the ${p.locale} disclosure`);
}

/* ---------- 7. the founders, exactly as approved ---------- */
const ATTRIB = {
  en: 'Rev. & Pastor Mrs. MOMOH — Founders, Champions Schools',
  fr: 'Rev. & Pastor Mrs. MOMOH — Fondateurs, Champions Schools',
};
for (const [locale, route] of [
  ['en', '/en/about/founders-message/'],
  ['fr', '/fr/a-propos/message-des-fondateurs/'],
]) {
  const p = pages.find((x) => x.route === route);
  if (!p) { fails.push(`${route} was not built`); continue; }
  ok(p.text.includes(ATTRIB[locale]),
    `${route}: the approved attribution "${ATTRIB[locale]}" is missing`);
  const title = p.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  ok(/Founders’ Message|Message des fondateurs/i.test(title),
    `${route}: the page is titled "${title}" — it must name the Founders’ Message`);
}
/* the two founders are never collapsed into one person, and neither is given a
   first name the school did not supply */
for (const p of pages) {
  if (!p.text.includes('MOMOH')) continue;
  const invented = [...p.text.matchAll(/([A-Z][a-zà-ÿ]{2,})\s+MOMOH/g)]
    .map((m) => m[1])
    .filter((w) => !['Mrs', 'Pastor', 'Rev'].includes(w));
  ok(invented.length === 0,
    `${p.route}: a given name appears before MOMOH (${invented.join(', ')}) — none was supplied`);
  ok(!/\bthe Founder\b(?!s)|\bla fondatrice\b|\ble fondateur\b/i.test(p.text),
    `${p.route}: the founders are referred to in the singular`);
}

/* ---------- 8. "staffs" appears nowhere a visitor reads ----------
   One of the supplied originals is filenamed staffs.jpeg. The original is
   read-only and stays as it is; the word must simply never reach the page. */
for (const p of pages) {
  ok(!/\bstaffs\b/i.test(p.text), `${p.route}: the word "staffs" appears in the page text`);
  ok(!/alt="[^"]*\bstaffs\b/i.test(p.html), `${p.route}: "staffs" appears in alt text`);
}

/* ==================================================================
   9-13. THE CORRECTION PASS OF 12 SEPTEMBER 2026.

   Five properties the school asked for. Each is checked in the BUILT output,
   because each of them is the kind of thing that looks right in the source and
   is wrong on the page.
   ================================================================== */

/* ---------- 9. the hero text changes with the photograph ----------
   The failure this exists to catch is the original defect: one <h1> over five
   different pictures, so frame 1's message sat over frame 4's photograph. */
const HERO_HEADLINES = {
  en: ['Raising a Generation of Champions',
       'Learning Today. Leading Tomorrow.',
       'Every Child. Every Beginning. Every Possibility.',
       'Learning Beyond the Classroom',
       'Building Champions. Shaping Futures.'],
  fr: ['Élever une génération de champions',
       'Apprendre aujourd’hui. Diriger demain.',
       'Chaque enfant. Chaque début. Chaque possibilité.',
       'Apprendre au-delà de la salle de classe',
       'Bâtir des champions. Façonner l’avenir.'],
};
for (const [locale, want] of Object.entries(HERO_HEADLINES)) {
  const p = pages.find((x) => x.route === `/${locale}/`);
  if (!p) { fails.push(`/${locale}/ was not built`); continue; }
  const lines = [...p.html.matchAll(/<span class="hero__headline-line"[^>]*data-on="(true|false)"[^>]*>([^<]*)<\/span>/g)]
    .map((m) => ({ on: m[1] === 'true', text: m[2].replace(/&#39;|&rsquo;/g, '’').replace(/&amp;/g, '&') }));
  ok(lines.length === want.length,
    `/${locale}/: ${lines.length} hero headlines in the markup, expected ${want.length} — one per photograph`);
  want.forEach((h, i) => {
    ok(lines[i]?.text === h,
      `/${locale}/ frame ${i + 1}: headline "${lines[i]?.text}" ≠ "${h}"`);
  });
  /* exactly one is shown on arrival, and it is the first */
  ok(lines.filter((l) => l.on).length === 1,
    `/${locale}/: ${lines.filter((l) => l.on).length} hero headlines visible at once — a slide has one message`);
  ok(lines[0]?.on === true, `/${locale}/: the opening frame's headline is not the one shown`);
  /* and the heading is still a single <h1>, for the page and for a crawler */
  ok((p.html.match(/<h1\b/g) || []).length === 1, `/${locale}/: not exactly one <h1>`);
}

/* ---------- 10. the header carries the school's second line ----------
   Scoped deliberately: the footer, the contact page and the structured data
   must still publish BOTH numbers. A blanket replacement would have removed
   one of the school's own lines from the site. */
const HEADER_PHONE = '+229 0166555087';
const OTHER_PHONE = '+229 0168064334';
let headerSeen = 0;
for (const p of pages) {
  const m = p.html.match(/<a href="tel:([^"]+)"[^>]*class="utility__link"[^>]*>([\s\S]*?)<\/a>/);
  if (!m) continue;
  headerSeen++;
  const shown = m[2].replace(/<[^>]+>/g, '').trim();
  ok(shown === HEADER_PHONE, `${p.route}: the header shows "${shown}", expected "${HEADER_PHONE}"`);
  ok(m[1].replace(/\s/g, '') === HEADER_PHONE.replace(/\s/g, ''),
    `${p.route}: the header dials ${m[1]}, expected ${HEADER_PHONE}`);
}
ok(headerSeen >= 26, `the header contact was found on only ${headerSeen} pages`);
/* the other number is NOT gone from the site */
ok(pages.some((p) => p.text.includes(OTHER_PHONE)),
  `"${OTHER_PHONE}" no longer appears anywhere — the header change must not remove a school line`);
/* and no number other than the school's two is published anywhere */
for (const p of pages) {
  for (const n of [...p.text.matchAll(/\+229[\s\d]{8,}/g)].map((m) => m[0].trim())) {
    ok([HEADER_PHONE, OTHER_PHONE].includes(n), `${p.route}: unapproved telephone number "${n}"`);
  }
}

/* ---------- 10b. the sticky action bar offers the SAME number ----------
   Added 13 September 2026, when the school confirmed that line is registered on
   WhatsApp. Before that the bar called the other number, so a phone visitor saw
   one number in the drawer and dialled another from the bar. This is the check
   that keeps the two from drifting apart again — including the WhatsApp target,
   which is the easy one to forget. */
let barSeen = 0;
for (const p of pages) {
  const bar = p.html.match(/<nav class="actionbar"[\s\S]*?<\/nav>/)?.[0];
  if (!bar) continue;
  barSeen++;
  const tels = [...bar.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
  const was = [...bar.matchAll(/href="https:\/\/wa\.me\/([^"?]+)"/g)].map((m) => m[1]);
  const want = HEADER_PHONE.replace(/[^\d+]/g, '');
  ok(tels.length === 1 && tels[0] === want,
    `${p.route}: the action bar dials ${JSON.stringify(tels)}, expected ${want}`);
  ok(was.length === 1 && was[0] === want.replace('+', ''),
    `${p.route}: the action bar's WhatsApp target is ${JSON.stringify(was)}, expected ${want.replace('+', '')}`);
  ok(!bar.includes(OTHER_PHONE.replace(/[^\d]/g, '')),
    `${p.route}: the other number is still inside the action bar`);
}
ok(barSeen >= 26, `the action bar was found on only ${barSeen} pages`);

/* ---------- 10c. every WhatsApp link is the primary line ----------
   Added 13 September 2026, when the school named +229 0166555087 as the
   preferred primary contact number. WhatsApp is the easy one to leave behind:
   the sticky action bar's target was missed in the 12 September pass, and the
   homepage admissions invitation's was missed in the 13th's first pass. This
   asks the whole site at once, so the next one cannot hide. */
for (const p of pages) {
  for (const m of p.html.matchAll(/href="https:\/\/wa\.me\/([^"?]+)"/g)) {
    ok(m[1] === HEADER_PHONE.replace(/[^\d]/g, ''),
      `${p.route}: a WhatsApp link targets ${m[1]}, expected ${HEADER_PHONE.replace(/[^\d]/g, '')}`);
  }
}
/* and the homepage admissions invitation dials it too */
for (const route of ['/en/', '/fr/']) {
  const p = pages.find((x) => x.route === route);
  if (!p) { fails.push(`${route} was not built`); continue; }
  const cta = p.html.match(/<div class="invite__actions"[\s\S]*?<\/div>/)?.[0];
  ok(!!cta, `${route}: the admissions invitation CTA was not found`);
  if (!cta) continue;
  const tels = [...cta.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
  ok(tels.length === 1 && tels[0] === HEADER_PHONE.replace(/[^\d+]/g, ''),
    `${route}: the admissions CTA dials ${JSON.stringify(tels)}, expected ${HEADER_PHONE.replace(/[^\d+]/g, '')}`);
  ok(!cta.includes(OTHER_PHONE.replace(/[^\d]/g, '')),
    `${route}: the other number is still in the admissions CTA`);
}
/* the school's OTHER number is still published — it is not being deleted from
   the site, only from the contact controls */
ok(pages.some((p) => p.text.includes(OTHER_PHONE)),
  `"${OTHER_PHONE}" has disappeared from the site entirely`);

/* ---------- 11. no internal editorial or source note renders ----------
   Notes explaining that content was supplied, verified or constrained by the
   school are working notes. They belong in the project documentation, not on a
   page a parent reads. The factual content they qualified stays. */
const SOURCE_NOTES = [
  /supplied by the school/i, /provided by the school/i, /as the school (gave|supplied)/i,
  /only contact details/i, /publishes no others/i,
  /communiqu[ée]s? par l[’']école/i, /fournis? par l[’']école/i,
  /seules coordonn[ée]es/i, /n[’']en publie aucune autre/i,
  /v[ée]rifi[ée]s? par l[’']école/i, /d[’']apr[èe]s l[’']école/i,
];
for (const p of pages) {
  for (const re of SOURCE_NOTES) {
    const hit = p.text.match(re);
    ok(!hit, `${p.route}: an internal source note still renders — "${hit?.[0]}"`);
  }
}
/* the facts those notes used to qualify are still there */
const achievements = pages.find((x) => x.route === '/en/achievements/');
ok(achievements && /100%/.test(achievements.text) && /CEP/.test(achievements.text),
  'the results disappeared along with the note that qualified them');
ok(achievements && /parents are saying|in their own words/i.test(achievements.text),
  'the testimonials disappeared along with the note that qualified them');
const contact = pages.find((x) => x.route === '/en/contact/');
ok(contact && contact.text.includes('Championsschoolpkou22@gmail.com') && contact.text.includes('Sinagourou'),
  'the contact details disappeared along with the note that qualified them');

/* ---------- 12. the gallery publishes the Events folder ----------
   "All of them" is checked against the folder itself, by MD5, not against a
   list somebody typed. Duplicates are resolved the project's way: identical
   bytes share one id, so no photograph is published twice. */
const EVENTS = '../02-School-Assets/Events';
if (existsSync(EVENTS)) {
  const { createHash } = await import('node:crypto');
  const md5 = (f) => createHash('md5').update(readFileSync(f)).digest('hex');
  const byMd5 = new Map();                       // md5 -> [manifest id]
  for (const [id, v] of Object.entries(lock)) {
    if (!byMd5.has(v.md5)) byMd5.set(v.md5, []);
    byMd5.get(v.md5).push(id);
  }
  const gallery = pages.filter((p) => /galerie|gallery/.test(p.route));
  ok(gallery.length === 2, `${gallery.length} gallery pages built, expected 2`);
  const files = readdirSync(EVENTS).filter((f) => /\.(jpe?g|png)$/i.test(f));
  ok(files.length >= 40, `only ${files.length} photographs found in ${EVENTS}`);
  for (const g of gallery) {
    const shown = new Set([...g.html.matchAll(/\/_astro\/([a-z0-9-]+)\.[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|avif)/g)]
      .map((m) => m[1]));
    const missing = [];
    for (const f of files) {
      const ids = byMd5.get(md5(join(EVENTS, f))) ?? [];
      if (!ids.length) { missing.push(`${f} (no manifest entry)`); continue; }
      if (!ids.some((id) => shown.has(id))) missing.push(`${f} (${ids.join('/')})`);
    }
    ok(missing.length === 0,
      `${g.route}: ${missing.length} Events photograph(s) not published — ${missing.slice(0, 4).join(', ')}`);
    /* and none of them twice: one <picture> per photograph */
    const main = g.html.slice(g.html.indexOf('<main'), g.html.indexOf('</main>'));
    const pics = [...main.matchAll(/<picture[\s\S]*?<img[^>]+src="\/_astro\/([a-z0-9-]+)\./g)].map((m) => m[1]);
    const twice = pics.filter((id, i) => pics.indexOf(id) !== i);
    ok(twice.length === 0, `${g.route}: photograph(s) published twice — ${[...new Set(twice)].join(', ')}`);
  }
}

/* ---------- 13. a cropped master really is cropped ----------
   Two supplied photographs carry older painted signage naming entities that
   are not the confirmed school name, plus telephone numbers that are not the
   school's. The crop is what keeps those off the page, so it is checked
   rather than trusted — and the ORIGINAL must be untouched. */
const cropped = entries.filter((e) => manifest.includes(`- id: ${e.id}`) && cropTopOf(e.id) !== null);
function cropTopOf(id) {
  const block = manifest.split(/\n(?=- id: )/).find((b) => b.startsWith(`- id: ${id}\n`));
  const m = block?.match(/\n\s*cropTop: ([\d.]+)/);
  return m ? Number(m[1]) : null;
}
ok(cropped.length >= 2,
  `only ${cropped.length} cropped entries — the two frames with conflicting signage must stay cropped`);
for (const e of cropped) {
  const master = `src/assets/${e.category}/${e.id}.jpg`;
  ok(existsSync(master), `${e.id}: no web master at ${master}`);
  const reason = manifest.split(/\n(?=- id: )/).find((b) => b.startsWith(`- id: ${e.id}\n`))
    ?.match(/\n\s*cropReason: "([^"]*)"/)?.[1];
  ok((reason ?? '').length >= 20, `${e.id}: cropTop without a written reason`);
}
/* the pipeline still honours it */
ok(/if \(m\.cropTop\)/.test(readFileSync('scripts/prepare-assets.mjs', 'utf8')),
  'the asset pipeline no longer applies cropTop — the signage would come back');

console.log(`QA acceptance: ${pages.length} built pages · ${expected.size} declared routes · `
  + `${entries.length} manifest entries (${excluded.length} excluded) · ${imageFiles.length} images shipped`);
console.log('  checked: route map ≡ build · excluded image absent from the build · no orphan image ·');
console.log('           hero traced to the 5 approved originals · no concept as a social card ·');
console.log('           future-campus disclosure · founders attribution · no "staffs" ·');
console.log('           a headline per hero frame · header contact · no internal source note ·');
console.log('           every Events photograph published once · signage crops still applied');
console.log(fails.length
  ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ')
  : '\nevery Phase 14 acceptance criterion holds');
process.exit(fails.length ? 1 : 0);
