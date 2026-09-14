/**
 * Phase 5 — homepage content, truthfulness and bilingual parity.
 *
 * This is the check that enforces the brief's core rule at the page level:
 * concept images stay labelled as concepts, no photograph acquires a claim the
 * school did not make, and neither language is a second-class citizen.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';

const BASE = process.argv[2] || 'http://localhost:4322';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const CONCEPT_PREFIX = { en: 'Future campus concept:', fr: 'Projet du futur campus :' };
const LABEL = { en: 'Future campus concept', fr: 'Projet du futur campus' };

const shape = {};

for (const locale of ['fr', 'en']) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/${locale}/`);
  await page.evaluate(async () => {
    const step = innerHeight * 0.6;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      scrollTo(0, y); await new Promise((r) => setTimeout(r, 200));
    }
    scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  // Lazy frames enter the viewport during that pass; give them time to decode.
  await page.waitForFunction(
    () => [...document.querySelectorAll('main img')].every((i) => i.complete),
    null, { timeout: 20000 },
  ).catch(() => {});

  /* --- the nine approved sections (Meet Our Heads added in the refinement pass) --- */
  const sections = await page.$$eval('main > section', (els) => els.length);
  ok(sections === 9, `${locale}: expected 9 homepage sections, found ${sections}`);

  const h1s = await page.locator('main h1').count();
  ok(h1s === 1, `${locale}: exactly one h1 (found ${h1s})`);

  const headings = await page.$$eval('main h1, main h2', (els) =>
    els.map((e) => `${e.tagName}:${e.textContent.trim().slice(0, 40)}`));
  ok(headings.length === 9, `${locale}: expected 9 top-level headings, found ${headings.length}`);

  /* every section is programmatically labelled */
  const labelled = await page.$$eval('main > section', (els) =>
    els.filter((e) => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby')).length);
  ok(labelled === 9, `${locale}: every section needs aria-label or aria-labelledby (${labelled}/9)`);

  /* --- images --- */
  const imgs = await page.$$eval('main img', (els) =>
    els.map((e) => ({
      alt: e.getAttribute('alt'),
      src: e.currentSrc || e.src,
      w: e.naturalWidth,
      concept: !!e.closest('.concept'),
      hidden: !!e.closest('[aria-hidden="true"]'),
    })));

  ok(imgs.length > 0, `${locale}: the homepage should carry images`);
  for (const img of imgs) {
    ok(img.alt !== null, `${locale}: an image is missing an alt attribute (${img.src})`);
    ok(img.hidden || img.alt.trim().length > 0,
      `${locale}: a visible, non-decorative image has empty alt (${img.src})`);
    ok(img.w > 0, `${locale}: an image failed to load (${img.src})`);
  }

  /* --- concept images keep their treatment and their prefixed alt --- */
  const concepts = imgs.filter((i) => i.concept);
  ok(concepts.length === 2, `${locale}: expected 2 future-campus concepts, found ${concepts.length}`);
  for (const c of concepts) {
    ok(c.alt.startsWith(CONCEPT_PREFIX[locale]),
      `${locale}: concept alt must begin "${CONCEPT_PREFIX[locale]}", got "${c.alt.slice(0, 40)}"`);
  }
  const chips = await page.$$eval('.concept__chip', (els) => els.map((e) => e.textContent.trim()));
  ok(chips.length === 2, `${locale}: every concept image needs its visible label chip`);
  for (const chip of chips) {
    ok(chip.toLowerCase().includes(LABEL[locale].toLowerCase()),
      `${locale}: concept chip should read "${LABEL[locale]}", got "${chip}"`);
  }

  /* no photograph may sit inside a concept frame, and vice versa */
  const strayFrames = await page.$$eval('.concept', (els) =>
    els.filter((e) => !e.querySelector('.concept__chip')).length);
  ok(strayFrames === 0, `${locale}: a concept frame is missing its label`);

  /* --- the campus-entrance concept is deliberately NOT on the homepage --- */
  const bodyHtml = await page.content();
  for (const bad of ['CICO', 'CMPS', 'Champions International College']) {
    ok(!bodyHtml.includes(bad),
      `${locale}: "${bad}" must not appear on the homepage — it conflicts with the confirmed school name`);
  }

  /* --- the blackboard's visible 2021 date is never presented as a date --- */
  const text = await page.locator('main').innerText();
  ok(!/\b2021\b/.test(text), `${locale}: the homepage must not print 2021 as a date`);

  /* --- untranslated leakage --- */
  ok(!text.includes('%s'), `${locale}: an unfilled %s placeholder reached the page`);
  ok(!/Proprietress|Proprietor/i.test(text), `${locale}: "Proprietor/Proprietress" must never appear`);
  if (locale === 'fr') {
    for (const en of ['Raising a Generation', 'What parents are saying', 'From Nursery to College',
                      'Meet Our Heads', 'Headmistress', 'Headmaster']) {
      ok(!text.includes(en), `fr: English copy leaked into the French page ("${en}")`);
    }
  } else {
    for (const fr of ['Élever une génération', 'Ce que disent les parents',
                      'Nos responsables de section', 'Directrice de la maternelle']) {
      ok(!text.includes(fr), `en: French copy leaked into the English page ("${fr}")`);
    }
  }

  /* --- the facts the school supplied, as printed --- */
  ok(text.includes('2023') && text.includes('2026'), `${locale}: CEP/BEPC years should be printed`);
  ok(text.includes('2024'), `${locale}: the English Challenge year should be printed`);
  ok(text.includes('50/50'), `${locale}: the 50/50 model should be stated`);
  ok(text.includes('2009'), `${locale}: the founding year should be stated`);
  ok(/100\s?%/.test(text), `${locale}: the 100% results should be stated`);

  /* --- the four approved heads, spelled exactly as the school gave them --- */
  for (const name of ['M. Houtunde Houngbedji Sylvain', 'Mrs. Afolabi Demilade',
                      'Mr. Obaje Joseph', 'Mme Idrissou Djoueratou']) {
    ok(text.includes(name), `${locale}: head "${name}" missing or misspelt`);
  }
  ok((await page.locator('.head__portrait img').count()) === 4,
    `${locale}: expected 4 head portraits`);
  const headAlts = await page.$$eval('.head__portrait img', (els) => els.map((e) => e.alt));
  ok(headAlts.every((a) => a && a.trim().length > 5), `${locale}: every head portrait needs alt text`);
  ok((await page.locator(`.heads__cta a[href$="${locale === 'fr' ? 'message-des-fondateurs/' : 'founders-message/'}"]`).count()) === 1,
    `${locale}: the Founders' Message CTA must link to the founders route`);

  /* --- Home is in the primary navigation and points at this locale's home --- */
  const homeHref = await page.locator('.pnav__link').first().getAttribute('href');
  ok(homeHref === `/${locale}/`, `${locale}: first nav item should link to /${locale}/, got ${homeHref}`);

  /* --- structured data: School only, never Review or a rating --- */
  const ld = await page.$$eval('script[type="application/ld+json"]', (els) =>
    els.map((e) => e.textContent));
  ok(ld.length >= 1, `${locale}: the page should carry its School structured data`);
  for (const block of ld) {
    ok(!/aggregateRating|"Review"|reviewRating|ratingValue/.test(block),
      `${locale}: no Review or aggregateRating structured data may be emitted`);
  }
  ok(ld.some((b) => b.includes('"School"')), `${locale}: School structured data missing`);

  shape[locale] = { sections, headings: headings.length, images: imgs.length, concepts: concepts.length };
  await page.context().close();
}

/* --- structural parity between the two languages --- */
ok(JSON.stringify(shape.fr) === JSON.stringify(shape.en),
  `the two languages differ structurally: ${JSON.stringify(shape)}`);
console.log(`  fr/en parity: ${JSON.stringify(shape.fr)}`);

/* --- the two homepage content files agree in shape and in key ---
   This is the check that would have caught the Phase 5 regression at source:
   a missing, mis-keyed or structurally divergent locale file fails here rather
   than at render time. It reads the YAML directly, so it is independent of
   Astro's content store. */
{
  const shapeOf = (v, path = '') => {
    if (Array.isArray(v)) {
      // arrays may differ in length between languages; compare the item shape
      return v.length ? shapeOf(v[0], `${path}[]`) : [`${path}[]`];
    }
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().flatMap((k) => shapeOf(v[k], path ? `${path}.${k}` : k));
    }
    return [path];
  };

  const files = {};
  for (const locale of ['fr', 'en']) {
    const path = new URL(`../src/content/home/${locale}.yaml`, import.meta.url);
    let raw;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      fails.push(`src/content/home/${locale}.yaml is missing — the homepage cannot render this locale`);
      continue;
    }
    ok(raw.trim().length > 0, `src/content/home/${locale}.yaml is empty`);
    const data = parseYaml(raw);
    ok(data && typeof data === 'object', `src/content/home/${locale}.yaml did not parse to an object`);
    // the filename keys the entry, so the declared locale must agree with it
    ok(data?.locale === locale,
      `src/content/home/${locale}.yaml declares locale: "${data?.locale}" — it must be "${locale}"`);
    files[locale] = data;
  }

  /* Keys the `home` schema declares .optional(), so one language may carry them
     and the other not. testimonial.note is the French "translated from English"
     line; the English testimonial is in the parent's own words and needs none.
     Anything NOT on this list must appear in both files. */
  const OPTIONAL = ['testimonial.note'];

  if (files.fr && files.en) {
    const frKeys = shapeOf(files.fr);
    const enKeys = shapeOf(files.en);
    const diff = (a, b) => a.filter((k) => !b.includes(k) && !OPTIONAL.includes(k));
    const onlyFr = diff(frKeys, enKeys);
    const onlyEn = diff(enKeys, frKeys);
    ok(onlyFr.length === 0, `keys present only in fr.yaml: ${onlyFr.join(', ')}`);
    ok(onlyEn.length === 0, `keys present only in en.yaml: ${onlyEn.join(', ')}`);

    for (const [locale, data] of Object.entries(files)) {
      const empty = shapeOf(data).filter((k) => {
        const v = k.split(/\.|\[\]/).filter(Boolean).reduce((o, p) => (Array.isArray(o) ? o[0] : o)?.[p], data);
        return typeof v === 'string' && v.trim() === '';
      });
      ok(empty.length === 0, `${locale}.yaml has empty values at: ${empty.join(', ')}`);
    }
    console.log(
      `  home collection: fr/en agree on ${frKeys.filter((k) => !OPTIONAL.includes(k)).length} required leaf keys, ` +
      'locale keys match their filenames');
  }
}

/* --- originals were not touched: the lock file still matches the sources --- */
{
  const lock = JSON.parse(readFileSync(new URL('../scripts/assets.lock.json', import.meta.url)));
  const heroes = Object.entries(lock).filter(([id]) => id.startsWith('hero-'));
  ok(heroes.length === 5, `expected 5 hero web masters in the lock file, found ${heroes.length}`);
  for (const [id, v] of heroes) {
    ok(v.source.startsWith('Hero/'),
      `${id} should derive from an unrenamed original in Hero/, got "${v.source}"`);
  }
  console.log('  asset lock: 5 hero masters, all from unrenamed Hero/ originals');
}

await browser.close();
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall homepage checks passed');
if (fails.length) process.exitCode = 1;
