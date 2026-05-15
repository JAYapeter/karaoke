'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode'
import { deriveJoinHost } from '@/lib/client/derive-join-host'

export type JoinUrlModalProps = { open: boolean; onClose: () => void; serverHost: string | null }

const useJoinUrl = (serverHost: string | null) => {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const host = deriveJoinHost(serverHost, window.location.host)
    setUrl(`${window.location.protocol}//${host}/`)
  }, [serverHost])
  return url
}
const useScrollLock = (locked: boolean) => {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    document.documentElement.classList.add('modal-open-lock')
    return () => document.documentElement.classList.remove('modal-open-lock')
  }, [locked])
}
const supportsDialog = () =>
  typeof window !== 'undefined' &&
  typeof window.HTMLDialogElement === 'function' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (HTMLDialogElement.prototype as any).showModal === 'function'

// Compact landscape: QR shrinks to 160 CSS px when height ≤ 480 (§5.6).
const useCompactLandscape = (): boolean => {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-height: 480px)')
    const apply = () => setCompact(mql.matches)
    apply()
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])
  return compact
}

export const JoinUrlModal = ({ open, onClose, serverHost }: JoinUrlModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const url = useJoinUrl(serverHost)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const compact = useCompactLandscape()
  const qrPx = compact ? 160 : 240

  // Stabilize onClose so the dialog-effect doesn't re-fire on every parent render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const stableClose = useCallback(() => onCloseRef.current(), [])

  useEffect(() => {
    if (!url) return
    qrcode.toDataURL(url, { margin: 1, width: qrPx * 1.5 }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [url, qrPx])
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    const usingDialog = supportsDialog() && !!dialogRef.current
    const prev = document.activeElement as HTMLElement | null
    let cancelHandler: ((e: Event) => void) | null = null
    if (usingDialog && dialogRef.current) {
      const d = dialogRef.current
      // Strict-mode double-mount or rapid re-render can re-enter this effect
      // while the dialog is already open. Guard so showModal() doesn't throw
      // InvalidStateError.
      if (!d.open) d.showModal()
      cancelHandler = (e: Event) => { e.preventDefault(); stableClose() }
      d.addEventListener('cancel', cancelHandler)
    }
    closeBtnRef.current?.focus()

    // Focus-trap helpers (only used by the manual-fallback path).
    const focusables = (): HTMLElement[] => {
      const root = containerRef.current
      if (!root) return []
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hidden && el.offsetParent !== null)
    }

    // Capture-phase keydown so we win over child + document-level handlers.
    // Runs for BOTH the <dialog> and the manual-fallback paths so Space and
    // ArrowLeft/ArrowRight/ArrowUp/ArrowDown don't reach KeyboardShortcuts on
    // /source while the modal is open (ArrowUp/Down adjust live pitch — a
    // silent state change while the user is arrow-navigating the modal's
    // controls). Escape closes the modal (the native <dialog> would also fire
    // its `cancel` event, but stopping propagation prevents any global Escape
    // handler from also reacting). Tab is intercepted only by the fallback
    // path for manual focus trap; <dialog> handles Tab natively.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!usingDialog) stableClose()
        return
      }
      if (
        e.key === ' ' ||
        e.key === 'Spacebar' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        // Don't preventDefault — let the focused button/textarea consume normally.
        e.stopPropagation()
        return
      }
      if (e.key !== 'Tab') return
      if (usingDialog) return // <dialog> traps Tab natively
      const f = focusables()
      if (f.length === 0) { e.preventDefault(); return }
      const active = document.activeElement as HTMLElement | null
      const idx = active ? f.indexOf(active) : -1
      e.preventDefault()
      if (idx === -1) { f[0]!.focus(); return }
      if (e.shiftKey) {
        f[idx === 0 ? f.length - 1 : idx - 1]!.focus()
      } else {
        f[idx === f.length - 1 ? 0 : idx + 1]!.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (usingDialog && dialogRef.current) {
        const d = dialogRef.current
        if (cancelHandler) d.removeEventListener('cancel', cancelHandler)
        if (d.open) d.close()
      }
      prev?.focus()
    }
  }, [open, stableClose])

  const onBackdropTap = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) stableClose()
  }
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }

  if (!open) return null

  const Body = (
    <div
      ref={containerRef}
      style={{
        padding: 'env(safe-area-inset-top, 12px) env(safe-area-inset-right, 12px) env(safe-area-inset-bottom, 12px) env(safe-area-inset-left, 12px)',
        maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
        background: 'var(--ink-deep)', color: 'var(--paper-cream)',
        minWidth: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}
    >
      <div className="uc" style={{ fontSize: 12, letterSpacing: '0.2em' }}>scan to join</div>
      <div style={{ width: qrPx, height: qrPx, background: 'var(--paper-cream)' }}>
        {qrDataUrl && <img src={qrDataUrl} alt={`Join URL ${url}`} width={qrPx} height={qrPx} style={{ display: 'block' }} />}
      </div>
      <div className="uc" style={{ fontSize: 13, wordBreak: 'break-all', textAlign: 'center' }}>{url}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="hit-target uc" onClick={onCopy} style={{ padding: '8px 12px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 12 }}>
          {copied ? 'copied' : 'copy URL'}
        </button>
        <button ref={closeBtnRef} type="button" className="hit-target uc" aria-label="Close" onClick={onClose} style={{ padding: '8px 12px', background: 'transparent', color: 'var(--paper-cream)', border: '1px solid var(--paper-cream)', fontSize: 12 }}>
          close
        </button>
      </div>
    </div>
  )

  if (supportsDialog()) {
    return (
      <dialog ref={dialogRef} onClick={onBackdropTap} style={{ padding: 0, border: 'none', background: 'transparent', color: 'inherit' }}>
        {Body}
      </dialog>
    )
  }
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Join URL"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {Body}
    </div>
  )
}
