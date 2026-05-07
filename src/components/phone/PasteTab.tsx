'use client'
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import { PrePitchSlider } from './PrePitchSlider'

const VIDEO_ID = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/
const REQUEST_TIMEOUT_MS = 12000

export const PasteTab = ({ conn }: { conn: Connection }) => {
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<{ videoId: string; title: string; thumbnail: string; durationSec: number } | null>(null)
  const [pitch, setPitch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const resolve = () => {
    const m = url.match(VIDEO_ID); if (!m) { setErr('Could not find a YouTube video id in that URL.'); return }
    cleanupRef.current?.()
    setBusy(true); setErr(null)
    const msgId = crypto.randomUUID()
    const handler = (e: Event) => {
      const x = (e as CustomEvent).detail
      if (x.type === 'meta.result' && x.msgId === msgId) {
        setMeta({ videoId: x.videoId, title: x.title, thumbnail: x.thumbnail, durationSec: x.durationSec })
        setBusy(false); cleanup()
      } else if (x.type === 'state.ack' && x.msgId === msgId && !x.ok) {
        setErr(x.error ?? 'failed'); setBusy(false); cleanup()
      }
    }
    const timeout = setTimeout(() => {
      setBusy(false); setErr('Timed out waiting for YouTube metadata.'); cleanup()
    }, REQUEST_TIMEOUT_MS)
    const cleanup = () => {
      window.removeEventListener('karaoke-msg', handler)
      clearTimeout(timeout)
      if (cleanupRef.current === cleanup) cleanupRef.current = null
    }
    cleanupRef.current = cleanup
    window.addEventListener('karaoke-msg', handler)
    conn.send({ type: 'meta.fetch', msgId, videoId: m[1]! })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <textarea value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…"
        rows={3} style={{ width: '100%', padding: 8, fontFamily: 'var(--mono-font)', fontSize: 13, background: 'var(--paper-cream)', color: 'var(--ink-black)' }} />
      <button onClick={resolve} disabled={busy} className="uc" style={{ padding: '8px 12px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
        {busy ? 'Resolving…' : 'Resolve'}
      </button>
      {err && <div className="uc" style={{ fontSize: 10, color: 'var(--riso-pink)' }}>{err}</div>}
      {meta && (
        <div className="paper-card paper-grain tape-strip">
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{meta.title}</div>
          <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{Math.floor(meta.durationSec / 60)}:{String(meta.durationSec % 60).padStart(2, '0')}</div>
          <PrePitchSlider value={pitch} onChange={setPitch} />
          <button
            onClick={() => {
              conn.send({ type: 'queue.add', msgId: crypto.randomUUID(), videoId: meta.videoId, prePitch: pitch })
              setMeta(null); setUrl('')
            }}
            className="uc" style={{ marginTop: 8, padding: '6px 10px', background: 'var(--hanko-red)', color: 'var(--paper-cream)' }}
          >Add</button>
        </div>
      )}
    </div>
  )
}
