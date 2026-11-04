import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/archivo'
import React from 'react'
import { Composition } from 'remotion'
import { Video } from './Video'

export const Root: React.FC = () => (
  <Composition id="Impasto" component={Video} durationInFrames={5400} fps={30} width={1920} height={1080} />
)
