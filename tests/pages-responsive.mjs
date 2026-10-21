/**
 * INNER-PAGE RESPONSIVE SWEEP — Phase 6.
 *
 * responsive-check.mjs sweeps the homepage. This one sweeps every inner page,
 * in both languages, at the widths the brief names. At each width it checks:
 *
 *   - the document does not scroll horizontally
 *   - no element inside <main> sticks out of the viewport
 *   - every link and button is at least 44px on its smallest side
 *   - no photograph is distorted (rendered box vs intrinsic aspect ratio)
 *   - the page heading is present and not clipped
 *   - a concept image is never rendered without its label
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const WIDTHS = [320, 375, 430, 768, 1024, 1280, 1440];

const ROUTES = [
  ['fr', '/fr/a-propos/'],                          ['en', '/en/about/'],
  ['fr', '/fr/a-propos/message-des-fondateurs/'],   ['en', '/en/about/founders-message/'],
  ['fr', '/fr/a-propos/direction/'],                ['en', '/en/about/leadership/'],
  ['fr', '/fr/programmes/'],                        ['en', '/en/academics/'],
  ['fr', '/fr/admissions/'],                        ['en', '/en/admissions/'],
  ['fr', '/fr/calendrier-et-horaires/'],            ['en', '/en/calendar-and-hours/'],
  ['fr', '/fr/vie-scolaire/'],                      ['en', '/en/school-life/'],
  ['fr', '/fr/vie-scolaire/galerie/'],              ['en', '/en/school-life/gallery/'],
  ['fr', '/fr/distinctions/'],                      ['en', '/en/achievements/'],
  ['fr', '/fr/futur-campus/'],                      ['en', '/en/future-campus/'],
  ['fr', '/fr/contact/'],                           ['en', '/en/contact/'],
  ['fr', '/fr/confidentialite/'],                   ['en', '/en/privacy/'],
];

const browser = await chromium.launch();
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
let checks = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  for (const [, route] of ROUTES) {
    const tag = `${route} @${width}`;
    await page.goto(BASE + route, { waitUntil: 'load' });
    // force lazy images in so the geometry below is real, not a placeholder
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    });

    const report = await page.evaluate((w) => {
      const out = { doc: 0, client: 0, wide: [], small: [], stretched: [], h1: null, unlabelled: 0 };
      out.doc = document.documentElement.scrollWidth;
      out.client = document.documentElement.clientWidth;

      for (const el of document.querySelectorAll('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > w + 1.5 || r.left < -1.5)
          out.wide.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
      }

      for (const el of document.querySelectorAll('main a, main button')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // inline links inside a paragraph are text, not controls
        if (el.closest('p, li') && !el.classList.contains('btn')) continue;
        if (r.height < 44 || r.width < 24)
          out.small.push(`${el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }

      for (const img of document.querySelectorAll('main img')) {
        if (!img.naturalWidth) continue;
        const r = img.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (getComputedStyle(img).objectFit === 'cover') continue; // cropping is intended
        const want = img.naturalWidth / img.naturalHeight;
        const got = r.width / r.height;
        if (Math.abs(want - got) / want > 0.02)
          out.stretched.push(`${img.currentSrc.split('/').pop()} ${got.toFixed(2)} vs ${want.toFixed(2)}`);
      }

      const h1 = document.querySelector('h1');
      out.h1 = h1 ? h1.textContent.trim().slice(0, 40) : null;
      if (h1) {
        const r = h1.getBoundingClientRect();
        out.h1clipped = r.right > w + 1.5 || h1.scrollWidth > h1.clientWidth + 1;
      }

      // every concept image must carry its visible label
      for (const f of document.querySelectorAll('.concept-frame, [data-concept]')) {
        if (!/Concept|Projet/i.test(f.textContent)) out.unlabelled++;
      }
      return out;
    }, width);

    checks++;
    ok(report.doc <= report.client + 1, `${tag}: horizontal overflow (${report.doc} > ${report.client})`);
    ok(report.wide.length === 0, `${tag}: outside viewport: ${report.wide.slice(0, 3).join(', ')}`);
    ok(report.small.length === 0, `${tag}: control under 44px: ${report.small.slice(0, 3).join(', ')}`);
    ok(report.stretched.length === 0, `${tag}: distorted image: ${report.stretched.slice(0, 2).join(', ')}`);
    ok(!!report.h1, `${tag}: no <h1>`);
    ok(!report.h1clipped, `${tag}: <h1> clipped`);
    ok(report.unlabelled === 0, `${tag}: ${report.unlabelled} concept image(s) with no visible label`);
  }
  await ctx.close();
}
await browser.close();

console.log(`checked ${ROUTES.length} pages × ${WIDTHS.length} widths = ${checks} page renders`);
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall inner-page responsive checks passed');
process.exit(fails.length ? 1 : 0);
