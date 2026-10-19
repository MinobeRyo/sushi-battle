import type { Archetype, Card } from '../types'
import type { RandomSource } from './types'
import { CARDS } from '../data/cards'
import { CPU_DECKS, type CpuDeckId } from '../data/cpuDecks'

// 寿司はしご（ローグライク）のラン進行。画面・保存先に依存しない純粋な処理だけを置く。

export type RunArchetype = Exclude<Archetype, 'general' | 'gunkan'>
export type RunNodeKind = 'battle' | 'rest' | 'boss'
export type RunEnemy = { cpuDeckId: CpuDeckId; initialBelly: number; label: string }
export type RunNode = { id: string; row: number; col: number; kind: RunNodeKind; next: string[]; enemy?: RunEnemy }
export type RunStatus = 'map' | 'battle' | 'reward' | 'rest' | 'won' | 'lost'
export type RunReward = { gold: number; cardIds: string[] }

export type RunState = {
  version: typeof RUN_VERSION
  archetype: RunArchetype
  /** デッキはカードIDで持つ。保存を小さくし、カード定義の更新にも追従させる。 */
  deck: string[]
  belly: number
  gold: number
  nodes: RunNode[]
  currentNodeId: string | null
  visited: string[]
  status: RunStatus
  reward: RunReward | null
  battlesWon: number
}

export const RUN_VERSION = 1
export const RUN_ROWS = 8 // 通常マスの段数。この上に大将が1マス
export const RUN_COLS = 3
export const REST_DIGEST = 30
export const SKIP_REWARD_GOLD = 50
export const MAX_RUN_BELLY = 100

export const RUN_ARCHETYPES: ReadonlyArray<{ id: RunArchetype; name: string; detail: string }> = [
  { id: 'akami', name: '赤身', detail: '重いが高火力。三種盛りで爆発' },
  { id: 'makimono', name: '巻物・軍艦', detail: '持続で机を埋め、軍艦で仕上げる' },
  { id: 'hikari', name: '光り物', detail: '切れ味を貯めてコハダで放つ' },
  { id: 'kaisen', name: '海鮮', detail: 'いか・たこの連鎖で畳みかける' },
  { id: 'niku', name: '肉寿司', detail: '生ハムを増やして生贄で強化' },
]

export const STARTER_DECK: readonly string[] = [
  'tamago', 'tamago', 'inari', 'inari', 'salmon',
  'tuna_salad_gunkan', 'tuna_salad_gunkan', 'corn_gunkan', 'cheese', 'ebi_avocado',
]

export const ARCHETYPE_STARTERS: Readonly<Record<RunArchetype, readonly string[]>> = {
  akami: ['maguro', 'chutoro', 'bintoro'],
  makimono: ['kappa_maki', 'natto_maki', 'ikura_gunkan'],
  hikari: ['aji', 'iwashi', 'kohada'],
  kaisen: ['ika', 'tako', 'ebi'],
  niku: ['gyutan', 'karubi', 'aigamo'],
}

const cardById = new Map(CARDS.map(card => [card.id, card]))

export function runDeckCards(run: Pick<RunState, 'deck'>): Card[] {
  return run.deck.flatMap(id => {
    const card = cardById.get(id)
    return card ? [card] : []
  })
}

const pick = <T,>(items: readonly T[], random: RandomSource): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]

/** 段ごとの敵。序盤は相手のお腹を高めにして短期決着にする。 */
export function enemyForRow(row: number, kind: 'battle' | 'boss', random: RandomSource): RunEnemy {
  if (kind === 'boss') return { cpuDeckId: 'challenge', initialBelly: 0, label: '大将' }
  if (row <= 2) return { cpuDeckId: 'weak', initialBelly: [30, 25, 20][row], label: '大食い客' }
  const deck = pick(CPU_DECKS, random)
  return { cpuDeckId: deck.id, initialBelly: row <= 5 ? 10 : 0, label: `大食い客 · ${deck.name}` }
}

/** 第1段で出るマスの重み。ハプニング・常連さん・買い物は後の段で足す。 */
const NODE_WEIGHTS: ReadonlyArray<readonly [Exclude<RunNodeKind, 'boss'>, number]> = [['battle', 75], ['rest', 25]]

function rollKind(random: RandomSource): Exclude<RunNodeKind, 'boss'> {
  const total = NODE_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [kind, weight] of NODE_WEIGHTS) {
    if (roll < weight) return kind
    roll -= weight
  }
  return 'battle'
}

export const nodeId = (row: number, col: number) => `r${row}c${col}`
export const BOSS_NODE_ID = 'boss'

