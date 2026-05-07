import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Store } from '@/lib/server/store'
import { Dispatcher, createIdempotencyState, type IdempotencyState } from '@/lib/server/dispatch'

vi.mock('@/lib/ytdlp/meta', () => ({
  fetchMeta: vi.fn().mockResolvedValue({ title: 'T', thumbnail: 'th', durationSec: 100 }),
}))

let store: Store
let send: ReturnType<typeof vi.fn> & ((msg: any) => void)
let broadcast: ReturnType<typeof vi.fn> & ((msg: any) => void)
let idem: IdempotencyState
let d: Dispatcher

beforeEach(() => {
  store = new Store('TOKEN')
  send = vi.fn() as any
  broadcast = vi.fn() as any
  idem = createIdempotencyState()
  d = new Dispatcher(store, { send, broadcast }, idem)
})

describe('dispatcher', () => {
  it('queue.add succeeds for joined user', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'a', name: 'Alice',
    })
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    expect(store.getQueue().length).toBe(1)
    expect(store.getQueue()[0]?.title).toBe('T')
  })

  it('queue.add is idempotent on msgId replay (returns the original ack outcome)', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'a', name: 'Alice',
    })
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    send.mockClear()
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    expect(store.getQueue().length).toBe(1) // not added twice
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'q1', ok: true }))
  })

  it('replay of a previously-failed mutation returns the cached failure', async () => {
    // queue.remove on a missing item → fails
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.remove', msgId: 'r1', itemId: 'nope',
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'r1', ok: false }))
    send.mockClear()
    // Replay → must return the same cached failure, not re-attempt
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.remove', msgId: 'r1', itemId: 'nope',
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'r1', ok: false }))
  })

  it('player.skip from non-source rejected', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'player.skip', msgId: 's1', epoch: 0,
    })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'state.ack', msgId: 's1', ok: false }),
    )
  })

  it('player.position from non-source is silently dropped (no state mutation)', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'player.position', epoch: 999, positionSec: 30,
    })
    // Player should remain idle (epoch 0)
    expect(store.getPlayer().status).toBe('idle')
  })

  it('source.ready with bad token sends Invalid source token toast', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'source.ready', msgId: 'sr1', sourceToken: 'WRONG',
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'toast', message: 'Invalid source token' }))
  })

  it('join uses caller.sessionId, ignores msg.sessionId mismatch', async () => {
    await d.handle({ sessionId: 'real-session', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'spoofed', name: 'Mallory',
    })
    expect(store.getUser('real-session')?.name).toBe('Mallory')
    expect(store.getUser('spoofed')).toBeUndefined()
  })

  it('idempotency state is shared — replay across new Dispatcher instances still dedupes', async () => {
    // First Dispatcher (simulating socket #1) applies the mutation
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'a', name: 'Alice',
    })
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    expect(store.getQueue().length).toBe(1)

    // Second Dispatcher with the SAME idempotency state (simulating reconnect)
    const send2 = vi.fn() as any
    const broadcast2 = vi.fn() as any
    const d2 = new Dispatcher(store, { send: send2, broadcast: broadcast2 }, idem)
    await d2.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    expect(store.getQueue().length).toBe(1) // not added twice
    expect(send2).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'q1', ok: true }))
  })

  it('stale-epoch player.error does NOT broadcast a toast', async () => {
    // Player is idle at epoch 0; a stale player.error event for some old epoch must be silently dropped.
    await d.handle({ sessionId: 's', isSource: true }, {
      type: 'player.error', epoch: 999, itemId: 'x', message: 'whatever',
    })
    expect(broadcast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toast' }),
    )
  })
})
