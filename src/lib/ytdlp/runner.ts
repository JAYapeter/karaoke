import { spawn, type ChildProcess } from 'node:child_process'
import { YTDLP_BIN } from '@/lib/config'

export class YtDlpError extends Error {
  constructor(public code: number | null, public stderr: string) {
    super(`yt-dlp exited with code ${code}: ${stderr.trim()}`)
  }
}

/** Kill a child and everything it spawned (yt-dlp's ffmpeg lives in the same group). */
const killTree = (child: ChildProcess, signal: NodeJS.Signals) => {
  try {
    if (child.pid) process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    try { child.kill(signal) } catch {}
  }
}

// `detached` below moves each child into its own process group, which is what lets us
// kill yt-dlp *and* its ffmpeg together. The cost is that terminal signals no longer
// reach them: start.command tells the user to close the window to stop the server, and
// without this an in-flight download would keep running and keep writing after Node
// exits. So we track live children and take them down with us.
const live = new Set<ChildProcess>()
const g = globalThis as typeof globalThis & { __karaokeYtDlpExitHooked?: boolean }
if (!g.__karaokeYtDlpExitHooked) {
  g.__karaokeYtDlpExitHooked = true
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => {
      for (const c of live) killTree(c, 'SIGKILL')
      process.exit(sig === 'SIGINT' ? 130 : 143)
    })
  }
  process.once('exit', () => {
    for (const c of live) killTree(c, 'SIGKILL')
  })
}

export const runYtDlp = (args: string[], opts: { timeoutMs?: number } = {}): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    live.add(child)
    let stdout = ''
    let stderr = ''
    const done = () => live.delete(child)
    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          killTree(child, 'SIGKILL')
          done()
          reject(new YtDlpError(null, `timeout after ${opts.timeoutMs}ms`))
        }, opts.timeoutMs)
      : null
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => {
      if (timeout) clearTimeout(timeout)
      done()
      reject(e)
    })
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout)
      done()
      if (code === 0) resolve(stdout)
      else reject(new YtDlpError(code, stderr))
    })
  })
