'use client'
import { useEffect, useRef, useState } from 'react'
import { getAudioGraph, subscribeAudioGraph } from '@/lib/client/audio-graph-ref'

const STORAGE_KEY = 'karaoke.volume'

const readStored = (): number => {
  if (typeof window === 'undefined') return 1
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return 1
  const n = Number(raw)
  if (!isFinite(n) || n < 0 || n > 1) return 1
  return n
}

export const VolumePanel = () => {
  const [volume, setVolume] = useState<number>(() => readStored())
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  useEffect(() => {
    const apply = () => { getAudioGraph()?.setVolume(volumeRef.current) }
    apply()
    return subscribeAudioGraph(apply)
  }, [])

  const onChange = (v: number) => {
    setVolume(v)
    localStorage.setItem(STORAGE_KEY, String(v))
    getAudioGraph()?.setVolume(v)
  }

  return (
    <div className="paper-card paper-grain volume-panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="uc" style={{ fontSize: 12 }}>VOL</span>
      <div className="hit-target" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center' }}>
        <input type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Output volume" style={{ width: '100%' }} />
      </div>
    </div>
  )
}
