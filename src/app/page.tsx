'use client'
import { useEffect, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { LivePitchSheet } from '@/components/phone/LivePitchSheet'
import { Toaster } from '@/components/shared/Toaster'
import { PendingAddsProvider } from '@/lib/client/pending-adds-context'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'

type Tab = 'queue' | 'search' | 'paste'

export default function Phone() {
  return (
    <Toaster>
      <PendingAddsProvider>
        <PhoneApp />
      </PendingAddsProvider>
    </Toaster>
  )
}

const PhoneApp = () => {
  const [name, setName] = useState<string>('')
  const [tab, setTab] = useState<Tab>('queue')
  const sessionId = typeof window === 'undefined' ? '' : getSessionId()
  useEffect(() => { setName(getStoredName()) }, [])
  const conn = useConnection({ name })
  const onAddedSwitchToQueue = () => setTab('queue')
  if (!name) return <NameEntry onSubmit={setName} />
  return (
    <main style={{ paddingBottom: 140 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid var(--ink-deep)' }}>
        <div className="uc" style={{ fontSize: 12 }}>● {name}</div>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['queue', 'search', 'paste'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="uc"
              style={{ padding: '6px 10px', fontSize: 12, background: tab === t ? 'var(--hanko-red)' : 'transparent', color: 'var(--paper-cream)' }}>
              {t}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'queue' && (
        <QueueView
          conn={conn}
          sessionId={sessionId}
          sourceConnected={conn.state?.sourceConnected ?? false}
          sourceReady={conn.state?.sourceReady ?? false}
        />
      )}
      {tab === 'search' && (
        <SearchTab
          conn={conn}
          currentEpoch={
            conn.state?.player && conn.state.player.status !== 'idle'
              ? conn.state.player.epoch
              : 0
          }
          isActive={tab === 'search'}
          queueLen={conn.state?.queue.length ?? 0}
          onAddedSwitchToQueue={onAddedSwitchToQueue}
        />
      )}
      {tab === 'paste' && <PasteTab conn={conn} />}
      <LivePitchSheet conn={conn} sessionId={sessionId} />
    </main>
  )
}
