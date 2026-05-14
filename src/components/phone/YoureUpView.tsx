'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { clampPitch } from './KeyStepper'

const NO_ACK_RETRY_MS = 6000

const fmtMmSs = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

type PendingPitch = {
  value: number
  itemId: string
  epoch: number
  msgId: string | null   // null while we're offline (no send yet)
  timer: ReturnType<typeof setTimeout> | null
}

export type YoureUpViewProps = {
  conn: Connection
  player: Exclude<PlayerState, { status: 'idle' }>
  sourceConnected: boolean
  sourceReady: boolean
}

export const YoureUpView = ({ conn, player, sourceConnected, sourceReady }: YoureUpViewProps) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [pitch, setPitch] = useState(player.livePitch)
  const pendingRef = useRef<PendingPitch | null>(null)
  // Latest server-authoritative livePitch so the ack handler can snap the
  // local readout back if the server rejects our value (§3.3a).
  const serverPitchRef = useRef(player.livePitch)
  serverPitchRef.current = player.livePitch

  const clearPendingTimer = () => {
    const p = pendingRef.current
    if (p && p.timer) { clearTimeout(p.timer); p.timer = null }
  }

  useEffect(() => () => clearPendingTimer(), [])

  // Source-driven live pitch updates sync the readout when we're online and
  // have no in-flight pending — otherwise the user's local edit wins until ack.
  useEffect(() => {
    const p = pendingRef.current
    if (sourceConnected && sourceReady && !p) {
      setPitch(player.livePitch)
    }
  }, [player.livePitch, sourceConnected, sourceReady])

  // Global state.ack listener clears OUR pending entry. (PendingAddsProvider
  // clears its own map for queue.add msgIds; this listener handles the
  // player.setLivePitch msgIds we mint.)
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack') return
      const p = pendingRef.current
      if (!p || p.msgId !== m.msgId) return
      // §3.3a: on ok=true we clear pending and let server-driven livePitch
      // sync the readout. On ok=false we ALSO drop pending silently AND snap
      // the local pitch back to the server's authoritative value — otherwise
      // the readout would keep showing the rejected user-tapped value
      // indefinitely.
      clearPendingTimer()
      pendingRef.current = null
      if (!m.ok) {
        setPitch(serverPitchRef.current)
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [])

  const scheduleNoAckRetry = useCallback((msgId: string, value: number) => {
    const t = setTimeout(() => {
      const p = pendingRef.current
      if (!p || p.msgId !== msgId) return
      // No ack within 6 s → resend with the SAME msgId. Server dedup returns
      // the cached ack if it had already processed the original; otherwise it
      // processes the resend.
      conn.send({ type: 'player.setLivePitch', msgId, semitones: clampPitch(value) })
      p.timer = setTimeout(() => {
        // Bound the retry count to one: if the second send also goes unacked
        // for 6 s, give up. The next user tap will mint a new msgId.
        if (pendingRef.current && pendingRef.current.msgId === msgId) {
          clearPendingTimer()
          pendingRef.current = null
        }
      }, NO_ACK_RETRY_MS)
    }, NO_ACK_RETRY_MS)
    return t
  }, [conn])

  const sendLivePitch = useCallback((value: number, opts?: { reuseMsgId?: string }) => {
    clearPendingTimer()
    const msgId = opts?.reuseMsgId ?? randomUUID()
    pendingRef.current = {
      value,
      itemId: player.item.id,
      epoch: player.epoch,
      msgId,
      timer: scheduleNoAckRetry(msgId, value),
    }
    conn.send({ type: 'player.setLivePitch', msgId, semitones: clampPitch(value) })
  }, [conn, player.item.id, player.epoch, scheduleNoAckRetry])

  // Reconnect replay per §3.3a.
  const wasConnectedRef = useRef(sourceConnected && sourceReady)
  useEffect(() => {
    const nowConnected = sourceConnected && sourceReady
    if (!wasConnectedRef.current && nowConnected) {
      const p = pendingRef.current
      if (p && p.itemId === player.item.id && p.epoch === player.epoch && p.value !== player.livePitch) {
        // Replay with same msgId (or new msgId if rejected once) — server
        // dedup makes this safe.
        sendLivePitch(p.value, p.msgId ? { reuseMsgId: p.msgId } : undefined)
      } else if (p && (p.itemId !== player.item.id || p.epoch !== player.epoch)) {
        // Song changed under us — discard.
        clearPendingTimer()
        pendingRef.current = null
      }
    }
    wasConnectedRef.current = nowConnected
  }, [sourceConnected, sourceReady, player.item.id, player.epoch, player.livePitch, sendLivePitch])

  const onPitchChange = (v: number) => {
    const clamped = clampPitch(v)
    setPitch(clamped)
    if (sourceConnected && sourceReady) {
      sendLivePitch(clamped)
    } else {
      // Hold while offline; replay on reconnect. No msgId yet.
      clearPendingTimer()
      pendingRef.current = {
        value: clamped,
        itemId: player.item.id,
        epoch: player.epoch,
        msgId: null,
        timer: null,
      }
    }
  }

  const offline = !sourceConnected || !sourceReady

  return (
    <section
      className="youre-up"
      data-mounted={mounted ? '1' : '0'}
      aria-label="You're up — pitch control"
    >
      <div
        className="youre-up__sub-header uc"
        style={{
          padding: '8px 16px',
          color: offline ? 'var(--riso-pink)' : 'var(--paper-cream)',
          letterSpacing: '0.2em',
          display: 'flex',
          justifyContent: 'space-between',
          // font-size enforced by .youre-up__sub-header cascade.
        }}
      >
        <span>{offline ? '▌ source offline — reconnecting…' : '▌ YOU’RE UP'}</span>
        <span>{offline ? '' : (player.status === 'paused' ? '▌ PAUSED' : `${fmtMmSs(player.positionSec)} / ${fmtMmSs(player.item.durationSec)}`)}</span>
      </div>
      <div className="youre-up__title-block" style={{ padding: '24px 16px 8px' }}>
        <h1 className="youre-up__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 32, margin: 0, color: 'var(--paper-cream)' }}>
          {player.item.title}
        </h1>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', letterSpacing: '0.15em', marginTop: 4 }}>
          {player.item.queuedBy.name.toUpperCase()} · {fmtMmSs(player.item.durationSec)}
        </div>
      </div>
      <div className="youre-up__controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 'auto', color: 'var(--paper-cream)' }}>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', opacity: 0.8 }}>KEY</div>
        <div className="youre-up__readout" aria-live="polite" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 32, color: 'var(--hanko-red)' }}>
          {pitch >= 0 ? `+${pitch}` : pitch}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="youre-up__btn uc"
            aria-label="Lower pitch by one semitone"
            onClick={() => onPitchChange(pitch - 1)}
            style={{
              minWidth: 56, minHeight: 56, padding: '8px 14px',
              background: 'transparent', color: 'var(--paper-cream)',
              border: '1px solid var(--paper-cream)', fontSize: 24,
            }}
          >−</button>
          <button
            type="button"
            className="youre-up__btn uc"
            aria-label="Raise pitch by one semitone"
            onClick={() => onPitchChange(pitch + 1)}
            style={{
              minWidth: 56, minHeight: 56, padding: '8px 14px',
              background: 'transparent', color: 'var(--paper-cream)',
              border: '1px solid var(--paper-cream)', fontSize: 24,
            }}
          >+</button>
        </div>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', opacity: 0.7, letterSpacing: '0.2em' }}>
          source has override
        </div>
      </div>
    </section>
  )
}
