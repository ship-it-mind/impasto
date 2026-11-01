// The commit log and the code on screen come straight from the repo.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), REPO = join(ROOT, '..')
const log = execSync('git log --reverse --format=%ad%x09%s --date=short', { cwd: REPO }).toString().trim().split('\n').map(l => { const [date, ...s] = l.split('\t'); return { date, subject: s.join(' ') } })
const cut = (file, from, to) => {
  const src = readFileSync(join(REPO, file), 'utf8').split('\n')
  const a = src.findIndex(l => l.includes(from)), b = src.findIndex((l, i) => i >= a && l.includes(to))
  if (a < 0 || b < 0) throw new Error(`Can't find the excerpt in ${file}`)
  return { file, firstLine: a + 1, lines: src.slice(a, b + 1) }
}
writeFileSync(join(ROOT, 'src/repo.json'), JSON.stringify({
  log,
  layout: cut('backend/impasto/layout.py', 'targets = np.array([rgb_to_lab', 'counts = np.bincount'),
  volume: cut('backend/impasto/volume.py', 'thickness = materials.layer_cm', 'paste_g=round('),
  mixing: cut('backend/impasto/mixing.py', 'def recipe(self, target_hex', 'chosen = best_by_size[0]'),
}))
console.log(log.length, 'commits')
