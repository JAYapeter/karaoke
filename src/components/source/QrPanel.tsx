'use client'
import { useEffect, useState } from 'react'
import qrcode from 'qrcode'
import { deriveJoinHost } from '@/lib/client/derive-join-host'

type Variant = 'full' | 'chip'

export type QrPanelProps = {
  variant?: Variant
  onOpenJoinModal?: () => void
  serverHost: string | null
}

const useJoinUrl = (serverHost: string | null) => {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const host = deriveJoinHost(serverHost, window.location.host)
    setUrl(`${window.location.protocol}//${host}/`)
  }, [serverHost])
  return url
}
const useQrDataUrl = (url: string, size: number) => {
  const [dataUrl, setDataUrl] = useState<string>('')
  useEffect(() => {
    if (!url) return
    qrcode.toDataURL(url, { margin: 1, width: size }).then(setDataUrl).catch(() => setDataUrl(''))
  }, [url, size])
  return dataUrl
}

export const QrPanel = ({ variant = 'full', onOpenJoinModal, serverHost }: QrPanelProps) => {
  const url = useJoinUrl(serverHost)
  // Gate the unused variant's hook so we only encode one QR at a time. The
  // hook bails when url is empty, so passing '' skips the qrcode work.
  const fullDataUrl = useQrDataUrl(variant === 'full' ? url : '', 220)
  const chipDataUrl = useQrDataUrl(variant === 'chip' ? url : '', 120)

  if (variant === 'chip') {
    return (
      <button
        type="button"
        // Default `.icon-btn` (dark-on-cream hover tint) — NOT `--on-dark`,
        // because the chip's surface is cream (`.qr-chip`); the `--on-dark`
        // tint is cream-on-cream and effectively invisible against the chip.
        className="qr-chip hit-target icon-btn"
        aria-label="Show join URL"
        onClick={onOpenJoinModal}
        // No inline `background` — the `.qr-chip` class in riso.css owns the
        // cream background so `:hover` and disabled-state rules from `.icon-btn`
        // can win via the cascade (inline `background` would shadow them).
        style={{ padding: 0, border: '1px solid var(--ink-deep)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {chipDataUrl && <img src={chipDataUrl} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />}
      </button>
    )
  }

  return (
    <div className="paper-card paper-grain" style={{ textAlign: 'center' }}>
      <div className="uc" style={{ fontSize: 12, letterSpacing: '0.2em', color: 'var(--ink-muted)' }}>scan to join</div>
      <div style={{ margin: '6px auto', width: 110, height: 110, background: 'var(--paper-cream)' }}>
        {fullDataUrl && <img src={fullDataUrl} alt={`Join URL ${url}`} width={110} height={110} style={{ display: 'block' }} />}
      </div>
      <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)', wordBreak: 'break-all' }}>
        {url.replace(/^https?:\/\//, '')}
      </div>
    </div>
  )
}
