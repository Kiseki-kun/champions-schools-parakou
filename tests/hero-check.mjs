/**
 * Phase 5 — the editorial hero sequence.
 *
 * Covers the interaction contract in 05-HOMEPAGE.md §6: one active frame at a
 * time, prev/next, wrap-around, keyboard, pause/play, swipe, auto-advance,
 * prefers-reduced-motion, and the assistive-technology surface.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const activeIndex = (page) =>
  page.$$eval('[data-hero-slide]', (els) => els.findIndex((e) => e.dataset.on === 'true'));
const onCount = (page) =>
  page.$$eval('[data-hero-slide]', (els) => els.filter((e) => e.dataset.on === 'true').length);
const counter = (page) => page.locator('[data-hero-position]').innerText();
const caption = (page) => page.locator('[data-hero-caption]').innerText();

/* --- structure, both locales --- */
for (const [path, first, expectCounter] of [
  ['/fr/', 'Des leçons de français', '01 sur 05'],
  ['/en/', 'French and English lessons', '01 of 05'],
]) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + path);

  ok((await page.locator('[data-hero-slide]').count()) === 5, `${path}: expected 5 hero frames`);
  ok((await onCount(page)) === 1, `${path}: exactly one frame may be active`);
  ok((await activeIndex(page)) === 0, `${path}: should open on frame 1`);
  ok((await counter(page)).trim() === expectCounter, `${path}: counter should read "${expectCounter}"`);
  ok((await caption(page)).includes(first), `${path}: caption should be frame 1's manifest caption`);

  /* alt text reaches the page from the manifest, in this locale */
  const alt = await page.locator('[data-hero-slide]').first().locator('img').getAttribute('alt');
  ok(alt && alt.length > 20, `${path}: active frame needs manifest alt text`);

  /* non-active frames are hidden from assistive technology */
  const hidden = await page.$$eval('[data-hero-slide]', (els) =>
    els.slice(1).every((e) => e.getAttribute('aria-hidden') === 'true'));
  ok(hidden, `${path}: inactive frames must be aria-hidden`);

  /* the photographic field is full-bleed and the words sit inside it */
  const bleed = await page.evaluate(() => {
    const f = document.querySelector('.hero__field').getBoundingClientRect();
    return { w: Math.round(f.width), vw: Math.round(document.documentElement.clientWidth) };
  });
  ok(bleed.w >= bleed.vw - 1, `${path}: the hero field must run edge to edge (${bleed.w} vs ${bleed.vw})`);

  /* the scrim is a darkening for legibility, never a filter on the photograph */
  const filtered = await page.$$eval('[data-hero-slide] img', (els) =>
    els.filter((e) => {
      const c = getComputedStyle(e);
      return c.filter !== 'none' || c.mixBlendMode !== 'normal';
    }).length);
  ok(filtered === 0, `${path}: no hero photograph may carry a CSS filter or blend mode`);

  /* the first frame is eager, the rest are not */
  const loadings = await page.$$eval('[data-hero-slide] img', (els) => els.map((e) => e.loading));
  ok(loadings[0] === 'eager', `${path}: frame 1 should load eagerly (LCP)`);
  ok(loadings.slice(1).every((l) => l === 'lazy'), `${path}: frames 2-5 should load lazily`);

  await page.context().close();
}
console.log('  structure, captions, alt text, aria surface — fr + en');

