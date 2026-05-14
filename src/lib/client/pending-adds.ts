// §4.3 pending-adds lifecycle. See spec for the canonical rules.

export type PendingAdd = {
  msgId: string
  videoId: string
  /** §4.3: tray displays title when known, falls back to videoId. Search
   *  knows the title at add time; Paste resolves it first. The reducer
   *  stores whatever the caller passes. */
  title?: string | undefined
  prePitch: number
  sentAt: number
  mutationsSentSince: number
  epochAtSent: number
}

export type PendingAddsState = ReadonlyMap<string, PendingAdd>

export type PendingAddsAction =
  | { type: 'add'; msgId: string; videoId: string; title?: string | undefined; prePitch: number; sentAt: number; epoch: number }
  | { type: 'ack'; msgId: string; ok: boolean; error?: string | undefined }
  | { type: 'dismiss'; msgId: string }
  | { type: 'incrementMutations' }

export const initialPendingAdds: PendingAddsState = new Map()

export const pendingAddsReducer = (
  state: PendingAddsState,
  action: PendingAddsAction,
): PendingAddsState => {
  switch (action.type) {
    case 'add': {
      // Idempotent: re-adding the same msgId preserves the original sentAt.
      if (state.has(action.msgId)) return state
      const next = new Map(state)
      next.set(action.msgId, {
        msgId: action.msgId,
        videoId: action.videoId,
        title: action.title,
        prePitch: action.prePitch,
        sentAt: action.sentAt,
        mutationsSentSince: 0,
        epochAtSent: action.epoch,
      })
      return next
    }
    case 'ack':
    case 'dismiss': {
      if (!state.has(action.msgId)) return state
      const next = new Map(state)
      next.delete(action.msgId)
      return next
    }
    case 'incrementMutations': {
      if (state.size === 0) return state
      const next = new Map<string, PendingAdd>()
      for (const [k, v] of state) {
        next.set(k, { ...v, mutationsSentSince: v.mutationsSentSince + 1 })
      }
      return next
    }
  }
}

// §4.3 thresholds (named constants so they're testable and discoverable).
export const RETRY_WINDOW_MUTATIONS = 80
export const RETRY_WINDOW_EPOCH_JUMP = 3
export const RETRY_WINDOW_WALL_MS = 2 * 60 * 1000
export const STALE_VISUAL_MS = 5 * 60 * 1000

export type PendingClassification =
  | 'queueing'        // still within the no-ack-yet window
  | 'retry'           // past ack timeout, inside the retry window
  | 'expired-window'  // any of the three retry-window thresholds crossed
  | 'stale-visual'    // past 5 min — the spec says relabel, not remove

export const classifyPendingState = (
  entry: PendingAdd,
  ctx: { now: number; currentEpoch: number; ackedTimeoutMs: number },
): PendingClassification => {
  const age = ctx.now - entry.sentAt
  if (age >= STALE_VISUAL_MS) return 'stale-visual'

  const epochDelta = ctx.currentEpoch - entry.epochAtSent
  const expiredWindow =
    entry.mutationsSentSince >= RETRY_WINDOW_MUTATIONS ||
    epochDelta >= RETRY_WINDOW_EPOCH_JUMP ||
    age >= RETRY_WINDOW_WALL_MS

  if (expiredWindow) return 'expired-window'
  if (age >= ctx.ackedTimeoutMs) return 'retry'
  return 'queueing'
}
