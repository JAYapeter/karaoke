import { _evictStream, resolveStream } from '@/lib/ytdlp/stream'
import { log } from '@/lib/log'

const upstream = async (videoId: string, range: string | null) => {
  const stream = await resolveStream(videoId)
  const headers: Record<string, string> = { ...stream.headers }
  if (range) headers['Range'] = range
  return { res: await fetch(stream.url, { headers }), stream }
}

const isRecoverable5xx = (status: number) => status >= 500 && status <= 599

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

  const out = new Headers()
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const v = r.res.headers.get(h)
    if (v) out.set(h, v)
  }
  out.set('Cache-Control', 'no-store')
  // 416 (unsatisfiable range) is relayed as-is — Content-Range/* tells the client the current size.
  return new Response(r.res.body, { status: r.res.status, headers: out })
}
