/**
 * Diffusion inpainting for the asset pipeline.
 *
 * Used for exactly one thing: removing a photographer's watermark from a
 * DERIVED web master, where the school holds the right to publish the
 * photograph and the watermark sits over flat fabric. The original on disk is
 * never touched — this runs on the resized master, in memory, immediately
 * before the JPEG is written.
 *
 * The method is a Laplace (Jacobi) diffusion solve: masked pixels are replaced,
 * repeatedly, by the average of their neighbours, with the unmasked pixels held
 * fixed as the boundary condition. It reconstructs smooth gradients and nothing
 * else. That is a deliberate limit — it means the result is only honest where
 * the covered area is genuinely smooth, and any attempt to use it over
 * structure or texture will look soft rather than invented. Whether it is
 * acceptable for a given photograph is a judgement made by looking at the
 * result, not by this file.
 *
 * BARRIERS. Diffusion has no idea where an object ends, so a mask that crosses
 * a real edge would average the two sides together and turn a hard boundary
 * into a smear — the one thing that reads unmistakably as retouching. A mask
 * may therefore mark a thin line of pixels as a barrier: those are never read
 * as neighbours, so each side is solved only from its own side and the edge
 * survives. The barrier line itself is filled last, from whichever side it sits
 * closer to, which keeps the boundary one pixel wide rather than blurring it.
 *
 * Mask values: 255 reconstruct · 128 barrier · 0 leave alone.
 *
 * No dependency: the masked region is small and the solve is a few hundred
 * three-by-three passes over its bounding box.
 */

/**
 * @param {Buffer} data   raw RGB pixels, 3 channels, width*height*3
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} mask  one byte per pixel: 2 = reconstruct, 1 = barrier, 0 = keep
 * @param {number} iterations
 * @returns {Buffer} a new buffer; `data` is not modified
 */
export function diffusionInpaint(data, width, height, mask, iterations = 1200) {
  const out = Buffer.from(data);

  /* Work only inside the mask's bounding box, plus a one-pixel ring so the
     boundary condition is real image data. */
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 2) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return out;                       // nothing masked
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
  x1 = Math.min(width - 1, x1 + 1); y1 = Math.min(height - 1, y1 + 1);

  /* Seed: the mean of the known pixels in the box, so the solve starts from a
     plausible level rather than from the watermark's own colour. */
  let sum = [0, 0, 0], n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * width + x]) continue;
      const i = (y * width + x) * 3;
      sum[0] += out[i]; sum[1] += out[i + 1]; sum[2] += out[i + 2]; n++;
    }
  }
  const seed = n ? sum.map((s) => Math.round(s / n)) : [0, 0, 0];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * width + x] !== 2) continue;
      const i = (y * width + x) * 3;
      out[i] = seed[0]; out[i + 1] = seed[1]; out[i + 2] = seed[2];
    }
  }

  /* Jacobi sweeps. Reading from a snapshot each pass (rather than in place)
     keeps the result independent of traversal order. */
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  let cur = new Float32Array(bw * bh * 3);
  const readBox = () => {
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const s = ((y + y0) * width + (x + x0)) * 3, d = (y * bw + x) * 3;
        cur[d] = out[s]; cur[d + 1] = out[s + 1]; cur[d + 2] = out[s + 2];
      }
    }
  };
  readBox();
  let next = new Float32Array(cur.length);

  for (let it = 0; it < iterations; it++) {
    next.set(cur);
    for (let y = 0; y < bh; y++) {
      const gy = y + y0;
      for (let x = 0; x < bw; x++) {
        if (mask[gy * width + (x + x0)] !== 2) continue;
        let r = 0, g = 0, b = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= bh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx; if (nx < 0 || nx >= bw) continue;
            if (mask[(ny + y0) * width + (nx + x0)] === 1) continue;   // barrier: not a neighbour
            const j = (ny * bw + nx) * 3;
            r += cur[j]; g += cur[j + 1]; b += cur[j + 2]; c++;
          }
        }
        if (!c) continue;
        const d = (y * bw + x) * 3;
        next[d] = r / c; next[d + 1] = g / c; next[d + 2] = b / c;
      }
    }
    const t = cur; cur = next; next = t;
  }

  for (let y = 0; y < bh; y++) {
    const gy = y + y0;
    for (let x = 0; x < bw; x++) {
      if (mask[gy * width + (x + x0)] !== 2) continue;
      const s = (y * bw + x) * 3, d = (gy * width + (x + x0)) * 3;
      out[d] = Math.max(0, Math.min(255, Math.round(cur[s])));
      out[d + 1] = Math.max(0, Math.min(255, Math.round(cur[s + 1])));
      out[d + 2] = Math.max(0, Math.min(255, Math.round(cur[s + 2])));
    }
  }

  /* The barrier line last, from the nearer side along its own row, so the edge
     it protected stays one pixel wide instead of fading across it. */
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * width + x] !== 1) continue;
      let l = x - 1; while (l >= 0 && mask[y * width + l] === 1) l--;
      let r = x + 1; while (r < width && mask[y * width + r] === 1) r++;
      const src = (l < 0) ? r : (r >= width) ? l : (x - l <= r - x ? l : r);
      const s = (y * width + src) * 3, d = (y * width + x) * 3;
      out[d] = out[s]; out[d + 1] = out[s + 1]; out[d + 2] = out[s + 2];
    }
  }
  return out;
}
