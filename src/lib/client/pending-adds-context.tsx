'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { ServerMessage } from '@/lib/types/protocol'
import { useToaster } from '@/components/shared/Toaster'
import {
  initialPendingAdds,
  pendingAddsReducer,
  type PendingAddsState,
} from './pending-adds'

type Ctx = {
  pendingAdds: PendingAddsState
  add: (msgId: string, videoId: string, prePitch: number, epoch: number, title?: string) => void
  ack: (msgId: string, ok: boolean, error?: string) => void
  dismiss: (msgId: string) => void
  incrementMutations: () => void
}

const PendingAddsContext = createContext<Ctx | null>(null)

const LAST_ADD_SENT_AT_KEY = 'karaoke.lastAddSentAt'
const RECENT_ADD_WARNING_MS = 10_000

export const PendingAddsProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(pendingAddsReducer, initialPendingAdds)
  // Provider must be mounted INSIDE <Toaster> (see PhoneApp wrap). The Toaster
  // provides the imperative showToast hook directly — calling it avoids the
  // race where a synth-dispatched CustomEvent fires before Toaster's window
  // listener mounts (it does in strict mode's first pass).
  const { showToast } = useToaster()

  // §4.3 "Persistence across reloads + recent-add warning." pendingAdds is
  // in-memory only, so a phone reload drops the map. Mitigation: a single
  // timestamp in localStorage. If a reload lands within 10 s, warn the user
  // a recent add may still be processing.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(LAST_ADD_SENT_AT_KEY)
      if (!raw) return
      const ts = Number(raw)
      if (!isFinite(ts)) return
      const age = Date.now() - ts
      if (age >= 0 && age < RECENT_ADD_WARNING_MS) {
        showToast({
          level: 'warn',
          message: 'A recent add may still be processing — wait a moment before retrying',
        })
      }
    } catch {
      // localStorage unavailable; silently skip.
    }
  }, [showToast])
  const add = useCallback((msgId: string, videoId: string, prePitch: number, epoch: number, title?: string) =>
    dispatch({ type: 'add', msgId, videoId, title, prePitch, sentAt: Date.now(), epoch }), [])
  const ack = useCallback((msgId: string, ok: boolean, error?: string) =>
    dispatch({ type: 'ack', msgId, ok, error }), [])
  const dismiss = useCallback((msgId: string) => dispatch({ type: 'dismiss', msgId }), [])
  const incrementMutations = useCallback(() => dispatch({ type: 'incrementMutations' }), [])

  // Global ack listener — owns the "did the server respond to my queue.add"
  // contract regardless of which tab the user is on. §4.3: the pendingAdds
  // map survives tab switches; the ack-handler that clears entries MUST also
  // be tab-agnostic, otherwise unmounting a tab mid-flight orphans the entry.
  // We dispatch only — the reducer is a no-op for unknown msgIds, so this
  // listener is safe to run even when this provider's pendingAdds is empty.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'state.ack') {
        dispatch({ type: 'ack', msgId: m.msgId, ok: m.ok, error: m.error })
        // §4.3 recent-add warning hygiene: once the server has acknowledged
        // success, the warning is misleading (a fast reload would still see
        // it within 10 s otherwise). Clear the timestamp on success so the
        // post-reload toast only fires when an add really is mid-flight.
        if (m.ok) {
          try { localStorage.removeItem(LAST_ADD_SENT_AT_KEY) } catch {}
        }
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [])

  const value = useMemo<Ctx>(
    () => ({ pendingAdds: state, add, ack, dismiss, incrementMutations }),
    [state, add, ack, dismiss, incrementMutations],
  )
  return <PendingAddsContext.Provider value={value}>{children}</PendingAddsContext.Provider>
}

export const usePendingAdds = (): Ctx => {
  const v = useContext(PendingAddsContext)
  if (!v) throw new Error('usePendingAdds must be used inside <PendingAddsProvider>')
  return v
}
