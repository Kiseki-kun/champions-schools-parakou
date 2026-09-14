/**
 * SECURITY POSTURE — Phase 13.
 *
 * The Phase 13 audit established a set of properties by hand. This suite turns
 * each one into something that fails if it stops being true, because a posture
 * that is only true on the day it was audited is not a posture.
 *
 * Every assertion below corresponds to a finding or a verified property in
 * 13-SECURITY.md. None of it is decoration:
 *
 *   1  no user-input surface reaches any built page
 *   2  nothing is loaded from a third-party origin
 *   3  every outbound link is safe against reverse tabnabbing
 *   4  no dangerous HTML sink survives into shipped JavaScript
 *   5  the JSON-LD sink stays escaped
 *   6  no source map, filesystem path or dev URL is shipped
 *   7  no secret-shaped value appears in the build
 *   8  the project reads no environment variable, and none is exposed
 *   9  .gitignore still covers credential material
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || 'dist';
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const all = walk(DIST);
const html = all.filter((f) => f.endsWith('.html'));
const text = all.filter((f) => /\.(html|js|css|xml|txt|json)$/.test(f));
const src = existsSync('src') ? walk('src') : [];
const srcText = src.filter((f) => /\.(astro|ts|js|mjs|yaml|css)$/.test(f));

ok(html.length >= 28, `only ${html.length} built pages found — is this a real build?`);

/* ---------- 1. no user-input surface ----------
   The site deliberately has no form: enquiries go to the school's own email
   and telephone (Phases 7 and 8). An unused form component still exists in
   src/components/ui/, so this checks the BUILT pages — what actually ships. */
for (const f of html) {
  const s = readFileSync(f, 'utf8');
  for (const tag of ['<form', '<input', '<textarea', '<select']) {
    ok(!s.includes(tag),
      `${f}: ships a ${tag}> — the site has no form by decision, and a new input `
      + 'surface needs a deliberate choice, not an accident');
  }
}

/* ---------- 2. nothing loads from a third party ----------
   Metadata may NAME a remote URL (canonical, hreflang, og:url, JSON-LD
   @context, XML namespaces, a WhatsApp link). What must not happen is a
   browser FETCHING from one: script, stylesheet, font, image, iframe, embed,
   object, or a media element. */
