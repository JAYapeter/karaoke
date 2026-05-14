'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ServerMessage } from '@/lib/types/protocol'

type Level = 'info' | 'warn' | 'error'

type Toast = {
  id: number
  level: Level
  message: string
  /** Optional UNDO action — when present, renders a tap target inside the toast. */
  undo?: { label: string; onTap: () => void }
}

const COLORS: Record<Level, string> = {
  info: 'var(--cigarette)',
  warn: 'var(--riso-pink)',
  error: 'var(--hanko-red)',
}

const DEFAULT_TTL_MS = 4500
const UNDO_TTL_MS = 6000

type Ctx = {
  showToast: (t: { level: Level; message: string; undo?: { label: string; onTap: () => void }; ttlMs?: number }) => void
}

const ToasterContext = createContext<Ctx | null>(null)

export const useToaster = (): Ctx => {
  const v = useContext(ToasterContext)
  if (!v) throw new Error('useToaster must be used inside <Toaster>')
  return v
}

// Each toast wraps its element in a small mount component so the `.toast`
// CSS transition from opacity:0 / translateY(-8px) → visible can fire. The
// element mounts with data-visible="0" (matching the .toast base rule),
// then flips to "1" after the first paint via rAF. Without this two-phase
// render the data-visible attribute would always be "1" and the §5.5 mount
// animation would never play.
const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      className="paper-card paper-grain toast"
      data-visible={visible ? '1' : '0'}
      style={{
        pointerEvents: 'auto',
        minWidth: 220,
        maxWidth: 360,
        borderLeft: `4px solid ${COLORS[toast.level]}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div className="uc" style={{ fontSize: 12, color: COLORS[toast.level], marginBottom: 2 }}>{toast.level}</div>
        <div style={{ fontFamily: 'var(--mono-font)', fontSize: 12, wordBreak: 'break-word' }}>{toast.message}</div>
      </div>
      {toast.undo && (
        <button
          type="button"
          className="hit-target uc"
          onClick={() => { toast.undo!.onTap(); onDismiss() }}
          style={{
            background: 'transparent',
            color: COLORS[toast.level],
            border: `1px solid ${COLORS[toast.level]}`,
            padding: '6px 10px',
            fontSize: 12,
          }}
        >
          {toast.undo.label}
        </button>
      )}
    </div>
  )
}

export const Toaster = ({ children }: { children?: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextIdRef = useRef(1)

  const showToast = useCallback<Ctx['showToast']>((t) => {
    const id = nextIdRef.current++
    const ttl = t.ttlMs ?? (t.undo ? UNDO_TTL_MS : DEFAULT_TTL_MS)
    // exactOptionalPropertyTypes: only spread `undo` when defined to avoid
    // assigning `undefined` to an optional-but-not-nullable property.
    const toast: Toast = { id, level: t.level, message: t.message, ...(t.undo ? { undo: t.undo } : {}) }
    setToasts((cur) => [...cur, toast])
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), ttl)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'toast') return
      showToast({ level: m.level, message: m.message })
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [showToast])

  const value = useMemo<Ctx>(() => ({ showToast }), [showToast])

  return (
    <ToasterContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          top: 'var(--top-occluder-height, 0px)',
          paddingTop: 12, // breathing room between chrome and the first toast
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 'min(420px, calc(100vw - 24px))',
        }}
      >
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onDismiss={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
          />
        ))}
      </div>
    </ToasterContext.Provider>
  )
}
