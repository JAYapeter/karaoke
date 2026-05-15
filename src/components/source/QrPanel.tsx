'use client'
import { useEffect, useState } from 'react'
import qrcode from 'qrcode'
import { useJoinUrl } from '@/lib/client/use-join-url'

type Variant = 'full' | 'chip'

export type QrPanelProps = {
  variant?: Variant
  onOpenJoinModal?: () => void
  serverHost: string | null
  /** Chip-variant only: drives `aria-expanded` so SR users hear the popup state. */
  joinModalOpen?: boolean
}

const useQrDataUrl = (url: string, size: number) => {
  const [dataUrl, setDataUrl] = useState<string>('')
  useEffect(() => {
    if (!url) return
    qrcode.toDataURL(url, { margin: 1, width: size }).then(setDataUrl).catch(() => setDataUrl(''))
  }, [url, size])
  return dataUrl
}

export const QrPanel = ({ variant = 'full', onOpenJoinModal, serverHost, joinModalOpen }: QrPanelProps) => {
  const url = useJoinUrl(serverHost)
  // Gate the unused variant's hook so we only encode one QR at a time. The
  // hook bails when url is empty, so passing '' skips the qrcode work.
  const fullDataUrl = useQrDataUrl(variant === 'full' ? url : '', 220)
  const chipDataUrl = useQrDataUrl(variant === 'chip' ? url : '', 120)

  if (variant === 'chip') {
    return (
      <button
        type="button"
        // `.qr-chip` owns the visible HOVER affordance via an outline (see
        // riso.css). The chip's <img> child fills 100%/100%, so the
        // `.icon-btn` background hover tint is occluded — outline is the
        // only thing that can show through. We keep `.icon-btn` anyway for
        // the cursor:pointer, tap-flash, and reduced-motion override; its
        // background-color hover rule is harmless dead behavior here.
        className="qr-chip hit-target icon-btn"
        aria-label="Show join URL"
        aria-haspopup="dialog"
        aria-expanded={joinModalOpen ?? false}
        onClick={onOpenJoinModal}
        // No inline `background` — the `.qr-chip` class in riso.css owns the
        // cream background so any future `:hover` / state rules can win via
        // the cascade (inline `background` would shadow them).
        style={{ padding: 0, border: '1px solid var(--ink-deep)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {chipDataUrl
          ? <img src={chipDataUrl} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />
          : <span className="uc" aria-hidden="true" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>…</span>}
      </button>
    )
  }

  // Initial-paint race: on the source page (loaded as http://localhost:3000),
  // `useJoinUrl` returns '' until `state.full` arrives with the LAN host.
  // Show a "connecting..." placeholder instead of encoding localhost into a
  // QR phones can't reach.
  const ready = url.length > 0

  return (
    <div className="paper-card paper-grain" style={{ textAlign: 'center' }}>
      <div className="uc" style={{ fontSize: 12, letterSpacing: '0.2em', color: 'var(--ink-muted)' }}>scan to join</div>
      <div style={{ margin: '6px auto', width: 110, height: 110, background: 'var(--paper-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {ready
          ? fullDataUrl && <img src={fullDataUrl} alt={`Join URL ${url}`} width={110} height={110} style={{ display: 'block' }} />
          : <span className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>connecting…</span>}
      </div>
      <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)', wordBreak: 'break-all' }}>
        {ready ? url.replace(/^https?:\/\//, '') : 'waiting for LAN host…'}
      </div>
    </div>
  )
}
