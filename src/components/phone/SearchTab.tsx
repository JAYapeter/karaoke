'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { SearchResult } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'
import { usePendingAdds } from '@/lib/client/pending-adds-context'
import { classifyPendingState, type PendingAdd } from '@/lib/client/pending-adds'
import { useToaster } from '@/components/shared/Toaster'
import { MarqueeText } from '@/components/shared/MarqueeText'
import { Tick } from '@/components/shared/Tick'

const SEARCH_TIMEOUT_MS = 8000
const ADD_ACK_TIMEOUT_MS = 6000

// Live-tick the "queueing → tap to retry → start new add anyway → expired"
// classification so per-row labels and lock states update in real time.
const usePendingTick = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

export type SearchTabProps = {
  conn: Connection
  currentEpoch: number
  isActive: boolean                // true iff the parent's activeTab is "search"
  queueLen: number
  onAddedSwitchToQueue: () => void
}

// Row identity = (videoId, index-in-results-list). Lets duplicate videoIds in
// the same result set behave as independent rows per §4.3 "two distinct rows
// for the same videoId" rule.
const rowKey = (videoId: string, idx: number) => `${videoId}:${idx}`

export const SearchTab = ({ conn, currentEpoch, isActive, queueLen, onAddedSwitchToQueue }: SearchTabProps) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeSearchMsgId, setActiveSearchMsgId] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [pitch, setPitch] = useState(0)
  const [errorByMsg, setErrorByMsg] = useState<Record<string, string>>({})
  // Track which row originated each pending op, so off-tab acks know whether
  // the originator is still around. Map<msgId, rowKey>.
  const originatorRef = useRef<Map<string, string>>(new Map())
  // Outstanding per-msgId window listeners so we can clean them up on unmount.
  // Map<msgId, EventListener>.
  const ackListenersRef = useRef<Map<string, EventListener>>(new Map())
  const searchCleanupRef = useRef<(() => void) | null>(null)
  const { pendingAdds, add: addPending, dismiss: dismissPending } = usePendingAdds()
  const { showToast } = useToaster()
  const now = usePendingTick(pendingAdds.size > 0)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const connRef = useRef(conn)
  connRef.current = conn
  const expandedKeyRef = useRef(expandedKey)
  expandedKeyRef.current = expandedKey
  const queueLenRef = useRef(queueLen)
  queueLenRef.current = queueLen

  // Cleanup any in-flight search AND any outstanding per-msgId ack listeners on unmount.
  useEffect(() => () => {
    searchCleanupRef.current?.()
    for (const [, fn] of ackListenersRef.current) {
      window.removeEventListener('karaoke-msg', fn)
    }
    ackListenersRef.current.clear()
  }, [])

  // §4.3 canonical collapse contract: "Switching tabs collapses any expanded
  // row." Tabs are now kept mounted (PhoneRoot uses `hidden` instead of
  // unmounting), so this component watches its own `isActive` prop and
  // collapses on each transition to inactive.
  useEffect(() => {
    if (!isActive) {
      setExpandedKey(null)
      setPitch(0)
    }
  }, [isActive])

  // Per-add success/failure side effects. The provider's global ack listener
  // already dispatches into pendingAdds; this listener is purely UX (switch
  // tab / show toast / surface inline error). Listening BY msgId restricts
  // each add to its own observer so we don't react to other tabs' adds. The
  // listener is registered in a Map so unmount can remove every outstanding
  // one — otherwise a tab switch mid-flight leaks listeners.
  const addAckListener = useCallback((msgId: string, rk: string) => {
    const onMsg: EventListener = (e) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack' || m.msgId !== msgId) return
      window.removeEventListener('karaoke-msg', onMsg)
      ackListenersRef.current.delete(msgId)
      // Only drop the originator mapping on success — on failure we keep it
      // so the row can still look up its error after the provider clears the
      // pendingAdds entry. The mapping is cleared later by retry, dismiss, or
      // a successful re-add.
      if (m.ok) originatorRef.current.delete(msgId)
      if (m.ok) {
        if (isActiveRef.current && expandedKeyRef.current === rk) {
          setResults([])
          setQ('')
          setExpandedKey(null)
          onAddedSwitchToQueue()
        } else {
          // Use the freshest queue length from conn.state — the server's
          // state.queue broadcast for this add typically lands before (or in
          // the same dispatch as) the state.ack, so the count is already
          // ticked. Take the max with the local snapshot+1 so a stale
          // state.queue (broadcast hasn't landed yet) never reports a count
          // that goes "backwards" — only ever forward.
          const liveLen = connRef.current.state?.queue.length ?? 0
          const reportLen = Math.max(liveLen, queueLenRef.current + 1)
          showToast({ level: 'info', message: `Added — ${reportLen} in queue`, ttlMs: 2000 })
        }
      } else {
        if (m.error) setErrorByMsg((prev) => ({ ...prev, [msgId]: m.error! }))
      }
    }
    ackListenersRef.current.set(msgId, onMsg)
    window.addEventListener('karaoke-msg', onMsg)
  }, [onAddedSwitchToQueue, showToast])

  const doSearch = useCallback(() => {
    if (!q.trim()) return
    if (activeSearchMsgId !== null) return // §4.3 submit lock
    searchCleanupRef.current?.()
    const msgId = randomUUID()
    setActiveSearchMsgId(msgId)
    const onMsg = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'search.results' && m.msgId === msgId) {
        setResults(m.results)
        setActiveSearchMsgId(null)
        cleanup()
      }
    }
    const timer = setTimeout(() => {
      setActiveSearchMsgId(null)
      cleanup()
    }, SEARCH_TIMEOUT_MS)
    const cleanup = () => {
      window.removeEventListener('karaoke-msg', onMsg)
      clearTimeout(timer)
      if (searchCleanupRef.current === cleanup) searchCleanupRef.current = null
    }
    searchCleanupRef.current = cleanup
    window.addEventListener('karaoke-msg', onMsg)
    setResults([])
    setExpandedKey(null)
    conn.send({ type: 'search', msgId, query: q.trim() })
  }, [conn, q, activeSearchMsgId])

  const cancelSearch = useCallback(() => {
    searchCleanupRef.current?.()
    setActiveSearchMsgId(null)
  }, [])

  const onQueryChange = (v: string) => {
    setQ(v)
    setExpandedKey(null) // §4.3: every keystroke collapses any expanded row
  }

  const toggle = (rk: string) => {
    setExpandedKey((cur) => (cur === rk ? null : rk))
    setPitch(0)
  }

  // Look up the pending op originated FROM this specific row (not just any op
  // for the same videoId — that would cross-couple duplicate-result rows).
  const pendingForRow = (rk: string) => {
    for (const [msgId, originKey] of originatorRef.current.entries()) {
      if (originKey !== rk) continue
      const entry = pendingAdds.get(msgId)
      if (entry) return entry
    }
    return null
  }

  // Find the most recent msgId this row originated, regardless of whether the
  // pendingAdds entry still exists. Used to surface inline errors AFTER the
  // provider clears the entry on ack.ok=false (which happens before the row
  // re-renders, so a pending-only lookup would lose the error).
  const lastMsgIdForRow = (rk: string): string | null => {
    let last: string | null = null
    for (const [msgId, originKey] of originatorRef.current.entries()) {
      if (originKey === rk) last = msgId
    }
    return last
  }

  const doAdd = (r: SearchResult, rk: string) => {
    // Sweep any stale originator entries for this row (kept past ack.ok=false
    // so the inline error could render) — once the user taps retry, those
    // post-failure mappings are no longer relevant.
    const existing = pendingForRow(rk)
    if (!existing) {
      // Drop any stale originator + error entries for this row (kept past
      // ack.ok=false so the inline error could render). Once the user taps
      // retry, those post-failure mappings are no longer relevant.
      const staleIds: string[] = []
      for (const [msgId, originKey] of originatorRef.current.entries()) {
        if (originKey === rk) staleIds.push(msgId)
      }
      for (const id of staleIds) originatorRef.current.delete(id)
      if (staleIds.length > 0) {
        setErrorByMsg((prev) => {
          const next = { ...prev }
          for (const id of staleIds) delete next[id]
          return next
        })
      }
    }
    // §4.3 bounded-retry-window:
    //   - queueing/retry: reuse existing msgId (server dedup short-circuits).
    //   - expired-window: mint a NEW msgId — user accepted dup risk via the
    //     "start new add anyway" affordance.
    //   - stale-visual: per spec line 329, "Tapping dismiss removes the entry
    //     from the map; NOTHING ELSE does at this stage." → tap is a no-op.
    let msgId: string
    if (existing) {
      const cls = classifyPendingState(existing, { now, currentEpoch, ackedTimeoutMs: ADD_ACK_TIMEOUT_MS })
      if (cls === 'stale-visual') {
        return // 5+ min stale — only dismiss is allowed, no retry.
      }
      if (cls === 'expired-window') {
        // §4.3 expired-window: the user accepted dup risk and we're minting a
        // fresh msgId. The OLD entry must be evicted FIRST — otherwise the
        // tray shows two rows, pendingForRow() can still match the stale
        // mapping (iteration order is insertion order), and the old per-msgId
        // listener keeps firing on a now-orphaned ack. Tear down old listener
        // + originator mapping + pendingAdds entry BEFORE registering the new.
        const oldListener = ackListenersRef.current.get(existing.msgId)
        if (oldListener) {
          window.removeEventListener('karaoke-msg', oldListener)
          ackListenersRef.current.delete(existing.msgId)
        }
        originatorRef.current.delete(existing.msgId)
        dismissPending(existing.msgId)
        msgId = randomUUID()
        addPending(msgId, r.videoId, clampPitch(pitch), currentEpoch, r.title)
        originatorRef.current.set(msgId, rk)
        addAckListener(msgId, rk)
      } else {
        msgId = existing.msgId
      }
    } else {
      msgId = randomUUID()
      addPending(msgId, r.videoId, clampPitch(pitch), currentEpoch, r.title)
      originatorRef.current.set(msgId, rk)
      addAckListener(msgId, rk)
    }
    setErrorByMsg((prev) => { const { [msgId]: _, ...rest } = prev; return rest })
    conn.send({ type: 'queue.add', msgId, videoId: r.videoId, prePitch: clampPitch(pitch) })
    // §4.3 lastAddSentAt: record so a phone reload within 10s warns the user
    // a recent add may still be processing.
    try { localStorage.setItem('karaoke.lastAddSentAt', String(Date.now())) } catch {}
  }

  const cancelPending = (msgId: string) => {
    dismissPending(msgId)
    originatorRef.current.delete(msgId)
    const listener = ackListenersRef.current.get(msgId)
    if (listener) {
      window.removeEventListener('karaoke-msg', listener)
      ackListenersRef.current.delete(msgId)
    }
    setErrorByMsg((prev) => { const { [msgId]: _, ...rest } = prev; return rest })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="search-tab__query-row" style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // §4.3 submit lock: no-op on Enter while a search is in flight.
              if (activeSearchMsgId === null) doSearch()
            }
          }}
          inputMode="search"
          enterKeyHint="search"
          placeholder="bohemian rhapsody karaoke"
          aria-label="Search YouTube"
          style={{
            flex: '1 1 auto', minWidth: 0, padding: '10px 12px',
            fontFamily: 'var(--mono-font)', fontSize: 16,
            background: 'var(--paper-cream)', color: 'var(--ink-black)',
          }}
        />
        <button
          type="button"
          // btn-disable-dim ONLY in the inert empty-query state. While a
          // search is in flight the label is "…" (status) — dimming that to
          // .45 would crush it like the ADD-button bug. So drop the class
          // when activeSearchMsgId is set.
          className={`hit-target uc${activeSearchMsgId === null ? ' btn-disable-dim' : ''}`}
          data-keyboard-primary-action="go"
          onClick={doSearch}
          disabled={activeSearchMsgId !== null || !q.trim()}
          aria-disabled={activeSearchMsgId !== null || !q.trim() || undefined}
          style={{ padding: '10px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 12 }}
        >
          {activeSearchMsgId !== null ? '…' : 'GO'}
        </button>
        {activeSearchMsgId !== null && (
          <button
            type="button"
            className="hit-target uc"
            onClick={cancelSearch}
            aria-label="Cancel current search"
            style={{ padding: '10px 12px', background: 'transparent', color: 'var(--paper-cream)', border: '1px solid var(--paper-cream)', fontSize: 12 }}
          >× cancel</button>
        )}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((r, idx) => {
          const rk = rowKey(r.videoId, idx)
          const isExpanded = expandedKey === rk
          const bodyId = `search-row-${rk}-body`
          const pending = pendingForRow(rk)
          // Look up error via the lastMsgId originator — survives the provider
          // clearing the pendingAdds entry on ack.ok=false (the entry is gone
          // by the time React re-renders, but the error must still surface).
          const lastMsgId = lastMsgIdForRow(rk)
          const rowError = lastMsgId ? errorByMsg[lastMsgId] : undefined
          const cls = pending
            ? classifyPendingState(pending, { now, currentEpoch, ackedTimeoutMs: ADD_ACK_TIMEOUT_MS })
            : null
          // exactOptionalPropertyTypes: only spread optional props when
          // defined — passing `undefined` violates the strict optional rule.
          // onCancelPending also wired when there's a post-failure error but
          // no pending entry, so the user can dismiss the error.
          const cancelTarget = pending ? pending.msgId : (rowError !== undefined ? lastMsgId : null)
          const rowExtras: Pick<SearchRowProps, 'error' | 'onCancelPending'> = {
            ...(rowError !== undefined ? { error: rowError } : {}),
            ...(cancelTarget ? { onCancelPending: () => cancelPending(cancelTarget) } : {}),
          }
          return (
            <SearchRow
              key={rk}
              result={r}
              isExpanded={isExpanded}
              bodyId={bodyId}
              onToggle={() => toggle(rk)}
              pitch={isExpanded ? pitch : 0}
              setPitch={setPitch}
              onAdd={() => doAdd(r, rk)}
              pending={pending}
              classification={cls}
              {...rowExtras}
            />
          )
        })}
      </ul>
    </div>
  )
}

