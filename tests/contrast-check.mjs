/**
 * WCAG 2.2 contrast, measured from the rendered page rather than estimated.
 *
 * Every text node's colour is compared against its first opaque ancestor
 * background. Thresholds: 4.5:1 normal text, 3:1 large text (>=24px, or >=19px
 * at weight >=700), 3:1 for control borders (1.4.11).
 *
 * Elements that are decorative and hidden from assistive technology are
 * reported separately: they are not failures, but they should still be legible.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const notes = [];
/* Elements with no opaque background behind them — text on photography.
   Listed, not failed: tests/hero-contrast.mjs measures these against the real
   pixels, which is the only way to judge them. */
const overPhotoAll = new Set();

/* Phase 6: the sweep covers every page, not only the homepage — the inner
   pages introduced tones (tint, deep) and devices (rung index, aside, chips,
   contact details) the homepage does not use. */
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

/* Two widths, because some of this interface only exists at one of them. The
   sweep used to run at 1280 alone, where the mobile action bar is display:none
   — so its primary link sat at 1.27:1 on every page below 1100px and no check
   could see it. Anything that appears at one width and not the other has to be
   measured at the width where it appears. */
const WIDTHS = [375, 1280];

const results = [];
for (const width of WIDTHS)
for (const route of ROUTES) {
  const locale = route.startsWith('/en/') ? 'en' : 'fr';
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });

  const found = await page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    /* Returns null when no opaque ancestor background exists. That is not a
       white page — it is text sitting on a photograph, and its contrast is a
       property of the pixels, not of the stylesheet. Assuming white there
       reported the overlay header's white lockup as 1:1 on the homepage, which
       is a measurement artefact rather than a defect. Those elements are
       measured for real, against the photograph, in tests/hero-contrast.mjs. */
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.9) return c;
        n = n.parentElement;
      }
      const root = parse(getComputedStyle(document.body).backgroundColor);
      return root && root.a > 0.9 ? root : null;
    };

    const out = [];
    const overPhoto = [];
    const seen = new Set();
    /* The whole page, not only <main>: the header, the footer, the mobile
       action bar and the drawer are interface too, and two of them never
       appear inside main. */
    for (const el of document.querySelectorAll('body *')) {
      // only elements that render their own text
      const hasOwnText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!hasOwnText) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      /* Text that exists only for screen readers has no visual contrast to
         judge; it is clipped to a 1px box off-screen. */
      if (el.closest('.visually-hidden, .sr-only')) continue;
      /* The homepage header floats over the hero photograph. Where its text
         sits directly on that photograph, its ground is a picture under a
         scrim rather than a colour, and colour arithmetic can only find the
         body's paper behind it and call white-on-white 1:1 — those bands are
         measured against the real pixels in tests/hero-contrast.mjs
         (hdr-name, hdr-motto, hdr-utility, hdr-nav). But the header also holds
         things that DO carry their own opaque ground, such as the gold
         Admissions button, and those stay measurable here. So the test is
         whether an opaque background is found before the walk leaves the
         header — not merely whether the element is inside it. */
      const overlay = el.closest('.header--overlay');
      if (overlay) {
        let n = el, ground = null;
        while (n && n !== overlay.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0.9) { ground = c; break; }
          n = n.parentElement;
        }
        if (!ground) {
          overPhoto.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0] || '-'}`);
          continue;
        }
      }
      const fg = parse(cs.color);
      if (!fg || fg.a < 0.95) continue;
      const bg = bgOf(el);
      if (!bg) { overPhoto.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0]}`); continue; }
      const size = parseFloat(cs.fontSize);
      const weight = +cs.fontWeight || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(fg, bg);
      const key = `${cs.color}|${cs.backgroundColor}|${size}|${el.className}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const decorative = !!el.closest('[aria-hidden="true"]') || el.getAttribute('aria-hidden') === 'true';
      out.push({
        kind: 'text',
        sel: `${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0] || '-'}`,
        text: el.textContent.trim().slice(0, 28),
        size: Math.round(size), weight, large, decorative,
        got: +got.toFixed(2), need,
      });
    }

    // 1.4.11: borders that identify a control
    for (const el of document.querySelectorAll('.btn, .hero__nav, .chip')) {
      const cs = getComputedStyle(el);
      const bw = parseFloat(cs.borderTopWidth);
      if (!bw) continue;
      const bc = parse(cs.borderTopColor);
      if (!bc || bc.a < 0.95) continue;
      const bg = bgOf(el.parentElement || el);
      if (!bg) continue;
      out.push({
        kind: 'border',
        sel: `${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/)[0]}`,
        text: el.textContent.trim().slice(0, 20),
        got: +ratio(bc, bg).toFixed(2), need: 3, decorative: false,
      });
    }
    return { out, overPhoto: [...new Set(overPhoto)] };
  });

  if (found.overPhoto.length) overPhotoAll.add(`${route} @${width}: ${found.overPhoto.join(', ')}`);
  for (const f of found.out) {
    results.push({ locale, route, width, ...f });
    if (f.got < f.need) {
      const line = `${route} @${width} ${f.kind} ${f.sel} "${f.text}" ${f.got}:1 (needs ${f.need}:1)`;
      const bucket = f.decorative ? notes : fails;
      if (!bucket.includes(line)) bucket.push(line);
    }
  }
  await page.context().close();
}

const worst = [...results].sort((a, b) => a.got - b.got).slice(0, 6);
console.log('  lowest measured ratios:');
for (const w of worst) {
  console.log(`    ${w.got.toString().padStart(6)}:1  ${w.kind.padEnd(6)} ${w.sel.padEnd(24)} "${w.text}"`);
}
console.log(`  ${results.length} colour pairings measured across ${ROUTES.length} pages in both locales at ${WIDTHS.join('px and ')}px`);
if (notes.length) console.log(`  decorative below threshold (not a failure):\n    ` + notes.join('\n    '));
if (overPhotoAll.size) console.log(`  text on photography, measured by pixel in tests/hero-contrast.mjs rather than here:\n    ` + [...overPhotoAll].join('\n    '));

await browser.close();
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall contrast checks passed');
if (fails.length) process.exitCode = 1;
