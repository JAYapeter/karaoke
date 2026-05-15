/**
 * Validate the KARAOKE_LAN_HOST env override value.
 *
 * Accepts:
 *  - DNS-style host with optional `:port`           e.g. `shimokita.local:3000`
 *  - Bare IPv4 (or any digit/dot host) with optional `:port`  e.g. `10.0.0.22:3000`
 *  - Bracketed IPv6 with optional `:port`            e.g. `[::1]:3000`
 *
 * Rejects:
 *  - Anything containing `://`, `?`, `#`, whitespace
 *  - Unbracketed IPv6, malformed `:port`, scheme prefixes
 *  - Bracketed payloads that aren't RFC-compliant IPv6 (e.g. `[1]`,
 *    `[::1::1]`, `[1:2:3:4:5:6:7:8:9]`) — these would otherwise pass the
 *    permissive `[0-9a-fA-F:]+` character class but break URL parsers on
 *    the phone side, producing a dead QR with no warning.
 *
 * The intent is to prevent broken QR encodings — `KARAOKE_LAN_HOST` ships
 * verbatim into the join URL composed in `useJoinUrl`. A malformed value
 * silently produces a QR phones can't parse.
 *
 * Pure / no-side-effects so it can be unit-tested without spinning up the
 * server.
 */

import { isIPv6 } from 'node:net'

const VALID_HOST_RE =
  /^([\w.-]+|\[[0-9a-fA-F:]+\])(:\d+)?$/

export const isValidLanHost = (value: string): boolean => {
  if (value.length === 0) return false
  // Belt-and-suspenders: explicitly reject scheme/query/fragment/whitespace
  // even though the regex anchor would also reject them.
  if (/[\s?#]/.test(value)) return false
  if (value.includes('://')) return false
  const m = VALID_HOST_RE.exec(value)
  if (!m) return false
  const host = m[1]!
  // Bracketed payload → must be a real IPv6 address. The regex's
  // `[0-9a-fA-F:]+` is permissive (it accepts `[1]`, `[::1::1]`, or 9-group
  // monstrosities), so delegate strict validation to Node's `net.isIPv6`,
  // which implements the full RFC 4291 grammar (incl. `::` collapse rules
  // and the IPv4-in-IPv6 dotted-quad tail).
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1)
    if (!isIPv6(inner)) return false
  }
  // Tighten port to a real TCP range. The regex's `(:\d+)?` would otherwise
  // accept `host:0` / `host:65536` / `host:99999` etc., which still encode
  // into a QR but produce URLs browsers refuse to open. Reject early so
  // operators see the "invalid LAN host" warning instead of a dead QR.
  const portStr = m[2]?.slice(1) // drop leading ':' (e.g. ':3000' → '3000')
  if (portStr) {
    if (portStr.length > 5) return false
    const portNum = Number(portStr)
    if (portNum < 1 || portNum > 65535) return false
  }
  return true
}
