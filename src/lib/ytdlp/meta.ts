import { runYtDlp } from './runner'
import { META_CACHE_MS } from '@/lib/config'

export type Meta = { title: string; thumbnail: string; durationSec: number }

const cache = new Map<string, { value: Meta; expiresAt: number }>()
export const _resetMetaCache = () => cache.clear()

export const fetchMeta = async (videoId: string): Promise<Meta> => {
  const now = Date.now()
  const hit = cache.get(videoId)
  if (hit && hit.expiresAt > now) return hit.value
  const stdout = await runYtDlp(
    ['--dump-json', '--no-warnings', `https://www.youtube.com/watch?v=${videoId}`],
    { timeoutMs: 10000 },
  )
  const j = JSON.parse(stdout)
  const meta: Meta = {
    title: j.title,
    thumbnail: j.thumbnail ?? '',
    durationSec: Number(j.duration ?? 0),
  }
  cache.set(videoId, { value: meta, expiresAt: now + META_CACHE_MS })
  return meta
}
