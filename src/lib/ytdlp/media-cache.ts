import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { runYtDlp } from './runner'
import {
  CACHE_MAX_BYTES, DOWNLOAD_TIMEOUT_MS, EVICT_MIN_AGE_MS, FAILURE_TTL_MS,
  MATCH_FILTER, MEDIA_FORMAT, cacheDir,
} from '@/lib/config'
import { log } from '@/lib/log'

/**
 * Songs are downloaded and muxed to disk before playback instead of being byte-proxied
 * from YouTube. Two reasons:
 *
 *  - 1080p only exists as adaptive video-only DASH, so audio and video must be merged;
 *    the muxed formats a proxy can stream top out at itag 18 (360p / 22 kHz audio).
 *  - a local file removes network jitter, mid-song URL expiry, and cross-origin taint
 *    from the playback path entirely.
 *
 * A karaoke queue gives a natural prefetch window, so the download is usually finished
 * long before the song reaches the front.
 */

// server.ts (run by tsx) and the Next-bundled route handler each get their own module
// registry, so plain module-level state would exist TWICE and the prefetch would never
// dedupe against the on-demand download. Pin it to globalThis so both halves share it.
type State = {
  inflight: Map<string, Promise<string>>
  failures: Map<string, number>
  chain: Promise<unknown>
}
const g = globalThis as typeof globalThis & { __karaokeMedia?: State }
const state: State = (g.__karaokeMedia ??= {
  inflight: new Map(),
  failures: new Map(),
  chain: Promise.resolve(),
})

export const _resetMediaCache = () => {
  state.inflight.clear()
  state.failures.clear()
  state.chain = Promise.resolve()
}

// videoId arrives from a URL path and becomes part of a filesystem path, so it has to
// be constrained before it is joined: '../../etc/passwd' would otherwise escape the
// cache dir and serve an arbitrary file to anyone on the WiFi. Deliberately not pinned
// to YouTube's current 11-char id length — no separators is what makes it safe.
const VIDEO_ID = /^[A-Za-z0-9_-]{1,32}$/

// Cached songs get a marker in the name, and eviction only ever considers files that
// carry it. Without one, a videoId-shaped filename is indistinguishable from a user's
// own video — pointing KARAOKE_CACHE_DIR at a folder holding "holiday.mp4" or
// "wedding-2019.mp4" would silently delete them, which this was measured doing.
const SUFFIX = '.karaoke.mp4'
const OURS = /^[A-Za-z0-9_-]{1,32}\.karaoke\.mp4$/

const finalPath = (videoId: string) => {
  if (!VIDEO_ID.test(videoId)) throw new Error(`invalid videoId: ${JSON.stringify(videoId)}`)
  return path.join(cacheDir(), `${videoId}${SUFFIX}`)
}

const sizeOf = async (p: string): Promise<number> => {
  try {
    const st = await fs.stat(p)
    return st.isFile() ? st.size : 0
  } catch {
    return 0
  }
}

/** Trim the cache to CACHE_MAX_BYTES, oldest first. Never throws. */
const evict = async (): Promise<void> => {
  try {
    const dir = cacheDir()
    const now = Date.now()
    const files: { p: string; id: string; size: number; mtime: number }[] = []
    for (const name of await fs.readdir(dir)) {
      const p = path.join(dir, name)
      const st = await fs.stat(p).catch(() => null)
      if (!st?.isFile()) continue
      if (name.startsWith('.part-')) {
        // Intermediates from an aborted download. Only sweep ones too old to belong
        // to a live attempt — a concurrent download's files match this prefix too.
        if (now - st.mtimeMs > DOWNLOAD_TIMEOUT_MS) await fs.rm(p, { force: true })
        continue
      }
      // Only ever delete files THIS cache wrote — see SUFFIX above.
      if (!OURS.test(name)) continue
      files.push({ p, id: name.slice(0, -SUFFIX.length), size: st.size, mtime: st.mtimeMs })
    }
    let total = files.reduce((a, f) => a + f.size, 0)
    if (total <= CACHE_MAX_BYTES) return
    files.sort((a, b) => a.mtime - b.mtime)
    for (const f of files) {
      if (total <= CACHE_MAX_BYTES) break
      // Deleting the file being played would stall playback with no recovery path.
      if (now - f.mtime < EVICT_MIN_AGE_MS) continue
      if (state.inflight.has(f.id)) continue
      await fs.rm(f.p, { force: true })
      total -= f.size
      log('info', `media cache: evicted ${f.id}`)
    }
  } catch (e) {
    log('warn', 'media cache eviction failed', { error: String(e) })
  }
}

