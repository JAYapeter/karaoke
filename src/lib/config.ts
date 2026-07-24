import os from 'node:os'
import path from 'node:path'

export const PORT = Number(process.env.PORT ?? 3000)

// Cap on downloaded video height. YouTube only offers H.264 up to 1080p — above that
// it's VP9/AV1 only, which Safari can't hardware-decode. Lower it on a slow link.
export const MAX_HEIGHT = Number(process.env.KARAOKE_MAX_HEIGHT ?? 1080)

// 1080p only exists as *adaptive* (video-only) DASH. The only muxed format YouTube
// still serves is itag 18 — 640x360, and 22 kHz lo-fi audio on plenty of videos —
// which is exactly what capped both picture and sound before. `ba[ext=m4a]` resolves
// to itag 140 (44.1 kHz / 128k AAC) on essentially every video; the two progressive
// rungs are a last resort for videos with no adaptive formats at all.
export const MEDIA_FORMAT =
  `bv*[ext=mp4][vcodec^=avc1][height<=${MAX_HEIGHT}]+ba[ext=m4a]/b[ext=mp4]/b`

// Livestreams never finish downloading (they fill the disk at ~2.4 GB/h). The
// duration cap keeps a multi-hour compilation from stalling the party behind a
// 500 MB download. `<?` passes when duration is unknown.
export const MATCH_FILTER = '!is_live & duration<?5400'

// Deliberately outside the project dir: Next's dev server watches the repo, and
// dropping 80 MB files into it churns the file watcher. Read lazily so tests can
// point it at a temp dir.
export const cacheDir = (): string =>
  process.env.KARAOKE_CACHE_DIR ?? path.join(os.tmpdir(), 'karaoke-media')

export const CACHE_MAX_BYTES = Number(process.env.KARAOKE_CACHE_MAX_BYTES ?? 10 * 1024 ** 3)

export const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

// How long a playback request will wait for a cold download before giving up. Separate
// from DOWNLOAD_TIMEOUT_MS on purpose: the download keeps running in the background (so
// a retry or the next time round is instant), but the room never sits looking at a
// frozen screen for ten minutes. Giving up surfaces the normal error → toast → skip.
export const ROUTE_WAIT_MS = 2 * 60 * 1000

// Never evict a file this recently used — it is probably the song playing right now.
export const EVICT_MIN_AGE_MS = 20 * 60 * 1000

// How long a failed download is remembered, so a private/blocked video isn't
// retried on every state broadcast.
export const FAILURE_TTL_MS = 60 * 1000

export const PITCH_MIN = -6
export const PITCH_MAX = 6

export const META_CACHE_MS = 5 * 60 * 1000

export const RECENT_MSG_IDS_PER_SESSION = 100

export const POSITION_HEARTBEAT_MS = 1000

export const YTDLP_BIN = process.env.YTDLP_BIN ?? 'yt-dlp'
