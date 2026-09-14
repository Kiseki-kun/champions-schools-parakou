/**
 * SCHOOL FACTS — Phase 8.
 *
 * The site states a small number of facts about a real school, over and over,
 * in two languages. This suite pins each of them to the approved source and
 * fails if any page disagrees — including the metadata and the structured data,
 * where a wrong fact is invisible to a reader but not to a search engine.
 *
 * The expected values below are the school's own, as recorded in
 * 01-School-Information/school-information.docx and §9.1/§9.3 of the discovery
 * document. Where the source needed a copy-editing correction (§9.4) the
 * corrected form is the expected one and the reason is stated inline.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';
const fails = [];
const note = (m) => fails.push(m);

/* ---- the approved facts ---- */
const SCHOOL_NAME = 'Champions Schools Parakou';
const ADDRESS = 'Vers rond point la vie, Sinagourou, Parakou, Benin Republic';
const ADDRESS_FR = 'Vers rond point la vie, Sinagourou, Parakou, République du Bénin';
const PHONES = ['+229 0168064334', '+229 0166555087'];
const EMAIL = 'Championsschoolpkou22@gmail.com';
const MOTTO = 'Godliness, Excellence, Leadership';
const FOUNDED = '2009';
const FOUNDERS = 'Rev. & Pastor Mrs. MOMOH';
const HEADS = [
  'M. Houtunde Houngbedji Sylvain',
  'Mrs. Afolabi Demilade',
  'Mr. Obaje Joseph',
  'Mme Idrissou Djoueratou',
];

/* Spellings that must NEVER appear anywhere on the site. Each is a real trap:
   a variant the source document or an earlier draft actually contained. */
const BANNED = [
  ['Goodliness', 'the source document\'s misspelling of the motto (§9.4)'],
  ['Champion Schools', 'the singular form; the school confirmed the plural (§9.1)'],
  ['Proprietor', 'the brief forbids it — the term is Founders'],
  ['Proprietress', 'the brief forbids it — the term is Founders'],
  ['Septmeber', 'the source document\'s typo (§9.4)'],
  ['photgraph', 'the source document\'s typo (§9.4)'],
  ['Directeur Générale', 'corrected to Directeur Général (§9.4)'],
  ['Épanouissement Globale', 'corrected to Épanouissement global (§9.4)'],
  ['CNPS', 'a sub-entity name that is not the confirmed school name (§9.1)'],
  ['CMPS', 'a sub-entity name that is not the confirmed school name (§9.1)'],
  ['CICO', 'a sub-entity name that is not the confirmed school name (§9.1)'],
  ['Champions International College', 'not the confirmed school name (§9.1)'],
  ['Champions Nursery & Primary School', 'not the confirmed school name (§9.1)'],
  ['Mme Djoueratou', 'the short form; the school confirmed Mme Idrissou Djoueratou (R2-10)'],
  ['lorem', 'placeholder text'],
  ['TODO', 'placeholder text'],
  ['being prepared', 'the Phase 4 placeholder notice'],
];

/* ---- collect the built pages ---- */
async function walk(d, acc = []) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}
const files = (await walk(DIST)).sort();
const strip = (html, foldApostrophes = true) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  /* The site uses the typographic apostrophe throughout; the expectations below
     are written with the plain one, so both are folded to the plain form before
     comparing. Nothing else about the text is altered. */
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'").replace(/&rsquo;/g, '’')
  .replace(/&quot;/g, '"').replace(/&laquo;|&raquo;/g, '"')
  .replace(/[’‘]/g, (c) => (foldApostrophes ? "'" : c))
  .replace(/\s+/g, ' ');

