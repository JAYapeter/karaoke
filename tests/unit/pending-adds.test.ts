import { describe, it, expect } from 'vitest'
import {
  pendingAddsReducer,
  initialPendingAdds,
  type PendingAddsAction,
  classifyPendingState,
  STALE_VISUAL_MS,
  RETRY_WINDOW_MUTATIONS,
  RETRY_WINDOW_EPOCH_JUMP,
  RETRY_WINDOW_WALL_MS,
} from '@/lib/client/pending-adds'

const addAction = (over: Partial<{ msgId: string; videoId: string; prePitch: number; sentAt: number; epoch: number }> = {}): PendingAddsAction => ({
  type: 'add',
  msgId: over.msgId ?? 'm1',
  videoId: over.videoId ?? 'vid1',
  prePitch: over.prePitch ?? 0,
  sentAt: over.sentAt ?? 1_000_000,
  epoch: over.epoch ?? 0,
})

describe('pendingAdds reducer', () => {
  it('starts empty', () => {
    expect(initialPendingAdds.size).toBe(0)
  })

  it('add inserts an entry keyed by msgId', () => {
    const s = pendingAddsReducer(initialPendingAdds, addAction())
    expect(s.size).toBe(1)
    expect(s.get('m1')?.videoId).toBe('vid1')
    expect(s.get('m1')?.prePitch).toBe(0)
  })

  it('add of same msgId is idempotent (does not overwrite sentAt)', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ sentAt: 1_000 }))
    const s2 = pendingAddsReducer(s1, addAction({ sentAt: 9_000 }))
    expect(s2.size).toBe(1)
    expect(s2.get('m1')?.sentAt).toBe(1_000)
  })

  it('two distinct msgIds for the same videoId coexist (different keys)', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ msgId: 'a', videoId: 'v', prePitch: 0 }))
    const s2 = pendingAddsReducer(s1, addAction({ msgId: 'b', videoId: 'v', prePitch: 3 }))
    expect(s2.size).toBe(2)
  })

  it('ack removes the entry regardless of outcome', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction())
    const sOk = pendingAddsReducer(s1, { type: 'ack', msgId: 'm1', ok: true })
    expect(sOk.size).toBe(0)
    const sFail = pendingAddsReducer(s1, { type: 'ack', msgId: 'm1', ok: false, error: 'x' })
    expect(sFail.size).toBe(0)
  })

  it('ack for an unknown msgId is a no-op (does not crash)', () => {
    const s = pendingAddsReducer(initialPendingAdds, { type: 'ack', msgId: 'missing', ok: true })
    expect(s.size).toBe(0)
  })

  it('dismiss removes a specific entry', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ msgId: 'a' }))
    const s2 = pendingAddsReducer(s1, addAction({ msgId: 'b' }))
    const s3 = pendingAddsReducer(s2, { type: 'dismiss', msgId: 'a' })
    expect(s3.size).toBe(1)
    expect(s3.has('b')).toBe(true)
  })

  it('add starts mutationsSentSince at -1 so the originating queue.add bumps it to 0', () => {
    // The useTrackedConn wrapper fires incrementMutations BEFORE every
    // mutating send, including the originating queue.add. If new entries
    // started at 0, the originating send would bump them to 1 and the
    // 80-mutation expired-window threshold would trip at 79 user actions
    // instead of 80 (off-by-one).
    const s1 = pendingAddsReducer(initialPendingAdds, addAction())
    expect(s1.get('m1')?.mutationsSentSince).toBe(-1)
  })

  it('incrementMutations advances mutationsSentSince on EVERY entry', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ msgId: 'a' }))
    const s2 = pendingAddsReducer(s1, addAction({ msgId: 'b' }))
    // After two adds, both entries are at -1. Two increments → +1.
    const s3 = pendingAddsReducer(s2, { type: 'incrementMutations' })
    const s4 = pendingAddsReducer(s3, { type: 'incrementMutations' })
    expect(s4.get('a')?.mutationsSentSince).toBe(1)
    expect(s4.get('b')?.mutationsSentSince).toBe(1)
  })

  describe('classifyPendingState', () => {
    const now = 1_000_000
    it('returns "queueing" before timeout, no thresholds crossed', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 1000, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('queueing')
    })
    it('returns "retry" after 6s ack timeout, still inside retry window', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 7000, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('retry')
    })
    it('returns "expired-window" after the 80-mutation threshold', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 7000, mutationsSentSince: RETRY_WINDOW_MUTATIONS, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('expired-window')
    })
    it('returns "expired-window" after the epoch-jump threshold', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 7000, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7 + RETRY_WINDOW_EPOCH_JUMP, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('expired-window')
    })
    it('returns "expired-window" after the 2-minute wall-clock threshold', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - RETRY_WINDOW_WALL_MS, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('expired-window')
    })
    it('returns "stale-visual" past 5 minutes (overrides expired-window)', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - STALE_VISUAL_MS, mutationsSentSince: 200, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('stale-visual')
    })
  })
})