const download = async (videoId: string): Promise<string> => {
  const dir = cacheDir()
  await fs.mkdir(dir, { recursive: true })
  // Unique per attempt, for two separate reasons:
  //  - a leftover .part file from a killed run makes yt-dlp exit 0 WITHOUT downloading
  //    ("has already been downloaded"), which would publish a truncated file;
  //  - an ffmpeg orphaned by a previous timeout must never share a path with a live
  //    attempt, since rename() moves the inode and the orphan keeps writing.
  const template = path.join(dir, `.part-${videoId}-${randomBytes(4).toString('hex')}.%(ext)s`)
  const stdout = await runYtDlp(
    [
      '-f', MEDIA_FORMAT,
      '--merge-output-format', 'mp4',
      // --merge-output-format is "ignored if no merge is required", so the progressive
      // fallback rungs could hand back a webm. We rename to <id>.mp4 and serve
      // Content-Type: video/mp4, so force the container to actually be mp4. No-op when
      // it already is.
      '--remux-video', 'mp4',
      '--match-filter', MATCH_FILTER,
      '--force-overwrites',
      '--no-playlist', '--no-warnings', '--no-progress',
      // Don't guess the produced filename: the fallback rungs can pick another
      // container, and a match-filter rejection writes nothing at all.
      '--print', 'after_move:filepath',
      '-o', template,
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { timeoutMs: DOWNLOAD_TIMEOUT_MS },
  )

  // Two different exit-0-but-no-file cases, worth telling apart because the fixes are
  // nothing alike:
  //  - nothing printed  → --match-filter rejected it (livestream / over the duration cap)
  //  - a path printed that does not exist → the merge step never ran. Almost always a
  //    missing ffmpeg; yt-dlp only warns about that on stderr, which --no-warnings eats.
  const produced = stdout.trim().split('\n').filter(Boolean).pop()
  if (!produced) {
    throw new Error(`${videoId} was skipped (livestream, or longer than the duration cap)`)
  }
  if ((await sizeOf(produced)) === 0) {
    throw new Error(
      `${videoId} downloaded but was never merged — is ffmpeg installed? (brew install ffmpeg)`,
    )
  }
  const dest = finalPath(videoId)
  await fs.rename(produced, dest)
  return dest
}

/** Path to a playable local mp4, downloading it first if needed. */
export const ensureLocal = async (videoId: string): Promise<string> => {
  const dest = finalPath(videoId)
  if ((await sizeOf(dest)) > 0) {
    const now = new Date()
    await fs.utimes(dest, now, now).catch(() => {}) // LRU touch
    return dest
  }

  const existing = state.inflight.get(videoId)
  if (existing) return existing

  const failedAt = state.failures.get(videoId)
  if (failedAt !== undefined && Date.now() - failedAt < FAILURE_TTL_MS) {
    throw new Error(`download for ${videoId} failed recently`)
  }

  const p = download(videoId)
    .then((out) => {
      state.failures.delete(videoId)
      return out
    })
    .catch((e) => {
      state.failures.set(videoId, Date.now())
      throw e
    })
    .finally(() => {
      state.inflight.delete(videoId)
      // On the failure path too: a run that died partway leaves .part-* intermediates,
      // and if every download fails they'd never be swept at all.
      void evict() // never throws; not awaited so playback isn't held up by a scan
    })
  state.inflight.set(videoId, p)
  return p
}

/**
 * Warm the cache for an upcoming song. Fire-and-forget and serialized: N phones
 * queueing N songs at once must not starve the download of the song that is actually
 * playing, which goes through ensureLocal directly.
 */
export const prefetch = (videoId: string): void => {
  if (!videoId) return
  if (state.inflight.has(videoId)) return
  const failedAt = state.failures.get(videoId)
  if (failedAt !== undefined && Date.now() - failedAt < FAILURE_TTL_MS) return
  state.chain = state.chain
    .then(async () => {
      if ((await sizeOf(finalPath(videoId))) > 0) return
      await ensureLocal(videoId)
    })
    // One bad videoId must not leave the chain permanently rejected.
    .catch((e) => log('debug', `prefetch failed for ${videoId}`, { error: String(e) }))
}
