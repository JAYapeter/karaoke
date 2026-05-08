export const PORT = Number(process.env.PORT ?? 3000)

// yt-dlp format selectors, in order. First success wins.
// `[protocol=https]` is REQUIRED: without it, yt-dlp can return HLS playlists
// (`application/vnd.apple.mpegurl`) that match our `[ext=mp4]` filter but reference
// cross-origin segments, which taints the <video> element and silences Web Audio.
export const FORMAT_SELECTORS = [
  'best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720][protocol=https]',
  'best[ext=mp4][acodec!=none][protocol=https]',
  'best[acodec!=none][vcodec!=none][protocol=https]',
] as const

export const PITCH_MIN = -6
export const PITCH_MAX = 6

export const URL_REFRESH_LEAD_MS = 5 * 60 * 1000 // refresh if expiry within 5 min

export const META_CACHE_MS = 5 * 60 * 1000

export const RECENT_MSG_IDS_PER_SESSION = 100

export const POSITION_HEARTBEAT_MS = 1000

export const YTDLP_BIN = process.env.YTDLP_BIN ?? 'yt-dlp'
