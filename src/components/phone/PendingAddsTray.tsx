'use client'
import { forwardRef, useEffect, useState } from 'react'
import { classifyPendingState, type PendingClassification } from '@/lib/client/pending-adds'
import { usePendingAdds } from '@/lib/client/pending-adds-context'

const ACK_TIMEOUT_MS = 6000

const labelFor = (c: PendingClassification): string => {
  switch (c) {
    case 'queueing':       return 'queueing…'
    case 'retry':          return 'tap to retry'
    case 'expired-window': return 'start new add anyway'
    case 'stale-visual':   return 'expired (server may have applied this)'
  }
}

export type PendingAddsTrayProps = {
  currentEpoch: number
  onRetry: (msgId: string) => void
}

export const PendingAddsTray = forwardRef<HTMLDivElement, PendingAddsTrayProps>(function PendingAddsTray(
  { currentEpoch, onRetry },
  ref,
) {
  const { pendingAdds, dismiss } = usePendingAdds()

  // The classification reads Date.now(); recompute on a 1s tick so the
  // queueing→retry→expired-window→stale-visual transitions surface live.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (pendingAdds.size === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pendingAdds.size])

  if (pendingAdds.size === 0) return null

  return (
    <div
      ref={ref}
      className="pending-adds-tray"
      role="region"
      aria-label="Pending adds"
      // Not sticky — flows in document order below the OfflineBanner. See
      // the OfflineBanner comment for the cascade rationale.
      style={{
        zIndex: 3,
        background: 'var(--ink-deep)',
        borderBottom: '1px solid var(--ink-black)',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {Array.from(pendingAdds.values()).map((entry) => {
        const cls = classifyPendingState(entry, { now, currentEpoch, ackedTimeoutMs: ACK_TIMEOUT_MS })
        const displayName = entry.title ?? entry.videoId
        // §4.3: stale-visual (5+ min) allows ONLY dismiss; retry is removed.
        // expired-window / retry / queueing all use the primary tap.
        const allowRetry = cls !== 'stale-visual'
        return (
          <div
            key={entry.msgId}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <button
              type="button"
              className="hit-target uc"
              aria-label={allowRetry ? `Retry pending add for ${displayName}` : `${displayName} expired — dismiss with ×`}
              onClick={() => { if (allowRetry) onRetry(entry.msgId) }}
              disabled={!allowRetry}
              aria-disabled={!allowRetry || undefined}
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                textAlign: 'left',
                padding: '6px 8px',
                background: 'transparent',
                color: cls === 'stale-visual' ? 'var(--riso-pink)' : 'var(--paper-cream)',
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName} · key {entry.prePitch >= 0 ? '+' : ''}{entry.prePitch} · {labelFor(cls)}
            </button>
            <button
              type="button"
              className="hit-target uc"
              aria-label={cls === 'stale-visual' ? `Dismiss expired add for ${displayName}` : `Cancel pending add for ${displayName}`}
              onClick={() => dismiss(entry.msgId)}
              style={{ background: 'transparent', color: 'var(--riso-pink)', fontSize: 12 }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
})
