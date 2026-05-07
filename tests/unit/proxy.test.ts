import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ytdlp/stream', () => ({
  resolveStream: vi.fn().mockResolvedValue({
    url: 'https://upstream/test.mp4',
    headers: { 'User-Agent': 'UA' },
    expiresAt: Date.now() + 3600_000,
  }),
  _evictStream: vi.fn(),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { GET } from '@/app/api/stream/[videoId]/route'

beforeEach(() => fetchMock.mockReset())

describe('stream proxy', () => {
  it('relays 206 with Content-Range when client sends Range', async () => {
    fetchMock.mockResolvedValue(new Response('partial', {
      status: 206,
      headers: { 'Content-Range': 'bytes 0-99/200', 'Content-Type': 'video/mp4' },
    }))
    const req = new Request('http://localhost/api/stream/v1', {
      headers: { Range: 'bytes=0-99' },
    })
    const res = await GET(req, { params: Promise.resolve({ videoId: 'v1' }) })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/200')
  })

  it('relays 200 when no Range', async () => {
    fetchMock.mockResolvedValue(new Response('whole', {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1'),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(200)
  })

  it('on upstream 403 evicts cache and retries once', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1'),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('relays 416 unsatisfiable range', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 416, headers: { 'Content-Range': 'bytes */200' } }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1', { headers: { Range: 'bytes=999999-' } }),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */200')
  })

  it('on mid-range upstream 5xx, evicts and retries once; if still 5xx, relays 502', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1', { headers: { Range: 'bytes=0-99' } }),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('on a non-range upstream 5xx, evicts and retries; if recovered, relays 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1'),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
