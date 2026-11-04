// Captures the real app's pieces from the example piece as sharp images (2x), for the film's app scenes.
// Run `make example PORT=8011` first, then (from a folder with playwright installed):
//   CH=/path/to/chrome EX=/abs/example/images/ node capture-app.mjs /abs/demo/cut/public/app-ui
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true })
const EX = process.env.EX
const B = 'http://localhost:8011/?piece=7b5c367705db4c798dcf00593c0d1756&step='
const b = await chromium.launch({ executablePath: process.env.CH })
const p = await (await b.newContext({ viewport: { width: 1280, height: 2600 }, deviceScaleFactor: 2 })).newPage()
const open = async (step) => {
  await p.goto(B + step); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500)
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const t = (el.textContent || '').trim()
      if (el.children.length < 6 && (t.startsWith('Example piece.') || t === 'Example only' || t.startsWith('This is the example piece'))) el.style.visibility = 'hidden'
    }
  })
}
// The page box from the top of `a` to the top of `z` (or a's bottom), padded.
const box = async (a, z, pad = 16) => {
  const r = await p.evaluate(([a, z]) => {
    const find = s => [...document.querySelectorAll('h1,h2,h3,p,div,span,dl,ul,img,form,section')].filter(e => e.getBoundingClientRect().height > 0).find(e => e.children.length < 12 && (e.textContent || e.getAttribute('alt') || '').trim().startsWith(s))
    const A = typeof a === 'string' ? find(a) : null, Z = z ? find(z) : null
    const ra = A.getBoundingClientRect(), rz = Z ? Z.getBoundingClientRect() : null
    const main = (document.querySelector('main') || document.body).getBoundingClientRect()
    return { x: main.left, w: main.width, top: ra.top, bottom: rz ? rz.top : ra.bottom, left: ra.left, right: ra.right }
  }, [a, z])
  return r
}
const shot = async (name, clip) => { await p.screenshot({ path: `${OUT}/${name}.png`, clip }); console.log(name, JSON.stringify(clip)) }
const el = async (name, loc) => { await loc.scrollIntoViewIfNeeded(); await loc.screenshot({ path: `${OUT}/${name}.png` }); console.log(name) }

// Idea: the box as she filled it, the brief, the size on her wall, and the details.
await open('brief')
await p.locator('input[type=file]').nth(0).setInputFiles(EX + '7b5c367705db4c798dcf00593c0d1756/wall.jpg'); await p.waitForTimeout(900)
await p.locator('input[type=file]').nth(1).setInputFiles(EX + 'concepts-1098fb52/exact.jpg'); await p.waitForTimeout(900)
await p.getByLabel('What you want to paint').fill('This is the wall of my office room. I wanna paint this exact reference I shared with you, can you help with that?')
await p.mouse.move(0, 0); await p.waitForTimeout(400)
await el('idea-box', p.locator('form').first())
await open('brief')
{ const r = await box('The brief', 'What width and height'); await shot('idea-brief', { x: r.left - 16, y: r.top - 16, width: 720 + 32, height: r.bottom - r.top + 8 }) }
{ const r = await box('What width and height', 'Your wall'); await shot('idea-size', { x: r.left - 16, y: r.top - 16, width: 720 + 32, height: r.bottom - r.top + 8 }) }
await el('idea-wall', p.getByAltText('Your wall').locator('..'))
await el('idea-details', p.locator('main dl').first())

// See it: the painting on her wall, and the plan's title and colors.
await open('concepts')
await el('see-wall', p.getByAltText('Your wall').locator('..'))
{ const r = await box('6 bands', 'Muse Image cleaned'); await shot('see-title', { x: r.left - 16, y: r.top - 16, width: 420, height: r.bottom - r.top + 8 }) }

