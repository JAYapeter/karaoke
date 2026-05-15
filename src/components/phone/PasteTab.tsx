'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'
import { usePendingAdds } from '@/lib/client/pending-adds-context'
import { classifyPendingState } from '@/lib/client/pending-adds'
import { useToaster } from '@/components/shared/Toaster'

const VIDEO_ID = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/
const RESOLVE_TIMEOUT_MS = 12000
const ADD_ACK_TIMEOUT_MS = 6000

type Meta = { videoId: string; title: string; thumbnail: string; durationSec: number }

// Compact-landscape (height ≤ 480 CSS px) — textarea drops to 2 rows.
const useCompactLandscape = (): boolean => {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-height: 480px)')
    const apply = () => setCompact(mql.matches)
    apply()
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])
  return compact
}

export type PasteTabProps = {
  conn: Connection
  currentEpoch: number
  isActive: boolean
  queueLen: number
}

export const PasteTab = ({ conn, currentEpoch, isActive, queueLen }: PasteTabProps) => {
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pitch, setPitch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Tracks the in-flight add msgId originated by THIS PasteTab's current
  // preview. A different preview (new resolve) starts a NEW msgId; the
  // pendingAdds map keeps both as independent ops per §4.3.
  const [activeAddMsgId, setActiveAddMsgId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const ackListenerRef = useRef<EventListener | null>(null)
  const { pendingAdds, add: addPending, dismiss: dismissPending } = usePendingAdds()
  const { showToast } = useToaster()
  const compact = useCompactLandscape()
  // Live tick so classification (queueing → retry → expired) updates the UI.
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    if (!activeAddMsgId) return
    const id = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeAddMsgId])
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const queueLenRef = useRef(queueLen)
  queueLenRef.current = queueLen
  const connRef = useRef(conn)
  connRef.current = conn

  useEffect(() => () => {
    cleanupRef.current?.()
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
      ackListenerRef.current = null
    }
  }, [])

  // Per-add ack listener — listens only for OUR active add's msgId. The global
  // ack listener in PendingAddsProvider already removes the map entry; here we
  // just handle UX (toast / clear / error).
  const addAckListener = useCallback((msgId: string) => {
    const onMsg: EventListener = (e) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack' || m.msgId !== msgId) return
      window.removeEventListener('karaoke-msg', onMsg)
      if (ackListenerRef.current === onMsg) ackListenerRef.current = null
      // Only clear activeAddMsgId on success — on failure we keep it so the
      // inline error & retry affordance can find their entry (pendingAdds is
      // also cleared by the provider on ack.ok=false, but the msgId is still
      // useful as a stable retry handle).
      if (m.ok) setActiveAddMsgId((cur) => (cur === msgId ? null : cur))
      if (m.ok) {
        if (isActiveRef.current) {
          setMeta(null); setUrl(''); setAddError(null)
        } else {
          // Take the max with the local snapshot+1: a stale state.queue can
          // read a smaller value than the queueLenRef snapshot (broadcast
          // hasn't landed yet), and the toast count should only move forward.
          const liveLen = connRef.current.state?.queue.length ?? 0
          const reportLen = Math.max(liveLen, queueLenRef.current + 1)
          showToast({ level: 'info', message: `Added — ${reportLen} in queue`, ttlMs: 2000 })
        }
      } else if (m.error) {
        setAddError(m.error)
      }
    }
    // Replace any prior listener (defensive — there should never be more than one
    // active add at a time on a single PasteTab).
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
    }
    ackListenerRef.current = onMsg
    window.addEventListener('karaoke-msg', onMsg)
  }, [showToast])

  const resolve = () => {
    const m = url.match(VIDEO_ID)
    if (!m) { setErr('Could not find a YouTube video id in that URL.'); return }
    cleanupRef.current?.()
    // Round-3 #2: a new paste invalidates any in-flight add from a previous
    // preview. Tear the per-add ack listener down BEFORE clearing
    // activeAddMsgId so a late-arriving stale ack can't blank the new meta
    // / url / addError state.
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
      ackListenerRef.current = null
    }
    setBusy(true); setErr(null); setMeta(null); setAddError(null); setActiveAddMsgId(null)
    const msgId = randomUUID()
    const onMsg = (e: Event) => {
      const x = (e as CustomEvent<ServerMessage>).detail
      if (x.type === 'meta.result' && x.msgId === msgId) {
        setMeta({ videoId: x.videoId, title: x.title, thumbnail: x.thumbnail, durationSec: x.durationSec })
        setBusy(false); cleanup()
      } else if (x.type === 'state.ack' && x.msgId === msgId && !x.ok) {
        setErr(x.error ?? 'failed'); setBusy(false); cleanup()
      }
    }
    const timer = setTimeout(() => {
      setErr('Timed out waiting for YouTube metadata.'); setBusy(false); cleanup()
    }, RESOLVE_TIMEOUT_MS)
    const cleanup = () => {
      window.removeEventListener('karaoke-msg', onMsg)
      clearTimeout(timer)
      if (cleanupRef.current === cleanup) cleanupRef.current = null
    }
    cleanupRef.current = cleanup
    window.addEventListener('karaoke-msg', onMsg)
    conn.send({ type: 'meta.fetch', msgId, videoId: m[1]! })
  }

  // Pending status for the ADD button is keyed on activeAddMsgId, not on
  // pendingAdds.has(...) for the videoId. This lets the same videoId be
  // re-queued (at a different key) without the button being locked just
  // because a previous-attempt-from-this-tab still happens to be pending.
  const activePending = activeAddMsgId ? pendingAdds.get(activeAddMsgId) ?? null : null
  const classification = activePending
    ? classifyPendingState(activePending, { now: tickNow, currentEpoch, ackedTimeoutMs: ADD_ACK_TIMEOUT_MS })
    : null

  const doAdd = () => {
    if (!meta) return
    const isQueueing = classification === 'queueing'
    if (isQueueing && !addError) return // pending lock during in-flight
    // §4.3 line 329: stale-visual is dismiss-only. Tap is a no-op.
    if (classification === 'stale-visual') return
    // §4.3 bounded-retry-window: on expired-window the user explicitly
    // accepts dup risk; mint a new msgId. On retry (no error yet), reuse the
    // same msgId so server dedup short-circuits if the server already saw it.
    // On `addError` set, the server has CACHED a failed ack for the old msgId,
    // so reusing it would return the same error — mint a fresh msgId.
    const needNewMsgId =
      !activeAddMsgId ||
      classification === 'expired-window' ||
      !!addError
    const msgId = needNewMsgId ? randomUUID() : activeAddMsgId!
    if (needNewMsgId) {
      // §4.3 expired-window / error-cached: minting a fresh msgId — evict the
      // OLD entry from pendingAdds + tear down the old per-msgId listener
      // BEFORE registering the new one. Without this, the tray would briefly
      // render two rows for the same paste, and the stale listener would keep
      // firing on a now-orphaned ack.
      if (activeAddMsgId) {
        dismissPending(activeAddMsgId)
        if (ackListenerRef.current) {
          window.removeEventListener('karaoke-msg', ackListenerRef.current)
          ackListenerRef.current = null
        }
      }
      addPending(msgId, meta.videoId, clampPitch(pitch), currentEpoch, meta.title)
      setActiveAddMsgId(msgId)
      addAckListener(msgId)
    }
    setAddError(null)
    conn.send({ type: 'queue.add', msgId, videoId: meta.videoId, prePitch: clampPitch(pitch) })
    try { localStorage.setItem('karaoke.lastAddSentAt', String(Date.now())) } catch {}
  }

  const cancelPending = () => {
    if (!activeAddMsgId) return
    dismissPending(activeAddMsgId)
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
      ackListenerRef.current = null
    }
    setActiveAddMsgId(null)
    setAddError(null)
  }

  // §4.3 line 329: stale-visual allows ONLY dismiss — ADD is locked.
  const lockAdd = (classification === 'queueing' && !addError) || classification === 'stale-visual'

  // After ack.ok=false, the provider clears pendingAdds before this re-renders,
  // so `activePending` is null even though `activeAddMsgId` and `addError` are
  // still set. The error branch leads with "tap to retry" so the retry path is
  // still discoverable.
  const addLabel =
    addError ? 'tap to retry'
    : !activePending ? 'ADD'
    : classification === 'retry' ? 'tap to retry'
    : classification === 'expired-window' ? 'start new add anyway'
    : classification === 'stale-visual' ? 'expired'
    : 'queueing…'

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="paste-tab__action-row" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          className="paste-tab__textarea hit-target"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          aria-label="YouTube URL"
          rows={compact ? 2 : 3}
          // Round-3 #3: min-height is in riso.css (.paste-tab__textarea) so
          // the compact-landscape media-query override can win. An inline
          // `minHeight: 48` would beat any stylesheet rule by specificity.
          style={{ width: '100%', padding: 10, fontFamily: 'var(--mono-font)', fontSize: 16, background: 'var(--paper-cream)', color: 'var(--ink-black)' }}
        />
        <button
          type="button"
          data-keyboard-primary-action="resolve"
          onClick={resolve}
          disabled={busy || !url.trim()}
          aria-disabled={busy || !url.trim() || undefined}
          className="hit-target uc"
          style={{ padding: '10px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 12 }}
        >
          {busy ? 'Resolving…' : 'RESOLVE'}
        </button>
      </div>
      {err && <div className="uc" style={{ fontSize: 12, color: 'var(--riso-pink)' }}>▌ {err}</div>}
      {meta && (
        <div className="paper-card paper-grain paper-card--accent">
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 16 }}>{meta.title}</div>
          <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            {Math.floor(meta.durationSec / 60)}:{String(meta.durationSec % 60).padStart(2, '0')}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>KEY</span>
              <KeyStepper value={pitch} onChange={setPitch} disabled={lockAdd} />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                data-keyboard-primary-action="add"
                onClick={doAdd}
                disabled={lockAdd}
                aria-disabled={lockAdd || undefined}
                className="hit-target uc"
                style={{
                  padding: '10px 16px',
                  background: classification === 'queueing' && !addError ? 'var(--ink-muted)' : 'var(--hanko-red)',
                  color: 'var(--paper-cream)', fontSize: 12,
                }}
              >
                {addLabel}
              </button>
              {(activePending || addError) && (
                <button
                  type="button"
                  onClick={cancelPending}
                  aria-label={classification === 'stale-visual' ? 'Dismiss pending add' : 'Cancel pending add'}
                  className="hit-target uc"
                  style={{ background: 'transparent', color: 'var(--riso-pink)', fontSize: 12 }}
                >×</button>
              )}
            </div>
          </div>
          {addError && (
            <div className="uc" style={{ marginTop: 6, fontSize: 12, color: 'var(--riso-pink)' }}>▌ {addError}</div>
          )}
          {classification === 'stale-visual' && !addError && (
            <div className="uc" style={{ marginTop: 6, fontSize: 12, color: 'var(--riso-pink)' }}>
              ▌ expired (server may have applied this)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
