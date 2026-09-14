import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:4322';
const PATHS = [
  '/', '/fr/', '/en/',
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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let problems = 0;
for (const vp of [{ width: 320, height: 720, name: '320' }, { width: 1280, height: 900, name: '1280' }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const p of PATHS) {
    const msgs = [], errs = [], failed = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
    const res = await page.goto(BASE + p, { waitUntil: 'networkidle' });
    const status = res?.status();
    // horizontal overflow check
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
      ? { scrollWidth: document.documentElement.scrollWidth, inner: window.innerWidth } : null);
    const problemsHere = [
      status !== 200 && p !== '/nope/' ? `HTTP ${status}` : null,
      msgs.length ? `console: ${msgs.join(' | ')}` : null,
      errs.length ? `pageerror: ${errs.join(' | ')}` : null,
      failed.length ? `requestfailed: ${failed.join(' | ')}` : null,
      overflow ? `H-OVERFLOW ${overflow.scrollWidth}px > ${overflow.inner}px` : null,
    ].filter(Boolean);
    if (problemsHere.length) { problems++; console.log(`  [${vp.name}] ${p}\n      ${problemsHere.join('\n      ')}`); }
    page.removeAllListeners('console'); page.removeAllListeners('pageerror'); page.removeAllListeners('requestfailed');
  }
  await ctx.close();
  console.log(`  viewport ${vp.name}px: checked ${PATHS.length} routes`);
}
await browser.close();
console.log(problems ? `\n  ${problems} problem(s)` : '\n  no console errors, no failed requests, no horizontal overflow');
