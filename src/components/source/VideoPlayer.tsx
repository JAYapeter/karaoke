'use client'
import { useEffect, useRef, useState } from 'react'
import { buildAudioGraph, type AudioGraph } from '@/lib/client/audio-graph'
import { setAudioGraph } from '@/lib/client/audio-graph-ref'
import type { Connection } from '@/lib/client/ws'
import { POSITION_HEARTBEAT_MS } from '@/lib/config'

export const VideoPlayer = ({ conn, sourceToken }: { conn: Connection; sourceToken: string }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<AudioGraph | null>(null)
  const lastEpochRef = useRef<number>(-1)
  const [graphReady, setGraphReady] = useState(false)
  const player = conn.state?.player

  // Mount audio graph once. Only after it's ready do we tell the server we're ready.
  useEffect(() => {
    let cancelled = false
    if (!mountRef.current) return
    buildAudioGraph(mountRef.current)
      .then((g) => {
        if (cancelled) { g.destroy(); return }
        graphRef.current = g
        setAudioGraph(g)
        setGraphReady(true)
        // Now safe to announce readiness — server can auto-advance.
        conn.send({ type: 'source.ready', msgId: crypto.randomUUID(), sourceToken })
      })
      .catch((e) => {
        console.error('Audio graph failed', e)
        if (graphRef.current === null) setGraphReady(false)
      })
    return () => {
      cancelled = true
      setAudioGraph(null)
      graphRef.current?.destroy()
      graphRef.current = null
    }
  }, [conn, sourceToken])

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
        conn.send({ type: 'player.error', epoch: player.epoch, itemId: player.item.id, message: String(e) })
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

  // Heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      const g = graphRef.current
      const p = conn.state?.player
      if (!g || !p || p.status === 'idle') return
      conn.send({ type: 'player.position', epoch: p.epoch, positionSec: g.video.currentTime })
    }, POSITION_HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [conn])

  // Ended event
  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const onEnded = () => {
      const p = conn.state?.player
      if (p && p.status !== 'idle') conn.send({ type: 'player.ended', epoch: p.epoch })
    }
    g.video.addEventListener('ended', onEnded)
    return () => g.video.removeEventListener('ended', onEnded)
  }, [conn, graphRef.current])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
}
