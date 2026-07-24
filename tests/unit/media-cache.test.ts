import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readdir, rm, stat, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

vi.mock('@/lib/ytdlp/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ytdlp/runner')>()
  return { ...actual, runYtDlp: vi.fn() }
})
import { runYtDlp } from '@/lib/ytdlp/runner'
import { ensureLocal, prefetch, _resetMediaCache } from '@/lib/ytdlp/media-cache'

const mockRun = runYtDlp as unknown as ReturnType<typeof vi.fn>
let dir: string

/** Stand in for yt-dlp: write the file it was told to write, print its path. */
const fakeDownload = (bytes = 'DATA', delayMs = 0) => async (args: string[]) => {
  const template = args[args.indexOf('-o') + 1]!
  const out = template.replace('%(ext)s', 'mp4')
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
  await writeFile(out, bytes)
  return `${out}\n`
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'karaoke-cache-'))
  process.env.KARAOKE_CACHE_DIR = dir
  mockRun.mockReset()
  _resetMediaCache()
})
afterEach(async () => {
  delete process.env.KARAOKE_CACHE_DIR
  await rm(dir, { recursive: true, force: true })
})

describe('ensureLocal', () => {
  it('downloads once and returns the marked cache path', async () => {
    mockRun.mockImplementation(fakeDownload())
    const p = await ensureLocal('vid')
    expect(p).toBe(path.join(dir, 'vid.karaoke.mp4'))
    expect((await stat(p)).size).toBe(4)
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it('renames the path yt-dlp actually reports, not a reconstructed one', async () => {
    mockRun.mockImplementation(async (args: string[]) => {
      // yt-dlp's real output name need not match our template guess (post-processors
      // rewrite it), so we must use the path it prints.
      const out = path.join(dir, 'yt-dlp-picked-this.mp4')
      await writeFile(out, 'DATA')
      return `${out}\n`
    })
    expect(await ensureLocal('vid')).toBe(path.join(dir, 'vid.karaoke.mp4'))
  })

  it('forces an mp4 container, since the file is served as Content-Type: video/mp4', async () => {
    mockRun.mockImplementation(fakeDownload())
    await ensureLocal('vid')
    const args = mockRun.mock.calls[0]![0] as string[]
    expect(args[args.indexOf('--remux-video') + 1]).toBe('mp4')
  })

  it('reuses an already-downloaded file without spawning yt-dlp', async () => {
    mockRun.mockImplementation(fakeDownload())
    await ensureLocal('vid')
    await ensureLocal('vid')
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent callers onto a single download', async () => {
    mockRun.mockImplementation(fakeDownload('DATA', 20))
    const [a, b, c] = await Promise.all([ensureLocal('vid'), ensureLocal('vid'), ensureLocal('vid')])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it('uses a unique temp name per attempt so a stale .part cannot be adopted', async () => {
    const templates: string[] = []
    mockRun.mockImplementation(async (args: string[]) => {
      templates.push(args[args.indexOf('-o') + 1]!)
      throw new Error('boom')
    })
    await expect(ensureLocal('vid')).rejects.toThrow()
    _resetMediaCache() // clear the negative cache to allow an immediate retry
    await expect(ensureLocal('vid')).rejects.toThrow()
    expect(templates[0]).not.toBe(templates[1])
    expect(templates[0]).toContain('.part-vid-')
  })

  it('treats an exit-0 run that printed nothing as a match-filter rejection', async () => {
    mockRun.mockResolvedValue('') // livestream / too long → yt-dlp writes nothing
    await expect(ensureLocal('live')).rejects.toThrow(/livestream, or longer than/)
  })

  it('names ffmpeg when yt-dlp reports a path it never actually produced', async () => {
    // Exactly what a missing ffmpeg does: exit 0, print the merged path, merge nothing.
    mockRun.mockImplementation(async (args: string[]) => {
      const out = args[args.indexOf('-o') + 1]!.replace('%(ext)s', 'mp4')
      return `${out}\n` // deliberately never created
    })
    await expect(ensureLocal('vid')).rejects.toThrow(/ffmpeg/)
  })

  it('does not retry a just-failed download, then clears the in-flight entry', async () => {
    mockRun.mockRejectedValue(new Error('unavailable'))
    await expect(ensureLocal('vid')).rejects.toThrow('unavailable')
    await expect(ensureLocal('vid')).rejects.toThrow(/failed recently/)
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it('recovers after a failure once the cooldown is reset', async () => {
    mockRun.mockRejectedValueOnce(new Error('transient'))
    await expect(ensureLocal('vid')).rejects.toThrow('transient')
    _resetMediaCache()
    mockRun.mockImplementation(fakeDownload())
    expect(await ensureLocal('vid')).toBe(path.join(dir, 'vid.karaoke.mp4'))
  })

  it('rejects a videoId that would escape the cache dir', async () => {
    mockRun.mockImplementation(fakeDownload())
    for (const bad of ['../../../etc/passwd', 'a/b', '..', 'has space', '']) {
      await expect(ensureLocal(bad)).rejects.toThrow(/invalid videoId/)
    }
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('passes --match-filter so livestreams are never downloaded', async () => {
    mockRun.mockImplementation(fakeDownload())
    await ensureLocal('vid')
    const args = mockRun.mock.calls[0]![0] as string[]
    expect(args[args.indexOf('--match-filter') + 1]).toContain('!is_live')
    expect(args).toContain('--force-overwrites')
  })
})

describe('prefetch', () => {
  it('serializes downloads so a queue burst cannot run them all at once', async () => {
    let concurrent = 0
    let peak = 0
    mockRun.mockImplementation(async (args: string[]) => {
      concurrent++
      peak = Math.max(peak, concurrent)
      await new Promise((r) => setTimeout(r, 15))
      const out = args[args.indexOf('-o') + 1]!.replace('%(ext)s', 'mp4')
      await writeFile(out, 'DATA')
      concurrent--
      return `${out}\n`
    })
    prefetch('a')
    prefetch('b')
    prefetch('c')
    await new Promise((r) => setTimeout(r, 150))
    expect(peak).toBe(1)
    expect(mockRun).toHaveBeenCalledTimes(3)
  })

  it('keeps working after one videoId fails', async () => {
    mockRun.mockImplementation(async (args: string[]) => {
      const out = args[args.indexOf('-o') + 1]!.replace('%(ext)s', 'mp4')
      if (out.includes('.part-bad-')) throw new Error('private video')
      await writeFile(out, 'DATA')
      return `${out}\n`
    })
    prefetch('bad')
    prefetch('good')
    await new Promise((r) => setTimeout(r, 150))
    expect((await readdir(dir)).filter((f) => f === 'good.karaoke.mp4')).toEqual(['good.karaoke.mp4'])
  })

  it('skips a videoId that is already cached', async () => {
    await writeFile(path.join(dir, 'vid.karaoke.mp4'), 'DATA')
    prefetch('vid')
    await new Promise((r) => setTimeout(r, 50))
    expect(mockRun).not.toHaveBeenCalled()
  })
})

describe('eviction', () => {
  it('drops the oldest files past the cap but never a recently used one', async () => {
    process.env.KARAOKE_CACHE_MAX_BYTES = '10'
    vi.resetModules()
    const cache = await import('@/lib/ytdlp/media-cache')
    cache._resetMediaCache()

    // 'old' is well past EVICT_MIN_AGE_MS; 'recent' is the song that just started.
    const old = path.join(dir, 'old.karaoke.mp4')
    const recent = path.join(dir, 'recent.karaoke.mp4')
    await writeFile(old, 'X'.repeat(50))
    await writeFile(recent, 'Y'.repeat(50))
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    await utimes(old, hourAgo, hourAgo)

    mockRun.mockImplementation(fakeDownload())
    await cache.ensureLocal('new')
    await new Promise((r) => setTimeout(r, 80)) // evict() runs detached

    const left = await readdir(dir)
    expect(left).not.toContain('old.karaoke.mp4')
    expect(left).toContain('recent.karaoke.mp4')
    expect(left).toContain('new.karaoke.mp4')
    delete process.env.KARAOKE_CACHE_MAX_BYTES
  })

  it("never deletes files the cache did not write, even videoId-shaped ones", async () => {
    process.env.KARAOKE_CACHE_MAX_BYTES = '10'
    vi.resetModules()
    const cache = await import('@/lib/ytdlp/media-cache')
    cache._resetMediaCache()

    // KARAOKE_CACHE_DIR is user-facing; someone may point it at a folder of their own
    // videos. 'holiday' and 'wedding-2019' are valid videoId shapes — the marker suffix
    // is what distinguishes ours, not the id pattern.
    const theirs = ['holiday.mp4', 'wedding-2019.mp4', 'baby first steps.mp4']
    const yearAgo = new Date(Date.now() - 365 * 864e5)
    for (const name of theirs) {
      await writeFile(path.join(dir, name), 'X'.repeat(500))
      await utimes(path.join(dir, name), yearAgo, yearAgo)
    }

    mockRun.mockImplementation(fakeDownload())
    await cache.ensureLocal('newsong')
    await new Promise((r) => setTimeout(r, 80))

    const left = await readdir(dir)
    for (const name of theirs) expect(left).toContain(name)
    delete process.env.KARAOKE_CACHE_MAX_BYTES
  })

  it('sweeps stale .part-* intermediates but leaves fresh ones alone', async () => {
    const stale = path.join(dir, '.part-gone-1111.f137.mp4')
    const live = path.join(dir, '.part-busy-2222.f137.mp4')
    await writeFile(stale, 'X')
    await writeFile(live, 'Y')
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await utimes(stale, dayAgo, dayAgo)

    mockRun.mockImplementation(fakeDownload())
    await ensureLocal('vid')
    await new Promise((r) => setTimeout(r, 80))

    const left = await readdir(dir)
    expect(left).not.toContain('.part-gone-1111.f137.mp4')
    expect(left).toContain('.part-busy-2222.f137.mp4')
  })
})
