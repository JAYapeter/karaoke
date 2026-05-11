'use client'
import { useState, useEffect } from 'react'
import { StartShowGesture } from '@/components/source/StartShowGesture'
import { VideoPlayer } from '@/components/source/VideoPlayer'
import { QueueOverlay } from '@/components/source/QueueOverlay'
import { KeyboardShortcuts } from '@/components/source/KeyboardShortcuts'
import { Toaster } from '@/components/shared/Toaster'
import { useConnection } from '@/lib/client/ws'

// Mirror of the server-side loopback check. Source authority is granted server-side
// based on `req.socket.remoteAddress`; this is just a UX guard so people who type
// the LAN URL into a phone don't see a half-broken /source.
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="paper-card paper-grain" style={{ maxWidth: 420 }}>
          <div className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>▌ wrong device</div>
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

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--ink-black)' }}>
      <VideoPlayer conn={conn} />
      <QueueOverlay conn={conn} />
      <KeyboardShortcuts conn={conn} />
      <Toaster />
    </main>
  )
}
