'use client'
import type { AudioGraph } from './audio-graph'

let current: AudioGraph | null = null
const listeners = new Set<() => void>()

export const setAudioGraph = (g: AudioGraph | null) => {
  current = g
  for (const l of listeners) l()
}

export const getAudioGraph = (): AudioGraph | null => current

export const subscribeAudioGraph = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
