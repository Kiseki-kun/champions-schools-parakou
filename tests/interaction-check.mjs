import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:4322';
const browser = await chromium.launch();
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

/* --- language switcher lands on the equivalent page, not home --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  for (const [from, to] of [
    ['/fr/vie-scolaire/', '/en/school-life/'],
    ['/en/about/leadership/', '/fr/a-propos/direction/'],
    ['/fr/futur-campus/', '/en/future-campus/'],
    ['/en/calendar-and-hours/', '/fr/calendrier-et-horaires/'],
  ]) {
    await page.goto(BASE + from);
    const target = from.startsWith('/fr/') ? 'EN' : 'FR';
    await page.locator('header .lang__link', { hasText: target }).first().click();
    await page.waitForLoadState('domcontentloaded');
    const got = new URL(page.url()).pathname;
    ok(got === to, `language switch ${from} -> expected ${to}, got ${got}`);
  }
  console.log('  language switcher: 4 equivalence checks');
  await page.context().close();
}

/* --- desktop submenu: opens on click, Esc closes, focus returns --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/fr/');
  const toggle = page.locator('.pnav__toggle').first();
  const menu = page.locator('.pnav__submenu').first();
  ok(!(await menu.isVisible()), 'submenu should start closed');
  await toggle.click();
  ok(await menu.isVisible(), 'submenu should open on click');
  ok((await toggle.getAttribute('aria-expanded')) === 'true', 'aria-expanded should be true when open');
  await page.keyboard.press('Escape');
  ok(!(await menu.isVisible()), 'Escape should close the submenu');
  ok(await toggle.evaluate((el) => el === document.activeElement), 'focus should return to the toggle');
  console.log('  desktop submenu: open/close/aria/focus-return');
  await page.context().close();
}

/* --- mobile drawer: dialog semantics, focus trap, Esc, focus return --- */
{
  const page = await (await browser.newContext({ viewport: { width: 375, height: 780 } })).newPage();
  await page.goto(BASE + '/fr/');
  const open = page.locator('#menu-open');
  const drawer = page.locator('#mobile-drawer');
  ok(!(await drawer.isVisible()), 'drawer should start hidden');
  await open.click();
  ok(await drawer.isVisible(), 'drawer should open');
  ok((await open.getAttribute('aria-expanded')) === 'true', 'menu button aria-expanded');
  ok(await page.locator('#mobile-drawer [role="dialog"][aria-modal="true"]').count() === 1, 'drawer needs role=dialog aria-modal');
  const inside = await page.evaluate(() =>
    document.getElementById('mobile-drawer')?.contains(document.activeElement));
  ok(inside, 'focus should move into the drawer');
  const locked = await page.evaluate(() => document.body.style.overflow === 'hidden');
  ok(locked, 'background scroll should be locked');
  await page.keyboard.press('Escape');
  ok(!(await drawer.isVisible()), 'Escape should close the drawer');
  ok(await open.evaluate((el) => el === document.activeElement), 'focus should return to the menu button');
  console.log('  mobile drawer: dialog/focus-trap/scroll-lock/Esc/focus-return');
  await page.context().close();
}

/* --- sticky action bar never covers content; skip link works --- */
{
  const page = await (await browser.newContext({ viewport: { width: 375, height: 780 } })).newPage();
  await page.goto(BASE + '/fr/contact/');
  const barVisible = await page.locator('.actionbar').isVisible();
  ok(barVisible, 'action bar should show below 900px');
  const covered = await page.evaluate(() => {
    const bar = document.querySelector('.actionbar');
    if (!bar) return 'no bar';
    const pad = parseFloat(getComputedStyle(document.body).paddingBottom);
    return pad >= bar.getBoundingClientRect().height - 1 ? null : `body padding ${pad} < bar ${bar.getBoundingClientRect().height}`;
  });
  ok(covered === null, `action bar overlaps content: ${covered}`);

  await page.keyboard.press('Tab');
  const skipFocused = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'));
  ok(skipFocused, 'first Tab should reach the skip link');
  const skipVisible = await page.locator('.skip-link').evaluate((el) => {
    const r = el.getBoundingClientRect(); return r.top >= 0;
  });
  ok(skipVisible, 'skip link should become visible on focus');
  console.log('  action bar clearance + skip link');
  await page.context().close();
}

/* --- desktop: action bar hidden, nav visible --- */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/en/');
  ok(!(await page.locator('.actionbar').isVisible()), 'action bar should be hidden at 1280');
  ok(await page.locator('.pnav').isVisible(), 'primary nav should be visible at 1280');
  ok(!(await page.locator('#menu-open').isVisible()), 'menu button should be hidden at 1280');
  console.log('  desktop/mobile navigation swap');
  await page.context().close();
}

/* --- concept image renders inside its frame with the label ---
   The homepage carries two since Phase 5; tests/home-check.mjs asserts the
   full contract (prefixed alt, chip wording, one chip per concept). */
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(BASE + '/fr/');
  const frames = page.locator('.concept');
  ok((await frames.count()) === 2, 'the homepage should render two concept frames');
  ok((await page.locator('.concept .concept__chip').count()) === 2, 'each concept frame needs its label chip');
  ok((await page.locator('.concept img:not([alt^="Projet du futur campus"])').count()) === 0,
    'every concept image needs the French concept prefix in its alt text');
  console.log('  concept frames on the homepage: 2, both labelled');
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall interaction checks passed');
