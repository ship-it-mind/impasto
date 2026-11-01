// Records the real app, driven by script, into public/captures and public/stills.
//
// It needs the app running on a COPY of the database, with a key that can't spend anything:
//   IMPASTO_DB=/path/to/copy.db MODEL_API_KEY=recording-no-spend IMPASTO_INVITE_CODE=rec uv run uvicorn impasto.api:app --port 8011
// Nothing here presses a button that calls a model. Where a model's answer appears, it's the one saved from the real run.
//
//   APP=http://localhost:5199 STATE=state.json ASSETS=dir node capture/record.mjs [clip ...]
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/captures')
const STILLS = join(ROOT, 'public/stills')
const APP = process.env.APP ?? 'http://localhost:5199'
const ASSETS = process.env.ASSETS
const DISPLAY = ':99'
const PIECE = '10c01e4a55da4d779608161a7786d83d'
const REQUEST = 'i want to paint a painting for this wall, i like the refrences i shared but want to use plum color'
mkdirSync(OUT, { recursive: true })
mkdirSync(STILLS, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))

const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1920x1400x24', '-nolisten', 'tcp'], { stdio: 'ignore' })
await sleep(800)

const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
  env: { ...process.env, DISPLAY },
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--window-position=0,0', '--window-size=1920,1300', '--force-device-scale-factor=1.33334', '--hide-scrollbars', '--disable-infobars', '--no-first-run'],
})
const context = await browser.newContext({ viewport: null, storageState: process.env.STATE })

// A cursor the film can see: the X pointer doesn't follow scripted input.
await context.addInitScript(() => {
  // No native file dialog on this display: the script hands the files straight to the input the button opens.
  const realClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () { if (this.type !== 'file') realClick.call(this) }
  addEventListener('DOMContentLoaded', () => { document.documentElement.spellcheck = false; document.body.spellcheck = false })
  const add = () => {
    if (document.getElementById('rec-cursor')) return
    const c = document.createElement('div')
    c.id = 'rec-cursor'
    c.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;transform:translate(720px,500px);transition:none'
    c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.7-4.4 3 6.7 3-1.3-3-6.6h6.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(c)
    addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)` }, true)
  }
  if (document.documentElement) add()
  addEventListener('DOMContentLoaded', add)
  const css = document.createElement('style')
  css.textContent = '*{scrollbar-width:none} *::-webkit-scrollbar{display:none}'
  addEventListener('DOMContentLoaded', () => document.head.appendChild(css))
})

const page = await context.newPage()
page.setDefaultTimeout(15000)
await page.goto('about:blank')
const cdp = await context.newCDPSession(page)
const { windowId } = await cdp.send('Browser.getWindowForTarget')
const barHeight = await page.evaluate(() => Math.round((outerHeight - innerHeight) * devicePixelRatio))
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: 1440, height: Math.ceil((1080 + barHeight) / 1.33334) } })
await sleep(500)
console.log('browser bar', barHeight, 'px; page', await page.evaluate(() => `${innerWidth}x${innerHeight} @${devicePixelRatio}`))
const failures = []
page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) failures.push(`${r.status()} ${r.url()}`) })

// Never let a model call through, whatever the script does by accident.
const PAID = /\/api\/(brief|concepts$|transcribe|step-checks|questions|checkins$)|\/edit$/
await page.route('**/api/**', route => {
  const req = route.request()
  if (req.method() === 'POST' && PAID.test(new URL(req.url()).pathname)) {
    console.error('BLOCKED a paid call:', req.url())
    return route.abort()
  }
  return route.fallback()
})

let at = { x: 720, y: 500 }
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
async function moveTo(x, y, ms = 650) {
  const from = at, steps = Math.max(8, Math.round(ms / 16))
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps)
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t)
    await sleep(ms / steps)
  }
  at = { x, y }
}
async function hover(locator, ms) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, ms)
}
async function click(locator, ms) {
  await hover(locator, ms)
  await sleep(120)
  await page.mouse.down(); await sleep(70); await page.mouse.up()
}
async function scrollTo(y, ms = 1500) {
  await page.evaluate(async ({ y, ms }) => {
    const from = scrollY, t0 = performance.now()
    await new Promise(done => {
      const f = now => {
        const t = Math.min(1, (now - t0) / ms)
        scrollTo(0, from + (y - from) * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2))
        t < 1 ? requestAnimationFrame(f) : done()
      }
      requestAnimationFrame(f)
    })
  }, { y, ms })
}
async function open(step, wait = 2500) {
  await page.goto(`${APP}/?piece=${PIECE}&step=${step}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(wait)
}

// The piece as it was before anyone asked for a change: the concepts without their later versions.
async function beforeEdits(on) {
  const url = `**/api/pieces/${PIECE}`
  await page.unroute(url).catch(() => {})
  if (!on) return
  await page.route(url, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch(), body = await res.json()
    body.concepts.concepts = body.concepts.concepts.filter(c => !c.edit)
    await route.fulfill({ response: res, json: body })
  })
}

