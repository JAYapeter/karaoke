import { runYtDlp, YtDlpError } from './runner'
import { FORMAT_SELECTORS, URL_REFRESH_LEAD_MS } from '@/lib/config'
import { log } from '@/lib/log'

export type Stream = {
  url: string
  headers: Record<string, string>
  expiresAt: number
}

const cache = new Map<string, Stream>()
export const _resetStreamCache = () => cache.clear()
export const _evictStream = (videoId: string) => cache.delete(videoId)

const parseExpiry = (url: string): number => {
  const m = url.match(/[?&]expire=(\d+)/)
  if (m && m[1]) return Number(m[1]) * 1000
  return Date.now() + 60 * 60 * 1000 // 1h default
}

export const resolveStream = async (videoId: string): Promise<Stream> => {
  const now = Date.now()
  const hit = cache.get(videoId)
  if (hit && hit.expiresAt - URL_REFRESH_LEAD_MS > now) return hit

  let lastErr: unknown
  for (const selector of FORMAT_SELECTORS) {
    try {
      const stdout = await runYtDlp(
        ['-f', selector, '--dump-json', '--no-warnings', `https://www.youtube.com/watch?v=${videoId}`],
        { timeoutMs: 12000 },
      )
      const j = JSON.parse(stdout)
      const stream: Stream = {
        url: j.url,
        headers: j.http_headers ?? {},
        expiresAt: parseExpiry(j.url),
      }
      cache.set(videoId, stream)
      return stream
    } catch (e) {
      lastErr = e
      log('debug', `format ${selector} failed for ${videoId}`, { error: String(e) })
    }
  }
  throw lastErr instanceof Error ? lastErr : new YtDlpError(null, 'all selectors failed')
}
