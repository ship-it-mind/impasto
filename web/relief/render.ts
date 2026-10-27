// Render a concept spec as a lit relief painting (PNG), from the command line.
//
//   node relief/render.ts spec.json out.png [--seed 7] [--width 1000] [--height 750] [--light 225] [--gloss 0.15]
//
// spec.json is one concept from backend/impasto/concepts.py:
// { "title": ..., "flow": ..., "bands": [{ "name", "hex", "width", "relief" }] }

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { bandScene, type ConceptSpec } from './bands.ts';
import { DEFAULTS, KNIFE, PASSES, Surface, Timeline, relight } from './engine.ts';
import { encodePng } from './png.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: 'string', default: '1' },
    width: { type: 'string', default: '1000' },
    height: { type: 'string', default: '750' },
    light: { type: 'string', default: '225' },
    gloss: { type: 'string', default: '0.15' },
    brush: { type: 'string', default: String(DEFAULTS.brush) },
    thick: { type: 'string', default: String(DEFAULTS.thick) },
    density: { type: 'string', default: String(DEFAULTS.density) },
    swirl: { type: 'string', default: String(DEFAULTS.swirl) },
    knife: { type: 'string', default: '{}' },  // JSON overrides of KNIFE, for tuning
    passes: { type: 'string', default: '[]' },  // JSON overrides per pass, for tuning
  },
});
if (positionals.length !== 2) {
  console.error('Usage: node relief/render.ts spec.json out.png [--seed N] [--width W] [--height H] [--light DEG] [--gloss G]');
  process.exit(2);
}
const [specPath, outPath] = positionals;
const spec: ConceptSpec = JSON.parse(readFileSync(specPath, 'utf8'));
const seed = Number(values.seed), W = Number(values.width), H = Number(values.height);
Object.assign(KNIFE, JSON.parse(values.knife));
(JSON.parse(values.passes) as object[]).forEach((o, i) => Object.assign(PASSES[i], o));

const started = performance.now();
const surface = new Surface(W, H);
const paint = {
  seed, brush: Number(values.brush), thick: Number(values.thick),
  density: Number(values.density), swirl: Number(values.swirl),
};
const timeline = new Timeline(surface, paint, bandScene(spec, W, H, seed));
timeline.seek(timeline.T, Infinity);
const rgba = new Uint8ClampedArray(W * H * 4);
relight(surface, rgba, Number(values.light), Number(values.gloss));
writeFileSync(outPath, encodePng(rgba, W, H));
console.log(`${spec.title}: ${timeline.T} strokes in ${((performance.now() - started) / 1000).toFixed(1)} s → ${outPath}`);
