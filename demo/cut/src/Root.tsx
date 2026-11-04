import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/archivo'
import React from 'react'
import { Composition } from 'remotion'
import { Idea, TOTAL, Video } from './Video'
import { UI_ALL_LEN, UiAll } from './app-ui'
import { APP_ALL_LEN, AppScenes, BowlScene, ColorsScene, IdeaScene, SeeScene, StepCheckScene, StepsScene } from './app-scenes'
import { INTRO_LEN, IntroClips, IntroCuts, IntroLift, IntroType, IntroWall } from './intros'
import { EASY_ALL_LEN, EASY_LEN, EasyChatAll, EasyPreview } from './easy'
import { IntroBlur, IntroFull, IntroNear, IntroPanels, IntroStrip } from './intro-clips'
import { HOOK_LEN, HookBowl, HookDeal, HookDecisions, HookKnife, HookNoise, HookSketch, HookSplit } from './hooks'

const opt = { fps: 30, width: 1920, height: 1080, durationInFrames: HOOK_LEN }
export const Root: React.FC = () => (
  <>
    <Composition id="Impasto" component={Video} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Hook1-Sketch" component={HookSketch} {...opt} />
    <Composition id="Hook2-Deal" component={HookDeal} {...opt} />
    <Composition id="Hook3-Knife" component={HookKnife} {...opt} />
    <Composition id="Hook4-Noise" component={HookNoise} {...opt} />
    <Composition id="Hook5-Split" component={HookSplit} {...opt} />
    <Composition id="Hook6-Decisions" component={HookDecisions} {...opt} />
    <Composition id="Hook7-Bowl" component={HookBowl} {...opt} />
    <Composition id="Intro1-Clips" component={IntroClips} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro2-Lift" component={IntroLift} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro3-Wall" component={IntroWall} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro4-Cuts" component={IntroCuts} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro5-Type" component={IntroType} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro1a-Panels" component={IntroPanels} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro1b-Blur" component={IntroBlur} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro1c-Full" component={IntroFull} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro1d-Strip" component={IntroStrip} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Intro1e-Near" component={IntroNear} {...opt} durationInFrames={INTRO_LEN} />
    <Composition id="Easy1-Clip" component={EasyPreview} {...opt} durationInFrames={EASY_LEN} defaultProps={{ v: 1 as const }} />
    <Composition id="Easy2-Claims" component={EasyPreview} {...opt} durationInFrames={EASY_LEN} defaultProps={{ v: 2 as const }} />
    <Composition id="Easy3-Chat" component={EasyPreview} {...opt} durationInFrames={EASY_LEN} defaultProps={{ v: 3 as const }} />
    <Composition id="Easy4-ChatAll" component={EasyChatAll} {...opt} durationInFrames={EASY_ALL_LEN} />
    <Composition id="Idea-Fix" component={Idea} {...opt} durationInFrames={300} defaultProps={{ brief: 'fix' as const }} />
    <Composition id="Idea-Hide" component={Idea} {...opt} durationInFrames={300} defaultProps={{ brief: 'hide' as const }} />
    <Composition id="UI-All" component={UiAll} {...opt} durationInFrames={UI_ALL_LEN} />
    <Composition id="App-All" component={AppScenes} {...opt} durationInFrames={APP_ALL_LEN} />
    <Composition id="App1-Idea" component={IdeaScene} {...opt} durationInFrames={300} />
    <Composition id="App2-See" component={SeeScene} {...opt} durationInFrames={150} />
    <Composition id="App3-Colors" component={ColorsScene} {...opt} durationInFrames={330} />
    <Composition id="App4-Steps" component={StepsScene} {...opt} durationInFrames={330} />
    <Composition id="App5-Bowl" component={BowlScene} {...opt} durationInFrames={270} />
    <Composition id="App6-StepCheck" component={StepCheckScene} {...opt} durationInFrames={330} />
  </>
)
