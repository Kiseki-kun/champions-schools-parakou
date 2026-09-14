/**
 * Utility: capture reference screenshots of any route at any widths.
 *
 *   node tests/screenshots.mjs <base-url> <out-dir> <path> [widths...]
 *   node tests/screenshots.mjs http://localhost:4322 ./shots /fr/ 390 768 1280
 *
 * Add --full to capture the whole page; the script scrolls first so lazy
 * images are decoded before the capture.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:4322', out = './shots', route = '/fr/', ...rest] = process.argv.slice(2);
const full = rest.includes('--full');
const widths = rest.filter((a) => /^\d+$/.test(a)).map(Number);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const width of widths.length ? widths : [390, 768, 1280, 1600]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(base + route, { waitUntil: 'networkidle' });
  if (full) {
    // Chromium omits lazy images from the off-screen part of a fullPage
    // capture even once they have decoded, so force them eager first. This
    // affects the screenshot only — the shipped page still lazy-loads.
    await page.evaluate(() => {
      for (const i of document.images) i.loading = 'eager';
    });
    await page.evaluate(async () => {
      const step = innerHeight * 0.5;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        scrollTo(0, y); await new Promise((r) => setTimeout(r, 160));
      }
      scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
      null, { timeout: 25000 },
    ).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(500);
  const name = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
  await page.screenshot({ path: `${out}/${name}-${width}${full ? '-full' : ''}.png`, fullPage: full });
  console.log(`  ${name} @${width}`);
  await page.close();
}
await browser.close();
