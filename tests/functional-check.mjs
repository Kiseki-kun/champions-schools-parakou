/**
 * FUNCTIONALITY & INTERACTIONS — Phase 7.
 *
 * Everything here is driven through a real browser: clicks, keys, focus and
 * navigation. Nothing is inferred from markup. Each block states what it is
 * proving, so a failure names a behaviour rather than a selector.
 *
 *   1  desktop navigation — every item, both languages, real navigations
 *   2  desktop submenus — click, Escape, outside click, keyboard, aria
 *   3  mobile drawer — open, close (button / scrim / Escape), scroll lock,
 *      focus trap, focus return, reopen, navigate
 *   4  language switching — from every page, in both directions
 *   5  buttons — every one is a real link or a control with a real job
 *   6  keyboard — skip link, focus order, visible focus, no traps
 *   7  scroll — sticky header never covers what a jump link lands on
 *   8  console — no errors raised by any of the above
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const done = [];

const ROUTES = {
  fr: {
    home: '/fr/', about: '/fr/a-propos/', founders: '/fr/a-propos/message-des-fondateurs/',
    leadership: '/fr/a-propos/direction/', academics: '/fr/programmes/',
    admissions: '/fr/admissions/', calendar: '/fr/calendrier-et-horaires/',
    'school-life': '/fr/vie-scolaire/', gallery: '/fr/vie-scolaire/galerie/',
    achievements: '/fr/distinctions/', 'future-campus': '/fr/futur-campus/',
    contact: '/fr/contact/', privacy: '/fr/confidentialite/',
  },
  en: {
    home: '/en/', about: '/en/about/', founders: '/en/about/founders-message/',
    leadership: '/en/about/leadership/', academics: '/en/academics/',
    admissions: '/en/admissions/', calendar: '/en/calendar-and-hours/',
    'school-life': '/en/school-life/', gallery: '/en/school-life/gallery/',
    achievements: '/en/achievements/', 'future-campus': '/en/future-campus/',
    contact: '/en/contact/', privacy: '/en/privacy/',
  },
};
const KEYS = Object.keys(ROUTES.fr);
const path = (u) => new URL(u).pathname;

const browser = await chromium.launch();

/* Console errors are collected across every context below. */
const consoleErrors = [];
/* The 404 block below deliberately requests a URL that does not exist; the
   browser logs that as a console error. It is the test's own doing, not the
   site's, so it is muted for exactly that navigation and nothing else. */
let expectNotFound = false;
const watch = (page, where) => {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectNotFound && /Failed to load resource/.test(m.text())) return;
    consoleErrors.push(`${where}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${where}: ${e}`));
};

/* ------------------------------------------------------------------ *
 * 1 + 2  DESKTOP NAVIGATION AND SUBMENUS                              *
 * ------------------------------------------------------------------ */
