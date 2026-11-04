import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/archivo'
import React from 'react'
import { Composition } from 'remotion'
import { Video } from './Video'
import { HOOK_LEN, HookBowl, HookDeal, HookDecisions, HookKnife, HookNoise, HookSketch, HookSplit } from './hooks'

const opt = { fps: 30, width: 1920, height: 1080, durationInFrames: HOOK_LEN }
export const Root: React.FC = () => (
  <>
    <Composition id="Impasto" component={Video} durationInFrames={5400} fps={30} width={1920} height={1080} />
    <Composition id="Hook1-Sketch" component={HookSketch} {...opt} />
    <Composition id="Hook2-Deal" component={HookDeal} {...opt} />
    <Composition id="Hook3-Knife" component={HookKnife} {...opt} />
    <Composition id="Hook4-Noise" component={HookNoise} {...opt} />
    <Composition id="Hook5-Split" component={HookSplit} {...opt} />
    <Composition id="Hook6-Decisions" component={HookDecisions} {...opt} />
    <Composition id="Hook7-Bowl" component={HookBowl} {...opt} />
  </>
)
