'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import { QrPanel } from './QrPanel'
import { getAudioGraph } from '@/lib/client/audio-graph-ref'

export const QueueOverlay = ({ conn }: { conn: Connection }) => {
  // Initial volume must match the GainNode's default (1.0) so the slider position
  // truthfully represents the actual gain at first render.
  const [volume, setVolume] = useState(1)
  const s = conn.state
  if (!s) return null
  const p = s.player

  const skip = () => conn.send({ type: 'player.skip', msgId: randomUUID(), epoch: p.epoch })
  const prev = () => conn.send({ type: 'player.prev', msgId: randomUUID(), epoch: p.epoch })
  const togglePause = () =>
    conn.send({ type: p.status === 'paused' ? 'player.play' : 'player.pause', msgId: randomUUID() })
  const shuffle = () => conn.send({ type: 'queue.shuffle', msgId: randomUUID() })
  const setLive = (sem: number) =>
    conn.send({ type: 'player.setLivePitch', msgId: randomUUID(), semitones: sem })
  const moveTop = (id: string) =>
    conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: id, toIndex: 0 })
  const onVolume = (v: number) => {
    setVolume(v)
    getAudioGraph()?.setVolume(v)
  }

  if (s.player.status === 'idle' && s.queue.length === 0) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, pointerEvents: 'auto' }}>
        <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 96, letterSpacing: -2 }}>下北沢</div>
        <div className="uc" style={{ fontSize: 14, color: 'var(--cigarette)' }}>house lights on — scan to add the first song</div>
        <QrPanel />
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid',
      gridTemplateColumns: '1fr 260px', gridTemplateRows: '1fr auto',
      pointerEvents: 'none', padding: 24, gap: 16, color: 'var(--paper-cream)',
    }}>
      <div style={{ gridColumn: 2, gridRow: 1, pointerEvents: 'auto' }}><QrPanel /></div>

      <div style={{ gridColumn: '1 / span 2', gridRow: 2, pointerEvents: 'auto' }}>
        {p.status !== 'idle' && (
          <div className="paper-card paper-grain tape-strip" style={{ marginBottom: 12 }}>
            <div className="uc" style={{ fontSize: 10, color: 'var(--riso-pink)' }}>▌ now playing</div>
            <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 28 }}>{p.item.title}</div>
            <div className="uc" style={{ fontSize: 11 }}>{p.item.queuedBy.name} · key {p.livePitch >= 0 ? '+' : ''}{p.livePitch} · {Math.floor(p.positionSec / 60)}:{String(Math.floor(p.positionSec) % 60).padStart(2, '0')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={() => setLive(p.livePitch - 1)} className="uc">−</button>
              <span className="hanko">{p.livePitch >= 0 ? `+${p.livePitch}` : p.livePitch}</span>
              <button onClick={() => setLive(p.livePitch + 1)} className="uc">+</button>
              <button onClick={prev} className="uc">⏮</button>
              <button onClick={togglePause} className="uc" aria-label={p.status === 'paused' ? 'Play' : 'Pause'}>
                {p.status === 'paused' ? '▶' : '⏸'}
              </button>
              <button onClick={skip} className="uc">⏭</button>
              <button onClick={shuffle} className="uc">🔀</button>
              <span className="uc" style={{ fontSize: 9, marginLeft: 12 }}>vol</span>
              <input
                type="range" min={0} max={1} step={0.01} value={volume}
                onChange={(e) => onVolume(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
          </div>
        )}

        <div className="uc" style={{ fontSize: 11 }}>setlist · {s.queue.length}</div>
        {s.queue.map((it, i) => (
          <div key={it.id} className="paper-card paper-grain" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <span className="uc" style={{ fontSize: 9, marginRight: 8 }}>{String(i + 2).padStart(2, '0')}</span>
              <span style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 16 }}>{it.queuedBy.name} — {it.title}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="uc" onClick={() => moveTop(it.id)}>⤴</button>
              <button className="uc" onClick={() => conn.send({ type: 'queue.remove', msgId: randomUUID(), itemId: it.id })}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
