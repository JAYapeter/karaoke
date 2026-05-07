import { describe, it, expect, vi } from 'vitest'
import { Store } from '@/lib/server/store'

describe('Store', () => {
  it('initial state is idle, empty', () => {
    const s = new Store('TOKEN')
    expect(s.snapshot().queue).toEqual([])
    expect(s.snapshot().player.status).toBe('idle')
    expect(s.snapshot().sourceConnected).toBe(false)
    expect(s.snapshot().sourceReady).toBe(false)
  })

  it('addUser / removeUser', () => {
    const s = new Store('TOKEN')
    s.addUser('a', 'Alice')
    expect(s.snapshot().users).toContainEqual({ sessionId: 'a', name: 'Alice' })
    s.removeUser('a')
    expect(s.snapshot().users).toEqual([])
  })

  it('emits change events on mutate', () => {
    const s = new Store('TOKEN')
    const cb = vi.fn()
    s.on(cb)
    s.addUser('a', 'A')
    expect(cb).toHaveBeenCalled()
  })

  it('verifySourceToken', () => {
    const s = new Store('TOKEN')
    expect(s.verifySourceToken('TOKEN')).toBe(true)
    expect(s.verifySourceToken('nope')).toBe(false)
  })
})
