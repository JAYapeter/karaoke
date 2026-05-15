import type { PlayerState, QueueItem, ServerState, User } from '@/lib/types/state'

type Listener = () => void

export class Store {
  private users = new Map<string, User>()
  private queue: QueueItem[] = []
  private history: QueueItem[] = []
  private player: PlayerState = { status: 'idle', epoch: 0 }
  private sourceConnected = false
  private sourceReady = false
  private serverHost: string | null = null
  private listeners = new Set<Listener>()

  constructor(private readonly sourceToken: string) {}

  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  verifySourceToken(token: string): boolean {
    return token === this.sourceToken
  }

  snapshot(): ServerState {
    return {
      users: [...this.users.values()].map(({ sessionId, name }) => ({ sessionId, name })),
      queue: [...this.queue],
      history: [...this.history],
      player: this.player,
      sourceConnected: this.sourceConnected,
      sourceReady: this.sourceReady,
      serverHost: this.serverHost,
    }
  }

  // Mutators
  addUser(sessionId: string, name: string) {
    this.users.set(sessionId, { sessionId, name, joinedAt: Date.now() })
    this.emit()
  }
  removeUser(sessionId: string) {
    if (this.users.delete(sessionId)) this.emit()
  }
  getUser(sessionId: string): User | undefined {
    return this.users.get(sessionId)
  }
  setQueue(q: QueueItem[]) { this.queue = q; this.emit() }
  setHistory(h: QueueItem[]) { this.history = h; this.emit() }
  setPlayer(p: PlayerState) { this.player = p; this.emit() }
  setSourceConnected(b: boolean) { this.sourceConnected = b; this.emit() }
  setSourceReady(b: boolean) { this.sourceReady = b; this.emit() }
  setServerHost(host: string | null) { this.serverHost = host; this.emit() }

  // Read-only accessors
  getQueue(): readonly QueueItem[] { return this.queue }
  getHistory(): readonly QueueItem[] { return this.history }
  getPlayer(): PlayerState { return this.player }
  getSourceReady(): boolean { return this.sourceReady }
}