/* --- prev / next / wrap-around --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/en/');
  const c1 = await caption(page);

  await page.locator('[data-hero-next]').click();
  ok((await activeIndex(page)) === 1, 'next should advance to frame 2');
  ok((await counter(page)).trim() === '02 of 05', 'counter should follow next');
  ok((await caption(page)) !== c1, 'the caption should change with the frame');
  ok((await onCount(page)) === 1, 'still exactly one active frame after next');

  await page.locator('[data-hero-prev]').click();
  ok((await activeIndex(page)) === 0, 'prev should return to frame 1');
  await page.locator('[data-hero-prev]').click();
  ok((await activeIndex(page)) === 4, 'prev from frame 1 should wrap to frame 5');
  ok((await counter(page)).trim() === '05 of 05', 'counter should wrap too');
  await page.locator('[data-hero-next]').click();
  ok((await activeIndex(page)) === 0, 'next from frame 5 should wrap to frame 1');
  console.log('  prev / next / wrap-around');
  await page.context().close();
}

/* --- keyboard --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/fr/');
  await page.locator('[data-hero-next]').focus();
  await page.keyboard.press('ArrowRight');
  ok((await activeIndex(page)) === 1, 'ArrowRight should advance the sequence');
  await page.keyboard.press('ArrowLeft');
  ok((await activeIndex(page)) === 0, 'ArrowLeft should step back');

  /* every control is reachable and labelled */
  for (const sel of ['[data-hero-prev]', '[data-hero-next]', '[data-hero-toggle]']) {
    const label = await page.locator(sel).getAttribute('aria-label');
    ok(label && label.trim().length > 0, `${sel} needs an accessible name`);
    const box = await page.locator(sel).boundingBox();
    ok(box && box.width >= 44 && box.height >= 44, `${sel} needs a 44px target`);
  }

  /* a user-initiated change is announced; auto-advance is not */
  await page.locator('[data-hero-next]').click();
  const status = await page.locator('[data-hero-status]').innerText();
  ok(status.includes('Photographie 2 sur 5'), `status region should announce the new frame, got "${status}"`);
  console.log('  keyboard, control names, 44px targets, live region');
  await page.context().close();
}

/* --- pause / play --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/en/');
  const toggle = page.locator('[data-hero-toggle]');
  ok((await toggle.getAttribute('aria-pressed')) === 'false', 'the sequence should start playing');
  const playLabel = await toggle.getAttribute('aria-label');

  await toggle.click();
  ok((await toggle.getAttribute('aria-pressed')) === 'true', 'pause should set aria-pressed=true');
  ok((await toggle.getAttribute('aria-label')) !== playLabel, 'the toggle label should change when paused');

  const before = await activeIndex(page);
  await page.waitForTimeout(8500);
  ok((await activeIndex(page)) === before, 'a paused sequence must not auto-advance');

  await toggle.click();
  ok((await toggle.getAttribute('aria-pressed')) === 'false', 'play should clear aria-pressed');
  console.log('  pause / play (paused for 8.5s, no movement)');
  await page.context().close();
}

/* --- auto-advance, pointer well away from the hero --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/en/');
  const before = await activeIndex(page);
  await page.waitForTimeout(8500);
  const after = await activeIndex(page);
  ok(after !== before, 'the sequence should auto-advance when left alone');
  ok((await onCount(page)) === 1, 'auto-advance must leave exactly one active frame');
  console.log('  auto-advance');
  await page.context().close();
}

/* --- prefers-reduced-motion: no auto-advance, starts paused, still usable --- */
{
  const page = await (await browser.newContext({
    viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
  })).newPage();
  await page.goto(BASE + '/en/');
  ok((await page.locator('[data-hero-toggle]').getAttribute('aria-pressed')) === 'true',
    'reduced motion should start paused');
  const before = await activeIndex(page);
  await page.waitForTimeout(8500);
  ok((await activeIndex(page)) === before, 'reduced motion must not auto-advance');
  await page.locator('[data-hero-next]').click();
  ok((await activeIndex(page)) === (before + 1) % 5, 'reduced motion must still allow manual advance');
  console.log('  prefers-reduced-motion');
  await page.context().close();
}

/* --- swipe (touch pointers only; a mouse drag must not advance) --- */
{
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  })).newPage();
  await page.goto(BASE + '/fr/');

  const swipe = async (dx) => {
    await page.locator('[data-hero]').dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 300, clientY: 500 });
    await page.locator('[data-hero]').dispatchEvent('pointerup', { pointerType: 'touch', clientX: 300 + dx, clientY: 504 });
  };
  await swipe(-120);
  ok((await activeIndex(page)) === 1, 'a left swipe should advance');
  await swipe(120);
  ok((await activeIndex(page)) === 0, 'a right swipe should go back');
  await swipe(-20);
  ok((await activeIndex(page)) === 0, 'a 20px drag is below the threshold and must not advance');

  await page.locator('[data-hero]').dispatchEvent('pointerdown', { pointerType: 'mouse', clientX: 300, clientY: 500 });
  await page.locator('[data-hero]').dispatchEvent('pointerup', { pointerType: 'mouse', clientX: 100, clientY: 500 });
  ok((await activeIndex(page)) === 0, 'a mouse drag must not act as a swipe');

  console.log('  swipe threshold, direction, mouse exclusion');
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall hero checks passed');
if (fails.length) process.exitCode = 1;
