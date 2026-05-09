'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { SearchResult } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { PrePitchSlider } from './PrePitchSlider'

const REQUEST_TIMEOUT_MS = 8000

export const SearchTab = ({ conn }: { conn: Connection }) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [pending, setPending] = useState<SearchResult | null>(null)
  const [pitch, setPitch] = useState(0)
  const [loading, setLoading] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Always tear down any in-flight listener on unmount.
  useEffect(() => () => cleanupRef.current?.(), [])

  const doSearch = () => {
    if (!q.trim()) return
    cleanupRef.current?.() // cancel any previous in-flight search
    setLoading(true)
    const msgId = randomUUID()
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'search.results' && m.msgId === msgId) {
        setResults(m.results)
        setLoading(false)
        cleanup()
      }
    }
    const timeout = setTimeout(() => {
      setLoading(false)
      cleanup()
    }, REQUEST_TIMEOUT_MS)
    const cleanup = () => {
      window.removeEventListener('karaoke-msg', handler)
      clearTimeout(timeout)
      if (cleanupRef.current === cleanup) cleanupRef.current = null
    }
    cleanupRef.current = cleanup
    window.addEventListener('karaoke-msg', handler)
    conn.send({ type: 'search', msgId, query: q.trim() })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="bohemian rhapsody karaoke"
          style={{ flex: 1, padding: '8px 10px', fontFamily: 'var(--mono-font)', fontSize: 14, background: 'var(--paper-cream)', color: 'var(--ink-black)' }}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        <button onClick={doSearch} className="uc" style={{ padding: '8px 12px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
          {loading ? '...' : 'GO'}
        </button>
      </div>
      {results.map((r) => (
        <div key={r.videoId} className="paper-card paper-grain" onClick={() => { setPending(r); setPitch(0) }}>
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{r.title}</div>
          <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{r.channel} · {Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, '0')}</div>
        </div>
      ))}
      {pending && (
        <div className="paper-card paper-grain tape-strip" style={{ position: 'sticky', bottom: 0 }}>
          <div className="uc" style={{ fontSize: 9 }}>▌ Add to queue</div>
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{pending.title}</div>
          <PrePitchSlider value={pitch} onChange={setPitch} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setPending(null)} className="uc" style={{ padding: '6px 10px' }}>Cancel</button>
            <button
              onClick={() => {
                conn.send({ type: 'queue.add', msgId: randomUUID(), videoId: pending.videoId, prePitch: pitch })
                setPending(null); setQ(''); setResults([])
              }}
              className="uc" style={{ padding: '6px 10px', background: 'var(--hanko-red)', color: 'var(--paper-cream)' }}
            >Add</button>
          </div>
        </div>
      )}
    </div>
  )
}
