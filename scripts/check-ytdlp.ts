import { runYtDlp, YtDlpError } from '../src/lib/ytdlp/runner'
import { resolveStream } from '../src/lib/ytdlp/stream'
import { log } from '../src/lib/log'

const TEST_VIDEO_ID = 'jNQXAC9IVRw'

const main = async () => {
  try {
    const v = await runYtDlp(['--version'])
    log('info', `yt-dlp version: ${v.trim()}`)
  } catch (e) {
    log('error', 'yt-dlp not found or not executable. Install with `brew install yt-dlp`.')
    process.exit(1)
  }
  try {
    const s = await resolveStream(TEST_VIDEO_ID)
    log('info', `smoke OK — got URL for ${TEST_VIDEO_ID} (expires ${new Date(s.expiresAt).toISOString()})`)
  } catch (e) {
    if (e instanceof YtDlpError) log('error', `smoke FAILED: ${e.stderr.trim()}`)
    else log('error', `smoke FAILED: ${String(e)}`)
    process.exit(2)
  }
}

main()
