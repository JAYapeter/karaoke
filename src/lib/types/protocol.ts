import type { PlayerState, QueueItem, ServerState, SearchResult } from './state'

export type ClientMutating =
  | { type: 'queue.add'; msgId: string; videoId: string; prePitch: number }
  | { type: 'queue.remove'; msgId: string; itemId: string }
  | { type: 'queue.move'; msgId: string; itemId: string; toIndex: number }
  | { type: 'queue.shuffle'; msgId: string }
  | { type: 'player.skip'; msgId: string; epoch: number }
  | { type: 'player.prev'; msgId: string; epoch: number }
  | { type: 'player.pause'; msgId: string }
  | { type: 'player.play'; msgId: string }
  | { type: 'player.setLivePitch'; msgId: string; semitones: number }
  | { type: 'player.setPrePitch'; msgId: string; itemId: string; semitones: number }
  | { type: 'player.setVolume'; msgId: string; volume: number }

export type ClientNonMutating =
  | { type: 'join'; msgId: string; sessionId: string; name: string; sourceToken?: string }
  | { type: 'source.ready'; msgId: string; sourceToken: string }
  | { type: 'search'; msgId: string; query: string }
  | { type: 'meta.fetch'; msgId: string; videoId: string }

export type ClientEvent =
  | { type: 'player.position'; epoch: number; positionSec: number }
  | { type: 'player.ended'; epoch: number }
  | { type: 'player.error'; epoch: number; itemId: string; message: string }

export type ClientMessage = ClientMutating | ClientNonMutating | ClientEvent

export type ServerMessage =
  | { type: 'state.full'; state: ServerState }
  | { type: 'state.queue'; queue: QueueItem[]; history: QueueItem[] }
  | { type: 'state.player'; player: PlayerState }
  | { type: 'state.ack'; msgId: string; ok: boolean; error?: string }
  | { type: 'search.results'; msgId: string; results: SearchResult[] }
  | { type: 'meta.result'; msgId: string; videoId: string; title: string; thumbnail: string; durationSec: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
