'use client'
import { useEffect, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { LivePitchSheet } from '@/components/phone/LivePitchSheet'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'

type Tab = 'queue' | 'search' | 'paste'

export default function Phone() {
  const [name, setName] = useState<string>('')
  const [tab, setTab] = useState<Tab>('queue')
  const sessionId = typeof window === 'undefined' ? '' : getSessionId()

  useEffect(() => { setName(getStoredName()) }, [])

  const conn = useConnection({ name })

  if (!name) return <NameEntry onSubmit={setName} />

  return (
    <main style={{ paddingBottom: 140 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid var(--ink-deep)' }}>
        <div className="uc" style={{ fontSize: 11 }}>● {name}</div>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['queue', 'search', 'paste'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="uc"
              style={{ padding: '6px 10px', fontSize: 10, background: tab === t ? 'var(--hanko-red)' : 'transparent', color: tab === t ? 'var(--paper-cream)' : 'var(--paper-cream)' }}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'queue' && <QueueView conn={conn} sessionId={sessionId} />}
      {tab === 'search' && <SearchTab conn={conn} />}
      {tab === 'paste' && <PasteTab conn={conn} />}

      <LivePitchSheet conn={conn} sessionId={sessionId} />
    </main>
  )
}
