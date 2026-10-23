import type { RandomSource } from './types'
import type { RelicId } from '../data/runRelics'
import { RUN_EVENT_IDS } from '../data/runEvents'
import {
  BOSS_NODE_ID, MAX_RUN_BELLY, RUN_ACT_COUNT, RUN_ROWS, actOf, aburiDeckId, canAburiDeckId, enemyForRow, findNode, finishBattle,
  startNextAct,
  type RunNode, type RunNodeKind, type RunState,
} from './run'

// 寿司はしごのデバッグ用の操作（アドレスに #debug を付けたときだけ画面に出す）。通常の遊びでは使わない。

export type DebugJumpKind = Exclude<RunNodeKind, 'boss'> | 'boss'

/**
 * 好きな種類のマスに飛ぶ。今いるマスの代わりに仮のマスを置き、抜けたあとは今の続き（同じ次のマス）から進む。
 * ボスは今の幕のボスのマスへ直接入る。
 */
export function debugJump(run: RunState, kind: DebugJumpKind, random: RandomSource = Math.random, eventId?: string): RunState {
  const act = actOf(run)
  const { event: _e, shop: _s, reward: _r, ...base } = run
  const cleared: RunState = { ...base, reward: null }
  if (kind === 'boss') {
    return { ...cleared, currentNodeId: BOSS_NODE_ID, visited: [...run.visited, BOSS_NODE_ID], status: 'battle' }
  }
  const current = findNode(run, run.currentNodeId)
  const row = current?.debug ? current.row : current ? Math.min(current.row + 1, RUN_ROWS - 1) : 0
  const next = current ? current.next : run.nodes.filter(node => node.row === 0 && !node.debug).map(node => node.id)
  const node: RunNode = {
    id: `debug${run.visited.length}`, row, col: -1, kind, next, debug: true,
    ...(kind === 'battle' || kind === 'regular' ? { enemy: enemyForRow(row, kind, random, act) } : {}),
  }
  const nodes = [...run.nodes.filter(item => !item.debug || item.id === run.currentNodeId), node]
  const moved: RunState = { ...cleared, nodes, currentNodeId: node.id, visited: [...run.visited, node.id] }
  if (kind === 'rest') return { ...moved, status: 'rest' }
  if (kind === 'shop') return { ...moved, status: 'shop', shop: { laneDone: false } }
  if (kind === 'event') {
    const id = eventId && RUN_EVENT_IDS.includes(eventId) ? eventId : RUN_EVENT_IDS[Math.floor(random() * RUN_EVENT_IDS.length)]
    return { ...moved, status: 'event', event: { id }, seenEvents: [...(run.seenEvents ?? []), id] }
  }
  return { ...moved, status: 'battle' }
}

/** 対戦のマスで、試合をせずに勝ち・負けにする。 */
export function debugFinishBattle(run: RunState, won: boolean, random: RandomSource = Math.random): RunState {
  return finishBattle(run, won, won ? run.belly : MAX_RUN_BELLY, random)
}

export const debugGold = (run: RunState, amount: number): RunState => ({ ...run, gold: Math.max(0, run.gold + amount) })

export const debugBelly = (run: RunState, belly: number): RunState =>
  ({ ...run, belly: Math.max(0, Math.min(MAX_RUN_BELLY - 1, Math.floor(belly))) })

export function debugAddRelic(run: RunState, id: RelicId): RunState {
  return run.relics.includes(id) ? run : { ...run, relics: [...run.relics, id] }
}

export const debugAddCard = (run: RunState, deckId: string): RunState => ({ ...run, deck: [...run.deck, deckId] })

export const debugRemoveCard = (run: RunState, deckIndex: number): RunState =>
  ({ ...run, deck: run.deck.filter((_, index) => index !== deckIndex) })

/** デッキの炙れる寿司をすべて炙る。 */
export const debugAburiAll = (run: RunState): RunState =>
  ({ ...run, deck: run.deck.map(id => canAburiDeckId(id) ? aburiDeckId(id) : id) })

/** 次の幕の入口へ（最後の幕なら何もしない）。 */
export function debugNextAct(run: RunState, random: RandomSource = Math.random): RunState {
  return actOf(run) >= RUN_ACT_COUNT ? run : startNextAct({ ...run, event: undefined, shop: undefined }, random)
}