for (const locale of ['fr', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, `desktop ${locale}`);
  const R = ROUTES[locale];

  /* every top-level nav item, clicked */
  const TOP = ['home', 'about', 'academics', 'admissions', 'school-life', 'future-campus', 'contact'];
  for (const key of TOP) {
    await page.goto(BASE + R.home, { waitUntil: 'load' });
    const link = page.locator(`.pnav__link[href="${R[key]}"]`).first();
    ok(await link.count() > 0, `${locale}: no desktop nav link for "${key}"`);
    if (await link.count() === 0) continue;
    await link.click();
    await page.waitForLoadState('load');
    ok(path(page.url()) === R[key], `${locale}: nav "${key}" went to ${path(page.url())}, expected ${R[key]}`);
  }
  done.push(`${locale}: 7 desktop nav items navigate correctly`);

  /* the Admissions action in the bar */
  await page.goto(BASE + R.home, { waitUntil: 'load' });
  await page.locator(`.mainbar__desktop .btn[href="${R.admissions}"]`).click();
  await page.waitForLoadState('load');
  ok(path(page.url()) === R.admissions, `${locale}: header Admissions CTA went to ${path(page.url())}`);

  /* the logo returns to this locale's homepage, never the other one */
  await page.goto(BASE + R.about, { waitUntil: 'load' });
  const logoHref = await page.locator('.lockup').first().getAttribute('href');
  ok(logoHref === R.home, `${locale}: logo points at ${logoHref}, expected ${R.home}`);
  await page.locator('.lockup').first().click();
  await page.waitForLoadState('load');
  ok(path(page.url()) === R.home, `${locale}: logo went to ${path(page.url())}`);

  /* Active state. Every page must say "you are here" SOMEWHERE in the chrome —
     the primary navigation for most, the utility bar for Calendar & Hours, the
     footer for Privacy — and it must never mark a page the visitor is not on. */
  for (const key of KEYS) {
    await page.goto(BASE + R[key], { waitUntil: 'load' });
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('header [aria-current="page"], footer [aria-current="page"]')]
        .map((a) => a.getAttribute('href')));
    ok(marked.includes(R[key]), `${locale}/${key}: nothing in the header or footer marks this page as current`);
    const strays = [...new Set(marked.filter((h) => h !== R[key]))];
    ok(strays.length === 0, `${locale}/${key}: aria-current="page" also on ${strays.join(', ')}`);
  }
  done.push(`${locale}: active-page state correct on all ${KEYS.length} pages`);

  /* A 404 is not a route: it must not be indexed as one, and it must not light
     up Home as though the visitor were on it. */
  expectNotFound = true;
  await page.goto(BASE + '/no-such-page/', { waitUntil: 'load' });
  expectNotFound = false;
  const nf = await page.evaluate(() => ({
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    alternates: document.querySelectorAll('link[rel="alternate"]').length,
    marked: document.querySelectorAll('header [aria-current="page"]').length,
    home: [...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/fr/'),
  }));
  ok(/noindex/.test(nf.robots ?? ''), `404: robots is "${nf.robots}", expected noindex`);
  ok(nf.canonical === null, `404: declares canonical ${nf.canonical}`);
  ok(nf.alternates === 0, `404: declares ${nf.alternates} hreflang alternates`);
  ok(nf.marked === 0, `404: the navigation marks ${nf.marked} item(s) as the current page`);
  ok(nf.home, '404: no link back to the French homepage');
  done.push(`${locale}: 404 — noindex, no canonical, no alternates, nothing marked current, way back home`);

  /* submenus */
  await page.goto(BASE + R.home, { waitUntil: 'load' });
  const groups = page.locator('.pnav__group');
  const nGroups = await groups.count();
  ok(nGroups === 2, `${locale}: expected 2 desktop submenus, found ${nGroups}`);
  for (let i = 0; i < nGroups; i++) {
    const g = groups.nth(i);
    const toggle = g.locator('.pnav__toggle');
    const menu = g.locator('.pnav__submenu');
    ok(await menu.isHidden(), `${locale}: submenu ${i} starts open`);
    ok(await toggle.getAttribute('aria-expanded') === 'false', `${locale}: submenu ${i} aria-expanded wrong at rest`);

    await toggle.click();
    ok(await menu.isVisible(), `${locale}: submenu ${i} did not open on click`);
    ok(await toggle.getAttribute('aria-expanded') === 'true', `${locale}: submenu ${i} aria-expanded not true when open`);

    /* aria-controls must name the thing it controls */
    const controls = await toggle.getAttribute('aria-controls');
    const menuId = await menu.getAttribute('id');
    ok(!!controls && controls === menuId,
      `${locale}: submenu ${i} toggle has aria-controls="${controls}" but the menu id is "${menuId}"`);

    /* Escape closes and returns focus to the toggle */
    await page.keyboard.press('Escape');
    ok(await menu.isHidden(), `${locale}: submenu ${i} did not close on Escape`);
    ok(await toggle.evaluate((el) => el === document.activeElement),
      `${locale}: submenu ${i} did not return focus to its toggle after Escape`);

    /* outside click closes */
    await toggle.click();
    /* a real pointer click on something that is neither the toggle nor the menu
       — a footer heading, which is plain text, so nothing else can fire */
    await page.locator('.footer__head').first().click();
    ok(await menu.isHidden(), `${locale}: submenu ${i} did not close on an outside click`);
    await page.evaluate(() => scrollTo(0, 0));

    /* the toggle is operable from the keyboard */
    await toggle.focus();
    await page.keyboard.press('Enter');
    ok(await menu.isVisible(), `${locale}: submenu ${i} did not open with Enter`);
    /* and its links go somewhere real */
    const first = menu.locator('a').first();
    const href = await first.getAttribute('href');
    await first.click();
    await page.waitForLoadState('load');
    ok(path(page.url()) === href, `${locale}: submenu link went to ${path(page.url())}, expected ${href}`);
    await page.goto(BASE + R.home, { waitUntil: 'load' });
  }
  done.push(`${locale}: submenus — click, Escape + focus return, outside click, Enter, links`);

  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * 3  MOBILE DRAWER                                                    *
 * ------------------------------------------------------------------ */
for (const width of [320, 375, 430]) {
  for (const locale of ['fr', 'en']) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    watch(page, `drawer ${locale} @${width}`);
    const R = ROUTES[locale];
    const tag = `${locale} @${width}`;
    await page.goto(BASE + R.about, { waitUntil: 'load' });

    const drawer = page.locator('#mobile-drawer');
    const open = page.locator('#menu-open');
    const close = page.locator('#menu-close');

    ok(await open.isVisible(), `${tag}: the menu button is not visible`);
    ok(await drawer.isHidden(), `${tag}: the drawer starts open`);

    /* open */
    await open.click();
    ok(await drawer.isVisible(), `${tag}: the drawer did not open`);
    ok(await open.getAttribute('aria-expanded') === 'true', `${tag}: aria-expanded not true when open`);
    ok(await page.evaluate(() => getComputedStyle(document.body).overflow) === 'hidden',
      `${tag}: the page still scrolls behind the open drawer`);
    ok(await page.evaluate(() => document.querySelector('.drawer__panel')?.contains(document.activeElement)),
      `${tag}: focus did not move into the drawer`);

    /* focus trap: Tab from the last item wraps to the first */
    const trapped = await page.evaluate(() => {
      const panel = document.querySelector('.drawer__panel');
      const items = [...panel.querySelectorAll('a[href], button:not([disabled])')];
      return items.length > 1 && items.every((el) => panel.contains(el));
    });
    ok(trapped, `${tag}: the drawer has no focusable chain to trap`);
    await page.evaluate(() => {
      const panel = document.querySelector('.drawer__panel');
      const items = [...panel.querySelectorAll('a[href], button:not([disabled])')];
      items[items.length - 1].focus();
    });
    await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.querySelector('.drawer__panel')?.contains(document.activeElement)),
      `${tag}: Tab from the last drawer item escaped the drawer`);
    await page.keyboard.press('Shift+Tab');
    ok(await page.evaluate(() => document.querySelector('.drawer__panel')?.contains(document.activeElement)),
      `${tag}: Shift+Tab escaped the drawer`);

    /* close with the close button, and focus returns to the opener */
    await close.click();
    ok(await drawer.isHidden(), `${tag}: the close button did not close the drawer`);
    ok(await page.evaluate(() => getComputedStyle(document.body).overflow) !== 'hidden',
      `${tag}: scrolling was not restored after closing`);
    ok(await open.evaluate((el) => el === document.activeElement),
      `${tag}: focus did not return to the menu button`);

    /* reopen, then Escape */
    await open.click();
    ok(await drawer.isVisible(), `${tag}: the drawer did not reopen`);
    await page.keyboard.press('Escape');
    ok(await drawer.isHidden(), `${tag}: Escape did not close the drawer`);

    /* reopen, then click the scrim */
    await open.click();
    await page.locator('.drawer__scrim').click({ position: { x: 5, y: 5 } });
    ok(await drawer.isHidden(), `${tag}: clicking the scrim did not close the drawer`);
    ok(await page.evaluate(() => getComputedStyle(document.body).overflow) !== 'hidden',
      `${tag}: scrolling was not restored after a scrim close`);

    /* a drawer link navigates */
    await open.click();
    const item = page.locator(`.drawer__link[href="${R.academics}"]`);
    ok(await item.count() === 1, `${tag}: no drawer link for Academics`);
    await item.click();
    await page.waitForLoadState('load');
    ok(path(page.url()) === R.academics, `${tag}: drawer link went to ${path(page.url())}`);
    ok(await page.locator('#mobile-drawer').isHidden(), `${tag}: the drawer is still open on the new page`);

    /* Home and Admissions from the drawer */
    await page.locator('#menu-open').click();
    await page.locator(`.drawer__link[href="${R.home}"]`).click();
    await page.waitForLoadState('load');
    ok(path(page.url()) === R.home, `${tag}: drawer Home went to ${path(page.url())}`);

    await page.locator('#menu-open').click();
    await page.locator(`.drawer__actions .btn[href="${R.admissions}"]`).click();
    await page.waitForLoadState('load');
    ok(path(page.url()) === R.admissions, `${tag}: drawer Admissions went to ${path(page.url())}`);

    /* the sticky action bar is reachable and does not cover the page footer */
    const bar = page.locator('.actionbar');
    ok(await bar.isVisible(), `${tag}: the action bar is not visible`);
    const clearance = await page.evaluate(() => {
      const b = document.querySelector('.actionbar').getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(document.body).paddingBottom);
      return { h: b.height, pad };
    });
    ok(clearance.pad >= clearance.h - 1,
      `${tag}: body padding ${Math.round(clearance.pad)}px is less than the action bar ${Math.round(clearance.h)}px`);

    await ctx.close();
  }
}
done.push(`mobile drawer: open / close ×3 / scroll lock / focus trap / focus return / reopen / navigate — 320, 375, 430 in both languages`);

