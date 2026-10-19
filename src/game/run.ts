import type { Archetype, Card } from '../types'
import type { PlayerId, RandomSource } from './types'
import { CARDS } from '../data/cards'
import { canAburi, toAburi } from '../data/aburi'
import { CPU_DECKS, type CpuDeckId } from '../data/cpuDecks'
import { isSideMenuId, SIDE_MENUS, type SideMenuId } from '../data/sideMenus'
import { isRelicId, REGULAR_SKILLS, RELICS, type RegularSkillId, type RelicGrade, type RelicId } from '../data/runRelics'
import type { PlayerMods } from './runMods'

// 寿司はしご（ローグライク）のラン進行。画面・保存先に依存しない純粋な処理だけを置く。

export type RunArchetype = Exclude<Archetype, 'general' | 'gunkan'>
export type RunNodeKind = 'battle' | 'regular' | 'rest' | 'boss'
/** maxBelly は敵の満腹ライン。序盤ほど小さく、短い試合で進める。 */
export type RunEnemy = { cpuDeckId: CpuDeckId; maxBelly: number; label: string; skill?: RegularSkillId }
export type RunNode = { id: string; row: number; col: number; kind: RunNodeKind; next: string[]; enemy?: RunEnemy }
/** start_relic：系統を選んだ直後、地図の前に器を3つから1つ選ぶ。 */
export type RunStatus = 'start_relic' | 'map' | 'battle' | 'reward' | 'rest' | 'won' | 'lost'
/** 常連さんに勝つと、寿司に加えて器3つかサイドメニュー3品から1つを選べる。 */
export type RunReward = {
  gold: number
  cardIds: string[]
  cardDone?: boolean
  relicIds?: RelicId[]
  sideMenuIds?: SideMenuId[]
  bonusDone?: boolean
}

export type RunState = {
  version: typeof RUN_VERSION
  archetype: RunArchetype
  /** デッキはカードIDで持つ。保存を小さくし、カード定義の更新にも追従させる。炙りは「id#aburi」。 */
  deck: string[]
  /** 集めた器。何個でも持てる。 */
  relics: RelicId[]
  /** 持ち越すサイドメニュー1枠。毎試合、買ったばかりの状態で持ち込む。 */
  sideMenu: SideMenuId | null
  /** 開始時の器の3択。選ぶ前に中断しても同じ3択で再開できるよう保存する。 */
  startRelicIds?: RelicId[]
  belly: number
  gold: number
  nodes: RunNode[]
  currentNodeId: string | null
  visited: string[]
  status: RunStatus
  reward: RunReward | null
  battlesWon: number
}

export const RUN_VERSION = 3
export const RUN_ROWS = 8 // 通常マスの段数。この上に大将が1マス
export const RUN_COLS = 3
export const REST_DIGEST = 30
export const SKIP_REWARD_GOLD = 50
export const MAX_RUN_BELLY = 100
export const ABURI_SUFFIX = '#aburi'
// デッキが13枚と少なく安い寿司が多いので、試合では手札を厚くする（通常は5枚・毎ターン1枚）。
export const RUN_OPENING_HAND = 6
export const RUN_DRAW_PER_TURN = 2

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
  // 三種盛りを最初から狙えるよう、マグロ・中トロ・大トロを揃える。
  akami: ['maguro', 'chutoro', 'otoro'],
  makimono: ['kappa_maki', 'natto_maki', 'ikura_gunkan'],
  hikari: ['aji', 'iwashi', 'kohada'],
  kaisen: ['ika', 'tako', 'ebi'],
  // 牛タン・焼肉寿司で生ハムを増やし、カルビで生贄にする。
  niku: ['gyutan', 'karubi', 'yakiniku'],
}

const cardById = new Map(CARDS.map(card => [card.id, card]))

export const isAburiId = (deckId: string) => deckId.endsWith(ABURI_SUFFIX)
export const baseCardId = (deckId: string) => isAburiId(deckId) ? deckId.slice(0, -ABURI_SUFFIX.length) : deckId
export const aburiDeckId = (cardId: string) => `${baseCardId(cardId)}${ABURI_SUFFIX}`

