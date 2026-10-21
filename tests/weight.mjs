/**
 * First-view transfer weight, measured at 390px on every page.
 *
 * The budget is per page, on first load with an empty cache: fonts and the
 * stylesheet are paid once and then shared, so the number that matters for an
 * inner page is how much IMAGE it pulls above the fold. A page over the budget
 * is a real failure — it is a parent on a phone in Parakou waiting.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const BUDGET_KB = 600;          // total first view, 390px viewport
const IMAGE_BUDGET_KB = 400;    // of which images

const ROUTES = [
  '/fr/', '/en/',
  '/fr/a-propos/', '/en/about/',
  '/fr/a-propos/message-des-fondateurs/', '/en/about/founders-message/',
  '/fr/a-propos/direction/', '/en/about/leadership/',
  '/fr/programmes/', '/en/academics/',
  '/fr/admissions/', '/en/admissions/',
  '/fr/calendrier-et-horaires/', '/en/calendar-and-hours/',
  '/fr/vie-scolaire/', '/en/school-life/',
  '/fr/vie-scolaire/galerie/', '/en/school-life/gallery/',
  '/fr/distinctions/', '/en/achievements/',
  '/fr/futur-campus/', '/en/future-campus/',
  '/fr/contact/', '/en/contact/',
  '/fr/confidentialite/', '/en/privacy/',
];

const b = await chromium.launch();
const fails = [];
let worst = { kb: 0, route: '' };

for (const p of ROUTES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  let bytes = 0; const byType = {};
  page.on('response', async (r) => {
    try {
      const buf = await r.body();
      const t = r.request().resourceType();
      bytes += buf.length; byType[t] = (byType[t] || 0) + buf.length;
    } catch {}
  });
  await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const kb = bytes / 1024;
  const imgKb = (byType.image || 0) / 1024;
  console.log(`  ${p.padEnd(38)} ${kb.toFixed(0).padStart(5)} KB   ` +
    Object.entries(byType).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}KB`).join('  '));
  if (kb > worst.kb) worst = { kb, route: p };
  if (kb > BUDGET_KB) fails.push(`${p}: ${kb.toFixed(0)}KB first view (budget ${BUDGET_KB}KB)`);
  if (imgKb > IMAGE_BUDGET_KB) fails.push(`${p}: ${imgKb.toFixed(0)}KB of images (budget ${IMAGE_BUDGET_KB}KB)`);
  await ctx.close();
}
/* ---------- the hero must not fetch the whole sequence to show one frame ----
   Every frame is absolutely positioned over the same rectangle, so all five are
   inside the viewport and loading="lazy" defers none of them. The Phase 12
   audit measured all five arriving before first paint — 407KB at 1280 and
   133KB at 375 for four photographs nobody can see. The fix is in
   HeroSequence.astro (data-armed); this is what stops it coming back. */
for (const width of [375, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const frames = new Set();
  page.on('response', (r) => {
    const f = r.url().split('/').pop() ?? '';
    if (r.request().resourceType() === 'image' && f.startsWith('hero-')) frames.add(f.split('.')[0]);
  });
  await page.goto(`${BASE}/fr/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  console.log(`  hero @${width}: ${frames.size} distinct frame(s) fetched before any interaction`);
  /* the opening frame, its neighbour armed on idle, and the same photograph
     reused in the split composition — never the whole sequence */
  if (frames.size > 2) fails.push(
    `the hero fetched ${frames.size} of its 5 photographs at ${width}px before the visitor `
    + `asked for any of them (${[...frames].join(', ')})`);
  await ctx.close();
}

await b.close();

console.log(`\n  heaviest page: ${worst.route} at ${worst.kb.toFixed(0)}KB (budget ${BUDGET_KB}KB)`);
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall pages within the weight budget');
if (fails.length) process.exitCode = 1;