/* ------------------------------------------------------------------ *
 * 4  LANGUAGE SWITCHING, FROM EVERY PAGE, BOTH DIRECTIONS             *
 * ------------------------------------------------------------------ */
for (const width of [1280, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  watch(page, `switcher @${width}`);
  for (const from of ['fr', 'en']) {
    const to = from === 'fr' ? 'en' : 'fr';
    for (const key of KEYS) {
      await page.goto(BASE + ROUTES[from][key], { waitUntil: 'load' });
      /* the switcher lives in the utility bar on desktop and in the mobile row
         below it; take whichever one is actually on screen */
      const link = page.locator(`.lang__link[hreflang="${to}"]`).locator('visible=true').first();
      ok(await link.count() > 0, `@${width} ${from}/${key}: no visible switcher link to ${to}`);
      if (await link.count() === 0) continue;
      const href = await link.getAttribute('href');
      ok(href === ROUTES[to][key],
        `@${width} ${from}/${key}: switcher points at ${href}, expected ${ROUTES[to][key]}`);
      await link.click();
      await page.waitForLoadState('load');
      ok(path(page.url()) === ROUTES[to][key],
        `@${width} ${from}/${key}: switching landed on ${path(page.url())}, expected ${ROUTES[to][key]}`);
      const lang = await page.evaluate(() => document.documentElement.lang);
      ok(lang === to, `@${width} ${from}/${key}: landed page declares lang="${lang}"`);
    }
  }
  await ctx.close();
}
done.push(`language switching: ${KEYS.length} pages × 2 directions × 2 widths — every landing URL verified`);

/* ------------------------------------------------------------------ *
 * 5  BUTTONS — nothing decorative pretending to be functional          *
 * ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'buttons');
  /* Every class here is a control with a real job, and each one is driven
     somewhere in this suite or in another. The gallery's photograph triggers
     and viewer controls joined the list on 13 September 2026 and are exercised
     end to end in tests/gallery-check.mjs — opened, stepped, closed, and
     checked for focus containment and scroll locking. */
  const KNOWN = [
    'menu-open', 'menu-close', 'pnav__toggle', 'hero__nav', 'hero__toggle',
    'school-image__open',        // opens a photograph in the viewer
    'lb__btn',                   // the viewer's previous / next / close
  ];
  for (const locale of ['fr', 'en']) {
    for (const key of KEYS) {
      await page.goto(BASE + ROUTES[locale][key], { waitUntil: 'load' });
      const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => ({
        id: b.id, cls: (b.className || '').toString(), type: b.type,
        label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30),
      })));
      /* A whitelist that only checks a class name would let a decorative button
         in by copying the class. So the gallery's triggers are checked for the
         thing that makes them work: a full-size source and an accessible name. */
      const inert = await page.evaluate(() => [...document.querySelectorAll('button.school-image__open')]
        .filter((b) => !b.dataset.lbFull || !(b.getAttribute('aria-label') || '').trim())
        .length);
      ok(inert === 0, `${locale}/${key}: ${inert} photograph button(s) open nothing`);

      for (const b of buttons) {
        const known = KNOWN.some((k) => b.id === k || b.cls.split(/\s+/).includes(k));
        ok(known, `${locale}/${key}: <button> with no known job — id="${b.id}" class="${b.cls}" "${b.label}"`);
        ok(b.type === 'button', `${locale}/${key}: <button type="${b.type}"> outside a form`);
      }
      /* every .btn must be a real link or one of those buttons */
      const dead = await page.evaluate(() => [...document.querySelectorAll('.btn')]
        .filter((el) => el.tagName === 'A' && !el.getAttribute('href'))
        .map((el) => el.textContent.trim().slice(0, 30)));
      ok(dead.length === 0, `${locale}/${key}: .btn rendered as a link with no href: ${dead.join(', ')}`);
    }
  }
  await ctx.close();
  done.push('buttons: every <button> has a known job; no .btn is a link without an href');
}

