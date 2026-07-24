import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage } from '@/lib/types/protocol'
import type { QueueItem, PlayerState } from '@/lib/types/state'
import { Store } from './store'
import { Dedup } from './dedup'
import { addItem, removeItem, moveItem, shuffleQueue } from './queue'
import {
  startNext, endCurrent, errorCurrent, skipCurrent, prevCurrent,
  pause, play, setLivePitch,
} from './player'
import { canMove, canRemove, canSetLivePitch, canSetPrePitch, isSourceOnly } from './authority'
import { fetchMeta } from '@/lib/ytdlp/meta'
import { prefetch } from '@/lib/ytdlp/media-cache'
import { RECENT_MSG_IDS_PER_SESSION, PITCH_MAX, PITCH_MIN } from '@/lib/config'

export type Caller = { sessionId: string; isSource: boolean; isLocalhost?: boolean }

export type IO = {
  send: (msg: ServerMessage) => void
  broadcast: (msg: ServerMessage) => void
}

const clampPitch = (n: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(n)))

export type CachedAck = { ok: boolean; error?: string }

/** Shared idempotency state across all dispatcher instances of a single server process.
 *  This must outlive any single WebSocket connection — the spec requires per-session
 *  msgId dedup that survives reconnects. */
export type IdempotencyState = {
  dedup: Dedup
  ackCache: Map<string, CachedAck>
}

export const createIdempotencyState = (): IdempotencyState => ({
  dedup: new Dedup(RECENT_MSG_IDS_PER_SESSION),
  ackCache: new Map(),
})

export class Dispatcher {
  constructor(
    private store: Store,
    private io: IO,
    private idem: IdempotencyState,
  ) {}

  private ackKey(sessionId: string, msgId: string) {
    return `${sessionId}::${msgId}`
  }

  async handle(caller: Caller, msg: ClientMessage): Promise<void> {
    // Idempotent replay for mutating messages — return the cached ack (ok or fail).
    const mutating = 'msgId' in msg && this.isMutating(msg)
    if (mutating && msg.msgId) {
      const key = this.ackKey(caller.sessionId, msg.msgId)
      if (this.idem.dedup.seen(caller.sessionId, msg.msgId)) {
        const cached = this.idem.ackCache.get(key) ?? { ok: true }
        this.io.send({ type: 'state.ack', msgId: msg.msgId, ok: cached.ok, ...(cached.error ? { error: cached.error } : {}) })
        return
      }
    }

    try {
      await this.dispatch(caller, msg)
      if ('msgId' in msg && msg.msgId) {
        this.io.send({ type: 'state.ack', msgId: msg.msgId, ok: true })
        if (mutating) this.idem.ackCache.set(this.ackKey(caller.sessionId, msg.msgId), { ok: true })
      }
    } catch (e) {
      const errStr = String(e)
      if ('msgId' in msg && msg.msgId) {
        this.io.send({ type: 'state.ack', msgId: msg.msgId, ok: false, error: errStr })
        if (mutating) this.idem.ackCache.set(this.ackKey(caller.sessionId, msg.msgId), { ok: false, error: errStr })
      }
    }
  }

  private isMutating(msg: ClientMessage): boolean {
    return msg.type.startsWith('queue.') || msg.type.startsWith('player.set') ||
      msg.type === 'player.skip' || msg.type === 'player.prev' ||
      msg.type === 'player.pause' || msg.type === 'player.play'
  }

