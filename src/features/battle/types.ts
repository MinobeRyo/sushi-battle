import type { Card } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────
export type FieldCard = Card & { fid: string; turnsLeft: number; kaisenPaired?: boolean }

type Phase = 'player' | 'animating' | 'cpu' | 'pass' | 'over' | 'reorder'

export type FloatNum = { id: number; dmg: number; target: 'cpu' | 'player' }

export type ComboAnim = { name: string; emoji: string; desc: string }

export type Inspect = { card: Card; canPlay: boolean; remainingTurns?: number }

export type BattleState = {
  // Active player (always "p")
  pHand: Card[]; pField: FieldCard[]; pDeck: Card[]
  pBelly: number; pAP: number; pMaxAP: number
  pSummonedIds: string[]
  pSummonedArch: Record<string, number>
  pDrawBonus: number
  pAttackBuff: Record<string, number>
  pCombosFired: string[]
  pKiretaStack: number
  pThisTurnBases: string[]
  pThisTurnArch: Record<string, number>
  pDigestStopTurns: number
  pApNextBonus: number   // 次のターンだけのAPボーナス
  pNikuMatsuri: boolean  // このターン肉祭りが発動中か（終盤強化ボーナス×2）
  pKiretaSpent: boolean  // コハダで切れ味を使い切ったか（実際のリセットはターン終了時）
  // Opponent / CPU (always "c")
  cHand: Card[]; cField: FieldCard[]; cDeck: Card[]
  cBelly: number
  cSummonedIds: string[]
  cSummonedArch: Record<string, number>
  cDrawBonus: number
  cAttackBuff: Record<string, number>
  cCombosFired: string[]
  cKiretaStack: number
  cDigestStopTurns: number
  cApNextBonus: number
  cNikuMatsuri: boolean
  cKiretaSpent: boolean
  // Game
  activePlayer: 1 | 2
  turn: number; phase: Phase; winner: 'player' | 'cpu' | null
  log: string[]; flash: 'cpu' | 'player' | null
}