const pages = [];
for (const f of files) {
  const html = await readFile(f, 'utf8');
  pages.push({
    route: '/' + f.replace(/^dist\//, '').replace(/index\.html$/, ''),
    html,
    text: strip(html),
    /* The same text with the apostrophes left exactly as the page renders
       them — check 14 is the one thing that must see the difference. */
    rawText: strip(html, false),
    locale: f.includes('/en/') ? 'en' : 'fr',
  });
}

/* ---- 1. banned spellings, anywhere, including attributes ---- */
for (const p of pages) {
  const hay = p.html;                      // markup too: alt text and metadata
  for (const [bad, why] of BANNED) {
    if (hay.includes(bad)) note(`${p.route}: contains "${bad}" — ${why}`);
  }
}

/* ---- 2. the school name is spelled one way, everywhere ---- */
for (const p of pages) {
  const names = [...p.text.matchAll(/Champions? Schools?(?: Parakou)?/g)].map((m) => m[0]);
  for (const n of new Set(names)) {
    if (!['Champions Schools', 'Champions Schools Parakou', 'Champions School'].includes(n))
      note(`${p.route}: school name variant "${n}"`);
  }
  /* "Champions School" singular must not appear: the source's testimonial
     attributions used it and they were normalised. */
  if (/Champions School\b(?!s)/.test(p.text)) note(`${p.route}: singular "Champions School"`);
}

/* ---- 3. contact details ---- */
for (const p of pages) {
  for (const phone of [...p.text.matchAll(/\+229[\s\d]{8,}/g)].map((m) => m[0].trim())) {
    if (!PHONES.includes(phone)) note(`${p.route}: telephone "${phone}" is not one of the school's`);
  }
  for (const mail of [...p.text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map((m) => m[0])) {
    if (mail !== EMAIL) note(`${p.route}: email "${mail}" is not the school's`);
  }
  for (const mail of [...p.html.matchAll(/mailto:([^"']+)/g)].map((m) => m[1])) {
    if (mail !== EMAIL) note(`${p.route}: mailto "${mail}" is not the school's`);
  }
}

/* ---- 4. EVERY occurrence of the address is the approved one ----
   Counting matters: a page that prints the address twice (a contact block and
   the footer) must not get one of them right and one of them wrong. */
for (const p of pages) {
  const mentions = (p.text.match(/Sinagourou/g) || []).length;
  if (!mentions) continue;
  const want = p.locale === 'fr' ? ADDRESS_FR : ADDRESS;
  const correct = p.text.split(want).length - 1;
  if (correct !== mentions)
    note(`${p.route}: ${mentions} address mention(s) but only ${correct} in the approved ${p.locale.toUpperCase()} form`);
}

/* ---- 5. the motto, wherever it appears ---- */
for (const p of pages) {
  if (/Godliness/.test(p.text) && !p.text.includes(MOTTO) && !/Godliness\. Excellence\. Leadership\./.test(p.text))
    note(`${p.route}: "Godliness" appears but not in an approved motto form`);
}

/* ---- 6. founders terminology ---- */
for (const p of pages) {
  if (p.text.includes('MOMOH') && !p.text.includes(FOUNDERS))
    note(`${p.route}: the founders are named but not as "${FOUNDERS}"`);
  /* Singular "Founder" (not Founders / Founders') is the trap here. */
  if (p.locale === 'en' && /\bFounder\b(?!s)/.test(p.text))
    note(`${p.route}: singular "Founder" — the school has two founders`);
  if (p.locale === 'fr' && /\bfondateur\b(?!s)/i.test(p.text))
    note(`${p.route}: singular "fondateur" — the school has two founders`);
}

/* ---- 7. heads of section: every name appears with no variant spelling ---- */
const leadership = pages.filter((p) => /direction|leadership/.test(p.route));
for (const p of leadership) {
  for (const h of HEADS) if (!p.text.includes(h)) note(`${p.route}: missing head "${h}"`);
}
/* the Censeur's approved form uses "Mme" without a full stop */
for (const p of pages) {
  if (/Mme\.\s*Idrissou/.test(p.text)) note(`${p.route}: "Mme." with a full stop — the approved form is "Mme"`);
}

/* ---- 8. structured data agrees with the same facts ---- */
for (const p of pages) {
  const m = p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) { if (p.route !== '/404.html' && p.route !== '/') note(`${p.route}: no JSON-LD`); continue; }
  let ld; try { ld = JSON.parse(m[1]); } catch { note(`${p.route}: JSON-LD does not parse`); continue; }
  if (ld.name !== SCHOOL_NAME) note(`${p.route}: JSON-LD name "${ld.name}"`);
  if (ld.foundingDate !== FOUNDED) note(`${p.route}: JSON-LD foundingDate "${ld.foundingDate}"`);
  if (ld.email !== EMAIL) note(`${p.route}: JSON-LD email "${ld.email}"`);
  if (JSON.stringify(ld.telephone) !== JSON.stringify(PHONES))
    note(`${p.route}: JSON-LD telephone ${JSON.stringify(ld.telephone)}`);
  if (ld['@type'] !== 'School') note(`${p.route}: JSON-LD @type "${ld['@type']}"`);
  /* nothing the source does not support */
  for (const banned of ['aggregateRating', 'review', 'award', 'numberOfStudents', 'accreditation'])
    if (banned in ld) note(`${p.route}: JSON-LD carries unsupported field "${banned}"`);
}

/* ---- 9. metadata names the school correctly and claims nothing extra ---- */
for (const p of pages) {
  if (p.route === '/' || p.route === '/404.html') continue;
  const og = p.html.match(/property="og:site_name" content="([^"]*)"/)?.[1];
  if (og !== SCHOOL_NAME) note(`${p.route}: og:site_name "${og}"`);
  const desc = p.html.match(/name="description" content="([^"]*)"/)?.[1] ?? '';
  for (const claim of ['best', 'meilleure', 'number one', 'leading school', 'accredited', 'agréé'])
    if (new RegExp(`\\b${claim}\\b`, 'i').test(desc))
      note(`${p.route}: meta description makes an unsupported claim ("${claim}")`);
}

/* ---- 10. a concept image is never described as a present-day photograph ---- */
const CONCEPT_WORDS_EN = /Future campus concept:/;
const CONCEPT_WORDS_FR = /Projet du futur campus/;
for (const p of pages) {
  const alts = [...p.html.matchAll(/alt="([^"]*)"/g)].map((m) => m[1]);
  for (const a of alts) {
    if (/campus/i.test(a) && !/future|futur/i.test(a))
      note(`${p.route}: alt text mentions the campus without saying it is the future one: "${a}"`);
  }
  /* wherever a concept frame is rendered, the label must be with it */
  const frames = (p.html.match(/class="[^"]*concept-frame/g) || []).length;
  const labels = (p.html.match(/Future Campus Concept|Projet de futur campus|Concept du futur campus/gi) || []).length;
  if (frames && !labels) note(`${p.route}: ${frames} concept frame(s) with no visible label`);
  if (frames) {
    const want = p.locale === 'fr' ? CONCEPT_WORDS_FR : CONCEPT_WORDS_EN;
    if (!want.test(p.html)) note(`${p.route}: concept images without the ${p.locale} alt-text prefix`);
  }
}

/* ---- 11. no English left on a French page, and vice versa ---- */
const EN_ON_FR = [
  'Read more', 'Learn more', 'Contact us', 'Our mission', 'Our vision',
  'School life', 'Admissions requirements', 'Coming soon', 'Home',
];
const FR_ON_EN = ['Nos niveaux', 'En savoir plus', 'Vie scolaire', 'Nous contacter', 'Accueil'];
for (const p of pages) {
  if (p.route === '/' || p.route === '/404.html') continue;   // 404 is deliberately bilingual
  const list = p.locale === 'fr' ? EN_ON_FR : FR_ON_EN;
  for (const s of list) {
    if (new RegExp(`(^|[\\s>"])${s}([\\s<".,!?]|$)`).test(p.text))
      note(`${p.route}: ${p.locale === 'fr' ? 'English' : 'French'} phrase "${s}" on a ${p.locale.toUpperCase()} page`);
  }
}

/* ---- 12. the structured facts, on the pages that carry them ----
   Each row is the school's own wording from §9.3, with the §9.4 corrections
   applied. If a page that is supposed to publish one of these drops or alters
   it, that is a factual regression and this fails. */
const STRUCTURED = [
  // [route fragment, locale, [strings that must all appear], what it is]
  ['/admissions/', 'en', ['Birth Certificate', '2 passport photographs', 'Transfer Certificate', 'Photocopy of last report card'], 'admission requirements'],
  ['/admissions/', 'fr', ['Acte de naissance', "2 photos d'identité", 'Certificat de transfert', 'Photocopie du dernier bulletin'], "conditions d'admission"],
  ['/calendar-and-hours/', 'en', ['September – December', 'January to early April', 'April to June'], 'the three terms'],
  ['/calendrier-et-horaires/', 'fr', ['Septembre – décembre', 'Janvier à début avril', 'Avril à juin'], 'les trois trimestres'],
  ['/calendar-and-hours/', 'en', ['7:30 – 2:30', '7:30 – 3:30', '7:00 – 4:00'], 'school hours'],
  ['/calendrier-et-horaires/', 'fr', ['7h30 – 14h30', '7h30 – 15h30', '7h00 – 16h00'], 'les horaires'],
  ['/school-life/', 'en', ['Jet Club', 'Press Club', 'Literary Club', 'Arts and Drama Club'], 'the clubs'],
  ['/vie-scolaire/', 'fr', ['Jet Club', 'Press Club', 'Literary Club', 'Arts and Drama Club'], 'les clubs'],
  ['/achievements/', 'en', ['100%', 'CEP', '2023 · 2025 · 2026', 'BEPC', 'English Challenge'], 'the record'],
  ['/distinctions/', 'fr', ['100 %', 'CEP', '2023 · 2025 · 2026', 'BEPC', 'English Challenge'], 'le palmarès'],
  ['/academics/', 'en', ['Nursery 1 – 3', 'Primary 1 – 6', 'JSS 1 – SS 1', 'Maternelle 1 au 3', 'CI au CM2', '6ème au 3ème'], 'the classes offered'],
  ['/programmes/', 'fr', ['Maternelle 1 au 3', 'CI au CM2', '6ème au 3ème', 'Nursery 1 – 3', 'Primary 1 – 6', 'JSS 1 – SS 1'], 'les classes proposées'],
  ['/academics/', 'en', ['50/50', 'Native-Speaking Educators', 'Translanguaging'], 'the bilingual model'],
  ['/programmes/', 'fr', ['50/50', 'enseignants natifs', 'translanguaging'], 'le modèle bilingue'],
];
for (const [frag, loc, strings, what] of STRUCTURED) {
  const p = pages.find((x) => x.route.endsWith(frag) && x.locale === loc);
  if (!p) { note(`no ${loc} page ending "${frag}" — cannot check ${what}`); continue; }
  for (const s of strings) {
    if (!p.text.toLowerCase().includes(s.toLowerCase()))
      note(`${p.route}: ${what} — "${s}" is missing`);
  }
}

/* ---- 13. the four heads carry the same title on every page that shows them ----
   Every title the school supplied is capitalised, so the two French renderings
   of the English titles are capitalised to match. A page that shows one of the
   four must show its approved title and no variant of it. */
const TITLES = {
  en: {
    'M. Houtunde Houngbedji Sylvain': 'Directeur Général',
    'Mrs. Afolabi Demilade': 'Headmistress — Nursery',
    'Mr. Obaje Joseph': 'Headmaster — Primary',
    'Mme Idrissou Djoueratou': 'Censeur du Collège',
  },
  fr: {
    'M. Houtunde Houngbedji Sylvain': 'Directeur Général',
    'Mrs. Afolabi Demilade': 'Directrice de la Maternelle',
    'Mr. Obaje Joseph': 'Directeur du Primaire',
    'Mme Idrissou Djoueratou': 'Censeur du Collège',
  },
};
for (const p of pages) {
  const t = TITLES[p.locale];
  if (!t) continue;
  for (const [name, title] of Object.entries(t)) {
    if (!p.text.includes(name)) continue;                   // this page does not show them
    if (!p.text.includes(title)) note(`${p.route}: "${name}" is shown without the title "${title}"`);
  }
}

/* ---- 14. one apostrophe, everywhere ----
   The site uses the typographic apostrophe. A plain one between two letters is
   a stray from an earlier draft, and it shows: the same phrase then renders two
   different ways on two pages. */
for (const p of pages) {
  const strays = [...p.rawText.matchAll(/\S*[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]\S*/g)].map((m) => m[0]);
  if (strays.length)
    note(`${p.route}: plain apostrophe in ${strays.length} word(s) — e.g. ${strays.slice(0, 3).join(', ')}`);
}

console.log(`pages checked: ${pages.length}  ·  banned spellings: ${BANNED.length}  ·  structured facts: ${STRUCTURED.length} groups  ·  facts pinned: name, address, phones, email, motto, founding year, founders, 4 heads, JSON-LD, metadata`);
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nevery school fact on the site matches the approved source');
process.exit(fails.length ? 1 : 0);
