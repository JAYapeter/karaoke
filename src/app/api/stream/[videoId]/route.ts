import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { ensureLocal } from '@/lib/ytdlp/media-cache'
import { ROUTE_WAIT_MS } from '@/lib/config'
import { log } from '@/lib/log'

export type ParsedRange = { start: number; end: number } | 'unsatisfiable' | null

/** `bytes=START-END` | `bytes=START-` | `bytes=-SUFFIX`. null = serve the whole file. */
export const parseRange = (header: string | null, size: number): ParsedRange => {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, rawStart = '', rawEnd = ''] = m
  if (rawStart === '' && rawEnd === '') return null

  let start: number
  let end: number
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (suffix <= 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}

const fileBody = (file: string, start: number, end: number): ReadableStream =>
  Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream

export const GET = async (
  req: Request,
  ctx: { params: Promise<{ videoId: string }> },
): Promise<Response> => {
  const { videoId } = await ctx.params

  // Blocks until the song is on disk. Normally a no-op — the queue prefetch has
  // already fetched it — but the first song of a session waits out its download.
  // No response byte can be written before this resolves, so the wait is capped: past
  // ROUTE_WAIT_MS we give up on *this request* and let the client report an error
  // rather than leave the room staring at a frozen screen. The download itself is left
  // running, so it will be there next time.
  let file: string
  try {
    const pending = ensureLocal(videoId)
    pending.catch(() => {}) // we may abandon it below; don't let that go unhandled
    let timer: NodeJS.Timeout | undefined
    file = await Promise.race([
      pending,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`still downloading after ${ROUTE_WAIT_MS}ms`)), ROUTE_WAIT_MS)
      }),
    ]).finally(() => clearTimeout(timer))
  } catch (e) {
    log('error', `media unavailable for ${videoId}`, { error: String(e) })
    // 503 → the <video> load fails → VideoPlayer reports player.error → toast + skip.
    return new Response('media unavailable', { status: 503 })
  }

  const size = (await stat(file).catch(() => null))?.size ?? 0
  if (size === 0) return new Response('media unavailable', { status: 503 })

  const base = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
  const range = parseRange(req.headers.get('Range'), size)

  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } })
  }
  if (range) {
    return new Response(fileBody(file, range.start, range.end), {
      status: 206,
      headers: {
        ...base,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      },
    })
  }
  return new Response(fileBody(file, 0, size - 1), {
    status: 200,
    headers: { ...base, 'Content-Length': String(size) },
  })
}
