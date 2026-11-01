import { Composition, continueRender, delayRender } from 'remotion'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { Demo, FPS, TOTAL_SECONDS } from './Demo'

if (typeof document !== 'undefined') {
  const handle = delayRender('Loading fonts')
  Promise.all(['400', '500', '600'].flatMap(w => [
    document.fonts.load(`${w} 40px "Geist Variable"`),
    document.fonts.load(`${w} 24px "Geist Mono Variable"`),
  ])).then(() => continueRender(handle))
}

export const Root = () => (
  <Composition id="Demo" component={Demo} durationInFrames={Math.round(TOTAL_SECONDS * FPS)} fps={FPS} width={1920} height={1080} />
)
