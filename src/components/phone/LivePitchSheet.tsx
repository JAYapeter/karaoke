'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'

export const LivePitchSheet = ({ conn, sessionId }: { conn: Connection; sessionId: string }) => {
  const player: PlayerState | undefined = conn.state?.player
  const isMine =
    player && player.status !== 'idle' && player.item.queuedBy.sessionId === sessionId
  const [pitch, setPitch] = useState(0)

  useEffect(() => {
    if (player && player.status !== 'idle') setPitch(player.livePitch)
  }, [player?.status, player?.status === 'idle' ? 0 : player?.livePitch])

  if (!isMine) return null

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      background: 'var(--ink-deep)', borderTop: '2px solid var(--riso-pink)',
      padding: 16, zIndex: 10,
    }}>
      <div className="uc" style={{ fontSize: 10, color: 'var(--riso-pink)' }}>▌ You&apos;re up</div>
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 18 }}>{player.item.title}</div>
      <div style={{ marginTop: 8 }}>
        <div className="uc" style={{ fontSize: 10, color: 'var(--cigarette)' }}>key {pitch >= 0 ? `+${pitch}` : pitch}</div>
        <input
          type="range" min={-6} max={6} step={1} value={pitch}
          onChange={(e) => {
            const v = Number(e.target.value); setPitch(v)
            conn.send({ type: 'player.setLivePitch', msgId: randomUUID(), semitones: v })
          }}
          style={{ width: '100%' }}
        />
        <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>Source has override</div>
      </div>
    </div>
  )
}
