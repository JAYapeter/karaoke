'use client'

export type AudioGraph = {
  ctx: AudioContext
  video: HTMLVideoElement
  setPitch: (semitones: number) => void
  setVolume: (v: number) => void
  bypassPitch: () => void
  destroy: () => void
}

export const buildAudioGraph = async (mountEl: HTMLElement): Promise<AudioGraph> => {
  // Resume *before* the async worklet load, so the user-activation token is still valid.
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
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
  // Stereo output is REQUIRED here: without `outputChannelCount: [2]`, some browsers
  // (and the SoundTouch worklet's internal stereo-write expectation) silence the output.
  // Matches the official @soundtouchjs/audio-worklet `SoundTouchNode` constructor.
  const worklet = new AudioWorkletNode(ctx, 'soundtouch-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  const gain = ctx.createGain()
  src.connect(worklet)
  worklet.connect(gain)
  gain.connect(ctx.destination)

  let bypassed = false

  const setPitch = (semitones: number) => {
    if (bypassed) return
    // Use the worklet's native semitone parameter instead of converting via `pitch` —
    // gives integer-step musical key changes with no rounding error.
    const param = (worklet.parameters as Map<string, AudioParam>).get('pitchSemitones')
    if (param) param.value = semitones
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

export const buildAudioGraphNoPitch = async (mountEl: HTMLElement): Promise<AudioGraph> => {
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const video = document.createElement('video')
  video.playsInline = true
  video.style.width = '100%'; video.style.height = '100%'
  video.style.objectFit = 'contain'; video.style.background = 'black'
  mountEl.appendChild(video)
  const src = ctx.createMediaElementSource(video)
  const gain = ctx.createGain()
  src.connect(gain); gain.connect(ctx.destination)
  return {
    ctx, video,
    setPitch: () => {},
    setVolume: (v) => { gain.gain.value = Math.max(0, Math.min(1, v)) },
    bypassPitch: () => {},
    destroy: () => { try { ctx.close() } catch {} mountEl.removeChild(video) },
  }
}
