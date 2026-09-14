/**
 * A static server for the test suites, equivalent to `astro preview` in the
 * ways the suites depend on: directory indexes, trailing-slash routing, and —
 * the one that matters — `dist/404.html` served with a 404 status for anything
 * unknown, which is how the functional suite checks the 404 page.
 *
 * Used when `astro preview` will not stay up in a sandbox. Not part of the
 * site; nothing here ships.
 *
 *   node scripts/preview-static.mjs [port] [root]
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const PORT = Number(process.argv[2] || 4322);
const ROOT = resolve(process.argv[3] || 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(ROOT, url);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const notFound = join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
