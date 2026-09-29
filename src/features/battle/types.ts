import type { Card } from '../../types'
import type { CardInstance, FieldCard, SideMenuState } from '../../game/types'
export type { FieldCard } from '../../game/types'

// ── Types ─────────────────────────────────────────────────────────────────────
export type ViewPhase = 'player' | 'animating' | 'cpu' | 'pass' | 'over' | 'reorder' | 'waiting' | 'syncing'

export type FloatNum = { id: number; dmg: number; target: 'cpu' | 'player' }

export type ComboAnim = { key: number; name: string; desc: string; playerLabel: string }

export type Inspect = { card: Card; canPlay: boolean; remainingTurns?: number; owner?: 'player' | 'opponent'; playBlockedReason?: string; actualAttack?: number }

// 既存の画面部品へ渡す投影。対戦の正本は game/types.ts の MatchState。
export type BattleView = {
  pSideMenu: SideMenuState | null
  cSideMenu: SideMenuState | null
  // この端末から見た自分側
  pHand: CardInstance[]; pField: FieldCard[]; pDeckCount: number
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
  // この端末から見た相手側（ローカル対戦用）
  cHandCount: number; cField: FieldCard[]; cDeckCount: number
  cBelly: number; cAP: number; cMaxAP: number
  cSummonedIds: string[]
  cSummonedArch: Record<string, number>
  cThisTurnArch: Record<string, number>
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
  turn: number; phase: ViewPhase; winner: 'player' | 'cpu' | null
  log: string[]; flash: 'cpu' | 'player' | null
}
