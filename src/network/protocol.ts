import type { MatchPlayer, PendingAttack, PendingReaction, PlayerId } from '../game/types'
import type { DraftState } from '../features/draft/draftEngine'
import type { DraftLane, DraftLaneClock, DraftOffer } from '../game/draftOffers'
import type { SideMenuId } from '../data/sideMenus'
import type { DeckSummaryEntry } from '../game/deckSummary'

export type PublicDraft = {
  draftId: string
  mode: 'initial' | 'reorder'
  startedAt: number
  initialBudget: number
  revision: number
  you: Omit<DraftState, 'purchasedIds'>
  offers: DraftOffer[]
  laneClocks: Record<DraftLane, DraftLaneClock>
  opponentCompleted: boolean
}
export type DraftCommand =
  | { type: 'omakase' }
  | { type: 'buy'; offerId: string }
  | { type: 'order'; cardId: string }
  | { type: 'buy_side_menu'; sideMenuId: SideMenuId }
  | { type: 'pickup' }
  | { type: 'complete' }
export type OnlineDraftAction = DraftCommand & { draftId: string; actionId: string; expectedRevision: number }
export type OnlineDraftHover = { draftId: string; lanes: DraftLane[]; sequence: number }

// 発動済みの公開コンボだけを配信する。手札や未公開カードの情報は含めない。
export type PublicComboEvent = { sequence: number; playerId: PlayerId; comboId: string }

export type PublicMatch = {
  matchId: string
  revision: number
  activePlayerId: PlayerId
  turn: number
  phase: 'playing' | 'reacting' | 'defending' | 'reorder' | 'over'
  pendingAttack: PendingAttack | null
  pendingReaction: PendingReaction | null
  winnerId: PlayerId | null
  you: Omit<MatchPlayer, 'deck'> & { deckCount: number; deckSummary: DeckSummaryEntry[] }
  opponent: Omit<MatchPlayer, 'hand' | 'deck'> & { handCount: number; deckCount: number }
  log: string[]
  comboEvents: PublicComboEvent[]
}

export type RoomSnapshot = {
  code: string
  serverNow: number
  playerId: PlayerId
  connected: Record<PlayerId, boolean>
  rematchRequested: Record<PlayerId, boolean>
  match: PublicMatch | null
  draft: PublicDraft | null
}
export type RoomSession = { code: string; playerId: PlayerId; token: string }
export type Reply = { ok: true } | { ok: false; error: string }
export type JoinReply = { ok: true; session: RoomSession; snapshot: RoomSnapshot } | { ok: false; error: string }
export type OnlineAction = {
  matchId: string
  actionId: string
  expectedRevision: number
  type: 'play_card' | 'end_turn' | 'use_side_menu' | 'respond_defense' | 'respond_reaction'
  cardInstanceId?: string
  sacrificeCount?: number
  targetFieldId?: string
  useGari?: boolean
  reserveDefense?: boolean
  useDefense?: boolean
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
  'draft:action': (action: OnlineDraftAction, reply: (result: Reply) => void) => void
  'draft:hover': (hover: OnlineDraftHover, reply: (result: Reply) => void) => void
  'match:rematch': (reply: (result: Reply) => void) => void
}
