import { describe, it, expect } from 'vitest'
import { canRemove, canMove, canSetLivePitch, canSetPrePitch, isSourceOnly } from '@/lib/server/authority'
import type { PlayerState, QueueItem } from '@/lib/types/state'

const item = (id: string, sessionId: string): QueueItem => ({
  id, videoId: 'v', title: 't', thumbnail: '', durationSec: 0,
  queuedBy: { sessionId, name: 'n' }, prePitch: 0, addedAt: 0,
})

describe('authority', () => {
  it('canRemove: source allowed', () => {
    expect(canRemove({ isSource: true, sessionId: 'x' }, item('a', 'b'))).toBe(true)
  })
  it('canRemove: queuer allowed', () => {
    expect(canRemove({ isSource: false, sessionId: 'a' }, item('i', 'a'))).toBe(true)
  })
  it('canRemove: stranger denied', () => {
    expect(canRemove({ isSource: false, sessionId: 'a' }, item('i', 'b'))).toBe(false)
  })

  it('canMove: source-only', () => {
    expect(canMove({ isSource: true, sessionId: 'x' })).toBe(true)
    expect(canMove({ isSource: false, sessionId: 'x' })).toBe(false)
  })

  it('canSetLivePitch: source or current queuer', () => {
    const p: PlayerState = { status: 'playing', epoch: 1, item: item('a', 'q'), livePitch: 0, positionSec: 0, positionUpdatedAt: 0 }
    expect(canSetLivePitch({ isSource: true, sessionId: 'x' }, p)).toBe(true)
    expect(canSetLivePitch({ isSource: false, sessionId: 'q' }, p)).toBe(true)
    expect(canSetLivePitch({ isSource: false, sessionId: 'z' }, p)).toBe(false)
  })

  it('canSetLivePitch: idle blocks non-source', () => {
    const idle: PlayerState = { status: 'idle', epoch: 0 }
    expect(canSetLivePitch({ isSource: false, sessionId: 'q' }, idle)).toBe(false)
    expect(canSetLivePitch({ isSource: true, sessionId: 'q' }, idle)).toBe(true)
  })

  it('canSetPrePitch: source or queuer of that item', () => {
    expect(canSetPrePitch({ isSource: true, sessionId: 'x' }, item('a', 'q'))).toBe(true)
    expect(canSetPrePitch({ isSource: false, sessionId: 'q' }, item('a', 'q'))).toBe(true)
    expect(canSetPrePitch({ isSource: false, sessionId: 'x' }, item('a', 'q'))).toBe(false)
  })

  it('isSourceOnly enforces source flag', () => {
    expect(isSourceOnly({ isSource: true, sessionId: 'x' })).toBe(true)
    expect(isSourceOnly({ isSource: false, sessionId: 'x' })).toBe(false)
  })
})
