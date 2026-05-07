'use client'

export type AudioGraph = {
  ctx: AudioContext
  video: HTMLVideoElement
  setPitch: (semitones: number) => void
  setVolume: (v: number) => void
  bypassPitch: () => void
  destroy: () => void
}

const semitoneToRatio = (s: number) => Math.pow(2, s / 12)

export const buildAudioGraph = async (mountEl: HTMLElement): Promise<AudioGraph> => {
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule('/worklets/soundtouch-worklet.js')
  if (ctx.state === 'suspended') await ctx.resume()

  const video = document.createElement('video')
  video.playsInline = true
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = 'contain'
  video.style.background = 'black'
  mountEl.appendChild(video)

  const src = ctx.createMediaElementSource(video)
  const worklet = new AudioWorkletNode(ctx, 'soundtouch-processor')
  const gain = ctx.createGain()
  src.connect(worklet)
  worklet.connect(gain)
  gain.connect(ctx.destination)

  let bypassed = false

  const setPitch = (semitones: number) => {
    if (bypassed) return
    const param = (worklet.parameters as Map<string, AudioParam>).get('pitch')
    if (param) param.value = semitoneToRatio(semitones)
  }

  const bypassPitch = () => {
    if (bypassed) return
    bypassed = true
    src.disconnect()
    src.connect(gain) // skip the worklet
  }

  return {
    ctx, video,
    setPitch,
    setVolume: (v) => { gain.gain.value = Math.max(0, Math.min(1, v)) },
    bypassPitch,
    destroy: () => { try { ctx.close() } catch {} mountEl.removeChild(video) },
  }
}