  private async dispatch(caller: Caller, msg: ClientMessage) {
    switch (msg.type) {
      case 'join': {
        // Trust the WS-bound sessionId on caller, not whatever the client put in the payload.
        const user = this.store.getUser(caller.sessionId)
        const name = msg.name?.trim() || user?.name || 'guest'
        this.store.addUser(caller.sessionId, name)
        this.io.send({ type: 'state.full', state: this.store.snapshot() })
        return
      }
      case 'source.ready': {
        // Localhost peers are trusted (this is the host machine itself).
        // Non-localhost peers must still present the source token.
        if (!caller.isLocalhost && !this.store.verifySourceToken(msg.sourceToken ?? '')) {
          this.io.send({ type: 'toast', level: 'warn', message: 'Invalid source token' })
          throw new Error('bad source token')
        }
        this.store.setSourceReady(true)
        this.maybeAutoAdvance()
        return
      }
      case 'queue.add': {
        const meta = await fetchMeta(msg.videoId)
        const user = this.store.getUser(caller.sessionId)
        if (!user) throw new Error('not joined')
        const item: QueueItem = {
          id: randomUUID(),
          videoId: msg.videoId,
          title: meta.title,
          thumbnail: meta.thumbnail,
          durationSec: meta.durationSec,
          queuedBy: { sessionId: caller.sessionId, name: user.name },
          prePitch: clampPitch(msg.prePitch),
          addedAt: Date.now(),
        }
        this.store.setQueue(addItem(this.store.getQueue(), item))
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
      case 'queue.remove': {
        const item = this.store.getQueue().find((q) => q.id === msg.itemId)
        if (!item) throw new Error('item not found')
        if (!canRemove(caller, item)) throw new Error('forbidden')
        this.store.setQueue(removeItem(this.store.getQueue(), msg.itemId))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'queue.move': {
        if (!canMove(caller)) throw new Error('forbidden')
        this.store.setQueue(moveItem(this.store.getQueue(), msg.itemId, msg.toIndex))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'queue.shuffle': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        this.store.setQueue(shuffleQueue(this.store.getQueue()))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.skip': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        const r = skipCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory())
        this.store.setPlayer(r.player)
        this.store.setHistory(r.history)
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
      case 'player.prev': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        const r = prevCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory())
        this.store.setPlayer(r.player)
        this.store.setQueue(r.queue)
        this.store.setHistory(r.history)
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.pause': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        this.store.setPlayer(pause(this.store.getPlayer()))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.play': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        this.store.setPlayer(play(this.store.getPlayer()))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.setLivePitch': {
        const p = this.store.getPlayer()
        if (!canSetLivePitch(caller, p)) throw new Error('forbidden')
        this.store.setPlayer(setLivePitch(p, msg.semitones))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.setPrePitch': {
        const item = this.store.getQueue().find((q) => q.id === msg.itemId)
        if (!item) throw new Error('item not found')
        if (!canSetPrePitch(caller, item)) throw new Error('forbidden')
        const updated = { ...item, prePitch: clampPitch(msg.semitones) }
        this.store.setQueue(this.store.getQueue().map((q) => (q.id === msg.itemId ? updated : q)))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.setVolume': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        // Volume is owned client-side on /source — no server state change. Broadcasted as-is for remote-control phones (future).
        return
      }
      case 'search': {
        const { searchYouTube } = await import('@/lib/ytdlp/search')
        const results = await searchYouTube(msg.query)
        this.io.send({ type: 'search.results', msgId: msg.msgId, results })
        return
      }
      case 'meta.fetch': {
        const meta = await fetchMeta(msg.videoId)
        this.io.send({
          type: 'meta.result', msgId: msg.msgId, videoId: msg.videoId,
          title: meta.title, thumbnail: meta.thumbnail, durationSec: meta.durationSec,
        })
        return
      }
      case 'player.position': {
        if (!isSourceOnly(caller)) return // silently drop non-source heartbeats
        const p = this.store.getPlayer()
        if (p.status !== 'idle' && p.epoch === msg.epoch) {
          this.store.setPlayer({ ...p, positionSec: msg.positionSec, positionUpdatedAt: Date.now() })
        }
        return
      }
      case 'player.ended': {
        if (!isSourceOnly(caller)) return
        const r = endCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory(), msg.epoch)
        this.store.setPlayer(r.player)
        this.store.setHistory(r.history)
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
      case 'player.error': {
        if (!isSourceOnly(caller)) return
        const before = this.store.getPlayer()
        const r = errorCurrent(before, this.store.getQueue(), this.store.getHistory(), msg.epoch)
        // If errorCurrent returned the player unchanged, the event was stale-epoch — discard silently.
        if (r.player === before) return
        this.store.setPlayer(r.player)
        this.store.setHistory(r.history)
        this.io.broadcast({ type: 'toast', level: 'warn', message: `Couldn't load: ${msg.message}` })
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
    }
  }

  private broadcastQueueAndPlayer() {
    const queue = this.store.getQueue()
    const history = this.store.getHistory()
    this.io.broadcast({ type: 'state.queue', queue: [...queue], history: [...history] })
    this.io.broadcast({ type: 'state.player', player: this.store.getPlayer() })
    // Single warm-the-cache hook. Every queue mutation and every player transition
    // routes through here, so add/remove/move/shuffle/skip/prev/ended/auto-advance
    // are all covered from one place. history[0] is included because player.prev
    // replays from history, which never re-enters the queue.
    for (const item of [queue[0], queue[1], history[0]]) {
      if (item) prefetch(item.videoId)
    }
  }

  /** If idle and source ready and queue non-empty → start next. */
  private maybeAutoAdvance() {
    const p = this.store.getPlayer()
    if (p.status !== 'idle') return
    if (!this.store.getSourceReady()) return
    const r = startNext(p, this.store.getQueue(), this.store.getHistory())
    if (r.player.status === 'playing') {
      this.store.setPlayer(r.player)
      this.store.setQueue(r.queue)
      this.broadcastQueueAndPlayer()
    }
  }
}
