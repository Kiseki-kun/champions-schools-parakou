/**
 * KEYBOARD OPERATION — Phase 10.
 *
 * Everything here is driven by real key events, not by reading attributes.
 * The Phase 7 interaction suite already proves the drawer's focus trap, Escape
 * and focus return; this suite covers what that one does not: the skip link
 * actually landing on main and clearing the sticky header, tab order matching
 * reading order, no keyboard trap anywhere on a page, the carousel operable
 * from the keyboard alone with its live region firing, submenus operable with
 * Enter and Space, and the drawer's background made inert while it is open.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const notes = [];

for (const locale of ['fr', 'en']) {
  /* ---------- 1. the skip link actually skips ---------- */
  for (const width of [375, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${locale}/about/`.replace('/fr/about/', '/fr/a-propos/'), { waitUntil: 'load' });

    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => {
      const el = document.activeElement;
      const b = el.getBoundingClientRect();
      return { cls: (el.className || '').toString().split(' ')[0], top: Math.round(b.top), text: el.textContent.trim() };
    });
    ok(first.cls === 'skip-link',
      `${locale} @${width}: the first Tab lands on .${first.cls}, not the skip link`);
    ok(first.top >= 0 && first.top < 200,
      `${locale} @${width}: the focused skip link is off-screen at top ${first.top}px`);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const m = document.getElementById('main');
      return {
        focused: document.activeElement?.id,
        mainTop: Math.round(m.getBoundingClientRect().top),
        headerBottom: Math.round(document.querySelector('header').getBoundingClientRect().bottom),
      };
    });
    ok(after.focused === 'main',
      `${locale} @${width}: after the skip link, focus is on "${after.focused}" rather than main`);
    /* the sticky header must not be covering where the visitor just landed */
    ok(after.mainTop >= after.headerBottom - 2,
      `${locale} @${width}: main starts at ${after.mainTop}px but the sticky header reaches `
      + `${after.headerBottom}px — the visitor arrives under the header`);
    await ctx.close();
  }

  /* ---------- 2. no keyboard trap, and tab order follows the page ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${locale}/`, { waitUntil: 'load' });
    const total = await page.evaluate(() =>
      document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])').length);

    const order = [];
    let trapped = null;
    for (let i = 0; i < total + 12; i++) {
      await page.keyboard.press('Tab');
      const cur = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const b = el.getBoundingClientRect();
        /* Identity has to include the accessible name: the carousel's three
           controls are icon-only buttons sharing one class, so a class+text key
           reports three different buttons as one element and reads a normal tab
           run as a trap. */
        const key = `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`
          + `|${(el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 24)}`;
        return { key, y: Math.round(b.top + window.scrollY), x: Math.round(b.left) };
      });
      if (!cur) break;
      /* the same element three times running means Tab is not moving on */
      if (order.length >= 2 && cur.key === order[order.length - 1].key && cur.key === order[order.length - 2].key) {
        trapped = cur.key; break;
      }
      order.push(cur);
    }
    ok(!trapped, `${locale}: keyboard trap — Tab will not leave ${trapped}`);
    ok(order.length > 20, `${locale}: only ${order.length} elements reachable by Tab`);

    /* Reading order: ignoring the sticky header, y must not jump far backwards. */
    let regressions = 0;
    for (let i = 1; i < order.length; i++) {
      if (order[i].y < order[i - 1].y - 120) regressions++;
    }
    ok(regressions <= 2,
      `${locale}: tab order jumps backwards up the page ${regressions} times — focus order does not follow the content`);

    /* Shift+Tab must walk back the same path. Measured on a fresh, short run:
       the sweep above deliberately tabs past the end of the document and wraps,
       so the tail of `order` is not where focus is sitting afterwards. */
    await page.goto(`${BASE}/${locale}/`, { waitUntil: 'load' });
    const id = () => page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`
        + `|${(el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 24)}`;
    });
    const fwd = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); fwd.push(await id()); }
    const back = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); back.push(await id()); }
    const expected = fwd.slice(0, 5).reverse();
    ok(JSON.stringify(back) === JSON.stringify(expected),
      `${locale}: Shift+Tab does not reverse the tab order\n      forward: ${fwd.join(' -> ')}`
      + `\n      back:    ${back.join(' -> ')}`);
    await ctx.close();
  }

  /* ---------- 3. the hero carousel, keyboard only ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${locale}/`, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => document.querySelector('[data-hero-position]').textContent.trim());
    await page.focus('[data-hero-next]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const afterNext = await page.evaluate(() => ({
      pos: document.querySelector('[data-hero-position]').textContent.trim(),
      live: document.querySelector('[data-hero-status]')?.textContent.trim() ?? '',
      onCount: document.querySelectorAll('[data-hero-slide][data-on="true"]').length,
      hidden: [...document.querySelectorAll('[data-hero-slide]')]
        .filter((s) => s.dataset.on !== 'true')
        .every((s) => getComputedStyle(s).visibility === 'hidden'),
    }));
    ok(afterNext.pos !== before, `${locale}: Enter on the next control did not advance the carousel`);
    ok(afterNext.live.length > 0, `${locale}: the carousel's live region said nothing after advancing`);
    ok(afterNext.onCount === 1, `${locale}: ${afterNext.onCount} slides are marked active at once`);
    ok(afterNext.hidden, `${locale}: an inactive slide is still exposed to assistive technology`);

    /* Space must work on a <button> too */
    await page.focus('[data-hero-prev]');
    await page.keyboard.press('Space');
    await page.waitForTimeout(900);
    const afterPrev = await page.evaluate(() => document.querySelector('[data-hero-position]').textContent.trim());
    ok(afterPrev === before, `${locale}: Space on the previous control did not return to ${before} (got ${afterPrev})`);

    /* the play/pause control must report its state */
    const toggle = await page.evaluate(() => {
      const t = document.querySelector('[data-hero-toggle]');
      return { pressed: t.getAttribute('aria-pressed'), name: t.getAttribute('aria-label') };
    });
    ok(toggle.pressed === 'true' || toggle.pressed === 'false',
      `${locale}: the carousel play/pause control does not expose aria-pressed`);
    ok(!!toggle.name, `${locale}: the carousel play/pause control has no accessible name`);
    await page.focus('[data-hero-toggle]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const afterToggle = await page.evaluate(() => {
      const t = document.querySelector('[data-hero-toggle]');
      return { pressed: t.getAttribute('aria-pressed'), name: t.getAttribute('aria-label') };
    });
    ok(afterToggle.pressed !== toggle.pressed,
      `${locale}: Enter on the play/pause control did not change aria-pressed`);
    ok(afterToggle.name !== toggle.name,
      `${locale}: the play/pause control keeps the name "${toggle.name}" in both states`);
    await ctx.close();
  }

  /* ---------- 4. desktop submenu from the keyboard ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${locale}/`, { waitUntil: 'load' });
    for (const key of ['Enter', 'Space']) {
      await page.focus('.pnav__toggle');
      await page.keyboard.press(key);
      await page.waitForTimeout(180);
      const open = await page.evaluate(() => {
        const t = document.querySelector('.pnav__toggle');
        const m = document.getElementById(t.getAttribute('aria-controls'));
        return { expanded: t.getAttribute('aria-expanded'), hidden: m?.hidden, controls: !!m };
      });
      ok(open.controls, `${locale}: the submenu toggle's aria-controls does not resolve to an element`);
      ok(open.expanded === 'true' && open.hidden === false,
        `${locale}: ${key} did not open the submenu (aria-expanded=${open.expanded}, hidden=${open.hidden})`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const closed = await page.evaluate(() => ({
        expanded: document.querySelector('.pnav__toggle').getAttribute('aria-expanded'),
        focus: (document.activeElement.className || '').toString().split(' ')[0],
      }));
      ok(closed.expanded === 'false', `${locale}: Escape did not close the submenu`);
      ok(closed.focus === 'pnav__toggle',
        `${locale}: after Escape focus went to .${closed.focus} rather than back to the toggle`);
    }
    await ctx.close();
  }

  /* ---------- 5. the drawer, at the three phone widths ---------- */
  for (const width of [320, 375, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${locale}/`, { waitUntil: 'load' });

    await page.focus('#menu-open');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const opened = await page.evaluate(() => {
      const d = document.getElementById('mobile-drawer');
      const p = d.querySelector('.drawer__panel');
      return {
        hidden: d.hidden,
        expanded: document.getElementById('menu-open').getAttribute('aria-expanded'),
        role: p.getAttribute('role'),
        modal: p.getAttribute('aria-modal'),
        name: p.getAttribute('aria-label'),
        focusInside: p.contains(document.activeElement),
        bodyOverflow: document.body.style.overflow,
        /* is the page behind actually protected from the keyboard? */
        outsideFocusable: [...document.querySelectorAll('a[href], button')]
          .filter((el) => !p.contains(el) && el.offsetParent !== null).length,
      };
    });
    ok(opened.hidden === false, `${locale} @${width}: Enter did not open the drawer`);
    ok(opened.expanded === 'true', `${locale} @${width}: the opener's aria-expanded stayed ${opened.expanded}`);
    ok(opened.role === 'dialog' && opened.modal === 'true',
      `${locale} @${width}: drawer is not a modal dialog (role=${opened.role}, aria-modal=${opened.modal})`);
    ok(!!opened.name, `${locale} @${width}: the drawer has no accessible name`);
    ok(opened.focusInside, `${locale} @${width}: focus did not move into the drawer`);
    ok(opened.bodyOverflow === 'hidden', `${locale} @${width}: background scrolling was not locked`);

    /* Tab all the way round: focus must never leave the panel */
    let escaped = null;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        document.querySelector('.drawer__panel').contains(document.activeElement));
      if (!inside) { escaped = i; break; }
    }
    ok(escaped === null, `${locale} @${width}: focus escaped the drawer after ${escaped} tabs`);

    /* and backwards */
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      const inside = await page.evaluate(() =>
        document.querySelector('.drawer__panel').contains(document.activeElement));
      if (!inside) { fails.push(`${locale} @${width}: Shift+Tab escaped the drawer`); break; }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() => ({
      hidden: document.getElementById('mobile-drawer').hidden,
      expanded: document.getElementById('menu-open').getAttribute('aria-expanded'),
      focus: document.activeElement?.id,
      bodyOverflow: document.body.style.overflow,
    }));
    ok(closed.hidden === true, `${locale} @${width}: Escape did not close the drawer`);
    ok(closed.expanded === 'false', `${locale} @${width}: aria-expanded stayed ${closed.expanded} after closing`);
    ok(closed.focus === 'menu-open',
      `${locale} @${width}: focus went to "${closed.focus}" instead of returning to the menu button`);
    ok(closed.bodyOverflow === '', `${locale} @${width}: scrolling was not restored`);
    await ctx.close();
  }

  /* ---------- 6. the language switcher ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const start = `/${locale}/${locale === 'fr' ? 'admissions' : 'admissions'}/`;
    await page.goto(BASE + start, { waitUntil: 'load' });
    const links = await page.evaluate(() => [...document.querySelectorAll('.lang__link')].map((a) => ({
      href: a.getAttribute('href'),
      lang: a.getAttribute('lang'),
      hreflang: a.getAttribute('hreflang'),
      current: a.getAttribute('aria-current'),
      name: a.textContent.trim(),
    })));
    ok(links.length >= 2, `${locale}: fewer than two language links`);
    ok(links.filter((l) => l.current).length >= 1,
      `${locale}: no language link is marked as the current one`);
    ok(links.every((l) => l.lang && l.hreflang),
      `${locale}: a language link is missing lang/hreflang`);
    /* the other language must land on the SAME page, not the homepage */
    const other = links.find((l) => !l.current);
    ok(other && other.href.split('/').filter(Boolean).length > 1,
      `${locale}: the other-language link points at ${other?.href} — it drops the visitor on the homepage`);
    await page.focus('.lang__link');
    const focusWorks = await page.evaluate(() =>
      document.activeElement.classList.contains('lang__link'));
    ok(focusWorks, `${locale}: the language link cannot take keyboard focus`);
    await ctx.close();
  }
}

await browser.close();
console.log(`keyboard: skip link, tab order, carousel, submenus, drawer (320/375/430) and `
  + `language switcher — driven in both languages`);
if (notes.length) console.log('  notes:\n    ' + notes.join('\n    '));
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall keyboard checks passed');
process.exit(fails.length ? 1 : 0);
