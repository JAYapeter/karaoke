'use client'
import { useState } from 'react'
import { setStoredName } from '@/lib/client/ws'

export const NameEntry = ({ onSubmit }: { onSubmit: (name: string) => void }) => {
  const [name, setName] = useState('')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) { setStoredName(name.trim()); onSubmit(name.trim()) } }}
        className="paper-card paper-grain"
        style={{ width: 320 }}
      >
        <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 8 }}>▌ enter the room</div>
        <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22, marginBottom: 12 }}>
          What&apos;s your name?
        </h2>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Sarah"
          style={{ width: '100%', padding: '8px 10px', fontFamily: 'var(--mono-font)', fontSize: 14, background: 'transparent', border: '1px solid var(--ink-black)' }}
        />
        <button
          type="submit"
          style={{ marginTop: 12, padding: '8px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontFamily: 'var(--mono-font)', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 11 }}
        >Sign in</button>
      </form>
    </div>
  )
}
