import { _evictStream, resolveStream } from '@/lib/ytdlp/stream'
import { log } from '@/lib/log'

const upstream = async (videoId: string, range: string | null) => {
  const stream = await resolveStream(videoId)
  const headers: Record<string, string> = { ...stream.headers }
  if (range) headers['Range'] = range
  return { res: await fetch(stream.url, { headers }), stream }
}

const isRecoverable5xx = (status: number) => status >= 500 && status <= 599

// HLS/DASH manifests reference cross-origin segments and taint the <video> element,
// silencing Web Audio. We refuse to serve them so the source's `player.error` path
// fires with a visible toast instead of "video plays but audio is silent".
const TAINTED_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',  // HLS .m3u8
  'application/x-mpegurl',          // HLS .m3u8 (alt)
  'application/dash+xml',           // DASH manifest
]
const isTainted = (ct: string | null) =>
  !!ct && TAINTED_CONTENT_TYPES.some((t) => ct.toLowerCase().startsWith(t))

export const GET = async (
  req: Request,
  ctx: { params: Promise<{ videoId: string }> },
): Promise<Response> => {
  const { videoId } = await ctx.params
  const range = req.headers.get('Range')

  let r = await upstream(videoId, range)
  // Refresh on URL-expiry-shaped errors or any upstream 5xx — the URL may be stale.
  if (r.res.status === 403 || r.res.status === 410 || isRecoverable5xx(r.res.status)) {
    log('warn', `upstream ${r.res.status} for ${videoId}; evicting and retrying`)
    _evictStream(videoId)
    r = await upstream(videoId, range)
  }

  // After one retry, if still 5xx, surface 502 to the client (clean signal to the source's refresh path).
  if (isRecoverable5xx(r.res.status)) {
    return new Response('upstream unavailable', { status: 502 })
  }

  const upstreamCt = r.res.headers.get('Content-Type')
  if (isTainted(upstreamCt)) {
    log('error', `refusing tainted content-type "${upstreamCt}" for ${videoId} — yt-dlp picked an HLS/DASH variant`)
    return new Response('upstream returned a streaming manifest, not progressive media', { status: 415 })
  }

  const out = new Headers()
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const v = r.res.headers.get(h)
    if (v) out.set(h, v)
  }
  out.set('Cache-Control', 'no-store')
  // 416 (unsatisfiable range) is relayed as-is — Content-Range/* tells the client the current size.
  return new Response(r.res.body, { status: r.res.status, headers: out })
}
