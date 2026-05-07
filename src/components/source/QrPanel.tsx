'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export const QrPanel = () => {
  const [dataUrl, setDataUrl] = useState<string>('')
  useEffect(() => {
    QRCode.toDataURL(`http://${location.host}`, { margin: 1, width: 240 }).then(setDataUrl)
  }, [])
  if (!dataUrl) return null
  return (
    <div className="paper-card paper-grain" style={{ width: 240, textAlign: 'center' }}>
      <div className="uc" style={{ fontSize: 10 }}>scan to join</div>
      <img src={dataUrl} alt="QR" style={{ width: 200, height: 200 }} />
      <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{location.host}</div>
    </div>
  )
}
