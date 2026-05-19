'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useRef, useState } from 'react'
import { buildAudioGraph, buildAudioGraphNoPitch, type AudioGraph } from '@/lib/client/audio-graph'
import { setAudioGraph } from '@/lib/client/audio-graph-ref'
import { createSourceReadyGate, type SourceReadyGate } from '@/lib/client/source-ready-gate'
import type { Connection } from '@/lib/client/ws'
import { POSITION_HEARTBEAT_MS } from '@/lib/config'
import { Tick } from '@/components/shared/Tick'
import { NowPlayingStrip } from './NowPlayingStrip'
import { IdleSplash } from './IdleSplash'
import { SourceOfflineState } from './SourceOfflineState'

export const VideoPlayer = ({ conn }: { conn: Connection }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<AudioGraph | null>(null)
  const lastEpochRef = useRef<number>(-1)
  const [graphReady, setGraphReady] = useState(false)
  const player = conn.state?.player

  // `conn` is a fresh object every render (from useConnection's return) and would re-fire any
  // effect that listed it as a dep. We funnel current state/send through a ref so the
  // mount/heartbeat/ended effects can stay stable.
  const connRef = useRef(conn)
  useEffect(() => { connRef.current = conn })

  // Mount the audio graph exactly once. Strict-mode double-effect handled
  // via the `cancelled` flag: if we tear down before the async build resolves, destroy on arrival.
  // The source.ready handshake is intentionally NOT sent from here — the
  // [conn.ready, graphReady] effect below owns it so we re-send on every
  // WebSocket reconnect (the audio graph survives, but the server clears
  // sourceReady on the old socket's close).
  useEffect(() => {
    let cancelled = false
    if (!mountRef.current) return
    const tryWorklet = async (): Promise<{ g: AudioGraph; bypassed: boolean }> => {
      try {
        return { g: await buildAudioGraph(mountRef.current!), bypassed: false }
      } catch (e) {
        console.warn('Worklet failed, bypassing pitch', e)
        return { g: await buildAudioGraphNoPitch(mountRef.current!), bypassed: true }
      }
    }
    tryWorklet()
      .then(({ g, bypassed }) => {
        if (cancelled) { g.destroy(); return }
        graphRef.current = g
        setAudioGraph(g)
        setGraphReady(true)
        if (bypassed) {
          // CLIENT-LOCAL toast: dispatching `player.error` to the server doesn't
          // work here because epoch=0/itemId='' is rejected by the stale-epoch
          // guard in dispatch.ts before the broadcast fires. The Toaster's
          // `karaoke-msg` listener handles synthetic `toast` ServerMessages.
          window.dispatchEvent(new CustomEvent('karaoke-msg', {
            detail: {
              type: 'toast',
              level: 'warn',
              message: 'Pitch shift unavailable — playing original key',
            },
          }))
        }
      })
      .catch((e) => {
        console.error('Audio graph init failed (no fallback worked)', e)
      })
    return () => {
      cancelled = true
      setAudioGraph(null)
      graphRef.current?.destroy()
      graphRef.current = null
      setGraphReady(false)
    }
  }, [])

  // Re-send `source.ready` on every WebSocket (re)connection.
  //
  // Why this lives in its own effect:
  // - useConnection auto-reconnects after a drop (new TCP socket, fresh join cycle).
  //   The server's close handler clears `sourceReady = false` on the OLD ws, but
  //   the new ws's join only re-sets `sourceConnected = true` — never `sourceReady`.
  //   The audio graph (held in a ref) survives the reconnect, so the mount-once
  //   effect doesn't run again, and without this effect `sourceReady` would
  //   stay `false` forever, stalling auto-advance and leaving all phones on
  //   "▌ source offline — playback paused".
  // - Gate (`createSourceReadyGate`) returns true exactly once per
  //   (connection × graph-ready) pairing and re-arms whenever `conn.ready`
  //   drops. Covers all orderings:
  //     a) graph ready BEFORE ws opens → fires the moment ws opens
  //     b) ws open BEFORE graph ready → fires the moment graph becomes ready
  //     c) ws reconnects mid-session  → fires again on the new connection
  // - Idempotent on the server: replaying `source.ready` on the same socket
  //   just re-sets `sourceReady = true` and re-broadcasts state. See
  //   dispatch.ts:93-103.
  const gateRef = useRef<SourceReadyGate | null>(null)
  if (gateRef.current === null) gateRef.current = createSourceReadyGate()
  useEffect(() => {
    if (gateRef.current!.shouldSend(conn.ready, graphReady)) {
      connRef.current.send({ type: 'source.ready', msgId: randomUUID() })
    }
  }, [conn.ready, graphReady])

  // Sync src and pitch with server-driven player state
  useEffect(() => {
    const g = graphRef.current
    if (!g || !player || !graphReady) return
    if (player.status === 'idle') {
      g.video.pause(); g.video.removeAttribute('src'); g.video.load()
      lastEpochRef.current = player.epoch
      return
    }
    g.setPitch(player.livePitch)
    if (player.epoch !== lastEpochRef.current) {
      lastEpochRef.current = player.epoch
      g.video.src = `/api/stream/${player.item.videoId}?e=${player.epoch}`
      // Project the resume target: server's last positionSec + wall-clock since update.
      const drift = (Date.now() - player.positionUpdatedAt) / 1000
      const target = Math.min(
        Math.max(0, player.positionSec + (player.status === 'playing' ? drift : 0)),
        Math.max(0, player.item.durationSec - 0.5),
      )
      g.video.currentTime = target
      g.video.play().catch((e) => {
        connRef.current.send({ type: 'player.error', epoch: player.epoch, itemId: player.item.id, message: String(e) })
      })
    }
    if (player.status === 'paused') g.video.pause()
    if (player.status === 'playing' && g.video.paused) void g.video.play()
  }, [
    graphReady,
    player?.status,
    (player && 'epoch' in player) ? player.epoch : -1,
    (player && 'livePitch' in player) ? player.livePitch : 0,
  ])

  // Heartbeat — runs once, reads latest conn via ref.
  useEffect(() => {
    const id = setInterval(() => {
      const g = graphRef.current
      const p = connRef.current.state?.player
      if (!g || !p || p.status === 'idle') return
      connRef.current.send({ type: 'player.position', epoch: p.epoch, positionSec: g.video.currentTime })
    }, POSITION_HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [])

  // Ended event — re-attaches once the graph is ready (graph.video exists then).
  useEffect(() => {
    if (!graphReady) return
    const g = graphRef.current
    if (!g) return
    const onEnded = () => {
      const p = connRef.current.state?.player
      if (p && p.status !== 'idle') connRef.current.send({ type: 'player.ended', epoch: p.epoch })
    }
    g.video.addEventListener('ended', onEnded)
    return () => g.video.removeEventListener('ended', onEnded)
  }, [graphReady])

  const isPlaying = player && player.status !== 'idle'
  const queueLen = conn.state?.queue.length ?? 0
  const sourceConnected = conn.state?.sourceConnected ?? false
  const sourceReady = conn.state?.sourceReady ?? false
  // §3.3a: source-offline with queued items renders the dedicated offline panel
  // INSIDE the video frame (replacing the splash). Idle with no queue still
  // shows the regular splash even when offline — there's nothing to be lost.
  const showOfflinePanel = !isPlaying && queueLen > 0 && (!sourceConnected || !sourceReady)
  // §3.3-bis: the transient-recovery "▶ Start next song" button only appears
  // when the source IS ready (otherwise auto-advance can't fire and the button
  // would do nothing on tap).
  const transientWithQueue = queueLen > 0 && sourceConnected && sourceReady

  return (
    <div
      className="source-video-frame"
      style={{
        position: 'relative', aspectRatio: '16 / 9', width: '100%', maxHeight: '100%',
        background: 'var(--ink-deep)', border: '1.5px solid var(--cigarette)', overflow: 'hidden',
      }}
    >
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {isPlaying ? (
        <>
          <div
            className="live-badge uc"
            data-status={player.status}
            style={{
              position: 'absolute', top: 8, left: 8, padding: '2px 6px',
              background: 'rgba(10, 8, 8, 0.7)', color: 'var(--riso-pink)',
              letterSpacing: '0.16em', borderRadius: 2, pointerEvents: 'none',
              // font-size enforced by .live-badge cascade (12 desktop, 13 phones).
            }}
          >
            <Tick />LIVE 出演中
          </div>
          <NowPlayingStrip conn={conn} player={player} />
        </>
      ) : showOfflinePanel ? (
        <SourceOfflineState />
      ) : (
        <IdleSplash conn={conn} transientWithQueue={transientWithQueue} />
      )}
    </div>
  )
}
