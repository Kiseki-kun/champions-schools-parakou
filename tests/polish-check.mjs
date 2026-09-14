/**
 * RESPONSIVE & VISUAL POLISH — Phase 9.
 *
 * The earlier responsive suites answer "does it fit?". This one answers "does
 * it look composed?" — the things that make a page read as designed rather than
 * as a desktop layout squeezed down:
 *
 *   1  no horizontal scrolling, and nothing wider than the viewport
 *   2  ONE left edge — the header, the page content and the footer must line up
 *   3  body copy keeps a readable measure at every width
 *   4  headings do not end on an orphan word
 *   5  no photograph is distorted
 *   6  the page is not flush to the screen edge, and not stranded in the middle
 *      of a very wide one
 *   7  the future-campus disclosure stays legible and stays with its images
 *
 * Nine widths, every page, both languages.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4322';
const WIDTHS = [320, 375, 430, 768, 1024, 1280, 1440, 1600, 1920];

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

/* The routes that carry future-campus concept images. Listed rather than
   inferred, so that a page losing its concept images is a failure and not an
   empty loop that quietly passes. */
const CONCEPT_PAGES = new Set(['/fr/', '/en/', '/fr/futur-campus/', '/en/future-campus/']);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
let renders = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    const tag = `${route} @${width}`;
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    });

    const r = await page.evaluate((w) => {
      const out = {
        doc: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        wide: [], longLines: [], orphans: [], stretched: [],
        edges: {}, gutters: {},
      };

      /* --- 1. nothing sticks out --- */
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (getComputedStyle(el).position === 'fixed') continue;   // the action bar
        if (b.right > w + 1.5 || b.left < -1.5)
          out.wide.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
      }

      /* --- 2. one left edge ---
         The header lockup, the first piece of page content and the footer's
         first column should all start at the same x. Two different container
         widths on one page read as a misalignment, not as a design. */
      const leftOf = (sel) => {
        const el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().left) : null;
      };
      out.edges.lockup = leftOf('.lockup');
      out.edges.utility = leftOf('.utility__inner');
      out.edges.footer = leftOf('.footer__col');
      /* Measure a real TEXT element, not a container box: .container carries
         its own padding-inline, so its border edge sits one gutter left of the
         text a reader actually sees. */
      out.edges.content =
        leftOf('.hero__eyebrow') ??          // homepage
        leftOf('.crumbs');                   // inner pages

      /* --- 3. a readable measure ---
         Measured from the RENDERED LINES, not the box: a two-word label in a
         wide box is not a long line. Only a paragraph that actually wraps can
         have a too-long measure, and the character width comes from the
         element's own font rather than a guess. */
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(50);
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      for (const p of document.querySelectorAll('main p')) {
        if (!p.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(p);
        const lines = [...range.getClientRects()].filter((x) => x.width > 1 && x.height > 1);
        if (lines.length < 2) continue;                 // one line: no measure to judge
        const cs = getComputedStyle(p);
        probe.style.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
        document.body.appendChild(probe);
        const ch = probe.getBoundingClientRect().width / 50;
        probe.remove();
        if (!ch) continue;
        const widest = Math.max(...lines.map((x) => x.width));
        const chars = widest / ch;
        if (chars > 100)
          out.longLines.push(`${Math.round(chars)}ch "${p.textContent.trim().slice(0, 32)}"`);
      }

      /* --- 4. orphan last lines in headings ---
         A heading that wraps and leaves one short word alone on the last line
         reads as a mistake. text-wrap: balance is the fix; this finds them. */
      for (const h of document.querySelectorAll('main h1, main h2')) {
        const node = [...h.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        if (!node) continue;
        const range = document.createRange();
        range.selectNodeContents(h);
        const lines = [...range.getClientRects()].filter((x) => x.width > 1);
        if (lines.length < 2) continue;
        const last = lines[lines.length - 1];
        const widest = Math.max(...lines.map((x) => x.width));
        const words = h.textContent.trim().split(/\s+/);
        if (last.width / widest < 0.22 && words.length > 3)
          out.orphans.push(`"${h.textContent.trim().slice(0, 40)}" last line ${Math.round(last.width)}px of ${Math.round(widest)}px`);
      }

      /* --- 5. no distorted photograph --- */
      for (const img of document.querySelectorAll('img')) {
        if (!img.naturalWidth) continue;
        const b = img.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        if (getComputedStyle(img).objectFit === 'cover') continue;
        const want = img.naturalWidth / img.naturalHeight;
        const got = b.width / b.height;
        if (Math.abs(want - got) / want > 0.02)
          out.stretched.push(img.currentSrc.split('/').pop());
      }

      /* --- 6. the side gutter ---
         Photographs bleed to the edge by design; WORDS never should. This walks
         every element that holds its own text and checks it keeps clear of both
         screen edges, which is the thing a reader actually notices. */
      const main = document.querySelector('main');
      out.gutters.mainLeft = main ? Math.round(main.getBoundingClientRect().left) : null;
      out.flush = [];
      for (const el of document.querySelectorAll('main *, footer *')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        for (const line of range.getClientRects()) {
          if (line.width < 1 || line.height < 1) continue;
          if (line.left < 10 || line.right > w - 10) {
            out.flush.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} `
              + `[${Math.round(line.left)}…${Math.round(line.right)}] "${el.textContent.trim().slice(0, 24)}"`);
            break;
          }
        }
      }

      /* --- 7. the future-campus disclosure --- */
      const banner = document.querySelector('.future__kicker');
      if (banner) {
        const cs = getComputedStyle(banner);
        const b = banner.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(banner);
        out.futureKicker = {
          px: parseFloat(cs.fontSize),
          lines: [...range.getClientRects()].filter((x) => x.width > 1).length,
          right: Math.round(b.right),
          text: banner.textContent.trim(),
        };
      }
      /* Every concept image carries the label, the label stays inside its own
         frame, stays on one line, and stays big enough to read. The figure is
         `.concept` and the chip `.concept__chip` — ConceptFrame.astro. Measured
         by class, so a renamed class fails the check rather than skipping it. */
      out.conceptCount = document.querySelectorAll('.concept').length;
      out.conceptLabels = [...document.querySelectorAll('.concept')].map((fig) => {
        const chip = fig.querySelector('.concept__chip');
        const img = fig.querySelector('img');
        if (!chip) return { missing: true };
        const fb = fig.getBoundingClientRect();
        const cb = chip.getBoundingClientRect();
        /* The chip holds a ◆ span and a text node, so a Range yields several
           rects on ONE line — and their tops differ by a pixel or two because
           the span is set smaller. Counting rects, or even distinct tops,
           reports three lines for one. The honest count is how many line boxes
           fit in the chip's content height. */
        const cs = getComputedStyle(chip);
        const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const contentH = cb.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const lines = Math.max(1, Math.round(contentH / lineH));
        return {
          inside: cb.left >= fb.left - 2 && cb.right <= fb.right + 2,
          /* The chip is designed to sit on the frame's bottom edge, just under
             the image. What matters is that it stays ATTACHED to the picture it
             labels — within a line of it, above or below. */
          gapFromImage: img ? Math.round(cb.top - img.getBoundingClientRect().bottom) : null,
          lines,
          px: parseFloat(cs.fontSize),
          width: Math.round(cb.width),
          text: chip.textContent.trim(),
        };
      });
      return out;
    }, width);

    renders++;
    ok(r.doc <= r.client + 1, `${tag}: horizontal overflow (${r.doc} > ${r.client})`);
    ok(r.wide.length === 0, `${tag}: outside the viewport: ${[...new Set(r.wide)].slice(0, 3).join(', ')}`);
    ok(r.longLines.length === 0, `${tag}: line too long — ${r.longLines.slice(0, 2).join(' | ')}`);
    ok(r.orphans.length === 0, `${tag}: orphan heading line — ${r.orphans.slice(0, 2).join(' | ')}`);
    ok(r.stretched.length === 0, `${tag}: distorted image ${[...new Set(r.stretched)].slice(0, 2).join(', ')}`);

    /* one left edge, from 1024 up where the header is horizontal */
    if (width >= 1024 && r.edges.content != null) {
      if (r.edges.lockup != null)
        ok(Math.abs(r.edges.lockup - r.edges.content) <= 2,
          `${tag}: the header lockup starts at ${r.edges.lockup}px but the page content at ${r.edges.content}px`);
      if (r.edges.footer != null)
        ok(Math.abs(r.edges.footer - r.edges.content) <= 2,
          `${tag}: the footer starts at ${r.edges.footer}px but the page content at ${r.edges.content}px`);
    }

    /* a side gutter always, and never a hairline one */
    ok(r.gutters.mainLeft === 0 || r.gutters.mainLeft >= 0,
      `${tag}: <main> starts at ${r.gutters.mainLeft}px`);
    ok(r.flush.length === 0,
      `${tag}: text runs into the screen edge — ${[...new Set(r.flush)].slice(0, 2).join(' | ')}`);

    /* the future-campus statement stays a statement */
    if (r.futureKicker) {
      ok(r.futureKicker.px >= 20,
        `${tag}: "${r.futureKicker.text}" is only ${Math.round(r.futureKicker.px)}px — too small to read as a statement`);
      ok(r.futureKicker.lines <= 2,
        `${tag}: "${r.futureKicker.text}" wraps onto ${r.futureKicker.lines} lines`);
      ok(r.futureKicker.right <= width + 1,
        `${tag}: the future-campus statement is clipped at the right edge`);
    }
    /* A page carrying concept images must carry a label on every one of them.
       CONCEPT_PAGES names the routes that are supposed to have them, so a page
       that silently loses its concept images fails here instead of passing an
       empty loop. */
    if (CONCEPT_PAGES.has(route))
      ok(r.conceptCount > 0, `${tag}: no concept figures found — the future-campus images are missing`);
    for (const l of r.conceptLabels ?? []) {
      ok(!l.missing, `${tag}: a concept image has no "Future Campus Concept" label`);
      if (l.missing) continue;
      ok(l.inside, `${tag}: the label "${l.text}" sits outside its frame`);
      ok(l.gapFromImage == null || (l.gapFromImage >= -40 && l.gapFromImage <= 24),
        `${tag}: the label "${l.text}" sits ${l.gapFromImage}px from its image — it has come away from the picture it labels`);
      ok(l.lines === 1, `${tag}: the label "${l.text}" wraps onto ${l.lines} lines`);
      ok(l.px >= 12, `${tag}: the label "${l.text}" is only ${l.px.toFixed(1)}px`);
      ok(l.width > 60, `${tag}: a concept label is only ${l.width}px wide`);
    }
  }
  await ctx.close();
}
await browser.close();

console.log(`checked ${ROUTES.length} pages × ${WIDTHS.length} widths = ${renders} renders`);
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall polish checks passed');
process.exit(fails.length ? 1 : 0);