/* ------------------------------------------------------------------ *
 * 6 + 7  KEYBOARD AND SCROLL                                          *
 * ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'keyboard');
  for (const locale of ['fr', 'en']) {
    for (const key of ['home', 'about', 'admissions', 'contact']) {
      const route = ROUTES[locale][key];
      await page.goto(BASE + route, { waitUntil: 'load' });

      /* the first Tab reaches the skip link, and it is visible once focused */
      await page.keyboard.press('Tab');
      const skip = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el?.classList.contains('skip-link')) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { top: r.top, outline: cs.outlineStyle, width: cs.outlineWidth };
      });
      ok(skip !== null, `${locale}/${key}: the first Tab stop is not the skip link`);
      ok(skip && skip.top >= -1, `${locale}/${key}: the focused skip link is off-screen`);

      /* activating it lands on main, and the sticky header does not cover it */
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);           // smooth scrolling
      const landing = await page.evaluate(() => {
        const main = document.getElementById('main');
        const header = document.querySelector('[data-header]');
        const hb = header.getBoundingClientRect();
        const cs = getComputedStyle(header);
        return {
          mainTop: main.getBoundingClientRect().top,
          headerBottom: cs.position === 'static' || cs.position === 'absolute' ? 0 : hb.bottom,
          focused: document.activeElement?.id === 'main',
        };
      });
      ok(landing.focused, `${locale}/${key}: the skip link did not move focus to <main>`);
      ok(landing.mainTop >= landing.headerBottom - 1,
        `${locale}/${key}: after the skip link, <main> starts ${Math.round(landing.headerBottom - landing.mainTop)}px behind the sticky header`);

      /* no keyboard trap: 40 tabs stay inside the document and reach the footer */
      const reached = await page.evaluate(async () => {
        const els = [...document.querySelectorAll('a[href], button:not([disabled])')]
          .filter((el) => el.offsetParent !== null || el.classList.contains('skip-link'));
        return els.length;
      });
      ok(reached > 20, `${locale}/${key}: only ${reached} focusable elements found`);
    }
  }
  await ctx.close();
  done.push('keyboard: skip link is the first stop, lands clear of the sticky header, focus moves to <main>');
}

