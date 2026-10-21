/**
 * SECURITY HEADERS — Phase 13.
 *
 * A Content-Security-Policy written and never tested is a liability: it either
 * does nothing or it breaks the site, and you find out in production. This
 * suite parses `public/_headers`, serves the built site with those exact
 * headers applied, loads every route in a real browser, and fails on any CSP
 * violation or console error.
 *
 * It also asserts the policy still says what it is supposed to say, so a
 * later edit that quietly widens it — `default-src *`, a third-party origin,
 * a re-enabled HSTS before deployment — fails here rather than shipping.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const DIST = resolve(process.argv[2] || 'dist');
const HEADERS_FILE = resolve('public/_headers');
const PORT = 4399;

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

/* ---------- parse the _headers file the way a host would ---------- */
ok(existsSync(HEADERS_FILE), 'public/_headers is missing');
const raw = existsSync(HEADERS_FILE) ? readFileSync(HEADERS_FILE, 'utf8') : '';
const rules = [];                       // [{ pattern, headers: {} }]
let current = null;
for (const line of raw.split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { current = { pattern: line.trim(), headers: {} }; rules.push(current); continue; }
  const m = line.match(/^\s+([A-Za-z0-9-]+):\s*(.+)$/);
  if (m && current) current.headers[m[1]] = m[2].trim();
}
const globalRule = rules.find((r) => r.pattern === '/*');
ok(!!globalRule, 'public/_headers has no /* rule');
const H = globalRule?.headers ?? {};

/* ---------- the policy must still say what it is meant to say ---------- */
const csp = H['Content-Security-Policy'] ?? '';
ok(!!csp, 'no Content-Security-Policy in _headers');
for (const need of [
  "default-src 'self'", "object-src 'none'", "base-uri 'self'",
  "frame-ancestors 'none'", "form-action 'none'", "img-src 'self'",
  "font-src 'self'", "connect-src 'self'",
]) ok(csp.includes(need), `the CSP no longer contains "${need}"`);
/* a wildcard source would quietly undo the whole policy */
ok(!/(^|[\s;])(default|script|style|img|font|connect|frame)-src[^;]*\*/.test(csp),
  'the CSP contains a wildcard source');
ok(!/https?:\/\//.test(csp), 'the CSP names a remote origin — the site loads nothing from one');

ok(H['X-Content-Type-Options'] === 'nosniff', 'X-Content-Type-Options is not nosniff');
ok(/^(DENY|SAMEORIGIN)$/.test(H['X-Frame-Options'] ?? ''), 'X-Frame-Options is not DENY/SAMEORIGIN');
ok(!!H['Referrer-Policy'], 'no Referrer-Policy');
ok(!!H['Permissions-Policy'], 'no Permissions-Policy');
/* HSTS must stay commented out until the real domain serves HTTPS: a browser
   that sees it remembers it, and on a domain whose certificate is not ready
   that is an outage no visitor can clear. */
ok(!('Strict-Transport-Security' in H),
  'Strict-Transport-Security is ACTIVE in _headers — it must stay commented out until the '
  + 'real domain is deployed and serving valid HTTPS on every subdomain');
ok(/^\s*#\s*Strict-Transport-Security:/m.test(raw),
  'the commented-out HSTS line is gone from _headers — it is the deployment reminder');

/* ---------- serve the built site WITH those headers ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(DIST, url);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  const found = existsSync(file) && !statSync(file).isDirectory();
  if (!found) file = join(DIST, '404.html');
  const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...H };
  for (const r of rules) {
    if (r.pattern === '/*') continue;
    const re = new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(url)) Object.assign(headers, r.headers);
  }
  res.writeHead(found ? 200 : 404, headers);
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

const ROUTES = [
  '/', '/404.html',
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

const browser = await chromium.launch();
let checked = 0;
for (const width of [375, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    const violations = [];
    const errors = [];
    const onConsole = (m) => {
      const t = m.text();
      if (m.type() !== 'error') return;
      /* the root stub redirects immediately; a cancelled navigation is not a
         security finding */
      if (/ERR_ABORTED|net::ERR_FAILED/.test(t)) return;
      if (/Content Security Policy|Refused to/i.test(t)) violations.push(t);
      else errors.push(t);
    };
    page.on('console', onConsole);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(BASE + route, { waitUntil: 'load' });
    /* exercise the interactive surfaces, which is where a CSP usually bites */
    if (route === '/fr/' || route === '/en/') {
      const next = await page.$('[data-hero-next]');
      if (next) { await next.click(); await page.waitForTimeout(900); }
    }
    if (width === 375) {
      const open = await page.$('#menu-open');
      if (open) { await open.click(); await page.waitForTimeout(250); await page.keyboard.press('Escape'); }
    } else {
      const t = await page.$('.pnav__toggle');
      if (t) { await t.click(); await page.waitForTimeout(200); await page.keyboard.press('Escape'); }
    }
    await page.waitForTimeout(250);
    page.off('console', onConsole);
    checked++;
    ok(violations.length === 0,
      `${route} @${width}: ${violations.length} CSP violation(s) — ${violations.slice(0, 2).join(' | ')}`);
    ok(errors.length === 0,
      `${route} @${width}: console error(s) under the policy — ${errors.slice(0, 2).join(' | ')}`);
  }
  await ctx.close();
}
await browser.close();
server.close();

console.log(`security headers: ${Object.keys(H).length} applied to every response; `
  + `${checked} page loads under the real policy (${ROUTES.length} routes × 2 widths, `
  + 'hero and menu exercised)');
console.log(fails.length
  ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ')
  : '\nthe policy holds: no CSP violation and no console error on any route');
process.exit(fails.length ? 1 : 0);
