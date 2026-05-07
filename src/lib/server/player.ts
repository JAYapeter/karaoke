import type { PlayerState, QueueItem } from '@/lib/types/state'
import { PITCH_MAX, PITCH_MIN } from '@/lib/config'

const clampPitch = (n: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(n)))

export type Result = {
  player: PlayerState
  queue: QueueItem[]
  history: QueueItem[]
}

export const startNext = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[] = [],
): Result => {
  if (queue.length === 0) return { player, queue: [...queue], history: [...history] }
  const [first, ...rest] = queue
  if (!first) return { player, queue: [...queue], history: [...history] }
  return {
    player: {
      status: 'playing',
      epoch: player.epoch + 1,
      item: first,
      livePitch: clampPitch(first.prePitch),
      positionSec: 0,
      positionUpdatedAt: Date.now(),
    },
    queue: [...rest],
    history: [...history],
  }
}

export const endCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
  reportedEpoch?: number,
): Result => {
  if (player.status === 'idle') return { player, queue: [...queue], history: [...history] }
  if (reportedEpoch !== undefined && reportedEpoch !== player.epoch) {
    return { player, queue: [...queue], history: [...history] }
  }
  return {
    player: { status: 'idle', epoch: player.epoch + 1 },
    queue: [...queue],
    history: [player.item, ...history],
  }
}

export const skipCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
): Result => {
  if (player.status === 'idle') return { player, queue: [...queue], history: [...history] }
  return {
    player: { status: 'idle', epoch: player.epoch + 1 },
    queue: [...queue],
    history: [player.item, ...history],
  }
}

export const prevCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
): Result => {
  if (history.length === 0) return { player, queue: [...queue], history: [...history] }
  const [prev, ...rest] = history
  if (!prev) return { player, queue: [...queue], history: [...history] }
  if (player.status === 'idle') {
    return {
      player: {
        status: 'playing',
        epoch: player.epoch + 1,
        item: prev,
        livePitch: clampPitch(prev.prePitch),
        positionSec: 0,
        positionUpdatedAt: Date.now(),
      },
      queue: [...queue],
      history: rest,
    }
  }
  return {
    player: {
      status: 'playing',
      epoch: player.epoch + 1,
      item: prev,
      livePitch: clampPitch(prev.prePitch),
      positionSec: 0,
      positionUpdatedAt: Date.now(),
    },
    queue: [player.item, ...queue],
    history: rest,
  }
}

export const errorCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
  reportedEpoch: number,
): Result => {
  if (player.status === 'idle' || reportedEpoch !== player.epoch) {
    return { player, queue: [...queue], history: [...history] }
  }
  return {
    player: { status: 'idle', epoch: player.epoch + 1 },
    queue: [...queue],
    history: [player.item, ...history],
  }
}

export const pause = (player: PlayerState): PlayerState =>
  player.status === 'playing' ? { ...player, status: 'paused' } : player

export const play = (player: PlayerState): PlayerState =>
  player.status === 'paused' ? { ...player, status: 'playing' } : player

export const setLivePitch = (player: PlayerState, semitones: number): PlayerState =>
  player.status === 'idle' ? player : { ...player, livePitch: clampPitch(semitones) }
