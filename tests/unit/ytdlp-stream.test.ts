import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ytdlp/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ytdlp/runner')>()
  return { ...actual, runYtDlp: vi.fn() }
})
import { runYtDlp, YtDlpError } from '@/lib/ytdlp/runner'
import { resolveStream, _resetStreamCache } from '@/lib/ytdlp/stream'

beforeEach(() => {
  ;(runYtDlp as any).mockReset()
  _resetStreamCache()
})

describe('resolveStream', () => {
  it('returns URL + headers from first selector that succeeds', async () => {
    ;(runYtDlp as any).mockResolvedValueOnce(
      JSON.stringify({ url: 'https://cdn/x.mp4', http_headers: { 'User-Agent': 'UA' } }),
    )
    const r = await resolveStream('vid')
    expect(r.url).toBe('https://cdn/x.mp4')
    expect(r.headers['User-Agent']).toBe('UA')
    expect(runYtDlp).toHaveBeenCalledTimes(1)
  })

  it('falls through ladder when first selector fails', async () => {
    ;(runYtDlp as any)
      .mockRejectedValueOnce(new YtDlpError(1, 'no format'))
      .mockResolvedValueOnce(JSON.stringify({ url: 'https://cdn/y.mp4', http_headers: {} }))
    const r = await resolveStream('vid')
    expect(r.url).toBe('https://cdn/y.mp4')
    expect(runYtDlp).toHaveBeenCalledTimes(2)
  })

  it('throws when all selectors fail', async () => {
    ;(runYtDlp as any).mockRejectedValue(new YtDlpError(1, 'no format'))
    await expect(resolveStream('vid')).rejects.toThrow()
  })

  it('caches result until expiresAt', async () => {
    ;(runYtDlp as any).mockResolvedValueOnce(
      JSON.stringify({ url: 'https://cdn/?expire=9999999999', http_headers: {} }),
    )
    await resolveStream('vid')
    await resolveStream('vid')
    expect(runYtDlp).toHaveBeenCalledTimes(1)
  })
})
