'use client'
import { forwardRef } from 'react'
import { Tick } from '@/components/shared/Tick'

export const OfflineBanner = forwardRef<HTMLDivElement>(function OfflineBanner(_props, ref) {
  return (
    <div
      ref={ref}
      className="offline-banner uc"
      role="status"
      aria-live="polite"
      // Not sticky — flows in document order below the sticky <Tabs> header.
      // Multiple sticky-at-same-top siblings would overlap (browser stacks
      // them at the same y-offset, not cascading). The Tabs header alone is
      // sticky; OfflineBanner + PendingAddsTray scroll with content. The
      // banner remains visible at initial scroll position (top of page);
      // when the user scrolls down through tab content it scrolls away
      // — acceptable since the takeover-banner-replacement and the queue
      // card's `▌ OFFLINE` badge keep the offline state visible elsewhere.
      style={{
        zIndex: 4,
        padding: '6px 12px',
        background: 'var(--ink-deep)',
        color: 'var(--riso-pink)',
        borderBottom: '1px solid var(--ink-black)',
        textAlign: 'center',
        // font-size enforced by .offline-banner cascade in riso.css (12 desktop, 13 phones).
      }}
    >
      <Tick />source offline — playback paused
    </div>
  )
})