/** ランのデッキIDからカードを作る。炙りフラグ付きなら炙り版にする。 */
export function runCard(deckId: string): Card | undefined {
  const card = cardById.get(baseCardId(deckId))
  return card && isAburiId(deckId) ? toAburi(card) : card
}

export function runDeckCards(run: Pick<RunState, 'deck'>): Card[] {
  return run.deck.flatMap(id => {
    const card = runCard(id)
    return card ? [card] : []
  })
}

/** お茶マスで炙れるか。1枚につき1回まで、生ハムは炙れない。 */
export function canAburiDeckId(deckId: string): boolean {
  const card = cardById.get(baseCardId(deckId))
  return !isAburiId(deckId) && !!card && canAburi(card)
}

const pick = <T,>(items: readonly T[], random: RandomSource): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]

/** 段ごとの敵の満腹ライン。1軒目50から上げていき、大将だけ100。 */
export const ENEMY_MAX_BELLY_BY_ROW: readonly number[] = [50, 55, 60, 60, 65, 70, 75, 80]
export const BOSS_MAX_BELLY = 100

/** 段ごとの敵。序盤は満腹ラインを低くして短期決着にする。常連さんは同じ段の大食い客より1段強いデッキ＋得意技。 */
export function enemyForRow(row: number, kind: 'battle' | 'regular' | 'boss', random: RandomSource): RunEnemy {
  if (kind === 'boss') return { cpuDeckId: 'challenge', maxBelly: BOSS_MAX_BELLY, label: '大将' }
  const maxBelly = ENEMY_MAX_BELLY_BY_ROW[Math.min(row, ENEMY_MAX_BELLY_BY_ROW.length - 1)]
  if (kind === 'regular') {
    const skill = pick(REGULAR_SKILLS, random)
    if (row <= 2) {
      const deck = pick(CPU_DECKS, random)
      return { cpuDeckId: deck.id, maxBelly, label: `常連さん · ${deck.name}`, skill: skill.id }
    }
    return { cpuDeckId: 'challenge', maxBelly, label: '常連さん · 肉寿司＋巻物', skill: skill.id }
  }
  if (row <= 2) return { cpuDeckId: 'weak', maxBelly, label: '大食い客' }
  const deck = pick(CPU_DECKS, random)
  return { cpuDeckId: deck.id, maxBelly, label: `大食い客 · ${deck.name}` }
}

/** 第2段で出るマスの重み。ハプニング・買い物（企画書の20・8）は第3段で足すまで対戦とお茶に寄せる。 */
const NODE_WEIGHTS: ReadonlyArray<readonly [Exclude<RunNodeKind, 'boss'>, number]> = [['battle', 65], ['regular', 15], ['rest', 20]]

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
        ...(kind === 'battle' || kind === 'regular' ? { enemy: enemyForRow(row, kind, random) } : {}) })
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

/** ランを始める。最初に器を3つから1つ選ぶ画面（start_relic）から始まる。 */
export function createRun(archetype: RunArchetype, random: RandomSource = Math.random): RunState {
  const nodes = generateRunMap(random)
  return {
    version: RUN_VERSION, archetype,
    deck: [...STARTER_DECK, ...ARCHETYPE_STARTERS[archetype]],
    relics: [], sideMenu: null,
    startRelicIds: rollRelicChoices({ archetype, relics: [] }, random),
    belly: 0, gold: 0, nodes,
    currentNodeId: null, visited: [], status: 'start_relic', reward: null, battlesWon: 0,
  }
}

