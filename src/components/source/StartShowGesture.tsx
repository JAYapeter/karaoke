'use client'
export const StartShowGesture = ({ onClick, label = 'Start show' }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick}
    style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      background: 'var(--ink-black)', color: 'var(--paper-cream)',
      fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 64,
      letterSpacing: -1, cursor: 'pointer', border: 'none',
    }}>
    ▶ {label}
  </button>
)
