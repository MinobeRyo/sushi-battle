import type { Card } from '../types'
import { CARDS } from '../data/cards'
import type { CardInstance, MatchAction, MatchEvent, MatchMode, MatchPlayer, MatchResult, MatchState, PlayerId, RandomSource } from './types'
import { applySummon, calcFieldDmg, cpuChoose, digestBonus, digestionAmount, FIELD_MAX, getCpuDeck, getCpuReorderDeck, HAND_LIMIT, INIT_AP, MAX_BELLY, shuffled } from './battleRules'

export const otherPlayer = (id: PlayerId): PlayerId => id === 1 ? 2 : 1

export type MatchOptions = { deck: Card[]; p2Deck?: Card[]; mode: MatchMode; matchId?: string }

function newPlayer(id: PlayerId): MatchPlayer {
  return {
    id, hand: [], deck: [], field: [], belly: 0, ap: INIT_AP, maxAP: INIT_AP,
    summonedIds: [], summonedArch: {}, drawBonus: 0, attackBuff: {}, combosFired: [],
    kiretaStack: 0, thisTurnBases: [], thisTurnArch: {}, digestStopTurns: 0,
    apNextBonus: 0, nikuMatsuri: false, kiretaSpent: false,
  }
}

function deal(state: MatchState, id: PlayerId, cards: Card[], random: RandomSource) {
  const instances: CardInstance[] = cards.map(card => ({
    ...structuredClone(card), instanceId: `${state.matchId}:p${id}:${state.nextInstanceId++}`,
  }))
  const deck = shuffled(instances, random)
  state.players[id].hand = deck.slice(0, 5)
  state.players[id].deck = deck.slice(5)
}

export function createMatch(options: MatchOptions, random: RandomSource = Math.random): MatchState {
  const state: MatchState = {
    matchId: options.matchId ?? 'local', mode: options.mode,
    players: { 1: newPlayer(1), 2: newPlayer(2) }, activePlayerId: 1,
    turn: 1, phase: 'playing', winnerId: null, reorderPlayerId: null,
    revision: 0, nextInstanceId: 1, log: ['バトル開始！'],
  }
  const fallback = CARDS.filter(card => card.lane === 'general').slice(0, 10)
  deal(state, 1, options.deck.length ? options.deck : fallback, random)
  deal(state, 2, options.mode === 'cpu' ? getCpuDeck(random)
    : options.p2Deck?.length ? options.p2Deck : fallback, random)
  return state
}

function addLog(state: MatchState, message: string) {
  state.log = [message, ...state.log].slice(0, 40)
}

function label(state: MatchState, id: PlayerId) {
  return state.mode === 'cpu' ? (id === 1 ? 'あなた' : 'CPU') : `P${id}`
}

function draw(player: MatchPlayer, count: number) {
  const take = Math.min(count, Math.max(0, HAND_LIMIT - player.hand.length))
  player.hand.push(...player.deck.splice(0, take))
}

function damage(state: MatchState, id: PlayerId, amount: number, events: MatchEvent[]) {
  state.players[id].belly = Math.min(MAX_BELLY, state.players[id].belly + amount)
  if (amount > 0) events.push({ type: 'damage', playerId: id, amount })
}

function checkWin(state: MatchState, events: MatchEvent[]) {
  const loser = ([1, 2] as const).find(id => state.players[id].belly >= MAX_BELLY)
  if (loser === undefined) return false
  state.winnerId = otherPlayer(loser)
  state.phase = 'over'
  state.reorderPlayerId = null
  events.push({ type: 'game_over', winnerId: state.winnerId })
  return true
}

function summon(state: MatchState, id: PlayerId, index: number, events: MatchEvent[]) {
  const player = state.players[id]
  const enemyId = otherPlayer(id)
  const enemy = state.players[enemyId]
  const [card] = player.hand.splice(index, 1)
  const result = applySummon({
    card, fieldId: card.instanceId, belly: player.belly, kireta: player.kiretaStack,
    field: player.field, summonedIds: player.summonedIds, summonedArch: player.summonedArch,
    thisTurnBases: player.thisTurnBases, thisTurnArch: player.thisTurnArch,
    combosFired: player.combosFired, attackBuff: player.attackBuff,
    drawBonus: player.drawBonus, nikuMatsuri: player.nikuMatsuri,
    kiretaSpent: player.kiretaSpent, enemyBelly: enemy.belly,
  })
  Object.assign(player, {
    belly: result.belly, kiretaStack: result.kireta, field: result.field,
    summonedIds: result.summonedIds, summonedArch: result.summonedArch,
    thisTurnBases: result.thisTurnBases, thisTurnArch: result.thisTurnArch,
    combosFired: result.combosFired, attackBuff: result.attackBuff,
    drawBonus: result.drawBonus, nikuMatsuri: result.nikuMatsuri,
    kiretaSpent: result.kiretaSpent,
    ap: player.ap - card.cost, apNextBonus: player.apNextBonus + result.apNext,
  })
  draw(player, result.drawNow)
  if (result.stopOppDigest) enemy.digestStopTurns = 1
  addLog(state, `${label(state, id)} ▶ ${card.name} 召喚`)
  for (const message of result.logs) addLog(state, `${label(state, id)}: ${message}`)
  events.push({ type: 'summon', playerId: id, cardInstanceId: card.instanceId, cardId: card.id })
  for (const combo of result.fired) events.push({ type: 'combo', playerId: id, comboId: combo.id })
  damage(state, enemyId, result.extraDmg, events)
  checkWin(state, events)
}

