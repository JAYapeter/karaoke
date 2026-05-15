import { describe, it, expect } from 'vitest'
import { createSourceReadyGate } from '@/lib/client/source-ready-gate'

describe('source-ready gate (round-7 #1 regression)', () => {
  it('fires once on the initial true/true edge', () => {
    const gate = createSourceReadyGate()
    expect(gate.shouldSend(true, true)).toBe(true)
    // Same cycle, no further fires
    expect(gate.shouldSend(true, true)).toBe(false)
    expect(gate.shouldSend(true, true)).toBe(false)
  })

  it('does not fire while conn.ready is false', () => {
    const gate = createSourceReadyGate()
    expect(gate.shouldSend(false, true)).toBe(false)
    expect(gate.shouldSend(false, false)).toBe(false)
  })

  it('does not fire while graphReady is false', () => {
    const gate = createSourceReadyGate()
    expect(gate.shouldSend(true, false)).toBe(false)
    expect(gate.shouldSend(true, false)).toBe(false)
  })

  it('fires when graph becomes ready AFTER connection opens (ordering b)', () => {
    const gate = createSourceReadyGate()
    expect(gate.shouldSend(true, false)).toBe(false) // ws open, graph still building
    expect(gate.shouldSend(true, true)).toBe(true)   // graph finishes → fire
    expect(gate.shouldSend(true, true)).toBe(false)  // armed/sent, no repeat
  })

  it('fires when connection opens AFTER graph is ready (ordering a)', () => {
    const gate = createSourceReadyGate()
    expect(gate.shouldSend(false, true)).toBe(false) // graph ready, ws not open
    expect(gate.shouldSend(true, true)).toBe(true)   // ws opens → fire
    expect(gate.shouldSend(true, true)).toBe(false)  // armed/sent, no repeat
  })

  it('re-fires on EVERY WebSocket reconnect (the P0 fix)', () => {
    const gate = createSourceReadyGate()
    // Initial connection
    expect(gate.shouldSend(true, true)).toBe(true)
    expect(gate.shouldSend(true, true)).toBe(false)

    // WebSocket drops (audio graph survives → graphReady stays true)
    expect(gate.shouldSend(false, true)).toBe(false)

    // WebSocket reconnects → must re-send source.ready, because the server
    // cleared sourceReady=false on the old socket's close.
    expect(gate.shouldSend(true, true)).toBe(true)
    expect(gate.shouldSend(true, true)).toBe(false)

    // Another drop + reconnect cycle
    expect(gate.shouldSend(false, true)).toBe(false)
    expect(gate.shouldSend(true, true)).toBe(true)
    expect(gate.shouldSend(true, true)).toBe(false)

    // And a third
    expect(gate.shouldSend(false, true)).toBe(false)
    expect(gate.shouldSend(true, true)).toBe(true)
  })

  it('is idempotent under React strict-mode-style repeated calls within a cycle', () => {
    const gate = createSourceReadyGate()
    const calls = [
      gate.shouldSend(true, true),
      gate.shouldSend(true, true),
      gate.shouldSend(true, true),
      gate.shouldSend(true, true),
    ]
    expect(calls.filter(Boolean).length).toBe(1)
  })

  it('disconnect during graph-building still re-arms the next cycle', () => {
    const gate = createSourceReadyGate()
    // ws opens, graph not yet ready
    expect(gate.shouldSend(true, false)).toBe(false)
    // ws drops before graph finishes
    expect(gate.shouldSend(false, false)).toBe(false)
    // ws reconnects, graph finishes
    expect(gate.shouldSend(true, false)).toBe(false)
    expect(gate.shouldSend(true, true)).toBe(true)
  })
})
