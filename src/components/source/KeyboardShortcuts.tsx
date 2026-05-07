'use client'
import { useEffect } from 'react'
import type { Connection } from '@/lib/client/ws'

export const KeyboardShortcuts = ({ conn }: { conn: Connection }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = conn.state?.player
      if (!p) return
      if (e.code === 'Space') { e.preventDefault(); conn.send({ type: p.status === 'paused' ? 'player.play' : 'player.pause', msgId: crypto.randomUUID() }) }
      if (e.code === 'ArrowRight') conn.send({ type: 'player.skip', msgId: crypto.randomUUID(), epoch: p.epoch })
      if (e.code === 'ArrowLeft') conn.send({ type: 'player.prev', msgId: crypto.randomUUID(), epoch: p.epoch })
      if (e.code === 'ArrowUp' && p.status !== 'idle')
        conn.send({ type: 'player.setLivePitch', msgId: crypto.randomUUID(), semitones: p.livePitch + 1 })
      if (e.code === 'ArrowDown' && p.status !== 'idle')
        conn.send({ type: 'player.setLivePitch', msgId: crypto.randomUUID(), semitones: p.livePitch - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [conn])
  return null
}
