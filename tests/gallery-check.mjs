/**
 * THE GALLERY AND ITS VIEWER — 13 September 2026.
 *
 * The gallery redesign added one genuinely interactive surface to the site, and
 * everything about it is the kind of thing that looks right in the markup and
 * is wrong in the hand: focus that escapes a modal, a counter that drifts out
 * of step, a background that scrolls behind the overlay, a viewer that shows
 * the wrong photograph after wrapping.
 *
 * So this drives it. Real clicks, real keys, real geometry, both languages:
 *
 *   1  every photograph on the page is a real, named, keyboard-reachable button
 *   2  the viewer opens on the photograph that was clicked
 *   3  next / previous / wrap, with the counter in step
 *   4  Escape, the close button and the scrim all close it
 *   5  ArrowLeft / ArrowRight / Home / End
 *   6  focus is trapped while open, in both directions
 *   7  focus returns to the photograph that opened it
 *   8  the page behind does not scroll, and its position is restored
 *   9  the viewer image keeps its own aspect ratio and is never cropped
 *  10  the controls are localised
 *  11  the full-size images are NOT fetched until a photograph is opened
 *  12  the album is a uniform grid — 2 / 3 / 4 equal square tiles
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const ROUTES = { en: '/en/school-life/gallery/', fr: '/fr/vie-scolaire/galerie/' };
const LABELS = {
  en: { close: 'Close', prev: 'Previous', next: 'Next', view: 'View photograph' },
  fr: { close: 'Fermer', prev: 'Précédente', next: 'Suivante', view: 'Voir la photographie' },
};

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const browser = await chromium.launch();
let opened = 0;

for (const [locale, route] of Object.entries(ROUTES)) {
  const L = LABELS[locale];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  /* ---------- 11. the viewer's images are not fetched with the page ---------- */
  const fetched = new Set();
  page.on('request', (r) => { if (r.resourceType() === 'image') fetched.add(r.url()); });

  await page.goto(BASE + route, { waitUntil: 'load' });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);

  const triggers = page.locator('[data-lb]');
  const total = await triggers.count();
  ok(total >= 50, `${locale}: only ${total} photographs are clickable`);

  /* ---------- 1. every trigger is a named button ---------- */
  const bad = await page.$$eval('[data-lb]', (els) => els.filter((e) =>
    e.tagName !== 'BUTTON' || !(e.getAttribute('aria-label') || '').trim()
      || !e.dataset.lbFull).map((e) => e.className));
  ok(bad.length === 0, `${locale}: ${bad.length} photograph trigger(s) are not named buttons with a full-size source`);

  const labelled = await page.$$eval('[data-lb]', (els, v) =>
    els.filter((e) => !(e.getAttribute('aria-label') || '').startsWith(v)).length, L.view);
  ok(labelled === 0, `${locale}: ${labelled} trigger(s) are not labelled "${L.view}: …"`);

  /* the caption must NOT be inside the button — it would join the name */
  const capInside = await page.$$eval('[data-lb]', (els) =>
    els.filter((e) => e.querySelector('figcaption')).length);
  ok(capInside === 0, `${locale}: ${capInside} trigger(s) swallow their caption into the button name`);

  /* full-size viewer images must not be among what the page loaded */
  const fullUrls = await page.$$eval('[data-lb]', (els) => els.map((e) => e.dataset.lbFull));
  const prefetched = fullUrls.filter((u) => [...fetched].some((f) => f.endsWith(u)));
  ok(prefetched.length === 0,
    `${locale}: ${prefetched.length} full-size viewer image(s) were downloaded before anything was opened`);

  /* ---------- 12. the album is a uniform grid: 2 / 3 / 4 equal squares ----------
     Measured, not read off the stylesheet: one cell width, one aspect ratio of
     1:1, one gap, and the column count that belongs to the width. Anything
     art-directed — a span, an alternating ratio, a taller tile — shows up here
     as a second distinct width or ratio. */
  const measureGrid = () => page.$$eval('.album__grid', (grids) => grids.map((g) => {
    const kids = [...g.children];
    const box = kids.map((k) => k.getBoundingClientRect());
    const widths = box.map((r) => Math.round(r.width));
    const ratios = kids.map((k) => {
      const im = k.querySelector('img'); if (!im) return null;
      const r = im.getBoundingClientRect(); return +(r.width / r.height).toFixed(2);
    });
    /* columns = how many cells share the first row's top edge */
    const top = Math.round(box[0].top);
    const cols = box.filter((r) => Math.round(r.top) === top).length;
    const cs = getComputedStyle(g);
    return {
      n: kids.length, cols,
      widths: [...new Set(widths)], ratios: [...new Set(ratios)],
      rowGap: cs.rowGap, colGap: cs.columnGap,
      fit: kids[0] ? getComputedStyle(kids[0].querySelector('img')).objectFit : null,
    };
  }));

  for (const [w, expectCols] of [[380, 2], [800, 3], [1280, 4]]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    const grids = await measureGrid();
    ok(grids.length >= 4, `${locale} @${w}: ${grids.length} album grids, expected 4`);
    for (const [i, g] of grids.entries()) {
      ok(g.widths.length === 1,
        `${locale} @${w}: album ${i + 1} has ${g.widths.length} distinct cell widths — the grid is not uniform`);
      ok(g.ratios.length === 1 && g.ratios[0] === 1,
        `${locale} @${w}: album ${i + 1} tiles are ${g.ratios.join('/')} — every tile must be square`);
      ok(g.cols === Math.min(expectCols, g.n),
        `${locale} @${w}: album ${i + 1} lays out ${g.cols} columns, expected ${expectCols}`);
      ok(g.rowGap === g.colGap,
        `${locale} @${w}: album ${i + 1} gap is ${g.rowGap}/${g.colGap} — the gap must be consistent`);
      ok(g.fit === 'cover',
        `${locale} @${w}: album ${i + 1} images use object-fit: ${g.fit}, expected cover`);
    }
    /* and no caption written under a thumbnail */
    const caps = await page.$$eval('.album__grid figcaption', (e) => e.length);
    ok(caps === 0, `${locale} @${w}: ${caps} caption(s) printed under gallery thumbnails`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(120);

  /* ---------- 2. open on the photograph that was clicked ---------- */
  const openIndex = 7;
  const wantAlt = await triggers.nth(openIndex).getAttribute('aria-label');
  await triggers.nth(openIndex).scrollIntoViewIfNeeded();
  const pageYBefore = await page.evaluate(() => window.scrollY);
  await triggers.nth(openIndex).click();
  await page.waitForTimeout(350);
  opened++;

  const dlg = page.locator('[data-lb-panel]');
  ok(await dlg.isVisible(), `${locale}: the viewer did not open`);
  ok(await page.locator('[data-lightbox]').first().isVisible(), `${locale}: the overlay is not visible`);

  const shownAlt = await page.locator('[data-lb-img]').getAttribute('alt');
  ok(wantAlt.endsWith(shownAlt),
    `${locale}: opened photograph "${shownAlt}" is not the one clicked ("${wantAlt}")`);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${openIndex + 1} / ${total}`,
    `${locale}: counter reads "${(await page.locator('[data-lb-count]').innerText()).trim()}", expected "${openIndex + 1} / ${total}"`);

  /* dialog semantics */
  ok(await dlg.getAttribute('role') === 'dialog', `${locale}: the viewer is not role=dialog`);
  ok(await dlg.getAttribute('aria-modal') === 'true', `${locale}: the viewer is not aria-modal`);
  ok(((await dlg.getAttribute('aria-label')) || '').trim().length > 0,
    `${locale}: the dialog has no accessible name`);

  /* ---------- 10. localised controls ---------- */
  for (const [sel, want] of [['[data-lb-close]', L.close], ['[data-lb-prev]', L.prev], ['[data-lb-next]', L.next]]) {
    ok(await page.locator(sel).getAttribute('aria-label') === want,
      `${locale}: ${sel} is labelled "${await page.locator(sel).getAttribute('aria-label')}", expected "${want}"`);
  }

  /* ---------- 8. the page behind is locked ----------
     Tested by behaviour, not by implementation: what matters is that the wheel
     does not move the page, and that the reading position is exactly where it
     was when the viewer closes. */
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).overflow) === 'hidden',
    `${locale}: the page behind the viewer is not scroll-locked`);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(250);
  ok(Math.abs((await page.evaluate(() => window.scrollY)) - pageYBefore) < 2,
    `${locale}: the page scrolled behind the viewer`);

  /* ---------- 9. the image keeps its own shape ---------- */
  const shape = await page.evaluate(() => {
    const im = document.querySelector('[data-lb-img]');
    const r = im.getBoundingClientRect();
    return { rendered: r.width / r.height, natural: im.naturalWidth / im.naturalHeight,
             fit: getComputedStyle(im).objectFit, w: r.width, h: r.height,
             vw: innerWidth, vh: innerHeight };
  });
  ok(shape.fit === 'contain', `${locale}: the viewer image is object-fit:${shape.fit}, not contain`);
  if (shape.natural) {
    ok(Math.abs(shape.rendered - shape.natural) / shape.natural < 0.02,
      `${locale}: the viewer image is distorted (${shape.rendered.toFixed(2)} vs ${shape.natural.toFixed(2)})`);
  }
  ok(shape.w <= shape.vw + 1 && shape.h <= shape.vh + 1,
    `${locale}: the viewer image overflows the viewport (${Math.round(shape.w)}x${Math.round(shape.h)} in ${shape.vw}x${shape.vh})`);

  /* ---------- 3 + 5. navigation and the counter ---------- */
  await page.locator('[data-lb-next]').click(); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${openIndex + 2} / ${total}`,
    `${locale}: Next did not advance the counter`);
  await page.locator('[data-lb-prev]').click(); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${openIndex + 1} / ${total}`,
    `${locale}: Previous did not step back`);

  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${openIndex + 2} / ${total}`,
    `${locale}: ArrowRight does not advance`);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${openIndex + 1} / ${total}`,
    `${locale}: ArrowLeft does not step back`);
  await page.keyboard.press('Home'); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `1 / ${total}`,
    `${locale}: Home does not jump to the first photograph`);
  /* wrap backwards from the first */
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${total} / ${total}`,
    `${locale}: the viewer does not wrap from the first to the last`);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `1 / ${total}`,
    `${locale}: the viewer does not wrap from the last back to the first`);
  await page.keyboard.press('End'); await page.waitForTimeout(220);
  ok((await page.locator('[data-lb-count]').innerText()).trim() === `${total} / ${total}`,
    `${locale}: End does not jump to the last photograph`);

  /* the viewer's own image is fetched only now */
  const nowFetched = fullUrls.filter((u) => [...fetched].some((f) => f.endsWith(u)));
  ok(nowFetched.length > 0, `${locale}: no full-size image was fetched even after opening the viewer`);

  /* ---------- 6. focus is trapped ---------- */
  const inside = async () => page.evaluate(() =>
    !!document.querySelector('[data-lb-panel]')?.contains(document.activeElement));
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    ok(await inside(), `${locale}: Tab ${i + 1} escaped the viewer`);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    ok(await inside(), `${locale}: Shift+Tab ${i + 1} escaped the viewer`);
  }

  /* ---------- 4 + 7. Escape closes and focus comes back ---------- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(!(await page.locator('[data-lightbox]').first().isVisible()), `${locale}: Escape did not close the viewer`);
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).overflow) !== 'hidden',
    `${locale}: the scroll lock was not released`);
  const restored = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
  ok(restored === wantAlt,
    `${locale}: focus returned to "${restored}", not to the photograph that opened the viewer`);
  ok(Math.abs((await page.evaluate(() => window.scrollY)) - pageYBefore) < 4,
    `${locale}: the reading position was not restored on close`);

  /* the close button and the scrim also close */
  await triggers.nth(3).click(); await page.waitForTimeout(300);
  await page.locator('[data-lb-close]').click(); await page.waitForTimeout(250);
  ok(!(await page.locator('[data-lightbox]').first().isVisible()), `${locale}: the close button did not close the viewer`);
  await triggers.nth(4).click(); await page.waitForTimeout(300);
  /* the empty field around the photograph — the panel covers the scrim, so
     this is what a visitor actually clicks when they click "outside" */
  await page.mouse.click(8, 500); await page.waitForTimeout(250);
  ok(!(await page.locator('[data-lightbox]').first().isVisible()),
    `${locale}: clicking away from the photograph did not close the viewer`);

  /* ---------- keyboard opening, from the page ---------- */
  await triggers.nth(2).focus();
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.locator('[data-lb-panel]').isVisible(), `${locale}: Enter does not open a photograph`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  await ctx.close();
}

