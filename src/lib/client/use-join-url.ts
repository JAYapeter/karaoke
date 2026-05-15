'use client'
import { useEffect, useState } from 'react'
import { deriveJoinHost } from '@/lib/client/derive-join-host'

/**
 * Shared helper hook for QR / join-URL composition (used by QrPanel and
 * JoinUrlModal). Returns the URL string a phone should hit to join, or `''`
 * during the initial-paint race when:
 *   1. The page is loaded on a non-LAN-reachable host (localhost / 127.* /
 *      ::1) — this is true for the source page, which is gated to
 *      http://localhost:3000 by the source-trust guard.
 *   2. The server-detected LAN host (`serverHost` from `state.full`) hasn't
 *      arrived over the WS yet (~50–500ms after first render).
 *
 * Without this gate, the QR would briefly encode `localhost:3000` and any
 * phone scanning during that window would get a useless URL. We return `''`
 * so consumers can render a "connecting..." placeholder instead.
 *
 * Phone clients (loaded on the LAN URL itself) skip the gate: their
 * `window.location.host` is already a LAN-reachable host, so the hook
 * returns immediately even if `serverHost` is null.
 */
const LOCALHOST_FALLBACK_RE = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/

export const isLocalhostFallback = (host: string): boolean =>
  LOCALHOST_FALLBACK_RE.test(host)

export const useJoinUrl = (serverHost: string | null): string => {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const winHost = window.location.host
    // If we're on a localhost / loopback host AND serverHost hasn't arrived
    // yet, suppress the URL. Otherwise the QR would encode a host phones
    // can't reach. Once serverHost lands the effect re-runs and produces
    // the real URL.
    if (!serverHost && isLocalhostFallback(winHost)) {
      setUrl('')
      return
    }
    const host = deriveJoinHost(serverHost, winHost)
    setUrl(`${window.location.protocol}//${host}/`)
  }, [serverHost])
  return url
}
