/**
 * HERO CONTRAST — text over photography, measured rather than assumed.
 *
 * The hero is the one place on this site where text sits directly on a
 * photograph. A token-level contrast check cannot see it: the background is not
 * a colour, it is five different photographs under a gradient, and the answer
 * changes with the frame, the viewport and where the words happen to land.
 *
 * So this measures the real thing:
 *
 *   1  screenshot each text band with the words SHOWN and with them HIDDEN.
 *      The pixels that differ are the pixels the glyphs cover — a glyph mask.
 *   2  read the on-screen background at exactly those coordinates, so a blown
 *      highlight in the empty half of a headline box cannot set the result.
 *   3  take the brightest 1% of them — the worst case a letter actually sits on.
 *   4  compare against the band's REAL foreground colour and its REAL WCAG bar.
 *
 * The bars come from the rendered size, not from a guess:
 *   headline  fs-hero, 40px minimum          large text   3:1
 *   eyebrow   13px semibold gold-300         small text   4.5:1
 *   lead      fs-lead paper at 92%           small text   4.5:1
 *   actions   button labels, paper           small text   4.5:1
 *   caption   13px paper at 95%              small text   4.5:1
 *   count     17px paper                     small text   4.5:1
 *
 * All five approved frames, eight widths, both languages' hero (the French is
 * the longer text and wraps to more lines, so it covers more of the frame).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.argv[2] || 'http://localhost:4322';
const WIDTHS = [320, 375, 430, 768, 1024, 1280, 1440, 1920];
const LOCALES = ['fr', 'en'];
const PAPER = [251, 250, 248];
const GOLD = [251, 215, 93];

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg, bg, a) => fg.map((c, i) => a * c + (1 - a) * bg[i]);
const raw = (buf) => sharp(buf).raw().toBuffer({ resolveWithObject: true });

/** Brightest 1% of the background pixels that a glyph actually sits on. */
async function bgUnderGlyphs(bgBuf, fgBuf) {
  const a = await raw(bgBuf), b = await raw(fgBuf);
  const ch = a.info.channels;
  const px = [];
  for (let i = 0; i < a.data.length; i += ch) {
    const d = Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d < 60) continue;                    // background, or faint antialiasing
    px.push([a.data[i], a.data[i + 1], a.data[i + 2]]);
  }
  if (!px.length) return null;
  px.sort((x, y) => lum(y) - lum(x));
  return px[Math.max(1, Math.floor(px.length * 0.01)) - 1];
}

const BANDS = [
  ['eyebrow', '.hero__eyebrow', GOLD, 1, 4.5],
  ['headline', '.hero__headline', PAPER, 1, 3],
  ['lead', '.hero__lead', PAPER, 0.92, 4.5],
  ['actions', '.hero__actions', PAPER, 1, 4.5],
  ['caption', '.hero__caption', PAPER, 0.95, 4.5],
  ['count', '.hero__count', PAPER, 1, 4.5],
  /* The homepage header floats over the same photograph (header--overlay), so
     its text is text-on-photography too and belongs here rather than in the
     colour-arithmetic sweep, which can only see that it has no opaque
     background. Its ground is --scrim-top over the frame. */
  ['hdr-name', '.header--overlay .lockup__name', PAPER, 1, 4.5],
  ['hdr-motto', '.header--overlay .lockup__motto', GOLD, 1, 4.5],
  ['hdr-utility', '.header--overlay .utility__link', PAPER, 1, 4.5],
  ['hdr-nav', '.header--overlay .pnav__link', PAPER, 1, 4.5],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const worst = {};
let measured = 0;

for (const locale of LOCALES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${locale}/`, { waitUntil: 'load' });
    await p.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    });
    /* stop the sequence advancing underneath the measurement */
    const toggle = await p.$('[data-hero-toggle]');
    if (toggle) { await toggle.click(); await p.waitForTimeout(150); }

    for (let frame = 0; frame < 5; frame++) {
      if (frame > 0) { await p.click('[data-hero-next]'); await p.waitForTimeout(900); }

      const boxes = await p.evaluate((sels) => {
        const out = {};
        for (const [name, sel] of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const b = el.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          out[name] = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
        }
        return out;
      }, BANDS.map(([n, s]) => [n, s]));

      const shown = {};
      for (const [name] of BANDS) if (boxes[name]) shown[name] = await p.screenshot({ clip: boxes[name] });

      /* .hero__content holds the words and the caption/controls rail; the two
         header bars float over the same photograph and have to come out of the
         picture too. The header's ::before scrim stays — it is part of the
         ground these words actually sit on. */
      const HIDE = '.hero__content, .header--overlay .utility__inner, .header--overlay .mainbar__inner';
      await p.evaluate((sel) => {
        document.querySelectorAll(sel).forEach((el) => { el.style.visibility = 'hidden'; });
      }, HIDE);
      await p.waitForTimeout(60);
      const hidden = {};
      for (const [name] of BANDS) if (boxes[name]) hidden[name] = await p.screenshot({ clip: boxes[name] });
      await p.evaluate((sel) => {
        document.querySelectorAll(sel).forEach((el) => { el.style.visibility = ''; });
      }, HIDE);

      for (const [name, , fg, fgAlpha, bar] of BANDS) {
        if (!boxes[name]) continue;
        const bg = await bgUnderGlyphs(hidden[name], shown[name]);
        if (!bg) continue;
        const text = fgAlpha < 1 ? over(fg, bg, fgAlpha) : fg;
        const c = ratio(text, bg);
        measured++;
        const where = `${locale} @${width} frame ${frame + 1} ${name}`;
        if (!worst[name] || c < worst[name].c) worst[name] = { c, where, bg, bar };
        if (c < bar) fails.push(`${where}: ${c.toFixed(2)}:1 on (${bg.join(',')}) — needs ${bar}:1`);
      }
    }
    await ctx.close();
  }
}
await browser.close();

console.log(`measured ${measured} band/frame/width combinations\n`);
console.log('band      worst contrast  bar   where');
for (const [name, w] of Object.entries(worst))
  console.log(`${name.padEnd(9)} ${`${w.c.toFixed(2)}:1`.padStart(13)}  ${String(w.bar).padEnd(4)}  ${w.where}${w.c < w.bar ? '  ✗' : ''}`);

console.log(fails.length
  ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ')
  : '\nevery hero band clears its WCAG bar on every frame at every width, in both languages');
process.exit(fails.length ? 1 : 0);
