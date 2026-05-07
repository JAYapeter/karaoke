import type { PlayerState, QueueItem } from '@/lib/types/state'

export type Caller = { isSource: boolean; sessionId: string }

export const isSourceOnly = (caller: Caller) => caller.isSource

export const canRemove = (caller: Caller, item: QueueItem) =>
  caller.isSource || caller.sessionId === item.queuedBy.sessionId

export const canMove = (caller: Caller) => caller.isSource

export const canSetLivePitch = (caller: Caller, player: PlayerState) => {
  if (caller.isSource) return true
  if (player.status === 'idle') return false
  return caller.sessionId === player.item.queuedBy.sessionId
}

export const canSetPrePitch = (caller: Caller, item: QueueItem) =>
  caller.isSource || caller.sessionId === item.queuedBy.sessionId
