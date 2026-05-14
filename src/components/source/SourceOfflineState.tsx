'use client'
// Overlay variant: `source-offline--overlay` resets 100dvh + safe-area to fill
// the parent video frame instead of the viewport. See riso.css.
export const SourceOfflineState = () => (
  <div
    className="source-offline source-offline--overlay"
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--ink-deep), var(--ink-black))', color: 'var(--riso-pink)' }}
  >
    <div className="uc offline-banner" style={{ fontSize: 16, letterSpacing: '0.2em' }}>
      ▌ source offline — reconnecting…
    </div>
  </div>
)
