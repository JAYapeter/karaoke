'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect } from 'react'
import type { Connection } from '@/lib/client/ws'

// Prevents silently changing player state while the host is interacting with form controls (e.g., the volume slider).
export const shouldHandleKey = (target: EventTarget | null): boolean => {
  if (target instanceof HTMLInputElement) return false
  if (target instanceof HTMLTextAreaElement) return false
  if (target instanceof HTMLSelectElement) return false
  if (target instanceof HTMLElement && target.isContentEditable) return false
  return true
}

export const KeyboardShortcuts = ({ conn }: { conn: Connection }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleKey(e.target)) return
      const p = conn.state?.player
      if (!p) return
      if (e.code === 'Space') { e.preventDefault(); conn.send({ type: p.status === 'paused' ? 'player.play' : 'player.pause', msgId: randomUUID() }) }
      if (e.code === 'ArrowRight') conn.send({ type: 'player.skip', msgId: randomUUID(), epoch: p.epoch })
      if (e.code === 'ArrowLeft') conn.send({ type: 'player.prev', msgId: randomUUID(), epoch: p.epoch })
      if (e.code === 'ArrowUp' && p.status !== 'idle')
        conn.send({ type: 'player.setLivePitch', msgId: randomUUID(), semitones: p.livePitch + 1 })
      if (e.code === 'ArrowDown' && p.status !== 'idle')
        conn.send({ type: 'player.setLivePitch', msgId: randomUUID(), semitones: p.livePitch - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [conn])
  return null
}
