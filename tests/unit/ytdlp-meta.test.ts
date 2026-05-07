import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ytdlp/runner', () => ({ runYtDlp: vi.fn() }))
import { runYtDlp } from '@/lib/ytdlp/runner'
import { fetchMeta, _resetMetaCache } from '@/lib/ytdlp/meta'

beforeEach(() => {
  ;(runYtDlp as any).mockReset()
  _resetMetaCache()
})

describe('fetchMeta', () => {
  it('returns parsed metadata', async () => {
    ;(runYtDlp as any).mockResolvedValue(
      JSON.stringify({ title: 'Hi', thumbnail: 't', duration: 200 }),
    )
    expect(await fetchMeta('xxx')).toEqual({ title: 'Hi', thumbnail: 't', durationSec: 200 })
  })

  it('caches within window', async () => {
    ;(runYtDlp as any).mockResolvedValueOnce(
      JSON.stringify({ title: 'A', thumbnail: 'a', duration: 100 }),
    )
    const a = await fetchMeta('vid')
    const b = await fetchMeta('vid')
    expect(a).toEqual(b)
    expect(runYtDlp).toHaveBeenCalledTimes(1)
  })
})
