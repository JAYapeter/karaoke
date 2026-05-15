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
}

export const useConnection = (opts: {
  name: string
  onMessage?: (msg: ServerMessage) => void
}): Connection => {
  const [state, setState] = useState<ServerState | null>(null)
  const [ready, setReady] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
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
      // Round-1 #12: reconnect-timer cleanup. Without this, an unmount during
      // the backoff delay would still trigger a (now-orphaned) reconnect.
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      wsRef.current?.close()
    }
  }, [opts.name, sessionId, onMessage])

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  return { state, send, ready }
}

const applyDelta = (s: ServerState, msg: ServerMessage): ServerState => {
  if (msg.type === 'state.queue') return { ...s, queue: msg.queue, history: msg.history }
  if (msg.type === 'state.player') return { ...s, player: msg.player }
  return s
}