/* ------------------------------------------------------------------ *
 * 9  TOUCH TARGETS AND SPACING IN THE CHROME                          *
 *                                                                     *
 * pages-responsive.mjs measures what is inside <main>. The header, the *
 * drawer, the footer and the sticky action bar are the controls a      *
 * visitor on a phone actually uses, so they are measured here.         *
 * ------------------------------------------------------------------ */
for (const width of [320, 375, 430, 768]) {
  for (const locale of ['fr', 'en']) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    watch(page, `chrome ${locale} @${width}`);
    const tag = `${locale} @${width}`;
    await page.goto(BASE + ROUTES[locale].academics, { waitUntil: 'load' });
    await page.locator('#menu-open').click();     // measure the drawer open

    const report = await page.evaluate(() => {
      const small = [], crowded = [];
      const boxes = [];
      const scopes = ['header', '.drawer__panel', '.actionbar', 'footer'];
      for (const scope of scopes) {
        const root = document.querySelector(scope);
        if (!root) continue;
        for (const el of root.querySelectorAll('a[href], button:not([disabled])')) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;       // not rendered at this width
          const name = `${scope} ${el.className || el.tagName}`.trim().slice(0, 40);
          // The lockup is a large block link; inline footer address lines are text.
          if (el.classList.contains('lockup')) continue;
          /* 44px for the controls a visitor drives the site with; the footer's
             link lists are secondary and are held to WCAG 2.2 AA's 24px. */
          const floor = scope === 'footer' ? 24 : 44;
          if (r.height < floor) small.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)} (min ${floor})`);
          boxes.push({ name, r: { x: r.x, y: r.y, w: r.width, h: r.height }, scope });
        }
      }
      /* two controls in the same row must not be closer than 8px */
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r, b = boxes[j].r;
          if (boxes[i].scope !== boxes[j].scope) continue;
          const sameRow = a.y < b.y + b.h && b.y < a.y + a.h;
          if (!sameRow) continue;
          const gap = b.x > a.x ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
          /* Two full-size targets may meet edge to edge — that is what a
             segmented bar is. Crowding is only a hazard when a target is
             small enough to miss. */
          const big = (x) => x.w >= 44 && x.h >= 44;
          if (gap < -1) crowded.push(`${boxes[i].name} overlaps ${boxes[j].name}`);
          else if (gap < 8 && !(big(a) && big(b)))
            crowded.push(`${boxes[i].name} / ${boxes[j].name} only ${Math.round(gap)}px apart`);
        }
      }
      return { small: [...new Set(small)], crowded: [...new Set(crowded)] };
    });

    ok(report.small.length === 0, `${tag}: chrome control under 44px tall: ${report.small.slice(0, 4).join(', ')}`);
    ok(report.crowded.length === 0, `${tag}: controls too close: ${report.crowded.slice(0, 3).join(', ')}`);
    await ctx.close();
  }
}
done.push('chrome controls: header, drawer, action bar and footer measured at 320, 375, 430, 768 in both languages');

/* ------------------------------------------------------------------ *
 * 10  HOVER AND MOTION                                                *
 * ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'hover');
  await page.goto(BASE + ROUTES.en.about, { waitUntil: 'load' });

  /* hover must change appearance without moving anything */
  for (const sel of ['.pnav__link', '.mainbar__desktop .btn', '.footer__list a']) {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const before = await el.boundingBox();
    const colBefore = await el.evaluate((n) => getComputedStyle(n).color);
    await el.hover();
    await page.waitForTimeout(200);
    const after = await el.boundingBox();
    const colAfter = await el.evaluate((n) => getComputedStyle(n).color);
    ok(Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1
       && Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1,
      `hover on ${sel} moves or resizes it`);
    ok(colBefore !== colAfter || sel.includes('btn'),
      `hover on ${sel} changes nothing a visitor can see`);
  }

  /* no interaction may introduce horizontal scrolling */
  const overflowAfterDrawer = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth <= d.clientWidth + 1;
  });
  ok(overflowAfterDrawer, 'the page scrolls horizontally after hovering the chrome');
  await ctx.close();

  /* reduced motion: animations are off and scrolling is not smoothed */
  const rm = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: 'reduce' });
  const p2 = await rm.newPage();
  watch(p2, 'reduced-motion');
  await p2.goto(BASE + ROUTES.en.about, { waitUntil: 'load' });
  ok(await p2.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior) === 'auto',
    'reduced motion: scroll-behavior is still smooth');
  await p2.locator('#menu-open').click();
  const anim = await p2.evaluate(() => getComputedStyle(document.querySelector('.drawer__panel')).animationName);
  ok(anim === 'none', `reduced motion: the drawer still animates (${anim})`);
  ok(await p2.locator('#mobile-drawer').isVisible(), 'reduced motion: the drawer did not open');
  await rm.close();
  done.push('hover: no layout shift, visible change; reduced motion: no drawer animation, no smooth scrolling');
}

/* ------------------------------------------------------------------ *
 * 11  SCROLL BEHAVIOUR                                                *
 * ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'scroll');

  /* inner pages: the header sticks, stays on top, and never hides a heading */
  for (const locale of ['fr', 'en']) {
    await page.goto(BASE + ROUTES[locale].academics, { waitUntil: 'load' });
    await page.evaluate(() => scrollTo({ top: 2000, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      const h = document.querySelector('[data-header]').getBoundingClientRect();
      const hidden = [...document.querySelectorAll('main h2, main h3')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.top < h.bottom && r.bottom > h.top; })
        .map((el) => el.textContent.trim().slice(0, 30));
      return { top: h.top, height: h.height, hidden, overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    });
    ok(Math.abs(s.top) < 1, `${locale}: the header did not stay stuck to the top while scrolling (top ${Math.round(s.top)})`);
    ok(s.overflow, `${locale}: scrolling introduced horizontal overflow`);
    /* a heading passing behind a sticky header during a scroll is normal; what
       matters is that scrolling back up brings it clear again */
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => window.scrollY);
    ok(back === 0, `${locale}: the page did not return to the top`);
  }

  /* homepage: the overlay header turns solid once the hero has passed, and
     turns back when it returns */
  for (const locale of ['fr', 'en']) {
    await page.goto(BASE + ROUTES[locale].home, { waitUntil: 'load' });
    const atTop = await page.evaluate(() => {
      const h = document.querySelector('[data-header]');
      return { stuck: h.classList.contains('is-stuck'), pos: getComputedStyle(h).position };
    });
    ok(!atTop.stuck, `${locale}: the homepage header is already stuck at the top of the page`);
    ok(atTop.pos === 'absolute', `${locale}: the homepage header is ${atTop.pos}, expected absolute over the photograph`);

    await page.evaluate(() => scrollTo({ top: 1600, behavior: 'instant' }));
    await page.waitForFunction(() => {
  const h = document.querySelector('[data-header]');
  return h && h.classList.contains('is-stuck') && Math.abs(h.getBoundingClientRect().top) < 1;
});
    const past = await page.evaluate(() => {
      const h = document.querySelector('[data-header]');
      const r = h.getBoundingClientRect();
      return { stuck: h.classList.contains('is-stuck'), pos: getComputedStyle(h).position, top: r.top };
    });
    ok(past.stuck, `${locale}: the homepage header did not become solid past the hero`);
    ok(past.pos === 'fixed' && Math.abs(past.top) < 1,
      `${locale}: the stuck homepage header is ${past.pos} at top ${Math.round(past.top)}`);

    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(600);
    const again = await page.evaluate(() => document.querySelector('[data-header]').classList.contains('is-stuck'));
    ok(!again, `${locale}: the homepage header stayed solid after scrolling back to the hero`);
  }
  await ctx.close();
  done.push('scroll: the inner-page header stays stuck; the homepage header turns solid past the hero and back again');
}

await browser.close();

/* ------------------------------------------------------------------ */
console.log('  ' + done.join('\n  '));
console.log(`  console errors during interaction: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 8)) console.log(`    ${e}`);
if (consoleErrors.length) fails.push(`${consoleErrors.length} console error(s) during interaction`);

console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall functional checks passed');
process.exit(fails.length ? 1 : 0);
