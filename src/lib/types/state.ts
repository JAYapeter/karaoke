export type SessionId = string

export type User = {
  sessionId: SessionId
  name: string
  joinedAt: number
}

export type QueueItem = {
  id: string
  videoId: string
  title: string
  thumbnail: string
  durationSec: number
  queuedBy: { sessionId: SessionId; name: string }
  prePitch: number
  addedAt: number
}

export type PlayerStateIdle = { status: 'idle'; epoch: number }

export type PlayerStateActive = {
  status: 'playing' | 'paused'
  epoch: number
  item: QueueItem
  livePitch: number
  positionSec: number
  positionUpdatedAt: number
}

export type PlayerState = PlayerStateIdle | PlayerStateActive

export type ServerState = {
  users: { sessionId: SessionId; name: string }[]
  queue: QueueItem[]
  history: QueueItem[]
  player: PlayerState
  sourceConnected: boolean
  sourceReady: boolean
}

export type SearchResult = {
  videoId: string
  title: string
  thumbnail: string
  durationSec: number
  channel: string
}