function finishTurn(state: MatchState, events: MatchEvent[]) {
  const id = state.activePlayerId
  const player = state.players[id]
  const nextId = otherPlayer(id)
  const total = calcFieldDmg(player.field, player.attackBuff, player.kiretaStack,
    state.players[nextId].belly, { nikuMatsuri: player.nikuMatsuri })
  if (total > 0) addLog(state, `${label(state, id)}の攻撃: ${total} ダメージ！`)
  damage(state, nextId, total, events)
  if (checkWin(state, events)) return

  player.field = player.field.map(card => ({ ...card, turnsLeft: card.turnsLeft - 1 }))
    .filter(card => card.turnsLeft > 0)
  draw(player, 1 + player.drawBonus)
  if (player.kiretaSpent) {
    player.kiretaStack = 0
    addLog(state, '✂ 切れ味スタックを使い切った（0にリセット）')
  }
  player.kiretaSpent = false
  player.nikuMatsuri = false
  player.thisTurnBases = []
  player.thisTurnArch = {}

  const oldTurn = state.turn
  if (state.mode === 'two_player' || id === 2) state.turn += 1
  state.activePlayerId = nextId
  const next = state.players[nextId]
  const round = state.mode === 'cpu' ? oldTurn : Math.ceil(oldTurn / 2)
  if (next.digestStopTurns > 0) {
    next.digestStopTurns -= 1
    addLog(state, `🚫 ${label(state, nextId)}の消化がスキップされた！`)
  } else {
    next.belly = Math.max(0, next.belly - digestionAmount(round) - digestBonus(next.field))
  }
  const baseAP = state.mode === 'two_player'
    ? INIT_AP + Math.floor((state.turn - 1) / 2)
    : INIT_AP + state.turn - (nextId === 1 ? 1 : 0)
  next.maxAP = Math.min(baseAP, 10) + next.apNextBonus
  next.ap = next.maxAP
  if (next.apNextBonus > 0) addLog(state, `⚡ ${label(state, nextId)}の一時APボーナス +${next.apNextBonus}！`)
  next.apNextBonus = 0
  events.push({ type: 'turn_started', playerId: nextId })
  addLog(state, `── ターン ${state.turn}（${label(state, nextId)}）──`)

  const allOut = Object.values(state.players).every(p => p.hand.length === 0 && p.deck.length === 0)
  // CPU戦では両者の手番が済んだ境界で補充する（既存の進行を維持）。
  if (allOut && (state.mode === 'two_player' || nextId === 1)) {
    state.phase = 'reorder'
    state.reorderPlayerId = nextId
    addLog(state, '🍽 追加注文タイム！ 軍資金 ¥1500 で補充しよう')
    events.push({ type: 'reorder_started', playerId: nextId })
  }
}

/** 1操作を原子的に確定する。入力は変更せず、演出やタイマーも実行しない。 */
export function transitionMatch(state: MatchState, action: MatchAction, random: RandomSource = Math.random): MatchResult {
  const reject = (error: string): MatchResult => ({ state, events: [], error })
  if (action.playerId !== 1 && action.playerId !== 2) return reject('unknown_player')
  if (state.phase === 'over') return reject('game_over')
  if (action.type === 'complete_reorder') {
    if (state.phase !== 'reorder' || action.playerId !== state.reorderPlayerId) return reject('not_reordering')
    const next = structuredClone(state)
    deal(next, action.playerId, action.cards, random)
    if (next.mode === 'two_player' && action.playerId === next.activePlayerId) {
      next.reorderPlayerId = otherPlayer(action.playerId)
    } else {
      if (next.mode === 'cpu') deal(next, 2, getCpuReorderDeck(random), random)
      next.phase = 'playing'
      next.reorderPlayerId = null
      addLog(next, '🍽 追加注文完了！ バトル再開')
    }
    next.revision += 1
    return { state: next, events: [] }
  }
  if (state.phase !== 'playing' || action.playerId !== state.activePlayerId) return reject('not_your_turn')
  const player = state.players[action.playerId]
  let index = -1
  if (action.type === 'play_card') {
    index = player.hand.findIndex(card => card.instanceId === action.cardInstanceId)
    if (index < 0) return reject('card_not_in_hand')
    if (player.ap < player.hand[index].cost) return reject('insufficient_ap')
    if (player.field.length >= FIELD_MAX) return reject('field_full')
  } else if (action.type !== 'end_turn') return reject('unknown_action')
  const next = structuredClone(state)
  const events: MatchEvent[] = []
  if (action.type === 'play_card') summon(next, action.playerId, index, events)
  else finishTurn(next, events)
  next.revision += 1
  return { state: next, events }
}

/** 思考の方針は既存の攻撃力順。実際の処理は人間と同じ操作を使う。 */
export function getCpuActions(state: MatchState): MatchAction[] {
  if (state.mode !== 'cpu' || state.phase !== 'playing' || state.activePlayerId !== 2) return []
  const cpu = state.players[2]
  return cpuChoose(cpu.hand, cpu.ap).slice(0, Math.max(0, FIELD_MAX - cpu.field.length))
    .map(card => ({ type: 'play_card', playerId: 2, cardInstanceId: card.instanceId }))
}