// Colors: the totals, what she needs ticked, and the first band's mix.
await open('recipe')
{ const r = await box('Curved bands in neutral earth tones, the picture to paint', 'What to buy'); await shot('colors-summary', { x: r.left - 16, y: r.top - 16, width: 360 + 32, height: r.bottom - r.top + 8 }) }
{ const r = await box("What you'll need", 'Tools'); await shot('colors-need', { x: r.left - 16, y: r.top - 16, width: 648 + 32, height: r.bottom - r.top }) }
{ // The first card under "Mix each band": from its h3 to the next band's h3.
  const r = await p.evaluate(() => {
    const hs = [...document.querySelectorAll('main h3')], mix = hs.findIndex(h => (h.textContent || '').trim() === 'Mix each band')
    const a = hs[mix + 1].getBoundingClientRect(), z = hs[mix + 2].getBoundingClientRect(), m = hs[mix].getBoundingClientRect()
    return { x: m.left, w: m.width, top: a.top, bottom: z.top }
  })
  await shot('colors-mix', { x: r.x - 16, y: r.top - 30, width: r.w + 32, height: r.bottom - r.top + 4 })
}

// Steps: each step with its picture.
await open('paint')
const steps = p.locator('main ol').first().locator(':scope > li')
const n = await steps.count()
for (let i = 0; i < n; i++) await el(`step-${String(i + 1).padStart(2, '0')}`, steps.nth(i))

// Check-ins: the bowl, then steps 06 and 07 opened.
await open('checkins')
await p.getByText('Tinted paste mixes').click(); await p.waitForTimeout(700)
{ const r = await box('Deep Burgundy Brown', 'Sage Grey'); await shot('check-bowl', { x: r.left - 60, y: r.top - 16, width: 812 + 16, height: r.bottom - r.top }) }
for (const [k, t, nx] of [['06', 'Lay Deep Burgundy Brown', '07'], ['07', 'Lay Dusty Rose', '08']]) {
  await open('checkins')
  const head = p.getByRole('button', { name: new RegExp(`^${k}\\s*${t}`) })
  if (k === '06') { await head.click(); await p.waitForTimeout(800) }
  const r = await p.evaluate(([k, nx]) => {
    const hs = [...document.querySelectorAll('main h3')]
    const a = hs.find(h => (h.textContent || '').trim().startsWith(k)), z = hs.find(h => (h.textContent || '').trim().startsWith(nx))
    const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect()
    return { x: ra.left, y: ra.top, w: ra.width, h: rz.top - ra.top }
  }, [k, nx])
  await shot(`check-${k}`, { x: r.x - 8, y: r.y - 4, width: r.w + 16, height: r.h })
}

// The step check-ins' parts at 3x, to show them large: the verdict, the picture of how it should look, and her photo.
const p3 = await (await b.newContext({ viewport: { width: 1280, height: 2600 }, deviceScaleFactor: 3 })).newPage()
for (const [k, t] of [['06', 'Lay Deep Burgundy Brown'], ['07', 'Lay Dusty Rose']]) {
  await p3.goto(B + 'checkins'); await p3.waitForLoadState('networkidle'); await p3.waitForTimeout(1200)
  if (k === '06') { await p3.getByRole('button', { name: new RegExp(`^${k}\\s*${t}`) }).click(); await p3.waitForTimeout(800) }
  await p3.evaluate(() => {
    const v = [...document.querySelectorAll('main p')].find(e => /^(On track|Needs work) · /.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 0)
    v.closest('.border-t').setAttribute('data-cap', 'verdict')
    const panel = v.closest('.grid'); panel.querySelectorAll('figure').forEach((fg, i) => fg.setAttribute('data-cap', `fig${i}`))
  })
  for (const [name, sel] of [['verdict', 'verdict'], ['target', 'fig0'], ['photo', 'fig1']]) {
    const l = p3.locator(`[data-cap=${sel}]`); await l.scrollIntoViewIfNeeded(); await l.screenshot({ path: `${OUT}/check-${k}-${name}.png` }); console.log(`check-${k}-${name}`)
  }
}
await b.close()