const LOADERS = /<(script|link|img|iframe|embed|object|source|video|audio|track|applet)\b[^>]*\b(src|href|data|srcset)\s*=\s*["'](https?:)?\/\/([^"']+)["']/gi;
const ALLOWED_LINK_RELS = /rel=["'](canonical|alternate|preconnect|dns-prefetch)["']/i;
for (const f of html) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(LOADERS)) {
    /* <link rel=canonical|alternate> is metadata, not a fetch */
    if (m[1].toLowerCase() === 'link' && ALLOWED_LINK_RELS.test(m[0])) continue;
    fails.push(`${f}: loads a remote resource — ${m[0].slice(0, 110)}`);
  }
}
/* and no remote @import or url() in the stylesheets */
for (const f of all.filter((x) => x.endsWith('.css'))) {
  const s = readFileSync(f, 'utf8');
  ok(!/@import\s+(url\()?["']?https?:/i.test(s), `${f}: remote @import`);
  ok(!/url\(\s*["']?https?:\/\//i.test(s), `${f}: remote url() in CSS`);
}

/* ---------- 3. outbound links cannot reach back ---------- */
for (const f of html) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/target\s*=\s*["']_blank["']/i.test(tag)) continue;
    ok(/rel\s*=\s*["'][^"']*noopener/i.test(tag),
      `${f}: a target="_blank" link has no rel="noopener" — ${tag.slice(0, 90)}`);
  }
}

/* ---------- 4. no dangerous HTML sink in shipped JavaScript ---------- */
const SINKS = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new\s+Function\s*\(|srcdoc)\b/;
for (const f of all.filter((x) => x.endsWith('.js'))) {
  const s = readFileSync(f, 'utf8');
  const m = s.match(SINKS);
  ok(!m, `${f}: shipped JavaScript uses ${m?.[1]}`);
}
/* inline scripts in the HTML, excluding the JSON-LD data block */
for (const f of html) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const hit = m[1].match(SINKS);
    ok(!hit, `${f}: an inline script uses ${hit?.[1]}`);
  }
}

/* ---------- 5. the JSON-LD sink stays escaped ----------
   JSON.stringify does not escape `<`. Without the escape, a value containing
   the closing sequence of a script tag breaks out of the element and becomes
   executable markup — demonstrated in the Phase 13 audit, where it produced a
   fourth <script> element and a firing dialog. */
ok(srcText.some((f) => /\\u003c/.test(readFileSync(f, 'utf8')) && /ld\+json/.test(readFileSync(f, 'utf8')))
   || src.some((f) => f.endsWith('BaseLayout.astro')
        && /replace\(\/<\/g,\s*'\\\\u003c'\)/.test(readFileSync(f, 'utf8'))),
  'the JSON-LD escape is gone from BaseLayout.astro');
for (const f of html) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    ok(!m[1].includes('<'),
      `${f}: the JSON-LD block contains a raw "<" — it is no longer escaped`);
    try { JSON.parse(m[1]); }
    catch { fails.push(`${f}: the JSON-LD block does not parse`); }
  }
}

/* ---------- 6. nothing internal is disclosed ---------- */
ok(all.filter((f) => f.endsWith('.map')).length === 0, 'source maps are shipped in the build');
for (const f of text) {
  const s = readFileSync(f, 'utf8');
  ok(!/sourceMappingURL/.test(s), `${f}: references a source map`);
  const path = s.match(/\/(home|Users|root)\/[A-Za-z0-9_.-]{3,}\/[A-Za-z0-9_./-]{4,}/);
  ok(!path, `${f}: leaks a filesystem path — ${path?.[0]}`);
  const dev = s.match(/localhost:\d+|127\.0\.0\.1:\d+/);
  ok(!dev, `${f}: references a development server — ${dev?.[0]}`);
}

/* ---------- 7. no secret-shaped value in the build ---------- */
const SECRETS = [
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['Google API key', /AIza[0-9A-Za-z_\-]{35}/],
  ['Slack token', /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ['GitHub token', /gh[pousr]_[0-9A-Za-z]{36,}/],
  ['Stripe key', /sk_(live|test)_[0-9a-zA-Z]{24,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT', /eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\./],
  ['connection string', /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^\s'"]{8,}/i],
  ['basic-auth URL', /https?:\/\/[^/\s:@]+:[^/\s:@]+@/],
];
for (const f of text) {
  const s = readFileSync(f, 'utf8');
  for (const [name, re] of SECRETS)
    ok(!re.test(s), `${f}: contains something shaped like a ${name} (value not reproduced)`);
}

/* ---------- 8. no environment variable is read or exposed ---------- */
for (const f of srcText) {
  const s = readFileSync(f, 'utf8');
  const m = s.match(/PUBLIC_[A-Z0-9_]+/);
  ok(!m, `${f}: declares a client-exposed environment variable (${m?.[0]}) — `
    + 'anything with that prefix is shipped to the browser');
}
for (const f of text) {
  ok(!/import\.meta\.env\.(?!MODE|DEV|PROD|BASE_URL|SITE|ASSETS_PREFIX)/.test(readFileSync(f, 'utf8')),
    `${f}: an environment variable reached the build output`);
}

/* ---------- 9. .gitignore still covers credential material ---------- */
if (existsSync('.gitignore')) {
  const gi = readFileSync('.gitignore', 'utf8');
  for (const need of ['.env', '*.pem', '*.key', 'node_modules/', 'dist/'])
    ok(gi.split('\n').some((l) => l.trim() === need || l.trim().startsWith(need)),
      `.gitignore no longer covers ${need}`);
} else fails.push('.gitignore is missing');

console.log(`security posture: ${html.length} built pages, ${text.length} text assets, `
  + `${srcText.length} source files`);
console.log('  checked: no input surface · no third-party load · safe outbound links ·');
console.log('           no HTML sinks · JSON-LD escaped · no disclosure · no secrets ·');
console.log('           no env exposure · .gitignore coverage');
console.log(fails.length ? `\nFAILURES (${fails.length}):\n  ` + fails.join('\n  ') : '\nall security posture checks passed');
process.exit(fails.length ? 1 : 0);
