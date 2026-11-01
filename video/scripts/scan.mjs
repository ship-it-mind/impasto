// Run before every render: sees which footage and voice takes exist, and pulls the real git log and code into the film.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(ROOT, '..')
const OUT = join(ROOT, 'src/generated')
mkdirSync(OUT, { recursive: true })
const read = f => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))
const duration = f => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim()) || 0
const VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.m4v'], IMAGE = ['.jpg', '.jpeg', '.png', '.webp']

const slots = read('src/slots.json')
const found = readdirSync(join(ROOT, 'public/footage'))
const footage = {}
for (const s of slots) {
  const file = found.find(f => f.replace(extname(f), '') === s.id && [...VIDEO, ...IMAGE].includes(extname(f).toLowerCase()))
  if (!file) continue
  const video = VIDEO.includes(extname(file).toLowerCase())
  footage[s.id] = { file: `footage/${file}`, kind: video ? 'video' : 'image', seconds: video ? duration(join(ROOT, 'public/footage', file)) : 0 }
}
writeFileSync(join(OUT, 'footage.json'), JSON.stringify(footage, null, 1))

const vo = {}, lines = read('src/vo.json'), mine = readdirSync(join(ROOT, 'public/vo'))
for (const l of lines) {
  const take = mine.find(f => f.replace(extname(f), '') === l.id)
  const file = take ? `vo/${take}` : `vo-scratch/${l.id}.wav`
  vo[l.id] = existsSync(join(ROOT, 'public', file)) ? { file, real: !!take, seconds: duration(join(ROOT, 'public', file)) } : null
}
writeFileSync(join(OUT, 'vo-files.json'), JSON.stringify(vo, null, 1))

const music = readdirSync(join(ROOT, 'public/footage')).find(f => /^music\./.test(f))
writeFileSync(join(OUT, 'music.json'), JSON.stringify({ file: music ? `footage/${music}` : existsSync(join(ROOT, 'public/music/bed.wav')) ? 'music/bed.wav' : null }))

// The commit log as it really is, oldest first.
const log = execSync('git log --reverse --format=%ad%x09%s --date=short', { cwd: REPO }).toString().trim().split('\n').map(l => { const [date, ...s] = l.split('\t'); return { date, subject: s.join(' ') } })
writeFileSync(join(OUT, 'gitlog.json'), JSON.stringify(log))

// The code on screen is cut from the files themselves, so it can't drift from the repo.
const cut = (file, from, to) => {
  const src = readFileSync(join(REPO, file), 'utf8').split('\n')
  const a = src.findIndex(l => l.includes(from)), b = src.findIndex((l, i) => i >= a && l.includes(to))
  if (a < 0 || b < 0) throw new Error(`Can't find the excerpt in ${file}: ${from} … ${to}`)
  return { file, firstLine: a + 1, lines: src.slice(a, b + 1) }
}
writeFileSync(join(OUT, 'code.json'), JSON.stringify({
  layout: cut('backend/impasto/layout.py', 'targets = np.array([rgb_to_lab', 'counts = np.bincount'),
  volume: cut('backend/impasto/volume.py', 'thickness = materials.layer_cm', 'paste_g=round('),
  mixing: cut('backend/impasto/mixing.py', 'def recipe(self, target_hex', 'chosen = best_by_size[0]'),
}, null, 1))

const missing = slots.filter(s => !footage[s.id])
console.log(`Footage: ${slots.length - missing.length}/${slots.length} in place`)
for (const s of missing) console.log(`  still needed: public/footage/${s.id}.mp4 (or .jpg)  ${s.seconds}s  ${s.title}`)
for (const s of slots) if (footage[s.id]?.kind === 'video' && !s.fit && footage[s.id].seconds < s.seconds) console.log(`  ${s.id} is ${footage[s.id].seconds.toFixed(1)}s and its slot is ${s.seconds}s: it will play in slow motion to fill it`)
const scratch = lines.filter(l => vo[l.id] && !vo[l.id].real)
console.log(`Voice: ${lines.length - scratch.length}/${lines.length} real takes${scratch.length ? ` (lines ${scratch.map(l => l.id).join(', ')} are still the stand-in voice)` : ''}`)
const { VO_ROOM } = JSON.parse(readFileSync(join(ROOT, 'src/timeline.json'), 'utf8'))
for (const l of lines) if (vo[l.id] && vo[l.id].seconds > VO_ROOM[l.id]) console.log(`  voice line ${l.id} runs ${vo[l.id].seconds.toFixed(1)}s and has room for ${VO_ROOM[l.id]}s: it will run into the next line`)
