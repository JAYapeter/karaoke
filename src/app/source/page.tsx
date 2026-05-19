'use client'
import { useState, useEffect } from 'react'
import { StartShowGesture } from '@/components/source/StartShowGesture'
import { VideoPlayer } from '@/components/source/VideoPlayer'
import { QueueOverlay } from '@/components/source/QueueOverlay'
import { KeyboardShortcuts } from '@/components/source/KeyboardShortcuts'
import { Toaster } from '@/components/shared/Toaster'
import { Tick } from '@/components/shared/Tick'
import { useConnection } from '@/lib/client/ws'

const isLocalhostOrigin = () => {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
}

export default function Source() {
  const [local, setLocal] = useState<boolean | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setLocal(isLocalhostOrigin()) }, [])

  const conn = useConnection({ name: 'source' })

  if (local === null) return null
  if (!local) {
    return (
      <div className="page-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="paper-card paper-grain" style={{ maxWidth: 420 }}>
          <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}><Tick />wrong device</div>
          <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22, margin: '8px 0 12px' }}>
            Open this page on the host machine.
          </h2>
          <p style={{ fontFamily: 'var(--mono-font)', fontSize: 12, lineHeight: 1.5 }}>
            <code>/source</code> is the TV display and runs on the MacBook that started the server. To add songs from this device, go to <code>/</code> instead.
          </p>
        </div>
      </div>
    )
  }
  if (!unlocked) return <StartShowGesture onClick={() => setUnlocked(true)} />

  // The .source-root grid (defined in riso.css) owns all four safe-area insets,
  // 100dvh sizing, and the desktop video-left + rail-right layout (single column on ≤720px).
  return (
    <Toaster>
      <main className="source-root" aria-label="Karaoke source display">
        <section className="source-root__video" aria-label="Now playing" style={{ position: 'relative' }}>
          <VideoPlayer conn={conn} />
        </section>
        <aside className="source-root__rail" aria-label="Setlist and join controls">
          <QueueOverlay conn={conn} />
        </aside>
        <KeyboardShortcuts conn={conn} />
      </main>
    </Toaster>
  )
}
