import type { Card } from '../types'
import type { SideMenuId } from '../data/sideMenus'

export type PlayerId = 1 | 2
export type MatchMode = 'cpu' | 'two_player'
export type RandomSource = () => number
export type CardInstance = Card & { instanceId: string }
export type FieldCard = Card & { fid: string; turnsLeft: number; kaisenPaired?: boolean; turnAttackBonus?: number }

export type SideMenuState = {
  id: SideMenuId
  status: 'ready' | 'active' | 'used' | 'expired'
  turnsLeft: number | null
  usedThisTurn: boolean
}

export type MatchPlayer = {
  id: PlayerId
  hand: CardInstance[]
  deck: CardInstance[]
  field: FieldCard[]
  belly: number
  ap: number
  maxAP: number
  gari: number
  summonedIds: string[]
  summonedArch: Record<string, number>
  drawBonus: number
  attackBuff: Record<string, number>
  combosFired: string[]
  kiretaStack: number
  thisTurnBases: string[]
  thisTurnArch: Record<string, number>
  digestStopTurns: number
  apNextBonus: number
  nikuMatsuri: boolean
  kiretaSpent: boolean
  sideMenu: SideMenuState | null
  sushiPlayedThisTurn: number
  tempuraTriggeredThisTurn: boolean
  skippedDigestionThisTurn: number
}

export type PendingAttack = {
  attackerId: PlayerId
  defenderId: PlayerId
  amount: number
  source: 'summon' | 'end_turn'
}

// 通信・保存できるデータだけを持つ。演出、React、待ち時間は含めない。
export type MatchState = {
  matchId: string
  mode: MatchMode
  players: Record<PlayerId, MatchPlayer>
  activePlayerId: PlayerId
  turn: number
  phase: 'playing' | 'defending' | 'reorder' | 'over'
  winnerId: PlayerId | null
  reorderPlayerId: PlayerId | null
  pendingAttack: PendingAttack | null
  revision: number
  nextInstanceId: number
  log: string[]
}

export type MatchAction =
  | { type: 'play_card'; playerId: PlayerId; cardInstanceId: string }
  | { type: 'end_turn'; playerId: PlayerId }
  | { type: 'use_side_menu'; playerId: PlayerId }
  | { type: 'respond_defense'; playerId: PlayerId; useGari: boolean }
  // 購入の検証が済んだカードを渡す内部操作。通信要求を直接渡さない。
  | { type: 'complete_reorder'; playerId: PlayerId; cards: Card[] }

export type MatchEvent =
  | { type: 'summon'; playerId: PlayerId; cardInstanceId: string; cardId: string }
  | { type: 'damage'; playerId: PlayerId; amount: number }
  | { type: 'defense_requested'; attack: PendingAttack }
  | { type: 'defense_resolved'; playerId: PlayerId; usedGari: boolean; reduction: number }
  | { type: 'combo'; playerId: PlayerId; comboId: string }
  | { type: 'turn_started'; playerId: PlayerId }
  | { type: 'reorder_started'; playerId: PlayerId }
  | { type: 'game_over'; winnerId: PlayerId }

export type MatchResult = { state: MatchState; events: MatchEvent[]; error?: string }
