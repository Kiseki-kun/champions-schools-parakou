/**
 * ACCESSIBILITY — Phase 10.
 *
 * axe-core run against the BUILT site, every route, both languages, at a phone
 * width and a desktop width, and again with the mobile drawer open and with a
 * desktop submenu open — because a component that only exists in one state is
 * only audited in that state.
 *
 * Tags: WCAG 2.0/2.1/2.2 A and AA, plus best-practice rules reported
 * separately (best-practice is advice, not conformance, so it does not fail
 * the build on its own — but it is printed, not hidden).
 *
 * An automated pass is a floor, never a ceiling: axe catches perhaps a third
 * of real barriers. §20 of 11-ACCESSIBILITY.md records what this cannot see.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.argv[2] || 'http://localhost:4322';
const WIDTHS = [375, 1280];

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
  '/404.html',
];

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const browser = await chromium.launch();
const violations = new Map();   // rule -> {impact, help, nodes:Set, where:Set}
const advisories = new Map();
let runs = 0;

const record = (map, v, where) => {
  const e = map.get(v.id) ?? { impact: v.impact, help: v.help, nodes: new Set(), where: new Set() };
  v.nodes.forEach((n) => e.nodes.add(n.target.join(' ')));
  e.where.add(where);
  map.set(v.id, e);
};

async function audit(page, where) {
  await page.evaluate(AXE);
  const res = await page.evaluate(async () => {
    // @ts-ignore
    return await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
  });
  runs++;
  for (const v of res.violations) {
    const isConformance = v.tags.some((t) => WCAG.includes(t));
    record(isConformance ? violations : advisories, v, where);
  }
}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    });
    await audit(page, `${route} @${width}`);

    /* Components that only exist in a state have to be audited in that state. */
    if (width === 375) {
      const open = await page.$('#menu-open');
      if (open) {
        await open.click();
        await page.waitForTimeout(250);
        await audit(page, `${route} @${width} drawer open`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    } else {
      const toggle = await page.$('.pnav__toggle');
      if (toggle) {
        await toggle.click();
        await page.waitForTimeout(200);
        await audit(page, `${route} @${width} submenu open`);
        await page.keyboard.press('Escape');
      }
    }
  }
  await ctx.close();
}
await browser.close();

/* ---------- target size (WCAG 2.2 SC 2.5.8, AA) ----------
   axe does not check this. Every control that is not an inline link inside a
   run of text has to be at least 24×24 CSS px. Measured at the three phone
   widths, with the drawer closed and open. */
const browser2 = await chromium.launch();
const undersized = new Map();
const TARGET_ROUTES = ['/fr/', '/en/', '/fr/contact/', '/fr/admissions/',
  '/fr/vie-scolaire/galerie/', '/fr/futur-campus/'];
for (const width of [320, 375, 430]) {
  const ctx = await browser2.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  for (const route of TARGET_ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'load' });
    for (const open of [false, true]) {
      if (open) {
        const b = await page.$('#menu-open');
        if (!b) continue;
        await b.click();
        await page.waitForTimeout(250);
      }
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
          })
          .map((el) => {
            const b = el.getBoundingClientRect();
            /* 2.5.8 exempts a link sitting inline within a sentence */
            const inline = !!el.closest('p, li:not([class]), figcaption')
              && getComputedStyle(el).display.includes('inline');
            return {
              cls: (el.className || '').toString().trim().split(/\s+/)[0] || el.tagName.toLowerCase(),
              name: (el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ')).slice(0, 32),
              min: Math.round(Math.min(b.width, b.height)),
              inline,
            };
          }));
      for (const it of items) {
        if (it.min >= 24 || it.inline) continue;
        const k = `${it.cls} "${it.name}"`;
        const e = undersized.get(k) ?? { min: 99, where: new Set() };
        e.min = Math.min(e.min, it.min);
        e.where.add(`${route}@${width}${open ? ' drawer' : ''}`);
        undersized.set(k, e);
      }
      if (open) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
    }
  }
  await ctx.close();
}
await browser2.close();

const show = (map, title) => {
  if (!map.size) { console.log(`  ${title}: none`); return; }
  console.log(`  ${title}:`);
  for (const [id, e] of [...map].sort((a, b) => b[1].where.size - a[1].where.size)) {
    console.log(`    ${id} (${e.impact}) — ${e.help}`);
    console.log(`      ${e.where.size} page/state(s); e.g. ${[...e.where].slice(0, 2).join(' | ')}`);
    console.log(`      nodes: ${[...e.nodes].slice(0, 3).join(' , ')}`);
  }
};

console.log(`axe-core ${ROUTES.length} routes × ${WIDTHS.length} widths + drawer/submenu states = ${runs} runs\n`);
show(violations, 'WCAG 2.2 A/AA violations');
show(advisories, 'best-practice advisories (not conformance failures)');

if (undersized.size) {
  console.log('  target size (2.5.8) — under 24×24 CSS px:');
  for (const [k, e] of undersized)
    console.log(`    ${k} — smallest side ${e.min}px — ${[...e.where].slice(0, 3).join(', ')}`);
} else {
  console.log('  target size (2.5.8): every non-inline control is at least 24×24 CSS px '
    + 'at 320, 375 and 430, drawer closed and open');
}

const failed = violations.size + undersized.size;
console.log(failed
  ? `\nFAILURES: ${violations.size} WCAG rule(s) violated, ${undersized.size} undersized target(s)`
  : '\nno WCAG 2.2 A/AA violations found by axe-core, and every target is large enough');
process.exit(failed ? 1 : 0);
