/**
 * Per-connection-cycle gate for the `source.ready` handshake.
 *
 * Round-7 #1: the original VideoPlayer sent `source.ready` from a mount-once
 * effect, so a WebSocket reconnect (audio graph survives, ws is new) never
 * re-handshook and the server kept `sourceReady = false` forever.
 *
 * Behavior:
 * - `shouldSend(connReady, graphReady)` returns true exactly once per
 *   "(connection × graph)" pairing where both inputs are true.
 * - When `connReady` drops back to false, the gate is re-armed so the next
 *   true edge fires again.
 * - Graph readiness is a level signal (the audio graph survives reconnects);
 *   only the connection edge re-arms the gate.
 *
 * Kept as a pure module so vitest (node env, no React) can exercise the
 * state machine directly. The component (VideoPlayer.tsx) consumes it via
 * a ref so React rerenders don't disturb the state.
 */
export type SourceReadyGate = {
  /** Returns true exactly once per (connection × graph-ready) cycle. */
  shouldSend(connReady: boolean, graphReady: boolean): boolean
}

export const createSourceReadyGate = (): SourceReadyGate => {
  let sentForCurrentCycle = false
  return {
    shouldSend(connReady, graphReady) {
      if (!connReady) {
        // Connection dropped (or hasn't opened yet). Arm the next cycle.
        sentForCurrentCycle = false
        return false
      }
      if (!graphReady) return false
      if (sentForCurrentCycle) return false
      sentForCurrentCycle = true
      return true
    },
  }
}
