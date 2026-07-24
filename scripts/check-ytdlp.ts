import { spawn } from 'node:child_process'
import { runYtDlp, YtDlpError } from '../src/lib/ytdlp/runner'
import { MATCH_FILTER, MEDIA_FORMAT } from '../src/lib/config'
import { log } from '../src/lib/log'

// Has both adaptive video and m4a audio, so it exercises the merge rung of MEDIA_FORMAT.
const TEST_VIDEO_ID = 'dQw4w9WgXcQ'

const hasFfmpeg = () =>
  new Promise<boolean>((resolve) => {
    const c = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    c.on('error', () => resolve(false))
    c.on('close', (code) => resolve(code === 0))
  })

const main = async () => {
  try {
    const v = await runYtDlp(['--version'])
    log('info', `yt-dlp version: ${v.trim()}`)
  } catch {
    log('error', 'yt-dlp not found or not executable. Install with `brew install yt-dlp`.')
    process.exit(1)
  }

  // yt-dlp needs ffmpeg to merge YouTube's separate 1080p video and audio streams.
  // Without it yt-dlp still exits 0 but writes no merged file, so nothing plays.
  if (!(await hasFfmpeg())) {
    log('error', 'ffmpeg not found. Install with `brew install ffmpeg` — without it, no song will play.')
    process.exit(1)
  }
  log('info', 'ffmpeg ready')

  try {
    const out = await runYtDlp(
      [
        '-f', MEDIA_FORMAT,
        '--match-filter', MATCH_FILTER,
        '--no-playlist', '--no-warnings', '--no-progress',
        '--print', '%(format_id)s %(width)sx%(height)s',
        `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`,
      ],
      { timeoutMs: 30000 },
    )
    const picked = out.trim()
    log('info', `smoke OK — ${TEST_VIDEO_ID} resolves to ${picked}`)
    // A '+' means video and audio were selected separately, i.e. the merge path that
    // gets us above 360p. Its absence means we silently dropped to progressive.
    if (!picked.includes('+')) {
      log('warn', `expected a merged (video+audio) format, got "${picked}" — quality will be capped`)
      process.exit(3)
    }
  } catch (e) {
    if (e instanceof YtDlpError) log('error', `smoke FAILED: ${e.stderr.trim()}`)
    else log('error', `smoke FAILED: ${String(e)}`)
    process.exit(2)
  }
}

main()
