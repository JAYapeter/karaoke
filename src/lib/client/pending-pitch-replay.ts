/**
 * Pure predicate for the YoureUpView reconnect-replay decision.
 *
 * Round-9 #1: the original ternary in YoureUpView's reconnect effect had
 * three implicit branches (replay / song-changed-discard / leave-as-is).
 * The third was a bug: when the user offline-tapped to a value that ended
 * up matching the server's livePitch (or tapped + then − back to the
 * baseline), we'd skip the replay (no value mismatch) AND skip the cleanup
 * (song matches), leaving a ghost `pendingRef`. That ghost then blocked
 * the source-sync effect (gated by `!pendingRef.current`) from rendering
 * any future server-driven livePitch updates — a silent UI freeze for the
 * takeover readout until the user tapped again.
 *
 * Decision matrix on reconnect (offline→online edge):
 *
 *   pending.itemId/epoch mismatch                         → discard pending
 *   pending matches AND pending.value !== livePitch       → replay
 *   pending matches AND pending.value === livePitch       → discard pending
 *
 * Only the middle case replays; both other cases drain. We extract just
 * the "should replay" question here so vitest (node env, no React) can
 * exercise it directly. The component drains pending in the else branch.
 */
export type PendingPitchSnapshot = {
  value: number
  itemId: string
  epoch: number
}

export type PlayerPitchContext = {
  itemId: string
  epoch: number
  livePitch: number
}

export const shouldReplayPendingPitch = (
  pending: PendingPitchSnapshot,
  player: PlayerPitchContext,
): boolean => {
  if (pending.itemId !== player.itemId) return false
  if (pending.epoch !== player.epoch) return false
  // Same song/epoch: only replay when our held value still differs from
  // what the server thinks is live. Otherwise the replay would be a
  // no-op and the caller MUST drain pending so it stops blocking the
  // source-sync effect.
  return pending.value !== player.livePitch
}
