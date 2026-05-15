/**
 * Pick the host string that the source-page QR / phone-client URL should encode.
 *
 * Spec §3.3: prefer the server-detected LAN host (or KARAOKE_LAN_HOST override)
 * over the browser's own location.host, because the source page is forced to
 * load on http://localhost:3000 (gated by the source-trust guard) — that
 * hostname can't be reached by phones on the LAN. Empty/nullish serverHost
 * means "no LAN host known"; fall back to window.location.host so phone
 * clients (and SSR snapshots) keep working unchanged.
 *
 * **Trim contract:** This helper is intentionally pure and does NOT trim
 * `serverHost`. Whitespace-only strings (e.g. `"   "`) are treated as
 * truthy and returned verbatim — they are NOT considered fallback. Callers
 * that source `serverHost` from user/env input are responsible for trimming
 * BEFORE calling. (`server.ts` already does `process.env.KARAOKE_LAN_HOST?.trim()`
 * before passing through `store.setServerHost`.) Keeping the trim out of
 * this helper preserves the pure-derivation property and prevents surprises
 * for callers that intentionally want raw passthrough.
 */
export function deriveJoinHost(
  serverHost: string | null | undefined,
  windowHost: string,
): string {
  if (serverHost && serverHost.length > 0) return serverHost
  return windowHost
}
