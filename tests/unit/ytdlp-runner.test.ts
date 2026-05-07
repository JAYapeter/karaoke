import { describe, it, expect, vi } from 'vitest'
import { runYtDlp } from '@/lib/ytdlp/runner'

vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events')
  return {
    spawn: () => {
      const ee: any = new EventEmitter()
      ee.stdout = new EventEmitter()
      ee.stderr = new EventEmitter()
      ee.kill = () => {}
      setImmediate(() => {
        ee.stdout.emit('data', Buffer.from('hello\n'))
        ee.emit('close', 0)
      })
      return ee
    },
  }
})

describe('runYtDlp', () => {
  it('resolves with stdout for exit 0', async () => {
    const out = await runYtDlp(['--version'])
    expect(out).toBe('hello\n')
  })
})
