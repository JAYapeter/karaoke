import { describe, it, expect } from 'vitest'
import { startNext, endCurrent, skipCurrent, prevCurrent, errorCurrent, pause, play, setLivePitch } from '@/lib/server/player'
import type { PlayerState, QueueItem } from '@/lib/types/state'

const idle = (epoch: number): PlayerState => ({ status: 'idle', epoch })

const item = (id: string, prePitch = 0): QueueItem => ({
  id,
  videoId: `v_${id}`,
  title: id,
  thumbnail: '',
  durationSec: 200,
  queuedBy: { sessionId: 's', name: 'n' },
  prePitch,
  addedAt: 0,
})

describe('player transitions', () => {
  it('startNext pops queue, increments epoch, copies prePitch to livePitch', () => {
    const r = startNext(idle(0), [item('a', -2), item('b')])
    expect(r.player.status).toBe('playing')
    expect(r.player.epoch).toBe(1)
    if (r.player.status === 'playing') {
      expect(r.player.item.id).toBe('a')
      expect(r.player.livePitch).toBe(-2)
      expect(r.player.positionSec).toBe(0)
    }
    expect(r.queue.map((q) => q.id)).toEqual(['b'])
  })

  it('startNext from empty queue stays idle (no epoch change)', () => {
    const r = startNext(idle(5), [])
    expect(r.player.status).toBe('idle')
    expect(r.player.epoch).toBe(5)
  })

  it('endCurrent pushes current to history and increments epoch', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 7, item: item('a'),
      livePitch: 0, positionSec: 100, positionUpdatedAt: 0,
    }
    const r = endCurrent(playing, [], [])
    expect(r.history.map((h) => h.id)).toEqual(['a'])
    expect(r.player.status).toBe('idle')
    expect(r.player.epoch).toBe(8)
  })

  it('endCurrent ignores stale epoch', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 7, item: item('a'),
      livePitch: 0, positionSec: 100, positionUpdatedAt: 0,
    }
    const r = endCurrent(playing, [], [], 6) // stale
    expect(r.history).toEqual([])
    expect(r.player).toBe(playing) // unchanged
  })

  it('skipCurrent advances epoch and moves current to history', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 1, item: item('a'),
      livePitch: 0, positionSec: 50, positionUpdatedAt: 0,
    }
    const r = skipCurrent(playing, [item('b')], [])
    expect(r.history.map((h) => h.id)).toEqual(['a'])
    expect(r.queue.map((q) => q.id)).toEqual([item('b').id]) // queue unchanged at this layer
    expect(r.player.epoch).toBe(2)
  })

  it('prevCurrent restores from history if available', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 3, item: item('b'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    const r = prevCurrent(playing, [], [item('a')])
    if (r.player.status === 'playing') expect(r.player.item.id).toBe('a')
    expect(r.queue.map((q) => q.id)).toEqual(['b'])
    expect(r.history).toEqual([])
    expect(r.player.epoch).toBe(4)
  })

  it('prevCurrent is no-op when history empty', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 3, item: item('b'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    const r = prevCurrent(playing, [], [])
    expect(r.player).toBe(playing)
  })

  it('pause/play preserve epoch', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 9, item: item('a'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    const paused = pause(playing)
    expect(paused.status).toBe('paused')
    expect(paused.epoch).toBe(9)
    const resumed = play(paused)
    expect(resumed.status).toBe('playing')
    expect(resumed.epoch).toBe(9)
  })

  it('setLivePitch clamps to [-6, 6]', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 1, item: item('a'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    if (setLivePitch(playing, 7).status !== 'idle')
      expect((setLivePitch(playing, 7) as any).livePitch).toBe(6)
    if (setLivePitch(playing, -10).status !== 'idle')
      expect((setLivePitch(playing, -10) as any).livePitch).toBe(-6)
  })
})
