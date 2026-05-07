import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ytdlp/runner', () => ({
  runYtDlp: vi.fn(),
}))

import { runYtDlp } from '@/lib/ytdlp/runner'
import { searchYouTube } from '@/lib/ytdlp/search'

describe('searchYouTube', () => {
  it('parses ndjson result lines into SearchResult[]', async () => {
    const lines = [
      JSON.stringify({ id: 'abc', title: 'Foo', thumbnail: 't1', duration: 230, channel: 'C1' }),
      JSON.stringify({ id: 'def', title: 'Bar', thumbnail: 't2', duration: 180, channel: 'C2' }),
    ].join('\n')
    ;(runYtDlp as any).mockResolvedValue(lines + '\n')

    const out = await searchYouTube('test')
    expect(out).toEqual([
      { videoId: 'abc', title: 'Foo', thumbnail: 't1', durationSec: 230, channel: 'C1' },
      { videoId: 'def', title: 'Bar', thumbnail: 't2', durationSec: 180, channel: 'C2' },
    ])
    expect(runYtDlp).toHaveBeenCalledWith(
      expect.arrayContaining(['--dump-json', '--flat-playlist', 'ytsearch10:test']),
      expect.any(Object),
    )
  })

  it('returns [] on empty stdout', async () => {
    ;(runYtDlp as any).mockResolvedValue('')
    expect(await searchYouTube('q')).toEqual([])
  })
})
