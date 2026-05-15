'use client'
import { useEffect, useState } from 'react'
import { deriveJoinHost } from '@/lib/client/derive-join-host'

/**
 * Shared helper hook for QR / join-URL composition (used by QrPanel and
 * JoinUrlModal). Returns the URL string a phone should hit to join, or `''`
 * when both of the following are true:
 *   1. The page is loaded on a non-LAN-reachable host (localhost / 127.* /
 *      ::1) — this is true for the source page, which is gated to
 *      http://localhost:3000 by the source-trust guard.
 *   2. The server-detected LAN host (`serverHost` from `state.full`) is
 *      `null`.
 *
 * Without this gate, the QR would encode `localhost:3000` and any phone
 * scanning would get a useless URL. We return `''` so consumers can render
 * a "connecting..." placeholder instead.
 *
 * Two regimes:
 *   - **WS-handshake race (transient):** `serverHost` is null for ~50–500
 *     ms while the WS connects, then `state.full` arrives with the LAN
 *     host and the effect re-runs. Placeholder swaps to the real QR.
 *   - **Loopback-only host (persistent, by design — spec §3.4):** if the
 *     server resolved no LAN IPv4 (Wi-Fi off, airplane mode, no IPv4
 *     lease) AND no `KARAOKE_LAN_HOST` env override is set, `serverHost`
 *     stays `null` and the placeholder stays visible indefinitely.
 *     Encoding `localhost:3000` would only mislead — phones cannot reach
 *     the host in this state regardless of what the QR says. Operators
 *     should set `KARAOKE_LAN_HOST` or bring up a LAN interface and
 *     restart the server.
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
