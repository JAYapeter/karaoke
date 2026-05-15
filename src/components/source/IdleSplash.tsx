'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'

const TRANSIENT_DELAY_MS = 1500

export type IdleSplashProps = { conn: Connection; transientWithQueue: boolean }

export const IdleSplash = ({ conn, transientWithQueue }: IdleSplashProps) => {
  const [showSkip, setShowSkip] = useState(false)
  useEffect(() => {
    if (!transientWithQueue) { setShowSkip(false); return }
    const id = setTimeout(() => setShowSkip(true), TRANSIENT_DELAY_MS)
    return () => { clearTimeout(id); setShowSkip(false) }
  }, [transientWithQueue])

  const startNext = () => {
    const p = conn.state?.player
    const epoch = p && 'epoch' in p ? p.epoch : 0
    conn.send({ type: 'player.skip', msgId: randomUUID(), epoch })
  }

  return (
    <div
      // Overlay variant — `--overlay` resets 100dvh + safe-area to fill the
      // parent video frame instead of the viewport.
      className="source-idle-splash source-idle-splash--overlay"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, background: 'linear-gradient(135deg, var(--ink-deep), var(--ink-black))',
        color: 'var(--paper-cream)',
      }}
    >
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 'clamp(96px, 12vw, 144px)', letterSpacing: '-1px' }}>下北沢</div>
      <div className="uc" style={{ fontSize: 16, letterSpacing: 3, color: 'var(--cigarette)' }}>house lights on</div>
      {showSkip && (
        <button
          type="button" className="hit-target uc"
          onClick={startNext}
          style={{ marginTop: 12, padding: '10px 20px', background: 'transparent', color: 'var(--paper-cream)', border: '1px solid var(--paper-cream)', fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 18 }}
        >
          ▶ Start next song
        </button>
      )}
    </div>
  )
}
