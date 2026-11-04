// Records the app clips from the example piece. Run `make example PORT=8011` first, then:
//   CH=/path/to/chrome node scripts/record-example.mjs /abs/out/dir && python3 scripts/cfr.py <out>/<clip>_frames <out>/<clip>.mp4
// Needs playwright (npm i playwright). The page is zoomed 1.5x so the text reads at 1080p.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
const OUT = process.argv[2]
const BASE = 'http://localhost:8011/?piece=7b5c367705db4c798dcf00593c0d1756&step='
const b = await chromium.launch({ executablePath: process.env.CH })
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)

const tidy = async () => {
  await p.evaluate(() => {
    document.documentElement.style.zoom = '1.5'
    for (const el of document.querySelectorAll('body *')) {
      const t = (el.textContent || '').trim()
      if (el.children.length < 6 && (t.startsWith('Example piece.') || t === 'Example only' || t.startsWith('This is the example piece'))) el.style.visibility = 'hidden'
    }
    for (const el of document.querySelectorAll('body *')) { const t = (el.textContent || '').trim(); if (t.startsWith('Example piece.') && el.offsetHeight < 80) el.style.display = 'none' }
    if (!document.getElementById('fake-cursor')) {
      const c = document.createElement('div'); c.id = 'fake-cursor'
      c.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 2l15 11-7 1.2L8.4 21z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, pointerEvents: 'none', transform: 'translate(-200px,-200px)', transition: 'transform 16ms linear' })
      document.body.appendChild(c)
      addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX / 1.5 - 3}px,${e.clientY / 1.5 - 1}px)` }, true)
    }
  })
}
const ease = async (y, ms = 1600) => p.evaluate(([y, ms]) => new Promise(r => {
  const s = scrollY, t0 = performance.now(), d = y - s
  const f = t => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k+2, 3)/2; scrollTo(0, s + d*e); k < 1 ? requestAnimationFrame(f) : r() }
  requestAnimationFrame(f)
}), [y, ms])
const yOf = async (text, off = 120) => p.evaluate(([t, off]) => {
  const el = [...document.querySelectorAll('h1,h2,h3,h4,p,button,span,div,summary')].find(e => e.children.length < 3 && (e.textContent||'').trim().startsWith(t))
  if (!el) return scrollY
  const s = scrollY; el.style.scrollMarginTop = (off / 1.5) + 'px'; el.scrollIntoView({ block: 'start', behavior: 'instant' }); const y = scrollY; scrollTo(0, s); return y
}, [text, off])
const bottom = async () => p.evaluate(() => { const s = scrollY; scrollTo(0, 1e7); const y = scrollY; scrollTo(0, s); return y })
let mouse = [960, 700]
const glide = async (x, y, steps = 40) => { await p.mouse.move(x, y, { steps }); mouse = [x, y] }
const clickText = async (text) => {
  const l = p.getByText(text, { exact: false }).first(); const bb = await l.boundingBox()
  await glide(bb.x + Math.min(bb.width / 2, 80), bb.y + bb.height / 2); await p.waitForTimeout(250); await l.click(); 
}
const wait = ms => p.waitForTimeout(ms)

async function clip(name, step, body) {
  await p.goto(BASE + step); await p.waitForLoadState('networkidle'); await wait(1200); await tidy()
  await p.mouse.move(...mouse)
  const dir = `${OUT}/${name}_frames`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const frames = []
  const on = async ({ data, metadata, sessionId }) => { frames.push([metadata.timestamp, data]); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) }
  cdp.on('Page.screencastFrame', on)
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  const t0 = Date.now() / 1000
  await body()
  const t1 = Date.now() / 1000
  await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame', on)
  let list = ''
  frames.forEach(([t, d], i) => { const f = `${dir}/${String(i).padStart(5, '0')}.jpg`; writeFileSync(f, Buffer.from(d, 'base64'))
    const next = i + 1 < frames.length ? frames[i + 1][0] : t1; list += `file '${f}'\nduration ${Math.max(0.001, next - t).toFixed(4)}\n` })
  list += `file '${dir}/${String(frames.length - 1).padStart(5, '0')}.jpg'\n`
  writeFileSync(`${dir}/list.txt`, list)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=0xf7f6f2', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', `${OUT}/${name}.mp4`])
  console.log(name, frames.length, 'frames', (t1 - t0).toFixed(1), 's')
}

await clip('01-brief', 'brief', async () => {
  await wait(1500)
  await ease(await yOf('The brief', 60), 1800); await wait(1800)
  await ease(await bottom(), 2200); await wait(900)
  await clickText('Transcript'); await wait(800)
  await ease(await bottom(), 600); await wait(2600)
})
await clip('02-wall', 'concepts', async () => {
  await wait(2200)
  await clickText('Sketch'); await wait(2000)
  await clickText('Your wall'); await wait(1800)
})
await clip('03-recipe', 'recipe', async () => {
  await wait(1800)
  await ease(await yOf("What you'll need", 40), 2000); await wait(2600)
  await ease(await yOf('Mix each band', 40), 2000); await wait(2600)
})
await clip('04-paint', 'paint', async () => {
  await wait(1800)
  for (const s of ['02', '04', '06', '08']) { await ease(await yOf(s, 40), 1500); await wait(1300) }
})
await clip('05-checkin', 'checkins', async () => {
  await wait(1200)
  await clickText('Lay Deep Burgundy Brown'); await wait(800)
  await ease(await yOf('Lay Deep Burgundy Brown', 90), 1400); await wait(3200)
  await clickText('Lay Dusty Rose'); await wait(800)
  await ease(await yOf('Lay Dusty Rose', 90), 1400); await wait(3000)
})
await b.close()
