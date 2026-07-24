'use client'

export type AudioGraph = {
  ctx: AudioContext
  video: HTMLVideoElement
  /** False when the SoundTouch worklet failed to load — playback works, key changes don't. */
  pitchAvailable: boolean
  setPitch: (semitones: number) => void
  setVolume: (v: number) => void
  resume: () => void
  destroy: () => void
}

/**
 * video → [soundtouch worklet, only while transposed] → gain → destination
 *
 * The worklet is deliberately NOT a permanent graph member. Measured on the vendored
 * build, it is bit-exact transparent at pitch 0 — but it still costs ~112 ms of audio
 * delay behind the video and eats ~128 ms of priming silence at the start of every
 * song. For karaoke (lip sync, and not clipping the first beat) that matters, and most
 * songs are sung in the original key, so the default path is a straight wire.
 */
export const buildAudioGraph = async (mountEl: HTMLElement): Promise<AudioGraph> => {
  // Resume *before* the async worklet load, so the user-activation token is still valid.
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()

  let pitchAvailable = true
  try {
    await ctx.audioWorklet.addModule('/worklets/soundtouch-worklet.js')
    if (ctx.state === 'suspended') await ctx.resume()
  } catch (e) {
    console.warn('SoundTouch worklet unavailable — playing in original key', e)
    pitchAvailable = false
  }

  const video = document.createElement('video')
  video.playsInline = true
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = 'contain'
  video.style.background = 'black'
  mountEl.appendChild(video)

  const src = ctx.createMediaElementSource(video)
  const gain = ctx.createGain()
  gain.connect(ctx.destination)
  src.connect(gain)

  let worklet: AudioWorkletNode | null = null
  let pitch = 0

  const setPitch = (semitones: number) => {
    if (!pitchAvailable || semitones === pitch) return
    pitch = semitones
    src.disconnect()
    worklet?.disconnect()
    worklet = null

    if (semitones === 0) {
      src.connect(gain)
      return
    }
    try {
      // A FRESH node every time. The processor exposes no reset and no message port, so
      // reusing one replays whatever was still in SoundTouch's FIFO when it was
      // disconnected — measured at 3.1 s of stale audio after a 3 s bypass.
      // Stereo output is required: without `outputChannelCount: [2]` the worklet's
      // internal stereo write silences the output on some browsers.
      const w = new AudioWorkletNode(ctx, 'soundtouch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      // Native semitone parameter — integer-step musical key changes, no rounding error.
      const param = (w.parameters as Map<string, AudioParam>).get('pitchSemitones')
      if (param) param.value = semitones
      src.connect(w)
      w.connect(gain)
      worklet = w
    } catch (e) {
      // The module loaded but the processor isn't usable. Never leave `src` connected to
      // nothing — that's silence for the rest of the song — and never throw out of here:
      // this runs inside a React effect with no error boundary above it.
      console.warn('SoundTouch node could not be created — playing in original key', e)
      pitchAvailable = false
      pitch = 0
      src.connect(gain)
    }
  }

  // Only 'suspended' is resumable: resume() rejects on a closed context (destroy()
  // closes it) and on Safari's 'interrupted', which the UA resumes by itself.
  const resume = () => {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  }
  ctx.onstatechange = resume

  return {
    ctx,
    video,
    pitchAvailable,
    setPitch,
    setVolume: (v) => { gain.gain.value = Math.max(0, Math.min(1, v)) },
    resume,
    destroy: () => {
      ctx.onstatechange = null
      try { ctx.close() } catch {}
      try { mountEl.removeChild(video) } catch {}
    },
  }
}
