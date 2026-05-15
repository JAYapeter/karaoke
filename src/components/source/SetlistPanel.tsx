'use client'
import { useEffect, useRef } from 'react'
import { randomUUID } from '@/lib/client/uuid'
import { getSessionId } from '@/lib/client/ws'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { useToaster } from '@/components/shared/Toaster'
import { MarqueeText } from '@/components/shared/MarqueeText'

const VISIBLE_CAP = 8
const UNDO_TTL_MS = 6000

export type SetlistPanelProps = {
  conn: Connection
  queue: QueueItem[]
  qrChip?: React.ReactNode | null
}

export const SetlistPanel = ({ conn, queue, qrChip }: SetlistPanelProps) => {
  const { showToast } = useToaster()
  const visible = queue.slice(0, VISIBLE_CAP)
  const more = Math.max(0, queue.length - VISIBLE_CAP)

  // Each remove-undo registers a `karaoke-msg` listener + 4 s setTimeout. If
  // the component unmounts before either fires, both leak. Track every live
  // cleanup function so unmount can tear them down.
  const undoCleanupsRef = useRef<Set<() => void>>(new Set())
  useEffect(() => () => {
    for (const fn of undoCleanupsRef.current) fn()
    undoCleanupsRef.current.clear()
  }, [])

  const shuffle = () => conn.send({ type: 'queue.shuffle', msgId: randomUUID() })

  const remove = (item: QueueItem) => {
    const originalIndex = queue.findIndex((q) => q.id === item.id)
    conn.send({ type: 'queue.remove', msgId: randomUUID(), itemId: item.id })
    // §3.6 undo: re-add via queue.add and, when the re-added item appears in
    // the queue snapshot, chain a queue.move to the original index. Since
    // queue.add mints a NEW item.id server-side, we can't use the old id;
    // we identify the new entry by listening for the next queue update and
    // matching on (videoId, queuedBy.sessionId === source's session, addedAt >
    // sentAt). "If possible" — if the queue update doesn't arrive within 4 s
    // (e.g. server error), the move is skipped silently and the song stays
    // wherever queue.add placed it.
    showToast({
      level: 'warn', message: `Removed: ${item.title}`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        const addMsgId = randomUUID()
        const mySession = getSessionId()
        // Snapshot the queue's current item IDs BEFORE sending the add. The
        // newly-added item will appear in a state.queue / state.full update
        // as an item whose id wasn't in the snapshot. Note: state.queue is
        // broadcast BEFORE state.ack by the server's dispatcher (see
        // dispatch.ts), so we must NOT gate the scan on the ack arriving
        // first — we'd miss the very update that contains our new item.
        const knownIds = new Set(queue.map((q) => q.id))
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const cleanup = () => {
          window.removeEventListener('karaoke-msg', onMsg)
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
          undoCleanupsRef.current.delete(cleanup)
        }
        undoCleanupsRef.current.add(cleanup)
        const onMsg = (e: Event) => {
          const m = (e as CustomEvent).detail as ServerMessage
          // ok=false ack short-circuits — the add was rejected, nothing to move.
          if (m.type === 'state.ack' && m.msgId === addMsgId && !m.ok) {
            cleanup()
            return
          }
          if (m.type !== 'state.queue' && m.type !== 'state.full') return
          const q = m.type === 'state.full' ? m.state.queue : m.queue
          // The newly-added item is one whose id is NOT in the pre-add snapshot
          // AND whose (videoId, queuedBy.sessionId) match our add. That two-way
          // filter survives concurrent same-videoId adds from other clients
          // AND clock skew (we don't depend on addedAt at all). Scan in reverse
          // so the most-recent new entry wins if multiple were added concurrently
          // (the previous queue snapshot rules out earlier additions).
          const candidate = [...q].reverse().find((it) =>
            !knownIds.has(it.id) &&
            it.videoId === item.videoId &&
            it.queuedBy.sessionId === mySession
          )
          if (!candidate) return
          if (originalIndex >= 0 && originalIndex < q.length) {
            conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: candidate.id, toIndex: originalIndex })
          }
          cleanup()
        }
        window.addEventListener('karaoke-msg', onMsg)
        conn.send({ type: 'queue.add', msgId: addMsgId, videoId: item.videoId, prePitch: item.prePitch })
        timeoutId = setTimeout(cleanup, 4000)
      }},
    })
  }

  const moveTop = (item: QueueItem) => {
    const originalIndex = queue.findIndex((q) => q.id === item.id)
    conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: item.id, toIndex: 0 })
    showToast({
      level: 'info', message: `Moved ${item.title} to top`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        if (originalIndex >= 0) {
          conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: item.id, toIndex: originalIndex })
        }
      }},
    })
  }

  return (
    <div className="setlist-panel paper-card paper-grain">
      <div className="setlist-panel__header">
        {qrChip}
        <div className="uc setlist-label" style={{ fontSize: 12 }}>SETLIST · {queue.length}</div>
        <button
          type="button" className="shuffle-btn hit-target uc"
          aria-label="Shuffle queue" onClick={shuffle}
          style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}
        >🔀</button>
      </div>
      <div style={{ borderBottom: '1px solid var(--ink-deep)', margin: '6px 0' }} />
      {queue.length === 0 && (
        <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', color: 'var(--ink-muted)', padding: '8px 0' }}>
          queue something to start the show
        </div>
      )}
      {visible.map((it, i) => (
        <div key={it.id} className={`setlist-row ${i > 0 ? 'paper-card--minor' : ''}`} style={{ padding: '4px 0' }}>
          <div className="setlist-row__title-wrap">
            <span className="uc setlist-row__index" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              {String(i + 2).padStart(2, '0')} · {it.queuedBy.name.toUpperCase()}
            </span>
            <MarqueeText text={it.title} className="setlist-row__title" />
          </div>
          <div className="setlist-row__actions">
            <button type="button" aria-label="Move to top" onClick={() => moveTop(it)} className="uc" style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 12 }}>⤴</button>
            <button type="button" aria-label="Remove from queue" onClick={() => remove(it)} className="uc" style={{ background: 'transparent', color: 'var(--hanko-red)', fontSize: 12 }}>✕</button>
          </div>
        </div>
      ))}
      {more > 0 && (
        <div className="uc" style={{ textAlign: 'center', padding: '6px 0', fontSize: 12, color: 'var(--ink-muted)' }}>
          + {more} more
        </div>
      )}
    </div>
  )
}