/** 開始時の器を受け取って地図へ進む。 */
export function chooseStartRelic(run: RunState, relicId: RelicId): RunState {
  if (run.status !== 'start_relic' || !run.startRelicIds) throw new Error('開始時の器を選べる状態ではありません')
  if (!run.startRelicIds.includes(relicId)) throw new Error(`選べない器です: ${relicId}`)
  const { startRelicIds: _, ...rest } = run
  return { ...rest, relics: [...run.relics, relicId], status: 'map' }
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

/**
 * 報酬の3枚：選んだ系統・汎用・ランダムを1枚ずつ。同じ寿司は並べない。
 * withAburi なら（常連さんの報酬）、どれか1枚を炙り済みにする。
 */
export function rollRewardCards(archetype: RunArchetype, random: RandomSource = Math.random, withAburi = false): string[] {
  const picked: string[] = []
  const take = (pool: Card[]) => {
    const candidates = pool.filter(card => !picked.includes(card.id))
    if (candidates.length > 0) picked.push(pick(candidates, random).id)
  }
  take(CARDS.filter(card => isArchetypeCard(card, archetype)))
  take(CARDS.filter(card => card.lane === 'general'))
  take([...CARDS])
  if (withAburi) {
    const slots = picked.flatMap((id, index) => canAburiDeckId(id) ? [index] : [])
    if (slots.length > 0) {
      const slot = pick(slots, random)
      picked[slot] = aburiDeckId(picked[slot])
    }
  }
  return picked
}

/** 器の格の出やすさ（仮）：並60%・上30%・特上10%。 */
const RELIC_GRADE_WEIGHTS: ReadonlyArray<readonly [RelicGrade, number]> = [['nami', 60], ['jo', 30], ['tokujo', 10]]

function rollGrade(random: RandomSource): RelicGrade {
  let roll = random() * 100
  for (const [grade, weight] of RELIC_GRADE_WEIGHTS) {
    if (roll < weight) return grade
    roll -= weight
  }
  return 'nami'
}

/** 器の3択。1つは選んだ系統の器。持っている器と同じものは出さない。足りなければ出せる分だけ。 */
export function rollRelicChoices(run: Pick<RunState, 'archetype' | 'relics'>, random: RandomSource = Math.random): RelicId[] {
  const picked: RelicId[] = []
  const take = (pool: typeof RELICS) => {
    const open = pool.filter(relic => !run.relics.includes(relic.id) && !picked.includes(relic.id))
    if (open.length === 0) return
    const grade = rollGrade(random)
    const graded = open.filter(relic => relic.grade === grade)
    picked.push(pick(graded.length > 0 ? graded : open, random).id)
  }
  take(RELICS.filter(relic => relic.archetype === run.archetype))
  take(RELICS)
  take(RELICS)
  return picked
}

export function rollSideMenuChoices(random: RandomSource = Math.random): SideMenuId[] {
  const pool = SIDE_MENUS.map(menu => menu.id)
  const picked: SideMenuId[] = []
  while (picked.length < 3 && pool.length > 0) picked.push(...pool.splice(Math.floor(random() * pool.length), 1))
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
  if (node?.kind === 'regular') {
    const gold = 450 + Math.floor(random() * 11) * 10
    return { ...run, belly, battlesWon, gold: run.gold + gold, status: 'reward', reward: {
      gold, cardIds: rollRewardCards(run.archetype, random, true),
      relicIds: rollRelicChoices(run, random), sideMenuIds: rollSideMenuChoices(random),
    } }
  }
  const gold = 250 + Math.floor(random() * 11) * 10
  return { ...run, belly, battlesWon, gold: run.gold + gold, status: 'reward',
    reward: { gold, cardIds: rollRewardCards(run.archetype, random) } }
}

const hasBonus = (reward: RunReward) => Boolean(reward.relicIds?.length || reward.sideMenuIds?.length)

/** 寿司と（常連さんなら）器・サイドメニューの両方を選び終えたら地図へ戻る。 */
function settleReward(run: RunState, reward: RunReward): RunState {
  return reward.cardDone && (reward.bonusDone || !hasBonus(reward))
    ? { ...run, status: 'map', reward: null } : { ...run, reward }
}

export function chooseReward(run: RunState, cardId: string | null): RunState {
  if (run.status !== 'reward' || !run.reward || run.reward.cardDone) throw new Error('報酬を選べる状態ではありません')
  if (cardId !== null && !run.reward.cardIds.includes(cardId)) throw new Error(`報酬にない寿司です: ${cardId}`)
  const next = cardId === null
    ? { ...run, gold: run.gold + SKIP_REWARD_GOLD }
    : { ...run, deck: [...run.deck, cardId] }
  return settleReward(next, { ...run.reward, cardDone: true })
}

export type RunBonusChoice = { relic: RelicId } | { sideMenu: SideMenuId } | null

/** 常連さんの報酬：器1つか、サイドメニュー1品（持ち越し枠を入れ替える）。null で見送る。 */
export function chooseBonus(run: RunState, choice: RunBonusChoice): RunState {
  const reward = run.reward
  if (run.status !== 'reward' || !reward || !hasBonus(reward) || reward.bonusDone) throw new Error('器を選べる状態ではありません')
  let next = run
  if (choice && 'relic' in choice) {
    if (!reward.relicIds?.includes(choice.relic)) throw new Error(`報酬にない器です: ${choice.relic}`)
    next = { ...run, relics: [...run.relics, choice.relic] }
  } else if (choice) {
    if (!reward.sideMenuIds?.includes(choice.sideMenu)) throw new Error(`報酬にないサイドメニューです: ${choice.sideMenu}`)
    next = { ...run, sideMenu: choice.sideMenu }
  }
  return settleReward(next, { ...reward, bonusDone: true })
}

/** お茶マス：お腹を30減らす。 */
export function takeRest(run: RunState): RunState {
  if (run.status !== 'rest') throw new Error('お茶のマスではありません')
  return { ...run, belly: Math.max(0, run.belly - REST_DIGEST), status: 'map' }
}

/** お茶マス：デッキの1枚を炙る（お腹は減らない）。 */
export function aburiAtRest(run: RunState, deckIndex: number): RunState {
  if (run.status !== 'rest') throw new Error('お茶のマスではありません')
  const deckId = run.deck[deckIndex]
  if (deckId === undefined || !canAburiDeckId(deckId)) throw new Error(`炙れない寿司です: ${deckId}`)
  const deck = [...run.deck]
  deck[deckIndex] = aburiDeckId(deckId)
  return { ...run, deck, status: 'map' }
}

/** 試合に持ち込む補正：自分は器、常連さんは得意技。 */
export function runMatchMods(run: Pick<RunState, 'relics'>, enemy: RunEnemy | undefined): Partial<Record<PlayerId, PlayerMods>> {
  return {
    ...(run.relics.length > 0 ? { 1: { relics: [...run.relics] } } : {}),
    ...(enemy?.skill ? { 2: { skill: enemy.skill } } : {}),
  }
}

/** 保存データを検証する。壊れたデータは null。第1段の満腹ライン版（version 2）は器なしとして読み込む。version 1 は敵の形が違うので読まない。 */
export function parseRun(raw: string | null): RunState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Omit<RunState, 'version' | 'relics' | 'sideMenu'> & { version: number; relics?: unknown; sideMenu?: unknown }
    if (parsed?.version === 2) Object.assign(parsed, { version: RUN_VERSION, relics: [], sideMenu: null })
    const data = parsed as RunState
    if (data?.version !== RUN_VERSION || !Array.isArray(data.deck) || !Array.isArray(data.nodes)) return null
    if (!RUN_ARCHETYPES.some(item => item.id === data.archetype)) return null
    if (!['start_relic', 'map', 'battle', 'reward', 'rest', 'won', 'lost'].includes(data.status)) return null
    if (data.status === 'start_relic' && !(Array.isArray(data.startRelicIds) && data.startRelicIds.length > 0 && data.startRelicIds.every(isRelicId))) return null
    if (!Array.isArray(data.relics) || !data.relics.every(isRelicId)) return null
    if (data.sideMenu !== null && !isSideMenuId(data.sideMenu)) return null
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
