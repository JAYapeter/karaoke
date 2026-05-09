'use client'

// `crypto.randomUUID()` requires a secure context (HTTPS or localhost). On a
// karaoke party, phones connect via the MacBook's LAN IP — `http://10.0.0.22`
// — which is NOT a secure context, so `crypto.randomUUID` is undefined and
// throws when called. `crypto.getRandomValues` is available everywhere
// (including insecure contexts), so we build a v4 UUID from it as a fallback.
export const randomUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 from getRandomValues.
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6]! & 0x0f) | 0x40 // version 4
  b[8] = (b[8]! & 0x3f) | 0x80 // variant 10xx
  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push(b[i]!.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}