async function record(name, run) {
  const file = join(OUT, `${name}.mp4`)
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', '1920x1080', '-i', `${DISPLAY}+0,${barHeight}`,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', file], { stdio: ['pipe', 'ignore', 'ignore'] })
  await sleep(400)
  const t0 = Date.now()
  try {
    await run()
  } finally {
    ff.stdin.write('q')
    await new Promise(r => ff.on('close', r))
  }
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

const CLIPS = {
  // Typed for real, with the real wall photo and references. It stops before "Read the brief", which is a model call.
  'brief-typed': async () => {
    await page.goto(APP); await page.waitForLoadState('networkidle').catch(() => {}); await sleep(1200)
    await record('brief-typed', async () => {
      await sleep(600)
      const box = page.getByRole('textbox', { name: "The client's brief" })
      await click(box)
      await page.keyboard.type(REQUEST, { delay: 42 })
      await sleep(350)
      await click(page.locator('button', { hasText: /^\s*Wall photo\s*$/ }))
      await page.locator('input[type=file]').nth(0).setInputFiles(join(ASSETS, 'wall.jpg'))
      await sleep(1300)
      await click(page.locator('button', { hasText: /^\s*References\s*$/ }))
      await page.locator('input[type=file]').nth(1).setInputFiles([join(ASSETS, 'ref1.jpg'), join(ASSETS, 'ref2.jpg')])
      await sleep(1500)
      await hover(page.locator('button[aria-label="Read the brief"]'))
      await sleep(700)
    })
  },
  // Muse Spark's saved reading of that request, then the size being changed by a corner.
  'brief-read': async () => {
    await open('brief')
    await page.evaluate(() => scrollTo(0, 120))
    await record('brief-read', async () => {
      await sleep(1600)
      await scrollTo(470, 1500)
      await sleep(500)
      const corner = page.getByRole('button', { name: /^Bottom.right corner|bottom right corner/i }).or(page.locator('[aria-label*="corner of the painting"]').nth(2))
      const b = await corner.first().boundingBox()
      await moveTo(b.x + b.width / 2, b.y + b.height / 2)
      await sleep(200)
      await page.mouse.down()
      await moveTo(b.x + b.width / 2 + 34, b.y + b.height / 2 + 18, 900)
      await sleep(150)
      await moveTo(b.x + b.width / 2, b.y + b.height / 2, 800)
      await page.mouse.up()
      await sleep(900)
    })
  },
  // The three concepts Muse Image painted, on the client's wall.
  'concepts-wall': async () => {
    await beforeEdits(true)
    await open('concepts', 3500)
    await record('concepts-wall', async () => {
      await sleep(1000)
      for (const title of ['Plum Hillside Mist', 'Plum River Drift', 'Plum Hollow']) {
        await click(page.getByRole('button', { name: new RegExp(title) }).first())
        await sleep(1700)
      }
      await sleep(500)
    })
    await beforeEdits(false)
  },
  // Tap a shape and say what to change. It stops before sending, which is a model call.
  'edit-tap': async () => {
    await beforeEdits(true)
    await open('concepts', 3500)
    await page.evaluate(() => scrollTo(0, 60))
    await record('edit-tap', async () => {
      await sleep(600)
      await click(page.getByRole('button', { name: 'Select a segment' }))
      await sleep(1100)
      const picker = page.locator('canvas[aria-hidden]').first()
      const r = await picker.boundingBox()
      // The two points tapped in the real run.
      await moveTo(r.x + r.width * 0.55, r.y + r.height * 0.5, 800)
      await sleep(300)
      await moveTo(r.x + r.width * 0.7912, r.y + r.height * 0.2615, 700)
      await page.mouse.down(); await sleep(70); await page.mouse.up()
      await sleep(500)
      await moveTo(r.x + r.width * 0.7619, r.y + r.height * 0.3855, 450)
      await page.mouse.down(); await sleep(70); await page.mouse.up()
      await sleep(900)
      const box = page.getByRole('textbox', { name: /What to change/ })
      await click(box)
      await page.keyboard.type('change the shape and color', { delay: 58 })
      await sleep(600)
      await hover(page.getByRole('button', { name: 'Send' }))
      await sleep(800)
    })
    await beforeEdits(false)
  },
  // The answer saved from that same request, then back to the original.
  'edit-result': async () => {
    await open('concepts', 3500)
    await page.evaluate(() => scrollTo(0, 150))
    await record('edit-result', async () => {
      await sleep(900)
      await click(page.getByRole('button', { name: /Version 2/ }))
      await sleep(3000)
      await click(page.getByRole('button', { name: /Original/ }))
      await sleep(2000)
      await click(page.getByRole('button', { name: /Let.s start painting/ }))
      await sleep(1500)
    })
  },
  'recipe': async () => {
    await open('recipe', 3500)
    await record('recipe', async () => {
      await sleep(1500)
      await scrollTo(560, 1800)
      await sleep(1000)
      const tick = page.locator('input[type=checkbox]').first()
      await click(tick)
      await sleep(1600)
      await scrollTo(1500, 2400)
      await sleep(1500)
    })
  },
  'paint': async () => {
    await open('paint', 5000)
    const total = await page.evaluate(() => document.body.scrollHeight - innerHeight)
    await record('paint', async () => {
      await sleep(900)
      await scrollTo(total * 0.92, 15000)
      await sleep(600)
    })
  },
  // A live reading, and free: the bowl check makes no model call. The photo is one of the real ones of the paint.
  'mix': async () => {
    await open('checkins', 2500)
    await record('mix', async () => {
      await sleep(700)
      await click(page.getByText('Color mixes', { exact: true }))
      await page.getByRole('button', { name: /Upload a photo|Another photo/ }).first().waitFor()
      await sleep(900)
      await click(page.getByRole('button', { name: /Upload a photo|Another photo/ }).first())
      await page.locator('input[type=file]').first().setInputFiles(join(ASSETS, 'bowl.jpg'))
      await sleep(1400)
      await click(page.getByText('Deep Plum Lobe').first())
      await sleep(4500)
    })
  },
  // Stills for the stage comparisons and the reveal, at twice the resolution, in a separate headless browser.
  'stills': async () => {
    const headless = await chromium.launch({ headless: true, executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` })
    const ctx = await headless.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2.5, storageState: process.env.STATE })
    const p = await ctx.newPage()
    await p.goto(`${APP}/?piece=${PIECE}&step=paint`); await p.waitForTimeout(6000)
    const stages = p.locator('[aria-label^="The canvas after step"]')
    const n = await stages.count()
    for (let i = 0; i < n; i++) {
      await stages.nth(i).scrollIntoViewIfNeeded()
      await p.waitForTimeout(400)
      await stages.nth(i).screenshot({ path: join(STILLS, `stage-${i + 1}.png`) })
    }
    await p.goto(`${APP}/?piece=${PIECE}&step=concepts`); await p.waitForTimeout(4000)
    const wall = p.locator('img[src*="/wall"]').first().locator('xpath=..')
    await wall.screenshot({ path: join(STILLS, 'mockup.png') })
    console.log('stages', n, 'mockup', await wall.boundingBox())
    await headless.close()
  },
}

try {
  const wanted = process.argv.slice(2)
  for (const name of wanted.length ? wanted : Object.keys(CLIPS)) await CLIPS[name]()
  if (failures.length) console.log('API errors while recording:', [...new Set(failures)].join('\n'))
} finally {
  await browser.close()
  xvfb.kill()
}
