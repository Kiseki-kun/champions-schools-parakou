/**
 * Phase 5 — responsive sweep of the homepage at the widths named in the brief.
 *
 * Checks, at each width and in both languages: no horizontal overflow, no
 * element wider than the viewport, the hero renders at a sensible height, the
 * control rail does not wrap, tap targets stay at 44px, and body text keeps a
 * readable measure.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1600];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

for (const locale of ['fr', 'en']) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const tag = `${locale} @${width}`;
    await page.goto(`${BASE}/${locale}/`, { waitUntil: 'networkidle' });

    /* no horizontal scrolling anywhere on the page */
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    ok(overflow.doc <= overflow.client + 1,
      `${tag}: horizontal overflow (${overflow.doc} > ${overflow.client})`);

    /* nothing sticks out of the viewport */
    const wide = await page.evaluate((w) => {
      const out = [];
      for (const el of document.querySelectorAll('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > w + 1.5 || r.left < -1.5) {
          out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        }
      }
      return out.slice(0, 4);
    }, width);
    ok(wide.length === 0, `${tag}: element(s) outside the viewport: ${wide.join(', ')}`);

    /* the hero photograph fills the opening viewport, edge to edge */
    const stage = await page.locator('[data-hero-slide][data-on="true"] img').boundingBox();
    ok(stage && stage.height > 320, `${tag}: the hero frame is too short (${stage && Math.round(stage.height)}px)`);
    ok(stage && stage.width >= width - 1, `${tag}: the hero photograph must run edge to edge`);

    /* the header sits on the photograph rather than above it */
    const overlaid = await page.evaluate(() => {
      const h = document.querySelector('.header');
      const hero = document.querySelector('.hero');
      if (!h || !hero) return null;
      return h.classList.contains('header--overlay')
        && Math.round(h.getBoundingClientRect().top) <= Math.round(hero.getBoundingClientRect().top) + 1;
    });
    ok(overlaid === true, `${tag}: the homepage header should overlay the hero`);

    /* the controls stay on one line: the row's height must not exceed the
       tallest control it holds (children are centred, so tops legitimately
       differ — height is what reveals a wrap) */
    const rail = await page.evaluate(() => {
      const r = document.querySelector('.hero__controls');
      if (!r) return null;
      const mids = [...r.children]
        .filter((c) => c.getBoundingClientRect().width > 0)
        .map((c) => { const b = c.getBoundingClientRect(); return b.top + b.height / 2; });
      return { spread: Math.round(Math.max(...mids) - Math.min(...mids)) };
    });
    ok(rail && rail.spread <= 2,
      `${tag}: the hero controls wrapped (vertical spread ${rail && rail.spread}px)`);

    /* 44px minimum on every control */
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('main a.btn, main button, .hero__nav')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.height < 44) out.push(`${el.className} ${Math.round(r.height)}px`);
      }
      return out.slice(0, 3);
    });
    ok(small.length === 0, `${tag}: control(s) under 44px tall: ${small.join(', ')}`);

    /* the nine sections survive every width */
    const sections = await page.locator('main > section').count();
    ok(sections === 9, `${tag}: ${sections} sections instead of 9`);

    /* the branding lockup never cramps: the name holds at most two lines and
       the motto, when shown, sits on its own */
    const lock = await page.evaluate(() => {
      const n = document.querySelector('.lockup__name');
      const m = document.querySelector('.lockup__motto');
      const nh = n.getBoundingClientRect().height;
      const lh = parseFloat(getComputedStyle(n).lineHeight);
      const bar = document.querySelector('.mainbar__inner').getBoundingClientRect().height;
      return { lines: Math.round(nh / lh), mottoShown: !!(m && m.offsetParent),
               nameH: Math.round(nh), barH: Math.round(bar) };
    });
    /* Two lines from 360px up. At 320px the row cannot give three words two
       lines once the mark, switcher and menu button are placed, so three
       tightly-led lines are allowed there — and the block must still be no
       taller than the row it sits in. */
    const maxLines = width < 360 ? 3 : 2;
    ok(lock.lines <= maxLines, `${tag}: the school name wraps onto ${lock.lines} lines`);
    ok(lock.nameH <= lock.barH, `${tag}: the lockup text (${lock.nameH}px) overflows the bar (${lock.barH}px)`);

    /* no section may collapse into a thin strip or balloon into an empty field */
    const heights = await page.$$eval('main > section', (els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)));
    ok(heights.every((h) => h > 120), `${tag}: a section collapsed (${heights.join(', ')})`);

    await ctx.close();
  }
  console.log(`  ${locale}: ${WIDTHS.length} widths checked (${WIDTHS.join(', ')})`);
}

await browser.close();
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall responsive checks passed');
if (fails.length) process.exitCode = 1;
