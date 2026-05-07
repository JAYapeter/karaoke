import { describe, it, expect } from 'vitest'
import { addItem, removeItem, moveItem, shuffleQueue } from '@/lib/server/queue'
import type { QueueItem } from '@/lib/types/state'

const item = (id: string, sessionId = 's1'): QueueItem => ({
  id,
  videoId: `v_${id}`,
  title: `Title ${id}`,
  thumbnail: '',
  durationSec: 100,
  queuedBy: { sessionId, name: 'n' },
  prePitch: 0,
  addedAt: 0,
})

describe('queue mutations', () => {
  it('addItem appends', () => {
    expect(addItem([], item('a')).map((x) => x.id)).toEqual(['a'])
    expect(addItem([item('a')], item('b')).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('removeItem removes by id', () => {
    expect(removeItem([item('a'), item('b')], 'a').map((x) => x.id)).toEqual(['b'])
  })

  it('removeItem is no-op when id missing', () => {
    expect(removeItem([item('a')], 'z').map((x) => x.id)).toEqual(['a'])
  })

  it('moveItem to top', () => {
    expect(moveItem([item('a'), item('b'), item('c')], 'c', 0).map((x) => x.id)).toEqual([
      'c', 'a', 'b',
    ])
  })

  it('moveItem clamps toIndex', () => {
    expect(moveItem([item('a'), item('b')], 'a', 99).map((x) => x.id)).toEqual(['b', 'a'])
    expect(moveItem([item('a'), item('b')], 'a', -5).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('shuffleQueue keeps every item exactly once', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((x) => item(x))
    const out = shuffleQueue(items, () => 0.42).map((x) => x.id).sort()
    expect(out).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
