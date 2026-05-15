'use client'
import { useState } from 'react'
import { setStoredName } from '@/lib/client/ws'

export const NameEntry = ({ onSubmit }: { onSubmit: (n: string) => void }) => {
  const [name, setName] = useState('')
  return (
    <div
      className="name-entry"
      // padding is owned by the .name-entry class (riso.css) — safe-area +
      // 24px breathing room baked in. Adding an inline `padding` shorthand
      // here would clobber the safe-area calc.
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (n) { setStoredName(n); onSubmit(n) }
        }}
        className="paper-card paper-grain"
        style={{ width: 360, maxWidth: '100%' }}
      >
        <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>▌ enter the room</div>
        <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22, margin: '8px 0 12px' }}>
          What&apos;s your name?
        </h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sarah"
          aria-label="Your name"
          style={{
            width: '100%', padding: '10px 12px',
            fontFamily: 'var(--mono-font)', fontSize: 16,
            background: 'transparent', color: 'var(--ink-black)',
            border: '1px solid var(--ink-black)',
          }}
        />
        <button
          type="submit"
          className="hit-target uc"
          style={{ marginTop: 12, padding: '10px 16px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 12 }}
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
