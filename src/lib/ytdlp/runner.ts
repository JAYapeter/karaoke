import { spawn } from 'node:child_process'
import { YTDLP_BIN } from '@/lib/config'

export class YtDlpError extends Error {
  constructor(public code: number | null, public stderr: string) {
    super(`yt-dlp exited with code ${code}: ${stderr.trim()}`)
  }
}

export const runYtDlp = (args: string[], opts: { timeoutMs?: number } = {}): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL')
          reject(new YtDlpError(null, `timeout after ${opts.timeoutMs}ms`))
        }, opts.timeoutMs)
      : null
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => {
      if (timeout) clearTimeout(timeout)
      reject(e)
    })
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout)
      if (code === 0) resolve(stdout)
      else reject(new YtDlpError(code, stderr))
    })
  })