type SearchRowProps = {
  result: SearchResult
  isExpanded: boolean
  bodyId: string
  onToggle: () => void
  pitch: number
  setPitch: (n: number) => void
  onAdd: () => void
  pending: PendingAdd | null
  classification: 'queueing' | 'retry' | 'expired-window' | 'stale-visual' | null
  error?: string
  onCancelPending?: () => void
}

const SearchRow = ({ result, isExpanded, bodyId, onToggle, pitch, setPitch, onAdd, pending, classification, error, onCancelPending }: SearchRowProps) => {
  const isPending = !!pending
  // §4.3 lock matrix:
  //   - queueing (no error): ADD + stepper LOCKED until ack / timeout.
  //   - retry / expired-window / on inline error: ADD must be tappable.
  //   - stale-visual (5+ min, spec line 329): dismiss-only; ADD LOCKED.
  // The row's expand toggle locks only during queueing so the row layout
  // doesn't shift mid-flight.
  const isQueueing = classification === 'queueing'
  const lockToggle = isQueueing
  const lockAdd = (isQueueing && !error) || classification === 'stale-visual'
  // Error is sticky after the provider clears pendingAdds on ack.ok=false:
  // when `error` is set but `pending` is null, still show "tap to retry" so
  // the user can re-attempt without inspecting an inconsistent "ADD" label.
  const addLabel =
    error ? 'tap to retry'
    : !isPending ? 'ADD'
    : classification === 'retry' ? 'tap to retry'
    : classification === 'expired-window' ? 'start new add anyway'
    : classification === 'stale-visual' ? 'expired'
    : 'queueing…'

  // §5.5 search-row expand/collapse — measure the body's natural height so the
  // max-height transition lands on a real value. If measurement is 0 (body not
  // yet rendered, fonts swapping, etc.), set data-no-measure so the CSS falls
  // back to an instant `max-height: none` and skips the animation rather than
  // clipping or flashing.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyHeight, setBodyHeight] = useState<number>(0)
  useEffect(() => {
    if (!isExpanded) return
    const measure = () => {
      const el = bodyRef.current
      if (!el) return
      // scrollHeight reflects the body's natural height including padding.
      setBodyHeight(el.scrollHeight)
    }
    measure()
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {})
    }
    if (!bodyRef.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [isExpanded])

  const noMeasure = bodyHeight === 0
  const rowStyle = bodyHeight > 0
    ? ({ ['--row-content-h' as any]: `${bodyHeight}px` })
    : undefined

  return (
    <li
      className={`search-row paper-card paper-grain ${isExpanded ? 'paper-card--accent' : ''}`}
      data-expanded={isExpanded ? '1' : '0'}
      data-no-measure={noMeasure ? '1' : '0'}
      style={rowStyle}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={lockToggle}
        aria-disabled={lockToggle || undefined}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 10px', background: 'transparent', color: 'inherit',
          border: 'none', textAlign: 'left',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {/* H1: full title scrolls into view — near-duplicate karaoke
              uploads differ only past where a single line would clip. */}
          <MarqueeText text={result.title} className="search-row__title-text" />
          <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            {result.channel} · {Math.floor(result.durationSec / 60)}:{String(result.durationSec % 60).padStart(2, '0')}
          </div>
        </div>
        <span aria-hidden style={{ color: isExpanded ? 'var(--hanko-red)' : 'var(--ink-muted)' }}>
          {isExpanded ? '▴' : '▾'}
        </span>
      </button>
      <div ref={bodyRef} id={bodyId} className="search-row__body" hidden={!isExpanded}>
        <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>KEY</span>
            <KeyStepper value={pitch} onChange={setPitch} disabled={lockAdd} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              data-keyboard-primary-action={isExpanded ? 'add' : undefined}
              onClick={onAdd}
              disabled={lockAdd}
              aria-disabled={lockAdd || undefined}
              // No `.btn-disable-dim`: ADD is only ever disabled while
              // showing status ("queueing…" on --ink-muted, or "expired" on
              // --hanko-red). Opacity .45 would crush that essential label to
              // ~2.1:1. The bg-color + label change already signal the locked
              // state (the original hardened design) — dimming is both
              // redundant and a contrast regression here.
              className="hit-target uc"
              style={{
                padding: '10px 16px',
                background: isPending && !error && classification === 'queueing' ? 'var(--ink-muted)' : 'var(--hanko-red)',
                color: 'var(--paper-cream)', fontSize: 12,
              }}
            >
              {addLabel}
            </button>
            {onCancelPending && (isPending || error) && (
              <button
                type="button"
                onClick={onCancelPending}
                aria-label={classification === 'stale-visual' ? `Dismiss pending add for ${result.title}` : `Cancel pending add for ${result.title}`}
                className="hit-target uc"
                style={{ background: 'transparent', color: 'var(--ink-muted)', fontSize: 12 }}
              >×</button>
            )}
          </div>
        </div>
        {error && (
          <div className="uc" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--hanko-red)' }}><Tick />{error}</div>
        )}
        {classification === 'stale-visual' && !error && (
          <div className="uc" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--hanko-red)' }}>
            <Tick />expired (server may have applied this)
          </div>
        )}
      </div>
    </li>
  )
}
