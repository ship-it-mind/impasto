// §3's first shot, three ways, instead of a pan over a still photo. 6 s each, under
// "I thought AI could do this easily. Models write ideas, paint pictures, name colors." / "I was wrong."
import React from 'react'
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { C, SANS, SERIF, Say, Tag, ease } from './kit'

export const EASY_LEN = 180
export const EASY_SAY: [number, number, string][] = [
  [6, 110, 'I thought AI could do this easily. Models write ideas, paint pictures, name colors.'],
  [118, 172, 'I was wrong.'],
]
// When each claim is said, and when "I was wrong." lands.
const CLAIMS: [number, string][] = [[20, 'writes ideas'], [34, 'paints pictures'], [48, 'names colors']]
const WRONG = 78  // on "I was wrong" in the voiceover

// Her white paste texture, the handheld pass over it, slowed to fill 6 s (it's 4.7 s).
const Texture: React.FC<{ grey?: number }> = ({ grey = 0 }) => (
  <OffthreadVideo src={staticFile('intro/texture.mp4')} playbackRate={0.78} muted
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 55%', transform: 'scale(1.14)', transformOrigin: '78% 50%', filter: `grayscale(${grey}) brightness(${1 - 0.25 * grey})` }} />
)

// ─── 1. Her clip, full frame ────────────────────────────────────────────────
export const EasyClip: React.FC = () => (
  <AbsoluteFill style={{ background: C.black }}>
    <Texture />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.5) 100%)' }} />
  </AbsoluteFill>
)

