'use client'
import { useEffect, useState } from 'react'
import type { ServerMessage } from '@/lib/types/protocol'

type Toast = { id: number; level: 'info' | 'warn' | 'error'; message: string }

const COLORS: Record<Toast['level'], string> = {
  info: 'var(--cigarette)',
  warn: 'var(--riso-pink)',
  error: 'var(--hanko-red)',
}

const TOAST_TTL_MS = 4500

export const Toaster = () => {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let nextId = 1
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'toast') return
      const t: Toast = { id: nextId++, level: m.level, message: m.message }
      setToasts((cur) => [...cur, t])
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), TOAST_TTL_MS)
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} className="paper-card paper-grain" style={{
          minWidth: 220, maxWidth: 360, borderLeft: `4px solid ${COLORS[t.level]}`,
        }}>
          <div className="uc" style={{ fontSize: 9, color: COLORS[t.level], marginBottom: 2 }}>{t.level}</div>
          <div style={{ fontFamily: 'var(--mono-font)', fontSize: 12 }}>{t.message}</div>
        </div>
      ))}
    </div>
  )
}