/** 3本の道を下から上へ。隣の道へ斜めに移る線は、交差しないよう段の間ごとに1方向だけ引く。 */
export function generateRunMap(random: RandomSource = Math.random): RunNode[] {
  const nodes: RunNode[] = []
  for (let row = 0; row < RUN_ROWS; row++) {
    for (let col = 0; col < RUN_COLS; col++) {
      const kind = row === 0 ? 'battle' : rollKind(random)
      nodes.push({ id: nodeId(row, col), row, col, kind, next: [],
        ...(kind === 'battle' ? { enemy: enemyForRow(row, 'battle', random) } : {}) })
    }
  }
  const at = (row: number, col: number) => nodes[row * RUN_COLS + col]
  for (let row = 0; row < RUN_ROWS - 1; row++) {
    for (let col = 0; col < RUN_COLS; col++) at(row, col).next.push(nodeId(row + 1, col))
    for (let col = 0; col < RUN_COLS - 1; col++) {
      const roll = random()
      if (roll < 0.3) at(row, col).next.push(nodeId(row + 1, col + 1))
      else if (roll < 0.6) at(row, col + 1).next.push(nodeId(row + 1, col))
    }
  }
  for (let col = 0; col < RUN_COLS; col++) at(RUN_ROWS - 1, col).next.push(BOSS_NODE_ID)
  nodes.push({ id: BOSS_NODE_ID, row: RUN_ROWS, col: 1, kind: 'boss', next: [], enemy: enemyForRow(RUN_ROWS, 'boss', random) })
  return nodes
}

export function createRun(archetype: RunArchetype, random: RandomSource = Math.random): RunState {
  return {
    version: RUN_VERSION, archetype,
    deck: [...STARTER_DECK, ...ARCHETYPE_STARTERS[archetype]],
    belly: 0, gold: 0, nodes: generateRunMap(random),
    currentNodeId: null, visited: [], status: 'map', reward: null, battlesWon: 0,
  }
}

export function findNode(run: RunState, id: string | null): RunNode | undefined {
  return id === null ? undefined : run.nodes.find(node => node.id === id)
}

/** 次に入れるマス。開始時は1段目のどれでも選べる。 */
export function reachableNodeIds(run: RunState): string[] {
  if (run.status !== 'map') return []
  const current = findNode(run, run.currentNodeId)
  if (!current) return run.nodes.filter(node => node.row === 0).map(node => node.id)
  return current.next
}

export function enterNode(run: RunState, id: string): RunState {
  if (!reachableNodeIds(run).includes(id)) throw new Error(`入れないマスです: ${id}`)
  const node = findNode(run, id)!
  return { ...run, currentNodeId: id, visited: [...run.visited, id], status: node.kind === 'rest' ? 'rest' : 'battle' }
}

const isArchetypeCard = (card: Card, archetype: RunArchetype) => card.archetype.includes(archetype)

/** 報酬の3枚：選んだ系統・汎用・ランダムを1枚ずつ。同じ寿司は並べない。 */
export function rollRewardCards(archetype: RunArchetype, random: RandomSource = Math.random): string[] {
  const picked: string[] = []
  const take = (pool: Card[]) => {
    const candidates = pool.filter(card => !picked.includes(card.id))
    if (candidates.length > 0) picked.push(pick(candidates, random).id)
  }
  take(CARDS.filter(card => isArchetypeCard(card, archetype)))
  take(CARDS.filter(card => card.lane === 'general'))
  take([...CARDS])
  return picked
}

export function finishBattle(run: RunState, won: boolean, endBelly: number, random: RandomSource = Math.random): RunState {
  if (run.status !== 'battle') throw new Error('対戦中ではありません')
  if (!won) return { ...run, belly: MAX_RUN_BELLY, status: 'lost' }
  const node = findNode(run, run.currentNodeId)
  // 試合後に消化して、お腹を半分にして次へ持ち越す。
  const belly = Math.floor(Math.max(0, endBelly) / 2)
  const battlesWon = run.battlesWon + 1
  if (node?.kind === 'boss') return { ...run, belly, battlesWon, status: 'won' }
  const gold = 250 + Math.floor(random() * 11) * 10
  return { ...run, belly, battlesWon, gold: run.gold + gold, status: 'reward',
    reward: { gold, cardIds: rollRewardCards(run.archetype, random) } }
}

export function chooseReward(run: RunState, cardId: string | null): RunState {
  if (run.status !== 'reward' || !run.reward) throw new Error('報酬を選べる状態ではありません')
  if (cardId !== null && !run.reward.cardIds.includes(cardId)) throw new Error(`報酬にない寿司です: ${cardId}`)
  return cardId === null
    ? { ...run, gold: run.gold + SKIP_REWARD_GOLD, status: 'map', reward: null }
    : { ...run, deck: [...run.deck, cardId], status: 'map', reward: null }
}

export function takeRest(run: RunState): RunState {
  if (run.status !== 'rest') throw new Error('お茶のマスではありません')
  return { ...run, belly: Math.max(0, run.belly - REST_DIGEST), status: 'map' }
}

/** 保存データを検証する。壊れた・古いデータは null。 */
export function parseRun(raw: string | null): RunState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as RunState
    if (data?.version !== RUN_VERSION || !Array.isArray(data.deck) || !Array.isArray(data.nodes)) return null
    if (!RUN_ARCHETYPES.some(item => item.id === data.archetype)) return null
    if (!['map', 'battle', 'reward', 'rest', 'won', 'lost'].includes(data.status)) return null
    return data
  } catch {
    return null
  }
}

/** 対戦の途中は保存しない。再開すると、その対戦のマスに入る前からやり直す。 */
export function runForSave(run: RunState): RunState {
  if (run.status !== 'battle') return run
  const visited = run.visited.slice(0, -1)
  return { ...run, status: 'map', visited, currentNodeId: visited.at(-1) ?? null }
}
