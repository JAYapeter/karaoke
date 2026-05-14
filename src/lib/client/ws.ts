'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ClientMessage, ServerMessage } from '@/lib/types/protocol'
import type { ServerState } from '@/lib/types/state'

const SESSION_KEY = 'karaoke.sessionId'
const NAME_KEY = 'karaoke.name'

export const getSessionId = () => {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export const getStoredName = () =>
  typeof window === 'undefined' ? '' : localStorage.getItem(NAME_KEY) ?? ''
export const setStoredName = (name: string) => localStorage.setItem(NAME_KEY, name)

export type Connection = {
  state: ServerState | null
  send: (msg: ClientMessage) => void
  ready: boolean
  ack: (msgId: string) => Promise<{ ok: boolean; error?: string }>
}

export const useConnection = (opts: {
  name: string
  onMessage?: (msg: ServerMessage) => void
}): Connection => {
  const [state, setState] = useState<ServerState | null>(null)
  const [ready, setReady] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const ackResolversRef = useRef<Map<string, (v: { ok: boolean; error?: string }) => void>>(new Map())
  // Track outstanding per-ack timers so they can be cleared on unmount AND
  // cleared from the map when each ack resolves naturally.
  const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const onMessage = opts.onMessage
  const sessionId = useMemo(() => getSessionId(), [])

  useEffect(() => {
    let alive = true
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws?sessionId=${sessionId}`)
      wsRef.current = ws
      ws.addEventListener('open', () => {
        attempt = 0
        setReady(true)
        ws.send(JSON.stringify({
          type: 'join',
          msgId: randomUUID(),
          sessionId,
          name: opts.name,
        } satisfies ClientMessage))
      })
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data) as ServerMessage
        if (msg.type === 'state.full') setState(msg.state)
        else if (msg.type === 'state.queue' || msg.type === 'state.player') {
          setState((s) => s && applyDelta(s, msg))
        }
        else if (msg.type === 'state.ack') {
          const r = ackResolversRef.current.get(msg.msgId)
          if (r) {
            r({ ok: msg.ok, ...(msg.error ? { error: msg.error } : {}) })
            ackResolversRef.current.delete(msg.msgId)
            const t = ackTimersRef.current.get(msg.msgId)
            if (t) { clearTimeout(t); ackTimersRef.current.delete(msg.msgId) }
          }
        }
        onMessage?.(msg)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('karaoke-msg', { detail: msg }))
        }
      })
      ws.addEventListener('close', () => {
        setReady(false)
        if (!alive) return
        const delay = Math.min(2000 + attempt * 500, 8000)
        attempt++
        reconnectTimer = setTimeout(connect, delay)
      })
    }
    connect()

    return () => {
      alive = false
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      // Clear every outstanding ack timeout. Snapshot first so the iteration
      // isn't disturbed by concurrent resolves (though unmount usually races
      // alone — defensive nonetheless).
      const timers = [...ackTimersRef.current.values()]
      ackTimersRef.current.clear()
      ackResolversRef.current.clear()
      for (const t of timers) clearTimeout(t)
      wsRef.current?.close()
    }
  }, [opts.name, sessionId, onMessage])

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  const ack = useCallback((msgId: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      ackResolversRef.current.set(msgId, resolve)
      const timer = setTimeout(() => {
        ackTimersRef.current.delete(msgId)
        if (ackResolversRef.current.has(msgId)) {
          ackResolversRef.current.delete(msgId)
          resolve({ ok: false, error: 'timeout' })
        }
      }, 6000)
      ackTimersRef.current.set(msgId, timer)
    }), [])

  return { state, send, ready, ack }
}

const applyDelta = (s: ServerState, msg: ServerMessage): ServerState => {
  if (msg.type === 'state.queue') return { ...s, queue: msg.queue, history: msg.history }
  if (msg.type === 'state.player') return { ...s, player: msg.player }
  return s
}
