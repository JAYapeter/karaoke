'use client'

export const StartShowGesture = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="start-show-gesture"
    aria-label="Start the show — unlocks audio"
    style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--ink-black)', color: 'var(--paper-cream)', border: 'none',
      fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900,
      fontSize: 'clamp(48px, 8vw, 96px)', cursor: 'pointer',
    }}
  >
    ▶ Start show
  </button>
)
