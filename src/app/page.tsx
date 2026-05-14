'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { YoureUpView } from '@/components/phone/YoureUpView'
import { Tabs, type Tab } from '@/components/phone/Tabs'
import { OfflineBanner } from '@/components/phone/OfflineBanner'
import { PendingAddsTray } from '@/components/phone/PendingAddsTray'
import { Toaster } from '@/components/shared/Toaster'
import { PendingAddsProvider, usePendingAdds } from '@/lib/client/pending-adds-context'
import { classifyPendingState } from '@/lib/client/pending-adds'
import { useTopOccluderHeight } from '@/lib/client/use-top-occluder-height'
import { randomUUID } from '@/lib/client/uuid'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'
import type { ClientMessage, ServerMessage } from '@/lib/types/protocol'
import type { Connection } from '@/lib/client/ws'
import { useToaster } from '@/components/shared/Toaster'

const MUTATING_PREFIXES = ['queue.', 'player.set']
const MUTATING_EXACT = new Set(['player.skip', 'player.prev', 'player.pause', 'player.play'])

const isMutatingClientMessage = (m: ClientMessage): boolean => {
  if (MUTATING_EXACT.has(m.type)) return true
  return MUTATING_PREFIXES.some((p) => m.type.startsWith(p))
}

// Wrap conn so mutating sends advance the pendingAdds mutation counter.
// `useConnection` returns a fresh object every render; we keep the wrapped
// `send` itself stable across renders by reading the latest `conn` from a
// ref. The returned Connection object is still fresh per render (we expose
// `state` / `ready` / `ack` from the latest conn), but consumers that close
// over `send` get a stable reference, which keeps their useEffect deps
// quiet.
const useTrackedConn = (conn: Connection): Connection => {
  const { incrementMutations } = usePendingAdds()
  const connRef = useRef(conn)
  connRef.current = conn
  const send = useCallback<Connection['send']>((msg) => {
    if (isMutatingClientMessage(msg)) incrementMutations()
    connRef.current.send(msg)
  }, [incrementMutations])
  return { state: conn.state, ready: conn.ready, ack: conn.ack, send }
}

// §5.4 iOS keyboard visibility — hysteresis + visualViewport + focus-correlated
// fallback. On open, scrolls the focused input into view; if the active tab's
// primary action button is still occluded after that scroll, scrolls it too
// (single follow-up — never both at once).
const useKeyboardScrollIntoView = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return

    let keyboardOpen = false
    let trailing: ReturnType<typeof setTimeout> | null = null
    let fallbackRecentFocusAt = 0 // ms timestamp of last focus on form field

    const isFormFocused = () => {
      const a = document.activeElement
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')
    }

    // Best-effort primary-action lookup. Candidate controls tag themselves
    // with `data-keyboard-primary-action="add" | "resolve" | "go"`. Priority
    // is ADD > RESOLVE > GO — an expanded Search row's ADD button beats the
    // GO button above it; a Paste preview's ADD beats RESOLVE. First visible
    // tagged element of the highest-priority kind wins. Returns null if no
    // tagged element is currently visible.
    const PRIORITY: Array<'add' | 'resolve' | 'go'> = ['add', 'resolve', 'go']
    const primaryAction = (): HTMLElement | null => {
      for (const kind of PRIORITY) {
        const els = document.querySelectorAll<HTMLElement>(`[data-keyboard-primary-action="${kind}"]`)
        for (const el of els) {
          if (el.offsetParent === null) continue
          return el
        }
      }
      return null
    }

    const scrollFocused = () => {
      const a = document.activeElement as HTMLElement | null
      if (!a || (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA')) return
      a.scrollIntoView({ block: 'center', behavior: 'auto' })
      // After the input scroll lands, check whether the primary action button
      // is still occluded; if so, do ONE follow-up scrollIntoView for it.
      // Wrapped in rAF so layout settles between the two scrolls (iOS otherwise
      // oscillates on back-to-back visualViewport-triggered scrolls).
      requestAnimationFrame(() => {
        const btn = primaryAction()
        const vvHeight = window.visualViewport?.height ?? window.innerHeight
        if (btn) {
          const r = btn.getBoundingClientRect()
          if (r.bottom > vvHeight) {
            btn.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        }
      })
    }

    const handleVVResize = () => {
      if (trailing) clearTimeout(trailing)
      trailing = setTimeout(() => {
        const vv = window.visualViewport
        if (!vv) return
        const delta = window.innerHeight - vv.height
        const OPEN_THRESHOLD = Math.max(120, window.innerHeight * 0.18)
        const CLOSE_THRESHOLD = Math.max(80, window.innerHeight * 0.10)
        if (!keyboardOpen && delta > OPEN_THRESHOLD && isFormFocused()) {
          keyboardOpen = true
          requestAnimationFrame(scrollFocused)
        } else if (keyboardOpen && (delta < CLOSE_THRESHOLD || !isFormFocused())) {
          keyboardOpen = false
        }
      }, 50)
    }

    // Fallback (no visualViewport): keyboard is "open" iff a focus on a form
    // field is followed by a window resize within 300 ms (per spec). It
    // "closes" on focusout OR on a resize that returns to within 100 px of
    // screen height.
    const handleFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return
      if (window.visualViewport) return // primary path handles it
      fallbackRecentFocusAt = Date.now()
    }
    const handleFocusOut = () => {
      if (window.visualViewport) return
      keyboardOpen = false
    }
    const handleFallbackResize = () => {
      if (window.visualViewport) return
      const sinceFocus = Date.now() - fallbackRecentFocusAt
      if (!keyboardOpen && sinceFocus < 300 && isFormFocused()) {
        keyboardOpen = true
        requestAnimationFrame(scrollFocused)
      } else if (keyboardOpen) {
        const heightDelta = Math.abs(screen.height - window.innerHeight)
        if (heightDelta < 100 || !isFormFocused()) keyboardOpen = false
      }
    }

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', handleVVResize)
    } else {
      window.addEventListener('resize', handleFallbackResize)
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      if (trailing) clearTimeout(trailing)
      if (vv) vv.removeEventListener('resize', handleVVResize)
      else window.removeEventListener('resize', handleFallbackResize)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])
}

