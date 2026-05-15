'use client'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import { QrPanel } from './QrPanel'
import { SetlistPanel } from './SetlistPanel'
import { VolumePanel } from './VolumePanel'
import { JoinUrlModal } from '@/components/phone/JoinUrlModal'

export const QueueOverlay = ({ conn }: { conn: Connection }) => {
  const s = conn.state
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsMobile(mql.matches)
    apply()
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])

  if (!s) return null

  return (
    <>
      {!isMobile && <QrPanel variant="full" serverHost={conn.state?.serverHost ?? null} />}
      <SetlistPanel
        conn={conn}
        queue={s.queue}
        qrChip={isMobile ? <QrPanel variant="chip" onOpenJoinModal={() => setJoinModalOpen(true)} serverHost={conn.state?.serverHost ?? null} /> : null}
      />
      <VolumePanel />
      <JoinUrlModal open={joinModalOpen} onClose={() => setJoinModalOpen(false)} serverHost={conn.state?.serverHost ?? null} />
    </>
  )
}
