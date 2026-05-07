'use client'
import { useState } from 'react'
import { setStoredSourceToken } from '@/lib/client/ws'

export const TokenEntry = ({ onSubmit }: { onSubmit: (t: string) => void }) => {
  const [token, setToken] = useState('')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={(e) => { e.preventDefault(); if (token.trim()) { setStoredSourceToken(token.trim()); onSubmit(token.trim()) } }}
        className="paper-card paper-grain" style={{ width: 360 }}>
        <div className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>▌ source token</div>
        <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22 }}>
          Enter the token printed in your terminal.
        </h2>
        <input autoFocus value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="a4f9-7c12"
          style={{ width: '100%', padding: '8px 10px', fontFamily: 'var(--mono-font)', fontSize: 14, background: 'transparent', border: '1px solid var(--ink-black)' }} />
        <button type="submit" className="uc"
          style={{ marginTop: 12, padding: '8px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
          Continue
        </button>
      </form>
    </div>
  )
}
