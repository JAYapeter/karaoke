'use client'
import { useState, useEffect } from 'react'
import { TokenEntry } from '@/components/source/TokenEntry'
import { StartShowGesture } from '@/components/source/StartShowGesture'
import { VideoPlayer } from '@/components/source/VideoPlayer'
import { QueueOverlay } from '@/components/source/QueueOverlay'
import { KeyboardShortcuts } from '@/components/source/KeyboardShortcuts'
import { getStoredSourceToken, useConnection } from '@/lib/client/ws'

export default function Source() {
  const [token, setToken] = useState<string>('')
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setToken(getStoredSourceToken()) }, [])

  const conn = useConnection({ name: 'source', ...(token ? { sourceToken: token } : {}) })

  if (!token) return <TokenEntry onSubmit={setToken} />
  if (!unlocked) return <StartShowGesture onClick={() => setUnlocked(true)} />

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--ink-black)' }}>
      <VideoPlayer conn={conn} sourceToken={token} />
      <QueueOverlay conn={conn} />
      <KeyboardShortcuts conn={conn} />
    </main>
  )
}