// ─── 2. The three claims, ticked, then crossed out ──────────────────────────
export const EasyClaims: React.FC = () => {
  const f = useCurrentFrame()
  const w = ease(f, WRONG, WRONG + 10)
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <Texture grey={w} />
      <AbsoluteFill style={{ background: `rgba(15,13,12,${0.42 + 0.2 * w})` }} />
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 220, paddingBottom: 150, flexDirection: 'column', gap: 30 }}>
        <div style={{ fontFamily: SANS, fontSize: 28, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', opacity: ease(f, 40, 54), marginBottom: 6 }}>
          AI models
        </div>
        {CLAIMS.map(([a, t], i) => {
          const o = ease(f, a, a + 10)
          const strike = ease(f, WRONG + i * 4, WRONG + 14 + i * 4)
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: o, transform: `translateX(${(1 - ease(f, a, a + 16)) * -30}px)` }}>
              <div style={{ width: 70, height: 70, borderRadius: 70, display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: SANS, fontSize: 40, fontWeight: 700,
                background: strike > 0.5 ? '#c9604f' : '#7d8f6a', color: '#fff', transform: `scale(${1 + 0.15 * Math.sin(Math.PI * strike)})` }}>
                {strike > 0.5 ? '✕' : '✓'}
              </div>
              <div style={{ position: 'relative', fontFamily: SERIF, fontSize: 92, color: `rgba(255,255,255,${1 - 0.45 * strike})`, letterSpacing: -1.5 }}>
                {t}
                <div style={{ position: 'absolute', left: -6, top: '54%', height: 6, borderRadius: 6, background: '#e07a66', width: `calc(${strike * 100}% + 12px)`, opacity: strike > 0 ? 1 : 0 }} />
              </div>
            </div>
          )
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ─── 3. A chat that answers confidently, then goes grey ─────────────────────
// The prompt behind the Day 1 'words alone' picture, shortened from backend/spikes/output/image/text-only.json.
const PROMPT = 'A palette-knife impasto painting: broad flowing bands of color, a muted palette, thick paste with visible ridges.'
export const EasyChat: React.FC = () => {
  const f = useCurrentFrame()
  const typed = PROMPT.slice(0, Math.round(PROMPT.length * Math.min(1, Math.max(0, (f - 8) / 44))))
  const w = ease(f, WRONG, WRONG + 14)
  const reply = (a: number, children: React.ReactNode) => (
    <div style={{ opacity: ease(f, a, a + 10), transform: `translateY(${(1 - ease(f, a, a + 16)) * 16}px)`, alignSelf: 'flex-start', background: '#fff', borderRadius: 22,
      padding: '24px 32px', maxWidth: 1300, boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 10px 30px -18px rgba(60,40,30,.35)', fontFamily: SANS, fontSize: 40, color: C.ink, lineHeight: 1.3 }}>{children}</div>
  )
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: 'absolute', left: 230, right: 230, top: 90, display: 'flex', flexDirection: 'column', gap: 26,
        filter: `grayscale(${w})`, opacity: 1 - 0.55 * w, transform: `scale(${1 - 0.03 * w})`, transformOrigin: '50% 30%' }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: 1200, background: C.ink, color: '#fff', borderRadius: 26, padding: '24px 32px', fontFamily: SANS, fontSize: 40, lineHeight: 1.3, opacity: ease(f, 2, 10) }}>
          {typed}<span style={{ opacity: f < 50 && Math.floor(f / 8) % 2 === 0 ? 1 : 0 }}>▍</span>
        </div>
        {reply(CLAIMS[0][0], <><b>Idea:</b> “Sage Drift”, soft waves of cream rising through sage, built up with a palette knife.</>)}
        {reply(CLAIMS[1][0], (
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <Img src={staticFile('text-only.webp')} style={{ width: 330, height: 220, objectFit: 'cover', borderRadius: 14 }} />
            <span>Here's your painting.</span>
          </div>
        ))}
        {reply(CLAIMS[2][0], (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <b>Colors:</b>
            {[['#9ca58b', 'Sage'], ['#efe4cc', 'Cream'], ['#b9a48d', 'Taupe']].map(([hex, n]) => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px 6px 8px', borderRadius: 999, background: C.paperDeep }}>
                <span style={{ width: 38, height: 38, borderRadius: 38, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />{n}
              </span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  )
}

// ─── 4. All of §3 as one chat ───────────────────────────────────────────────
// The opening chat, then the Day 1 test and the sage-and-cream test as the next turns of the same chat.
// Both are what really happened: Muse Image was given three paintings of hers
// (backend/spikes/output/image/with-refs.json), and SAM looked for "cream paint band" and
// "sage green paint band" in the first of them and found nothing (output/sam/…5.54.40 PM/summary.json).
// That first painting isn't shown: she painted it after the app was done.
const BUBBLE: React.CSSProperties = { borderRadius: 26, padding: '24px 32px', fontFamily: SANS, fontSize: 40, lineHeight: 1.3 }
const Me: React.FC<{ a: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ a, children, style }) => {
  const f = useCurrentFrame()
  return <div style={{ ...BUBBLE, alignSelf: 'flex-end', background: C.ink, color: '#fff', opacity: ease(f, a, a + 10), transform: `translateY(${(1 - ease(f, a, a + 16)) * 16}px)`, ...style }}>{children}</div>
}
const It: React.FC<{ a: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ a, children, style }) => {
  const f = useCurrentFrame()
  return <div style={{ ...BUBBLE, alignSelf: 'flex-start', background: '#fff', color: C.ink, boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 10px 30px -18px rgba(60,40,30,.35)',
    opacity: ease(f, a, a + 10), transform: `translateY(${(1 - ease(f, a, a + 16)) * 16}px)`, ...style }}>{children}</div>
}
// A chat screen that slides in from below and out the top, like the chat scrolling on.
const Turn: React.FC<{ len: number; children: React.ReactNode; last?: boolean }> = ({ len, children, last }) => {
  const f = useCurrentFrame()
  const inn = ease(f, 0, 16), out = last ? 0 : ease(f, len - 10, len)
  return (
    <div style={{ position: 'absolute', left: 230, right: 230, top: 120, display: 'flex', flexDirection: 'column', gap: 26,
      opacity: inn * (1 - out), transform: `translateY(${(1 - inn) * 70 - out * 70}px)` }}>{children}</div>
  )
}
const thumb = (src: string, w: number, h: number) => <Img src={staticFile(src)} style={{ width: w, height: h, objectFit: 'cover', borderRadius: 12 }} />

// Day 1: her three paintings in, generic texture out.
const ChatDayOne: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <Turn len={131}>
      <Me a={0} style={{ maxWidth: 1080 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          {thumb('easy/ref-2.jpg', 160, 200)}{thumb('easy/ref-3.jpg', 160, 200)}
        </div>
        These are her paintings. Make a new one in the same style, palette and knife texture.
      </Me>
      <It a={34}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          {thumb('with-refs.webp', 480, 320)}
          <span>Here's a new one,<br />in her style.</span>
        </div>
      </It>
    </Turn>
    <Tag at={30}>Day 1 test</Tag>
  </AbsoluteFill>
)

// Sage and cream: asked to find them in her painting, it finds nothing; then why, the same cream in light and in shadow.
const LIT = '#e5dccb', SHADE = '#a39b8b'
const ChatNothing: React.FC = () => {
  const f = useCurrentFrame()
  const why = ease(f, 132, 148)  // on "Every ridge's shadow changes the color"
  const row = (a: number, word: string) => (
    <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', opacity: ease(f, a, a + 10) }}>
      <span>“{word}”</span><span style={{ color: C.soft }}>→</span>
      <span style={{ fontWeight: 650, color: '#c9604f', opacity: ease(f, a + 10, a + 20) }}>nothing found</span>
    </div>
  )
  const dot = (x: number, y: number, hex: string, label: string, a: number) => (
    <div style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)', opacity: ease(f, a, a + 10) }}>
      <div style={{ width: 64, height: 64, borderRadius: 64, border: '6px solid #fff', background: hex, boxShadow: '0 4px 16px rgba(0,0,0,.45)' }} />
      <div style={{ position: 'absolute', top: 74, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: SANS, fontSize: 28, fontWeight: 600, color: '#fff',
        background: 'rgba(15,13,12,.72)', padding: '6px 14px', borderRadius: 999 }}>{label}</div>
    </div>
  )
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Turn len={120} last>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, opacity: 1 - 0.8 * why, filter: `grayscale(${why}) blur(${why * 3}px)` }}>
          <Me a={0}>Find the sage green band and the cream band in her painting.</Me>
          <It a={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {row(14, 'sage green')}
            {row(30, 'cream')}
          </It>
        </div>
      </Turn>
      {/* Why: one cream, two colors. The two points are measured from the photo. */}
      <div style={{ position: 'absolute', left: 510, top: 100, width: 900, height: 632, borderRadius: 24, overflow: 'hidden', opacity: why, transform: `translateY(${(1 - why) * 30}px) scale(${0.96 + 0.04 * why})`,
        boxShadow: '0 40px 90px -30px rgba(40,25,15,.65)' }}>
        <Img src={staticFile('easy/shadow.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {dot(0.347, 0.445, SHADE, 'in shadow', 150)}
        {dot(0.642, 0.55, LIT, 'in light', 158)}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 30px', display: 'flex', alignItems: 'center', gap: 22, background: 'rgba(15,13,12,.78)',
          fontFamily: SANS, fontSize: 34, color: '#fff', opacity: ease(f, 166, 178) }}>
          <span style={{ fontFamily: SERIF, fontSize: 42 }}>The same cream:</span>
          {[[LIT, 'in light'], [SHADE, 'in shadow']].map(([hex, n]) => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 54, height: 54, borderRadius: 12, background: hex, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.5)' }} />{n}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  )
}

export const DontGuess: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: C.black, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ fontFamily: SERIF, fontSize: 110, color: '#fff', letterSpacing: -2, opacity: ease(f, 4, 16), transform: `scale(${1.03 - 0.03 * ease(f, 4, 40)})`, paddingBottom: 120 }}>
        So Impasto doesn't guess.
      </div>
    </AbsoluteFill>
  )
}

// The whole of §3, 540 frames: chat (0–180), Day 1 (180–330), sage and cream (330–450), then "doesn't guess".
// Timed to the voiceover (public/vo/easy.wav, from frame 8): each turn of the chat starts on its line.
export const EASY_ALL_LEN = 548
const CUTS = [110, 241, 454]  // "Ask it to paint", "Ask it to find", "So Impasto doesn't guess"
export const EASY_ALL_SAY: [number, number, string][] = [
  [8, 63, 'I thought AI could do this easily.'],
  [78, 98, 'I was wrong.'],
  [110, 226, 'Ask it to paint her idea: generic texture, nothing like hers.'],
  [241, 358, 'Ask it to find “sage” or “cream” in her painting: nothing.'],
  [373, 439, "Every ridge's shadow changes the color."],
]
export const EasyChatAll: React.FC<{ say?: boolean }> = ({ say = true }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    <Sequence durationInFrames={CUTS[0]}><EasyChat /></Sequence>
    <Sequence from={CUTS[0]} durationInFrames={CUTS[1] - CUTS[0]}><ChatDayOne /></Sequence>
    <Sequence from={CUTS[1]} durationInFrames={CUTS[2] - CUTS[1]}><ChatNothing /></Sequence>
    <Sequence from={CUTS[2]}><DontGuess /></Sequence>
    {say && <Sequence durationInFrames={CUTS[2]}><Say lines={EASY_ALL_SAY} dark={false} bottom={40} /></Sequence>}
    {say && <Sequence from={CUTS[2]}><Say lines={[[0, 82, "So Impasto doesn't guess. It measures."]]} /></Sequence>}
  </AbsoluteFill>
)

// Previews with the narration, to choose from.
export const EasyPreview: React.FC<{ v: 1 | 2 | 3 }> = ({ v }) => (
  <AbsoluteFill>
    {v === 1 ? <EasyClip /> : v === 2 ? <EasyClaims /> : <EasyChat />}
    <Say lines={EASY_SAY} dark={v !== 3} bottom={v === 3 ? 40 : 86} />
  </AbsoluteFill>
)