/* ---------- reduced motion: the viewer still works ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + ROUTES.en, { waitUntil: 'load' });
  await page.locator('[data-lb]').first().scrollIntoViewIfNeeded();
  await page.locator('[data-lb]').first().click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-lb-panel]').isVisible(), 'reduced motion: the viewer does not open');
  /* global.css collapses every transition to 0.01ms under reduced motion, which
     is the site's existing convention (Phase 9); anything at or under a
     millisecond is not motion. */
  const t = await page.evaluate(() => getComputedStyle(document.querySelector('[data-lb-close]')).transitionDuration);
  const longest = Math.max(...t.split(',').map((x) => parseFloat(x) || 0));
  ok(longest <= 0.001, `reduced motion: the controls still animate (${t})`);
  await page.keyboard.press('Escape');
  await ctx.close();
}

/* ---------- touch: a swipe steps the viewer ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE + ROUTES.fr, { waitUntil: 'load' });
  const t0 = page.locator('[data-lb]').first();
  await t0.scrollIntoViewIfNeeded();
  await t0.tap();
  await page.waitForTimeout(350);
  ok(await page.locator('[data-lb-panel]').isVisible(), 'touch: tapping a photograph did not open the viewer');
  const before = (await page.locator('[data-lb-count]').innerText()).trim();
  await page.evaluate(() => {
    const panel = document.querySelector('[data-lb-panel]');
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: panel, clientX: x, clientY: y });
      return new TouchEvent(type, { changedTouches: [t], bubbles: true, cancelable: true });
    };
    panel.dispatchEvent(mk('touchstart', 320, 400));
    panel.dispatchEvent(mk('touchend', 120, 405));
  });
  await page.waitForTimeout(250);
  const after = (await page.locator('[data-lb-count]').innerText()).trim();
  ok(before !== after, `touch: a left swipe did not advance the viewer (${before} → ${after})`);
  /* the controls are reachable and large enough on a phone */
  const small = await page.$$eval('[data-lb-panel] button', (bs) => bs.filter((b) => {
    const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44;
  }).length);
  ok(small === 0, `touch: ${small} viewer control(s) are under 44px`);
  await ctx.close();
}

await browser.close();
console.log(`gallery viewer: ${opened} openings driven, 2 languages, plus reduced motion and touch`);
console.log('  checked: named buttons · opens the clicked photograph · next/prev/wrap/Home/End ·');
console.log('           counter · Escape/close/scrim · focus trap both ways · focus restored ·');
console.log('           scroll lock and restore · aspect ratio · localised controls ·');
console.log('           full-size images deferred · album grid uniform at 2/3/4 columns');
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nthe gallery and its viewer behave as specified');
process.exit(fails.length ? 1 : 0);
