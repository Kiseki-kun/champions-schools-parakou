#!/usr/bin/env node
/**
 * Derive web masters from the supplied originals.
 *
 * HARD RULES (Brief Clarifications, rounds 1-3):
 *   - Originals are READ-ONLY. This script never writes to the source folder.
 *   - Derived masters are NEW files in src/assets/, kept separate from source.
 *   - Optimisation never changes content, appearance, identity or intended use.
 *   - Upscaling applies ONLY to status: concept entries, capped at 4x.
 *
 * Usage:  node scripts/prepare-assets.mjs [--src <dir>] [--force]
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { diffusionInpaint } from './inpaint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const srcFlag = args.indexOf('--src');
const SRC = resolve(ROOT, srcFlag > -1 ? args[srcFlag + 1] : '../02-School-Assets');
const OUT = join(ROOT, 'src/assets');
const LOCK = join(ROOT, 'scripts/assets.lock.json');
const FORCE = args.includes('--force');

const MAX_EDGE = 2400;   // web master ceiling; Astro derives responsive sizes from this
const QUALITY = 82;

/** Minimal YAML reader for this manifest's shape. Avoids a dependency. */
function parseManifest(text) {
  const entries = [];
  let cur = null, stack = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const t = line.trim();
    if (t.startsWith('- ')) {
      cur = {}; entries.push(cur); stack = [{ indent, obj: cur }];
      const rest = t.slice(2);
      if (rest.includes(':')) assign(cur, rest);
      continue;
    }
    if (!cur) continue;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (t.endsWith(':')) {
      const key = t.slice(0, -1);
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      assign(parent, t);
    }
  }
  return entries;
}
function assign(obj, pair) {
  const i = pair.indexOf(':');
  const key = pair.slice(0, i).trim();
  let val = pair.slice(i + 1).trim();
  if (val === '') return;
  val = val.replace(/^["'](.*)["']$/, '$1');
  if (val === 'true') val = true;
  else if (val === 'false') val = false;
  else if (/^\d+$/.test(val)) val = Number(val);
  obj[key] = val;
}

const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const exists = async (p) => access(p).then(() => true, () => false);

async function main() {
  const manifest = parseManifest(await readFile(join(ROOT, 'src/content/media/media.yaml'), 'utf8'));
  let lock = {};
  if (await exists(LOCK)) lock = JSON.parse(await readFile(LOCK, 'utf8'));

  const nextLock = {};
  let built = 0, skipped = 0, excluded = 0, drifted = [];

  for (const m of manifest) {
    /* An excluded entry is documented but must never be published. Deriving a
       web master for it would put its bytes in src/assets/, and everything in
       src/assets/ is emitted into the build by the import.meta.glob in
       SchoolImage — reachable at a stable URL even with no page linking it.
       So the exclusion has to happen here, before a file exists at all. */
    if (m.excluded) {
      console.log(`  EXCLUDED ${m.id.padEnd(18)} ${m.excluded}`);
      excluded++;
      continue;
    }
    const source = join(SRC, m.source);
    if (!(await exists(source))) {
      console.error(`  MISSING  ${m.id}  <- ${m.source}`);
      process.exitCode = 1;
      continue;
    }
    const original = await readFile(source);          // read-only, always
    const hash = md5(original);
    nextLock[m.id] = { source: m.source, md5: hash };

    if (lock[m.id] && lock[m.id].md5 !== hash) drifted.push(m.id);

    const outDir = join(OUT, m.category);
    const outFile = join(outDir, `${m.id}.jpg`);
    if (!FORCE && lock[m.id]?.md5 === hash && (await exists(outFile))) {
      skipped++; continue;
    }

    await mkdir(outDir, { recursive: true });
    let img = sharp(original, { failOn: 'none' }).rotate();
    const meta = await img.metadata();

    let workingW = meta.width, workingH = meta.height;

    /* cropTop: trim a band off the top of the DERIVED master. The original on
       disk is never touched. Used only where a supplied photograph carries
       painted signage naming an entity that is not the confirmed school name,
       or telephone numbers that are not the school's — see cropReason on the
       manifest entry. */
    if (m.cropTop) {
      const cut = Math.round(workingH * Number(m.cropTop));
      img = img.extract({ left: 0, top: cut, width: workingW, height: workingH - cut });
      workingH -= cut;
      console.log(`  CROP     ${m.id.padEnd(18)} -${cut}px from the top — ${m.cropReason ?? ''}`);
    }

    if (m.status === 'concept' && m.upscale) {
      // Upscaling is permitted ONLY for generated concept art (R2-3), capped at 4x.
      // Lanczos is the documented fallback; an ML super-resolution pass can replace
      // this block without changing the interface.
      const factor = Math.min(Number(m.upscale) || 1, 4);
      workingW = Math.round(meta.width * factor);
      workingH = Math.round(meta.height * factor);
      img = img.resize(workingW, workingH, { kernel: 'lanczos3' });
    }

    // Cap the web master AFTER any upscale. Upscaling past the cap and then
    // resampling down is deliberate: it supersamples, giving a cleaner master
    // than enlarging straight to the target size.
    if (Math.max(workingW, workingH) > MAX_EDGE) {
      img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: false });
    }

    /* retouchMask: remove a photographer's watermark from the DERIVED master.
       The original on disk is never touched, and nothing is invented: the mask
       covers the watermark's own strokes and the covered pixels are rebuilt by
       diffusion from the fabric around them. The mask is stored in the
       coordinates of the finished master, so if the original is ever replaced
       the two will disagree — which is checked here rather than silently
       producing a smear in the wrong place. See retouchReason on the entry. */
    if (m.retouchMask) {
      const maskFile = join(ROOT, 'scripts', m.retouchMask);
      const { data: raw, info } = await img.removeAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      const mk = await sharp(maskFile).greyscale().raw()
        .toBuffer({ resolveWithObject: true });
      if (mk.info.width !== info.width || mk.info.height !== info.height) {
        console.error(`  RETOUCH  ${m.id}: mask is ${mk.info.width}x${mk.info.height} `
          + `but the master is ${info.width}x${info.height} — regenerate the mask.`);
        process.exitCode = 1;
      } else {
        /* 255 reconstruct · 128 barrier (a real edge the solve must not cross,
           see inpaint.mjs) · 0 leave alone. */
        const mask = new Uint8Array(info.width * info.height);
        let covered = 0, barrier = 0;
        for (let i = 0; i < mask.length; i++) {
          const v = mk.data[i * mk.info.channels];
          if (v > 200) { mask[i] = 2; covered++; }
          else if (v > 64) { mask[i] = 1; barrier++; }
        }
        const fixed = diffusionInpaint(raw, info.width, info.height, mask);
        img = sharp(fixed, { raw: { width: info.width, height: info.height, channels: 3 } });
        console.log(`  RETOUCH  ${m.id.padEnd(18)} ${covered} px rebuilt, `
          + `${barrier} px of protected edge — ${m.retouchReason ?? ''}`);
      }
    }

    await img.jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
             .withMetadata({})
             .toFile(outFile);
    built++;
    const out = await sharp(outFile).metadata();
    console.log(
      `  ${m.status === 'concept' ? 'CONCEPT ' : 'PHOTO   '} ${m.id.padEnd(18)} ` +
      `${meta.width}x${meta.height} -> ${out.width}x${out.height}`
    );
  }

  await writeFile(LOCK, JSON.stringify(nextLock, null, 2) + '\n');

  if (drifted.length) {
    console.log(`\n  NOTE: originals changed since the last run: ${drifted.join(', ')}`);
    console.log('  Web masters were rebuilt from the new originals.');
  }
  console.log(`\n  built ${built}, unchanged ${skipped}, excluded ${excluded}, `
    + `source ${SRC} (never written to)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
