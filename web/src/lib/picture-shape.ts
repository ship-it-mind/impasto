// Whether a picture's shape can fill the canvas. The backend checks the exact picture the same way (impasto/exact.py).

import type { Point } from './checkin'
import { orderQuad, quadSides } from './wall'
import type { SizeCm } from './wall'

// Same as MAX_SHAPE_CROP in backend/impasto/exact.py.
const MAX_SHAPE_CROP = 0.15

// A picture's width over height, as a browser shows it.
export function pictureRatio(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { resolve(image.naturalWidth / image.naturalHeight); URL.revokeObjectURL(url) }
    image.onerror = () => { reject(new Error(`Couldn't read ${file.name}.`)); URL.revokeObjectURL(url) }
    image.src = url
  })
}

// Width over height of the painting those four corners mark, as seen straight on.
export function cornersRatio(corners: Point[]): number {
  const { across, down } = quadSides(orderQuad(corners))
  return across / down
}

// How the picture is off from the canvas, if fitting it would cut off too much.
export function shapeOff(ratio: number, size: SizeCm): 'wider' | 'taller' | null {
  const off = ratio / (size.w / size.h)
  if (1 - Math.min(off, 1 / off) <= MAX_SHAPE_CROP) return null
  return off > 1 ? 'wider' : 'taller'
}
