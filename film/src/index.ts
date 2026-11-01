import React from 'react'
import { Composition, continueRender, delayRender, getInputProps, registerRoot } from 'remotion'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/jetbrains-mono'
import { Film, TOTAL_BEATS } from './Film'

if (typeof document !== 'undefined') {
  const h = delayRender('fonts')
  Promise.all([
    document.fonts.load('900 300px "Archivo Variable"'),
    document.fonts.load('500 300px "Fraunces Variable"'),
    document.fonts.load('500 20px "JetBrains Mono Variable"'),
  ]).then(() => continueRender(h))
}

const fps = Number(getInputProps().fps ?? 60)
registerRoot(() => React.createElement(Composition, {
  id: 'Film', component: Film, durationInFrames: Math.round((TOTAL_BEATS / 2) * fps), fps, width: 1920, height: 1080,
}))
