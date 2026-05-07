import { describe, it, expect } from 'vitest'
import { Dedup } from '@/lib/server/dedup'

describe('Dedup', () => {
  it('first call records and returns false', () => {
    const d = new Dedup(3)
    expect(d.seen('s1', 'm1')).toBe(false)
    expect(d.seen('s1', 'm1')).toBe(true)
  })

  it('per-session isolation', () => {
    const d = new Dedup(3)
    d.seen('s1', 'm1')
    expect(d.seen('s2', 'm1')).toBe(false)
  })

  it('LRU eviction at capacity', () => {
    const d = new Dedup(2)
    d.seen('s1', 'a')
    d.seen('s1', 'b')
    d.seen('s1', 'c') // evicts 'a'
    expect(d.seen('s1', 'a')).toBe(false) // re-recorded
    expect(d.seen('s1', 'b')).toBe(true)
  })
})