export default function Phone() {
  return (
    <Toaster>
      <PendingAddsProvider>
        <PhoneApp />
      </PendingAddsProvider>
    </Toaster>
  )
}

const PhoneApp = () => {
  const [name, setName] = useState<string>('')
  const [tab, setTab] = useState<Tab>('queue')
  const sessionId = typeof window === 'undefined' ? '' : getSessionId()

  useEffect(() => { setName(getStoredName()) }, [])

  const baseConn = useConnection({ name })
  const conn = useTrackedConn(baseConn)

  const tabsRef = useRef<HTMLElement | null>(null)
  const offlineBannerRef = useRef<HTMLDivElement | null>(null)
  const trayRef = useRef<HTMLDivElement | null>(null)

  const state = conn.state
  const sourceConnected = state?.sourceConnected ?? false
  const sourceReady = state?.sourceReady ?? false
  const offline = !sourceConnected || !sourceReady

  const player = state?.player
  const isOwnTurn =
    player && player.status !== 'idle' && player.item.queuedBy.sessionId === sessionId
  const showTakeoverInQueueTab = isOwnTurn && tab === 'queue'

  const { pendingAdds, add: addPending, dismiss: dismissPending } = usePendingAdds()
  const { showToast } = useToaster()
  const currentEpoch = player && 'epoch' in player ? player.epoch : 0

  // Keep the latest conn in a ref so the one-shot tray-retry ack listener can
  // read freshest queue length without closing over a stale conn snapshot.
  const connRef = useRef(conn)
  connRef.current = conn

  // Mount-version: bumps whenever any conditionally-mounted occluder flips
  // visibility (offline banner — gated by showOfflineBanner — or pending
  // tray). Drives the occluder-height hook to re-observe.
  const mountVersion = ((offline && !showTakeoverInQueueTab) ? 1 : 0) + (pendingAdds.size > 0 ? 2 : 0)
  const refs = useMemo(() => [tabsRef, offlineBannerRef, trayRef], [])
  useTopOccluderHeight(refs, mountVersion)

  // §5.4 keyboard-visibility scroll.
  useKeyboardScrollIntoView()

  // Stable callback so child memoization doesn't break.
  const onAddedSwitchToQueue = useCallback(() => setTab('queue'), [])

  const queueLen = state?.queue.length ?? 0
  const takeoverMountedAttr = showTakeoverInQueueTab ? '1' : '0'
  // §3.3a banner-vs-takeover precedence: when the takeover is mounted, the
  // takeover's own sub-header carries the offline state. Hide the global
  // banner to avoid double-chrome.
  const showOfflineBanner = offline && !showTakeoverInQueueTab

  if (!name) return <NameEntry onSubmit={setName} />

  return (
    <div className="phone-root" data-takeover-mounted={takeoverMountedAttr}>
      <Tabs
        ref={tabsRef}
        name={name}
        activeTab={tab}
        onTabChange={setTab}
        onEditName={() => setName('')}
        queueBadge={queueLen}
      />
      {showOfflineBanner && <OfflineBanner ref={offlineBannerRef} />}
      {pendingAdds.size > 0 && (
        <PendingAddsTray
          ref={trayRef}
          currentEpoch={currentEpoch}
          onRetry={(msgId) => {
            const entry = pendingAdds.get(msgId)
            if (!entry) return
            const cls = classifyPendingState(entry, {
              now: Date.now(),
              currentEpoch,
              ackedTimeoutMs: 6000,
            })
            // §4.3 line 329: stale-visual is dismiss-only — the tray button is
            // disabled at that classification so this code path shouldn't run,
            // but ignore defensively.
            if (cls === 'stale-visual') return
            // §4.3 bounded-retry-window: when the entry crosses the threshold
            // (expired-window), the tray's "start new add anyway" affordance
            // mints a fresh msgId — the user has accepted dup risk.
            if (cls === 'expired-window') {
              // §4.3 expired-window: minting a fresh msgId — evict the OLD
              // pendingAdds entry FIRST. Otherwise the tray renders two rows
              // for the same retry, and any tab-level pendingForRow lookups
              // can still match the stale msgId (insertion-order iteration).
              dismissPending(msgId)
              const newMsgId = randomUUID()
              addPending(newMsgId, entry.videoId, entry.prePitch, currentEpoch, entry.title)
              // §4.3: tray-originated retries have no per-tab UX listener
              // because the originating tab may be unmounted. Register a
              // one-shot listener here so success / failure surfaces a toast.
              const onAck: EventListener = (e) => {
                const m = (e as CustomEvent<ServerMessage>).detail
                if (m.type !== 'state.ack' || m.msgId !== newMsgId) return
                window.removeEventListener('karaoke-msg', onAck)
                if (m.ok) {
                  const liveLen = connRef.current.state?.queue.length
                  const reportLen = typeof liveLen === 'number' ? liveLen : queueLen + 1
                  showToast({ level: 'info', message: `▌ Added — ${reportLen} in queue`, ttlMs: 2000 })
                } else {
                  showToast({ level: 'error', message: `▌ Add failed — ${m.error ?? 'unknown error'}` })
                }
              }
              window.addEventListener('karaoke-msg', onAck)
              conn.send({ type: 'queue.add', msgId: newMsgId, videoId: entry.videoId, prePitch: entry.prePitch })
              return
            }
            // queueing / retry: same-msgId retry (server dedup short-circuits
            // if the original was already processed).
            conn.send({ type: 'queue.add', msgId, videoId: entry.videoId, prePitch: entry.prePitch })
          }}
        />
      )}
      {/* All three tab bodies stay mounted across tab switches; only the
          visible one is unhidden. Without this, switching away from Search/Paste
          mid-flight unmounts the tab and tears down its per-msgId ack listener,
          making the §4.3 off-tab "Added — N in queue" toast impossible.
          The takeover lives INSIDE the queue tab branch per §4.5 ("Queue tab is
          replaced entirely by the takeover; other tabs still navigable"). */}
      <main aria-label={tab === 'queue' ? 'Queue' : tab === 'search' ? 'Search' : 'Paste'}>
        <div hidden={tab !== 'queue'}>
          {showTakeoverInQueueTab ? (
            <YoureUpView
              conn={conn}
              player={player!}
              sourceConnected={sourceConnected}
              sourceReady={sourceReady}
            />
          ) : (
            <QueueView
              conn={conn}
              sessionId={sessionId}
              sourceConnected={sourceConnected}
              sourceReady={sourceReady}
            />
          )}
        </div>
        <div hidden={tab !== 'search'}>
          <SearchTab
            conn={conn}
            currentEpoch={currentEpoch}
            isActive={tab === 'search'}
            queueLen={queueLen}
            onAddedSwitchToQueue={onAddedSwitchToQueue}
          />
        </div>
        <div hidden={tab !== 'paste'}>
          <PasteTab
            conn={conn}
            currentEpoch={currentEpoch}
            isActive={tab === 'paste'}
            queueLen={queueLen}
          />
        </div>
      </main>
    </div>
  )
}
