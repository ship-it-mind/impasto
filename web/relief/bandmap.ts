// Write a concept's band map: which band each pixel belongs to, as a gray PNG
// (pixel value = band index). It is the plan the progress check-ins measure
// against (backend/impasto/checkin.py), from the same geometry the relief
// preview paints, so it matches the preview for the same seed and size.
//
//   node relief/bandmap.ts spec.json out.png [--seed 1] [--width 1000] [--height 750]

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { bandScene, type ConceptSpec } from './bands.ts';
import { encodePng } from './png.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: 'string', default: '1' },
    width: { type: 'string', default: '1000' },
    height: { type: 'string', default: '750' },
  },
});
if (positionals.length !== 2) {
  console.error('Usage: node relief/bandmap.ts spec.json out.png [--seed N] [--width W] [--height H]');
  process.exit(2);
}
const [specPath, outPath] = positionals;
const spec: ConceptSpec = JSON.parse(readFileSync(specPath, 'utf8'));
const seed = Number(values.seed), W = Number(values.width), H = Number(values.height);

const scene = bandScene(spec, W, H, seed);
const rgba = new Uint8ClampedArray(W * H * 4);
for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
  rgba[i] = rgba[i + 1] = rgba[i + 2] = scene.bandAt(x, y);
}
writeFileSync(outPath, encodePng(rgba, W, H));
console.log(`${spec.title}: ${spec.bands.length} bands, ${W}x${H} → ${outPath}`);
