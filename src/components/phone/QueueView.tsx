'use client'
import { randomUUID } from '@/lib/client/uuid'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem, ServerState } from '@/lib/types/state'
import { useToaster } from '@/components/shared/Toaster'

const UNDO_TTL_MS = 6000

type Props = { conn: Connection; sessionId: string; sourceConnected: boolean; sourceReady: boolean }

export const QueueView = ({ conn, sessionId, sourceConnected, sourceReady }: Props) => {
  const state = conn.state
  const { showToast } = useToaster()
  if (!state) return <div className="uc" style={{ padding: 16 }}>Connecting…</div>

  const remove = (it: QueueItem) => {
    conn.send({ type: 'queue.remove', msgId: randomUUID(), itemId: it.id })
    showToast({
      level: 'warn', message: `Removed: ${it.title}`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        conn.send({ type: 'queue.add', msgId: randomUUID(), videoId: it.videoId, prePitch: it.prePitch })
      }},
    })
  }

  // When the player is idle, NowPlayingCard renders queue[0] as the ▌ NEXT UP
  // preview, so the up-next list must start at index 1 to avoid duplicating it.
  // In playing/paused state the now-playing card shows the live item (not
  // queue[0]), so the queue list stays intact.
  const idleWithQueue = state.player.status === 'idle' && state.queue.length > 0
  const renderedQueue = idleWithQueue ? state.queue.slice(1) : state.queue
  const upNextCount = idleWithQueue ? state.queue.length - 1 : state.queue.length

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NowPlayingCard state={state} sourceConnected={sourceConnected} sourceReady={sourceReady} />
      <h3 className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', letterSpacing: '0.2em' }}>
        ▌ up next · {upNextCount}
      </h3>
      {renderedQueue.length === 0 && !idleWithQueue && (
        <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', color: 'var(--ink-muted)' }}>
          nothing queued yet — try search or paste
        </div>
      )}
      {renderedQueue.map((it, i) => (
        <div key={it.id} className="paper-card paper-grain" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              {String(i + 2).padStart(2, '0')} · {it.queuedBy.sessionId === sessionId ? 'YOU' : it.queuedBy.name.toUpperCase()}
            </div>
            {/* font-size owned by .queue-now-playing__title in riso.css —
                desktop 18px, compact-landscape 16px. No inline `fontSize`. */}
            <div className="queue-now-playing__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.title}
            </div>
            {it.prePitch !== 0 && (
              <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                KEY {it.prePitch > 0 ? '+' : ''}{it.prePitch}
              </div>
            )}
          </div>
          {it.queuedBy.sessionId === sessionId && (
            <button
              type="button" className="hit-target uc"
              aria-label="Remove your queued song"
              onClick={() => remove(it)}
              style={{ background: 'transparent', color: 'var(--hanko-red)', fontSize: 12 }}
            >✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

const NowPlayingCard = ({ state, sourceConnected, sourceReady }: { state: ServerState; sourceConnected: boolean; sourceReady: boolean }) => {
  const p = state.player
  const offline = !sourceConnected || !sourceReady

  // Source-offline with no prior snapshot.
  if (offline && p.status === 'idle') {
    return (
      <div className="paper-card paper-grain paper-card--accent">
        <div className="uc" style={{ fontSize: 13, color: 'var(--riso-pink)' }}>▌ offline · waiting for source</div>
      </div>
    )
  }

  if (p.status === 'idle' && state.queue.length === 0) {
    return (
      <div className="paper-card paper-grain">
        <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>▌ idle — queue something</div>
      </div>
    )
  }

  if (p.status === 'idle' && state.queue.length > 0) {
    const next = state.queue[0]!
    return (
      <div className="paper-card paper-grain paper-card--accent">
        <div className="next-up-badge uc" style={{ fontWeight: 700, color: 'var(--ink-black)' }}>▌ NEXT UP</div>
        {/* font-size owned by .queue-now-playing__title in riso.css —
            desktop 18px, compact-landscape 16px. No inline `fontSize`. */}
        <div className="queue-now-playing__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900 }}>{next.title}</div>
        <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          {next.queuedBy.name.toUpperCase()} · KEY {next.prePitch >= 0 ? '+' : ''}{next.prePitch}
        </div>
      </div>
    )
  }

  // playing or paused — we have a real item. The three idle branches above
  // cover every `p.status === 'idle'` case (offline-idle, idle-empty-queue,
  // idle-with-queue), but TS can't combine those narrowings, so guard
  // explicitly to recover the PlayerStateActive type here.
  if (p.status === 'idle') return null
  const progress = Math.max(0, Math.min(1, p.positionSec / Math.max(1, p.item.durationSec)))
  const badge =
    p.status === 'paused'
      ? (<div className="paused-badge uc" style={{ fontWeight: 700, color: 'var(--ink-black)' }}>▌ PAUSED</div>)
      : (<div className="now-playing-badge uc" style={{ color: 'var(--riso-pink)' }}>▌ NOW PLAYING</div>)
  return (
    <div className="paper-card paper-grain paper-card--accent">
      {offline ? (
        <div className="uc" style={{ fontSize: 13, color: 'var(--riso-pink)' }}>▌ OFFLINE</div>
      ) : badge}
      {/* font-size owned by .queue-now-playing__title in riso.css —
          desktop 18px, compact-landscape 16px. Setting inline `fontSize`
          here would defeat the compact-landscape media query. */}
      <div className="queue-now-playing__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900 }}>
        {p.item.title}
      </div>
      <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
        {p.item.queuedBy.name.toUpperCase()} · KEY {p.livePitch >= 0 ? '+' : ''}{p.livePitch}
      </div>
      <div style={{ marginTop: 6, height: 3, background: 'var(--ink-muted)' }}>
        {/* No CSS transition on the width — that would be a decorative
            animation outside the §5.4/§5.5 registry. The bar steps with
            React state on every state.player tick, which is smooth enough
            given heartbeat cadence (~500 ms). */}
        <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--hanko-red)' }} />
      </div>
    </div>
  )
}
