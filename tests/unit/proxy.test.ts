import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ensureLocal = vi.fn()
vi.mock('@/lib/ytdlp/media-cache', () => ({ ensureLocal: (id: string) => ensureLocal(id) }))

import { GET, parseRange } from '@/app/api/stream/[videoId]/route'

const BODY = 'abcdefghij' // 10 bytes
let dir: string
let file: string

beforeEach(async () => {
  ensureLocal.mockReset()
  dir = await mkdtemp(path.join(tmpdir(), 'karaoke-route-'))
  file = path.join(dir, 'v1.mp4')
  await writeFile(file, BODY)
  ensureLocal.mockResolvedValue(file)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const get = (headers: Record<string, string> = {}) =>
  GET(new Request('http://localhost/api/stream/v1', { headers }), {
    params: Promise.resolve({ videoId: 'v1' }),
  })

describe('parseRange', () => {
  it('returns null with no header or an unparseable one', () => {
    expect(parseRange(null, 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
    expect(parseRange('bytes=-', 10)).toBeNull()
  })

  it('parses closed, open-ended and suffix ranges, clamping the end to the file', () => {
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 })
    expect(parseRange('bytes=0-999', 10)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-999', 10)).toEqual({ start: 0, end: 9 })
  })

  it('flags ranges that start past the end of the file', () => {
    expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=99-200', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 10)).toBe('unsatisfiable')
  })
})

describe('stream route', () => {
  it('serves the whole file as 200 with Content-Length and Accept-Ranges', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Content-Length')).toBe('10')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await res.text()).toBe(BODY)
  })

  it('serves 206 with Content-Range and only the requested bytes', async () => {
    const res = await get({ Range: 'bytes=2-5' })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(res.headers.get('Content-Length')).toBe('4')
    expect(await res.text()).toBe('cdef')
  })

  it('serves 206 for an open-ended range', async () => {
    const res = await get({ Range: 'bytes=7-' })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 7-9/10')
    expect(await res.text()).toBe('hij')
  })

  it('returns 416 with Content-Range */size for an unsatisfiable range', async () => {
    const res = await get({ Range: 'bytes=999-' })
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('returns 503 when the download fails, so the client reports player.error', async () => {
    ensureLocal.mockRejectedValue(new Error('yt-dlp exited 1'))
    expect((await get()).status).toBe(503)
  })

  it('returns 503 rather than a 0-byte body when the cached file is empty', async () => {
    await writeFile(file, '')
    expect((await get()).status).toBe(503)
  })
})
