import type { SearchResult } from '@/lib/types/state'
import { runYtDlp } from './runner'

const SEARCH_LIMIT = 10

export const searchYouTube = async (query: string): Promise<SearchResult[]> => {
  const stdout = await runYtDlp(
    ['--dump-json', '--flat-playlist', '--no-warnings', `ytsearch${SEARCH_LIMIT}:${query}`],
    { timeoutMs: 8000 },
  )
  return stdout
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const j = JSON.parse(line)
      return {
        videoId: j.id,
        title: j.title,
        thumbnail: j.thumbnail ?? '',
        durationSec: Number(j.duration ?? 0),
        channel: j.channel ?? j.uploader ?? '',
      } satisfies SearchResult
    })
}
