// YouTube thumbnails, 1280 × 720: two to choose from.
import React from 'react'
import { AbsoluteFill, Img, staticFile } from 'remotion'
import { C, SANS, SERIF } from './kit'

const chip = (text: React.ReactNode, style: React.CSSProperties) => (
  <div style={{ position: 'absolute', padding: '14px 22px', borderRadius: 16, background: '#fff', fontFamily: SANS, fontSize: 26, fontWeight: 600, color: C.ink,
    boxShadow: '0 18px 40px -16px rgba(40,25,15,.45), 0 0 0 1px rgba(40,25,15,.06)', display: 'flex', alignItems: 'center', gap: 12, ...style }}>{text}</div>
)
const dot = (hex: string) => <span style={{ width: 26, height: 26, borderRadius: 8, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />

// A: her finished canvas, with a few of the app's real numbers around it, and the name.
export const ThumbCanvas: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <div style={{ position: 'absolute', left: 90, top: 70, width: 494, height: 580, transform: 'rotate(-3deg)', boxShadow: '0 40px 80px -30px rgba(40,25,15,.6)' }}>
      <Img src={staticFile('hook/finished-straight.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
    </div>
    {chip(<>{dot('#391e20')}Deep Burgundy Brown · 552 g</>, { left: 330, top: 120, transform: 'rotate(2deg)' })}
    {chip(<><span style={{ color: '#c9604f' }}>ΔE 25.2</span> · add 1 part white</>, { left: 40, top: 430, transform: 'rotate(-2deg)' })}
    {chip(<><span style={{ width: 30, height: 30, borderRadius: 30, background: C.ink, color: '#fff', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>07</span>Dusty Rose · on track</>, { left: 300, top: 560, transform: 'rotate(1.5deg)' })}
    <div style={{ position: 'absolute', left: 690, top: 0, bottom: 0, right: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
      <div style={{ fontFamily: SERIF, fontSize: 150, lineHeight: 0.95, color: C.ink, letterSpacing: -5, fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>Impasto</div>
      <div style={{ fontFamily: SERIF, fontSize: 56, lineHeight: 1.08, color: C.plum, letterSpacing: -1 }}>From the idea in her head to the canvas</div>
      <div style={{ fontFamily: SANS, fontSize: 28, fontWeight: 600, color: C.soft, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 10 }}>An AI co-pilot for painters</div>
    </div>
  </AbsoluteFill>
)

// B: Yara with her paintings, and the line.
export const ThumbYara: React.FC = () => (
  <AbsoluteFill style={{ background: C.black }}>
    <Img src={staticFile('thumb/yara.jpg')} style={{ position: 'absolute', left: -120, top: 0, width: 1280 * 1.15, height: 720 * 1.15, objectFit: 'cover', objectPosition: '30% 30%' }} />
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(15,13,12,0) 30%, rgba(15,13,12,.82) 58%, rgba(15,13,12,.92) 100%)' }} />
    <div style={{ position: 'absolute', left: 700, right: 50, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
      <div style={{ fontFamily: SERIF, fontSize: 74, lineHeight: 1.04, color: '#fff', letterSpacing: -1.5 }}>I built an AI co&#8209;pilot for my wife’s paintings</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: SERIF, fontSize: 54, color: '#f2c9b8', letterSpacing: -1.5, fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>Impasto</span>
        <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 600, color: 'rgba(255,255,255,.7)', letterSpacing: 1.5, textTransform: 'uppercase' }}>4 Meta models</span>
      </div>
    </div>
  </AbsoluteFill>
)
