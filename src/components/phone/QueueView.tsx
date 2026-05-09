'use client'
import { randomUUID } from '@/lib/client/uuid'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem, PlayerState } from '@/lib/types/state'

export const QueueView = ({ conn, sessionId }: { conn: Connection; sessionId: string }) => {
  const state = conn.state
  if (!state) return <div className="uc" style={{ padding: 16 }}>Connecting…</div>

  const remove = (it: QueueItem) =>
    conn.send({ type: 'queue.remove', msgId: randomUUID(), itemId: it.id })

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NowPlayingCard player={state.player} />
      <h3 className="uc" style={{ fontSize: 11 }}>▌ Up next · {state.queue.length}</h3>
      {state.queue.map((it, i) => (
        <div key={it.id} className="paper-card paper-grain" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{String(i + 2).padStart(2, '0')} · {it.queuedBy.name}</div>
            <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{it.title}</div>
            {it.prePitch !== 0 && (
              <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>key {it.prePitch > 0 ? '+' : ''}{it.prePitch}</div>
            )}
          </div>
          {it.queuedBy.sessionId === sessionId && (
            <button onClick={() => remove(it)} aria-label="Remove" style={{ padding: 6 }}>✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

const NowPlayingCard = ({ player }: { player: PlayerState }) => {
  if (player.status === 'idle') return (
    <div className="paper-card paper-grain"><div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>▌ idle — queue something</div></div>
  )
  return (
    <div className="paper-card paper-grain tape-strip">
      <div className="uc" style={{ fontSize: 9, color: 'var(--riso-pink)' }}>▌ now playing</div>
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 18 }}>{player.item.title}</div>
      <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{player.item.queuedBy.name} · key {player.livePitch >= 0 ? '+' : ''}{player.livePitch}</div>
    </div>
  )
}
