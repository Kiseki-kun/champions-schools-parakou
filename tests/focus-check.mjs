/**
 * FOCUS INDICATORS — Phase 10.
 *
 * axe-core does not evaluate focus-indicator contrast, so nothing before this
 * phase was checking it. This does, against the background each indicator is
 * actually drawn on.
 *
 * WCAG 1.4.11 asks 3:1 of a focus indicator. The site's indicator is two
 * adjacent bands — a paper ring hugging the element and an ink ring just
 * outside it — so the test is whether EITHER band clears 3:1 against the
 * ground: one perceivable band is a perceivable indicator, and the two bands
 * also contrast with each other, so the boundary never disappears.
 *
 * Where the ground is a photograph rather than a colour (the homepage's overlay
 * header), the CSS walker cannot answer, so the background is sampled from the
 * rendered pixels instead.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.argv[2] || 'http://localhost:4322';
const WIDTHS = [375, 1280];

/* Routes chosen to cover every distinct ground on the site: the photographic
   hero and overlay header, the paper pages, the blue-900 bands (footer,
   utility, invite, voice), the tinted sections, and the filled buttons. */
const ROUTES = ['/fr/', '/en/', '/en/about/', '/fr/contact/', '/fr/futur-campus/', '/fr/distinctions/'];

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = (c) => {
  const m = (c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  return m && (m[4] === undefined || +m[4] > 0.9) ? [+m[1], +m[2], +m[3]] : null;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const seen = new Set();
let measured = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    });
    const n = await page.evaluate(() =>
      document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])').length);

    for (let i = 0; i < n; i++) {
      const info = await page.evaluate((idx) => {
        const els = [...document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')];
        const el = els[idx];
        if (!el) return null;
        const pre = getComputedStyle(el);
        if (pre.display === 'none' || pre.visibility === 'hidden') return null;
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return null;
        el.focus();
        const cs = getComputedStyle(el);
        /* first ancestor with an opaque background — null means the ground is
           a photograph, and the caller samples pixels instead */
        let node = el, ground = null, groundOn = '?';
        while (node && node !== document.documentElement) {
          const c = getComputedStyle(node).backgroundColor;
          const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
          if (m && (m[4] === undefined || +m[4] > 0.9)) {
            ground = c;
            groundOn = (node.className || '').toString().trim().split(/\s+/)[0] || node.tagName.toLowerCase();
            break;
          }
          node = node.parentElement;
        }
        const inOverlayHeader = !!el.closest('.header--overlay');
        return {
          cls: (el.className || '').toString().trim().split(/\s+/)[0] || el.tagName.toLowerCase(),
          name: (el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ')).slice(0, 34),
          outlineColor: cs.outlineColor,
          outlineWidth: parseFloat(cs.outlineWidth),
          outlineStyle: cs.outlineStyle,
          boxShadow: cs.boxShadow,
          ground: inOverlayHeader ? null : ground,
          groundOn: inOverlayHeader ? 'the hero photograph' : groundOn,
          box: { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) },
        };
      }, i);
      if (!info) continue;

      const key = `${route}|${info.cls}|${info.outlineColor}|${info.boxShadow}|${info.ground ?? 'photo'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      measured++;

      /* every band the indicator draws */
      const bands = [];
      if (info.outlineStyle !== 'none' && info.outlineWidth >= 1) {
        const c = parse(info.outlineColor);
        if (c) bands.push(['outline', c]);
      }
      for (const m of (info.boxShadow || '').matchAll(/rgba?\([^)]*\)/g)) {
        const c = parse(m[0]);
        if (c) bands.push(['ring', c]);
      }
      if (!bands.length) {
        fails.push(`${route} @${width} .${info.cls} "${info.name}" — no focus indicator at all`);
        continue;
      }

      /* the ground: a colour when the page has one, otherwise real pixels */
      let ground = parse(info.ground);
      if (!ground) {
        const pad = 6;
        const clip = {
          x: Math.max(0, info.box.x - pad),
          y: Math.max(0, info.box.y - pad),
          width: Math.min(width - Math.max(0, info.box.x - pad), info.box.width + pad * 2),
          height: info.box.height + pad * 2,
        };
        if (clip.width < 2 || clip.height < 2) continue;
        const buf = await page.screenshot({ clip });
        const { data, info: meta } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
        /* brightest pixel in the frame around the element — the worst case for
           the dark band, and the case the paper band has to answer */
        let best = null;
        for (let p = 0; p < data.length; p += meta.channels) {
          const px = [data[p], data[p + 1], data[p + 2]];
          if (!best || lum(px) > lum(best)) best = px;
        }
        ground = best;
      }
      if (!ground) continue;

      const scored = bands.map(([k, c]) => [k, ratio(c, ground)]);
      const best = scored.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (best[1] < 3) fails.push(
        `${route} @${width} .${info.cls} "${info.name}" — best band ${best[0]} at ${best[1].toFixed(2)}:1 `
        + `on ${info.groundOn} (${scored.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}) needs 3:1`);
    }
  }
  await ctx.close();
}
await browser.close();

console.log(`focus indicators: ${measured} distinct element/ground pairings across `
  + `${ROUTES.length} routes × ${WIDTHS.length} widths`);
console.log(fails.length
  ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ')
  : '\nevery focus indicator clears 3:1 against the ground it is drawn on');
process.exit(fails.length ? 1 : 0);
