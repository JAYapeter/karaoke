'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useRef, useState } from 'react'
import { buildAudioGraph, buildAudioGraphNoPitch, type AudioGraph } from '@/lib/client/audio-graph'
import { setAudioGraph } from '@/lib/client/audio-graph-ref'
import type { Connection } from '@/lib/client/ws'
import { POSITION_HEARTBEAT_MS } from '@/lib/config'
import { NowPlayingStrip } from './NowPlayingStrip'

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
        connRef.current.send({ type: 'source.ready', msgId: randomUUID() })
        if (bypassed) {
          connRef.current.send({
            type: 'player.error', epoch: 0, itemId: '',
            message: 'Pitch shift unavailable — playing original key',
          } as any)
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

  return (
    <div
      className="source-video-frame"
      style={{
        position: 'relative', aspectRatio: '16 / 9', width: '100%', maxHeight: '100%',
        background: 'var(--ink-deep)', border: '1.5px solid var(--cigarette)', overflow: 'hidden',
      }}
    >
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {isPlaying && (
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
            ▌ LIVE 出演中
          </div>
          <NowPlayingStrip conn={conn} player={player} />
        </>
      )}
    </div>
  )
}
