import { describe, it, expect } from 'vitest'
import { shouldReplayPendingPitch } from '@/lib/client/pending-pitch-replay'

describe('shouldReplayPendingPitch (round-9 #1 regression)', () => {
  const player = { itemId: 'song-A', epoch: 1, livePitch: 0 }

  it('replays when same song/epoch and value differs from server livePitch', () => {
    expect(shouldReplayPendingPitch({ value: 2, itemId: 'song-A', epoch: 1 }, player)).toBe(true)
    expect(shouldReplayPendingPitch({ value: -3, itemId: 'song-A', epoch: 1 }, player)).toBe(true)
  })

  it('does NOT replay when value already matches server livePitch (the round-9 #1 bug)', () => {
    // User offline-tapped + then − back to the baseline (or coincidentally
    // matched the server). Before the fix, the component left the ghost
    // pendingRef in place, blocking source-sync forever.
    expect(shouldReplayPendingPitch({ value: 0, itemId: 'song-A', epoch: 1 }, player)).toBe(false)
    const player2 = { itemId: 'song-A', epoch: 1, livePitch: 5 }
    expect(shouldReplayPendingPitch({ value: 5, itemId: 'song-A', epoch: 1 }, player2)).toBe(false)
  })

  it('does NOT replay when itemId differs (song changed under us)', () => {
    expect(shouldReplayPendingPitch({ value: 2, itemId: 'song-B', epoch: 1 }, player)).toBe(false)
  })

  it('does NOT replay when epoch differs (re-queue of the same song)', () => {
    expect(shouldReplayPendingPitch({ value: 2, itemId: 'song-A', epoch: 2 }, player)).toBe(false)
  })

  it('does NOT replay when both itemId and epoch differ', () => {
    expect(shouldReplayPendingPitch({ value: 2, itemId: 'song-B', epoch: 7 }, player)).toBe(false)
  })

  // The component drains pending whenever shouldReplayPendingPitch returns
  // false — these cases document the "drain instead of replay" contract.
  it('all non-replay cases imply the caller should drain pending (contract)', () => {
    const nonReplayCases: { value: number; itemId: string; epoch: number }[] = [
      { value: 0, itemId: 'song-A', epoch: 1 },  // value match
      { value: 2, itemId: 'song-B', epoch: 1 },  // itemId mismatch
      { value: 2, itemId: 'song-A', epoch: 2 },  // epoch mismatch
      { value: 2, itemId: 'song-B', epoch: 9 },  // both mismatch
    ]
    for (const p of nonReplayCases) {
      expect(shouldReplayPendingPitch(p, player)).toBe(false)
    }
  })
})
