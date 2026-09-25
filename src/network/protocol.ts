import type { MatchPlayer, PlayerId } from '../game/types'

export type PublicMatch = {
  matchId: string
  revision: number
  activePlayerId: PlayerId
  turn: number
  phase: 'playing' | 'reorder' | 'over'
  winnerId: PlayerId | null
  you: Omit<MatchPlayer, 'deck'> & { deckCount: number }
  opponent: Omit<MatchPlayer, 'hand' | 'deck'> & { handCount: number; deckCount: number }
  log: string[]
}

export type RoomSnapshot = {
  code: string
  playerId: PlayerId
  connected: Record<PlayerId, boolean>
  rematchRequested: Record<PlayerId, boolean>
  match: PublicMatch | null
}
export type RoomSession = { code: string; playerId: PlayerId; token: string }
export type Reply = { ok: true } | { ok: false; error: string }
export type JoinReply = { ok: true; session: RoomSession; snapshot: RoomSnapshot } | { ok: false; error: string }
export type OnlineAction = {
  matchId: string
  actionId: string
  expectedRevision: number
  type: 'play_card' | 'end_turn'
  cardInstanceId?: string
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void
  'room:closed': (reason: string) => void
}
export interface ClientToServerEvents {
  'room:create': (reply: (result: JoinReply) => void) => void
  'room:join': (request: { code: string }, reply: (result: JoinReply) => void) => void
  'room:resume': (request: { code: string; token: string }, reply: (result: JoinReply) => void) => void
  'room:leave': (reply: (result: Reply) => void) => void
  'match:action': (action: OnlineAction, reply: (result: Reply) => void) => void
  'match:rematch': (reply: (result: Reply) => void) => void
}
