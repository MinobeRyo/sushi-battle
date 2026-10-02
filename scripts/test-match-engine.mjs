#!/usr/bin/env node
// React・ブラウザ・タイマーを使わず、実際の試合進行を検証する。
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions, getCpuDefenseAction } = loadTs('src/game/matchEngine.ts')
const { INIT_GARI, GARI_REDUCTION_RATE } = loadTs('src/game/battleRules.ts')
const byId = id => {
  const card = CARDS.find(c => c.id === id)
  assert.ok(card, `カードが見つかりません: ${id}`)
  return card
}
const copies = (id, count) => Array.from({ length: count }, () => byId(id))
const keepOrder = () => 0.999
const clone = value => JSON.parse(JSON.stringify(value))
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}
const make = (options = {}) => createMatch({
  deck: copies('tamago', 10), p2Deck: copies('tamago', 10),
  mode: 'two_player', matchId: 'regression', ...options,
}, keepOrder)
const end = (state, playerId = state.activePlayerId) => ({ type: 'end_turn', playerId })
const play = (state, id, playerId = state.activePlayerId) => {
  const card = state.players[playerId].hand.find(c => c.id === id)
  assert.ok(card, `P${playerId}の手札に${id}が必要です`)
  return { type: 'play_card', playerId, cardInstanceId: card.instanceId }
}
const step = (state, action) => {
  const before = clone(state)
  const result = transitionMatch(deepFreeze(state), action, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before, '入力状態を変更してはいけません')
  assert.equal(result.state.revision, state.revision + 1)
  assert.ok(Array.isArray(result.events))
  assert.deepEqual(clone(result.state), result.state, '状態はJSONで往復できる必要があります')
  return result.state
}
const advance = (state, action) => {
  const next = step(state, action)
  return next.phase === 'defending'
    ? step(next, { type: 'respond_defense', playerId: next.pendingAttack.defenderId, useGari: false })
    : next
}
const defend = (state, useGari, playerId = state.pendingAttack?.defenderId) => ({ type: 'respond_defense', playerId, useGari })
const reject = (state, action) => {
  const before = clone(state)
  const result = transitionMatch(deepFreeze(state), action, keepOrder)
  assert.ok(result.error, '不正な操作にはエラーが必要です')
  assert.deepEqual(result.state, before, '拒否した操作で状態が変わってはいけません')
  assert.deepEqual(state, before)
  assert.deepEqual(result.events, [], '拒否した操作で演出や通知を発行してはいけません')
}
const putOnField = (state, playerId, id, turnsLeft) => {
  const player = state.players[playerId]
  const index = player.hand.findIndex(card => card.id === id)
  assert.ok(index >= 0)
  const [card] = player.hand.splice(index, 1)
  player.field.push({ ...card, fid: card.instanceId, turnsLeft })
}
const allInstanceIds = state => Object.values(state.players).flatMap(player => [
  ...player.hand.map(c => c.instanceId), ...player.deck.map(c => c.instanceId),
  ...player.field.map(c => c.fid),
])
let passed = 0
let failed = 0
const test = (label, run) => {
  try {
    run()
    passed++
    console.log(`  ✓ ${label}`)
  } catch (error) {
    failed++
    console.error(`  ✗ ${label}\n${error.stack}`)
  }
}

console.log('\n[試合エンジン] 初期化・カード個体・操作検証')
test('同じカードの複数枚と両プレイヤーに、異なる個体IDを割り当てる', () => {
  const state = make()
  const ids = allInstanceIds(state)
  assert.equal(ids.length, 20)
  assert.equal(new Set(ids).size, 20)
  assert.deepEqual([state.players[1].hand.length, state.players[1].deck.length], [5, 5])
  assert.deepEqual([state.activePlayerId, state.turn, state.phase], [1, 1, 'playing'])
  assert.deepEqual([state.players[1].gari, state.players[2].gari], [1, 2])
  assert.equal(state.pendingAttack, null)
})
test('初回に両者が0枚で終了した場合は、汎用カード10枚ずつで開始する', () => {
  const state = make({ deck: [], p2Deck: [] })
  const expected = CARDS.filter(card => card.lane === 'general').slice(0, 10).map(card => card.id)
  for (const player of Object.values(state.players)) {
    assert.deepEqual([...player.hand, ...player.deck].map(card => card.id), expected)
  }
})
test('JSONから復元したカードを個体IDで召喚し、同じ種類の残り1枚を保持する', () => {
  let state = clone(make({ deck: copies('tamago', 2) }))
  const [first, second] = state.players[1].hand
  const action = { type: 'play_card', playerId: 1, cardInstanceId: first.instanceId }
  state = advance(state, action)
  assert.deepEqual(state.players[1].hand.map(c => c.instanceId), [second.instanceId])
  assert.deepEqual(state.players[1].field.map(c => c.fid), [first.instanceId])
  assert.equal(state.players[1].ap, 1)
  reject(state, action)
  state = advance(state, play(state, 'tamago'))
  assert.equal(state.players[1].field.length, 2)
  assert.equal(state.players[1].ap, 0)
})
test('相手の手番での召喚・ターン終了を拒否する', () => {
  const state = make()
  reject(state, play(state, 'tamago', 2))
  reject(state, end(state, 2))
})
test('相手のカード個体IDと存在しない個体IDの召喚を拒否する', () => {
  const state = make()
  reject(state, { type: 'play_card', playerId: 1, cardInstanceId: state.players[2].hand[0].instanceId })
  reject(state, { type: 'play_card', playerId: 1, cardInstanceId: 'missing-card' })
})
test('AP不足では手札・履歴・APを変更しない', () => {
  const state = make({ deck: [byId('otoro')] })
  reject(state, play(state, 'otoro'))
})
test('机8枚では召喚を拒否する', () => {
  const state = make({ deck: copies('tamago', 9) })
  const player = state.players[1]
  player.hand.push(...player.deck.splice(0))
  for (let i = 0; i < 8; i++) putOnField(state, 1, 'tamago', 1)
  reject(state, play(state, 'tamago'))
})
test('通常対戦中の追加注文完了を拒否する', () => {
  reject(make(), { type: 'complete_reorder', playerId: 1, cards: copies('tamago', 2) })
})
test('存在しないプレイヤーと操作種別を拒否する', () => {
  reject(make(), { type: 'end_turn', playerId: 3 })
  reject(make(), { type: 'unknown_operation', playerId: 1 })
})

console.log('\n[試合エンジン] ドロー・ターン・持続効果')
test('手札7枚の終了時ドローは山札を減らさない', () => {
  const state = make()
  state.players[1].hand.push(...state.players[1].deck.splice(0, 2))
  const deckBefore = clone(state.players[1].deck)
  const next = advance(state, end(state))
  assert.equal(next.players[1].hand.length, 7)
  assert.deepEqual(next.players[1].deck, deckBefore)
})
test('明太子の2枚ドローは空き1枠だけ引き、溢れる1枚は山札に残す', () => {
  const state = make({ deck: [byId('mentaiko'), ...copies('tamago', 9)] })
  const player = state.players[1]
  player.hand.push(...player.deck.splice(0, 2))
  player.ap = 3
  const deckBefore = player.deck.map(c => c.instanceId)
  const next = advance(state, play(state, 'mentaiko'))
  assert.equal(next.players[1].hand.length, 7)
  assert.deepEqual(next.players[1].deck.map(c => c.instanceId), deckBefore.slice(1))
  assert.ok(next.players[1].hand.some(c => c.instanceId === deckBefore[0]))
  assert.equal(allInstanceIds(next).length, allInstanceIds(state).length)
})
test('2Pの攻撃・消化・持続減衰は本人の手番に各1回だけ解決する', () => {
  let state = make({ p2Deck: [byId('natto_maki'), ...copies('tamago', 9)] })
  state.players[1].belly = 10
  state.players[2].belly = 10
  putOnField(state, 1, 'tamago', 1)
  putOnField(state, 2, 'natto_maki', 4)
  state = advance(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[2].ap], [2, 2, 2])
  assert.deepEqual([state.players[1].belly, state.players[2].belly], [10, 12])
  assert.equal(state.players[1].field.length, 0)
  assert.equal(state.players[2].field[0].turnsLeft, 4)
  const firstEnd = state
  reject(firstEnd, end(firstEnd, 1))
  state = advance(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[1].ap], [1, 3, 3])
  assert.deepEqual([state.players[1].belly, state.players[2].belly], [11, 12])
  assert.equal(state.players[2].field[0].turnsLeft, 3)
})
test('CPUモードは双方の終了で1ラウンド進み、それぞれのAPを回復する', () => {
  let state = make({ mode: 'cpu' })
  state = advance(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[2].ap], [2, 1, 3])
  state = advance(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[1].ap], [1, 2, 3])
})
test('消化停止は次の本人の開始時だけ消費され、その次は消化が再開する', () => {
  let state = make()
  state.players[2].belly = 10
  state.players[2].digestStopTurns = 1
  state = advance(state, end(state))
  assert.deepEqual([state.players[2].belly, state.players[2].digestStopTurns], [10, 0])
  state = advance(state, end(state))
  state = advance(state, end(state))
  assert.equal(state.players[2].belly, 7)
})
test('次ターンAPボーナスは本人の開始時だけ使い、永続しない', () => {
  let state = make({ deck: [byId('inari'), ...copies('tamago', 9)] })
  state = advance(state, play(state, 'inari'))
  assert.equal(state.players[1].apNextBonus, 1)
  state = advance(state, end(state))
  assert.equal(state.players[1].apNextBonus, 1)
  state = advance(state, end(state))
  assert.deepEqual([state.players[1].ap, state.players[1].apNextBonus], [4, 0])
  state = advance(state, end(state))
  state = advance(state, end(state))
  assert.equal(state.players[1].ap, 4)
})
test('コハダは追加ダメージと机の攻撃に切れ味を使ってからリセットする', () => {
  let state = make({ deck: [byId('kohada'), ...copies('tamago', 5)] })
  state.players[1].ap = 4
  state.players[1].kiretaStack = 6
  state = advance(state, play(state, 'kohada'))
  assert.deepEqual([state.players[2].belly, state.players[1].kiretaStack], [18, 6])
  state = advance(state, end(state))
  assert.equal(state.players[2].belly, 22) // 追加18 + 机6 - 消化2
  assert.deepEqual([state.players[1].kiretaStack, state.players[1].kiretaSpent], [0, false])
})

console.log('\n[試合エンジン] 勝敗・追加注文')
test('攻撃で満腹になった時点で終了し、消化で勝敗が取り消されない', () => {
  let state = make()
  state.players[2].belly = 98
  state = advance(state, play(state, 'tamago'))
  state = advance(state, end(state))
  assert.deepEqual([state.phase, state.winnerId, state.players[2].belly], ['over', 1, 100])
  reject(state, end(state))
  reject(state, play(state, 'tamago'))
  reject(state, { type: 'complete_reorder', playerId: 1, cards: [] })
})
test('召喚時の追加ダメージで満腹になってもその場で勝敗を確定する', () => {
  const state = make({ deck: [byId('kohada')] })
  state.players[1].ap = 4
  state.players[1].kiretaStack = 6
  state.players[2].belly = 90
  const next = advance(state, play(state, 'kohada'))
  assert.deepEqual([next.phase, next.winnerId, next.players[2].belly], ['over', 1, 100])
})
test('P2が勝っても固定のプレイヤーIDを保持する', () => {
  let state = make()
  state = advance(state, end(state))
  state = clone(state)
  state.players[1].belly = 98
  state = advance(state, play(state, 'tamago'))
  state = advance(state, end(state))
  assert.deepEqual([state.phase, state.winnerId, state.players[1].id, state.players[2].id], ['over', 2, 1, 2])
})
const exhaust = mode => {
  let state = make({ mode })
  for (const player of Object.values(state.players)) {
    player.hand = []
    player.deck = []
  }
  state = advance(state, end(state))
  if (state.phase !== 'reorder') state = advance(state, end(state))
  assert.equal(state.phase, 'reorder')
  return state
}
test('2P追加注文は指定プレイヤー順で進み、補充後も既存の状態を保持する', () => {
  let state = clone(exhaust('two_player'))
  const firstId = state.reorderPlayerId
  const secondId = firstId === 1 ? 2 : 1
  state.players[firstId].belly = 42
  state.players[firstId].drawBonus = 1
  state.players[firstId].kiretaStack = 3
  state.players[firstId].attackBuff = { 'マグロ': 2 }
  state.players[firstId].combosFired = ['maki_comp_3']
  state.players[firstId].gari = 0
  state.players[secondId].gari = 1
  const oldNextId = state.nextInstanceId
  const oldIds = allInstanceIds(make())
  reject(state, { type: 'complete_reorder', playerId: secondId, cards: copies('tamago', 2) })
  reject(state, end(state))
  state = advance(state, { type: 'complete_reorder', playerId: firstId, cards: copies('tamago', 7) })
  assert.equal(state.phase, 'reorder')
  assert.equal(state.reorderPlayerId, secondId)
  reject(state, { type: 'complete_reorder', playerId: firstId, cards: copies('tamago', 7) })
  state = advance(state, { type: 'complete_reorder', playerId: secondId, cards: copies('cheese', 3) })
  assert.equal(state.phase, 'playing')
  assert.equal(state.reorderPlayerId, null)
  assert.deepEqual([state.players[firstId].hand.length, state.players[firstId].deck.length], [5, 2])
  assert.equal(state.players[secondId].hand.length, 3)
  assert.deepEqual([state.players[firstId].gari, state.players[secondId].gari], [0, 1])
  const ids = allInstanceIds(state)
  assert.equal(new Set(ids).size, 10)
  assert.ok(ids.every(id => !oldIds.includes(id)), '補充カードは消費済みカードのIDを再利用しません')
  assert.ok(state.nextInstanceId > oldNextId)
  assert.deepEqual([
    state.players[firstId].belly, state.players[firstId].drawBonus,
    state.players[firstId].kiretaStack, state.players[firstId].attackBuff,
    state.players[firstId].combosFired,
  ], [42, 1, 3, { 'マグロ': 2 }, ['maki_comp_3']])
})
test('CPUの追加注文はP1完了時にCPUも補充して再開する', () => {
  let state = exhaust('cpu')
  state.players[1].gari = 0
  state.players[2].gari = 1
  assert.equal(state.reorderPlayerId, 1)
  state = advance(state, { type: 'complete_reorder', playerId: 1, cards: copies('tamago', 2) })
  assert.equal(state.phase, 'playing')
  assert.equal(state.players[1].hand.length, 2)
  assert.ok(state.players[2].hand.length > 0)
  assert.deepEqual([state.players[1].gari, state.players[2].gari], [0, 1])
})
test('2P追加注文の0枚は無料補充せず、両者の完了後に対戦を再開する', () => {
  let state = exhaust('two_player')
  state = advance(state, { type: 'complete_reorder', playerId: state.reorderPlayerId, cards: [] })
  state = advance(state, { type: 'complete_reorder', playerId: state.reorderPlayerId, cards: [] })
  assert.equal(state.phase, 'playing')
  assert.equal(allInstanceIds(state).length, 0)
})

console.log('\n[試合エンジン] ガリによる防御割り込み')
test('ガリは先攻1個・後攻2個で開始し、通常攻撃を50％軽減する', () => {
  assert.deepEqual(INIT_GARI, { 1: 1, 2: 2 })
  assert.equal(GARI_REDUCTION_RATE, 0.5)
  for (const mode of ['two_player', 'cpu']) {
    const state = make({ mode })
    assert.equal(state.activePlayerId, 1)
    assert.deepEqual(Object.values(state.players).map(player => player.gari), [1, 2])
  }
})
test('通常攻撃を保留し、ガリで致死を回避してから消化とターン交代を行う', () => {
  let state = make({ deck: [byId('maguro'), ...copies('tamago', 9)] })
  state.players[2].belly = 90
  state.players[2].ap = 0
  putOnField(state, 1, 'maguro', 1)
  const fieldBefore = clone(state.players[1].field)
  state = step(state, end(state))
  assert.deepEqual(state.pendingAttack, { attackerId: 1, defenderId: 2, amount: 12, source: 'end_turn' })
  assert.deepEqual([state.phase, state.winnerId, state.activePlayerId, state.turn], ['defending', null, 1, 1])
  assert.equal(state.players[2].belly, 90, '選択前にダメージを与えてはいけません')
  assert.deepEqual(state.players[1].field, fieldBefore)
  state = step(clone(state), defend(state, true))
  assert.deepEqual([state.phase, state.winnerId, state.activePlayerId, state.turn], ['playing', null, 2, 2])
  assert.equal(state.players[2].belly, 94) // 90 + 12の半分 - 消化2
  assert.equal(state.players[2].ap, 2, 'ガリでAPを消費せず、交代後のAPを補充する')
  assert.equal(state.players[2].gari, 1)
  assert.equal(state.pendingAttack, null)
})
test('致死攻撃に温存を選ぶと決着し、終了後の寿命・ドロー・消化を実行しない', () => {
  let state = make({ deck: [byId('maguro'), ...copies('tamago', 9)] })
  state.players[2].belly = 90
  putOnField(state, 1, 'maguro', 1)
  state = step(state, end(state))
  const attackerBefore = clone(state.players[1])
  const result = transitionMatch(deepFreeze(state), defend(state, false), keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual([result.state.phase, result.state.winnerId, result.state.players[2].belly], ['over', 1, 100])
  assert.equal(result.state.players[2].gari, 2)
  assert.deepEqual(result.state.players[1], attackerBefore)
  assert.equal(result.state.pendingAttack, null)
  assert.equal(result.events.filter(event => event.type === 'game_over').length, 1)
  assert.ok(!result.events.some(event => event.type === 'turn_started'))
  reject(result.state, defend(state, true))
})
test('召喚時コンボはガリを挟まず着弾し、同じ攻撃者が残りAPで召喚できる', () => {
  let state = make({ deck: [byId('otoro'), ...copies('tamago', 9)] })
  state.players[1].ap = 10
  state.players[1].summonedIds = ['maguro', 'chutoro']
  state.players[2].belly = 80
  state.players[2].ap = 0
  const result = transitionMatch(deepFreeze(state), play(state, 'otoro'), keepOrder)
  assert.equal(result.error, undefined)
  assert.ok(!result.events.some(event => event.type.startsWith('defense_')))
  assert.deepEqual(result.events.find(event => event.type === 'damage'), { type: 'damage', playerId: 2, amount: 10 })
  state = result.state
  const apAfterSummon = state.players[1].ap
  assert.equal(state.pendingAttack, null)
  assert.equal(state.players[2].belly, 90)
  assert.ok(state.players[1].combosFired.includes('akami_mori'))
  assert.deepEqual([state.activePlayerId, state.turn, state.phase], [1, 1, 'playing'])
  assert.equal(state.players[2].ap, 0)
  assert.equal(state.players[2].gari, 2)
  assert.equal(state.players[1].ap, apAfterSummon)
  state = step(state, play(state, 'tamago'))
  assert.equal(state.players[1].field.length, 2)
  assert.equal(state.players[1].ap, apAfterSummon - 1)
})
test('切れ味の固定ダメージも軽減せず、ガリを残したまま即座に決着する', () => {
  let state = make({ deck: [byId('kohada')] })
  state.players[1].ap = 4
  state.players[1].kiretaStack = 1
  state.players[2].belly = 97
  const result = transitionMatch(deepFreeze(state), play(state, 'kohada'), keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual([result.state.phase, result.state.winnerId, result.state.pendingAttack], ['over', 1, null])
  assert.deepEqual([result.state.players[2].belly, result.state.players[2].gari], [100, 2])
  assert.deepEqual(result.events.find(event => event.type === 'damage'), { type: 'damage', playerId: 2, amount: 3 })
  assert.equal(result.events.filter(event => event.type === 'game_over').length, 1)
  assert.ok(!result.events.some(event => event.type.startsWith('defense_') || event.type === 'turn_started'))
})
test('通常攻撃を大小にかかわらず半減し、受ける端数を切り上げる', () => {
  for (const [amount, expectedDamage, expectedReduction] of [[1, 1, 0], [3, 2, 1], [12, 6, 6], [15, 8, 7], [40, 20, 20]]) {
    let state = make()
    putOnField(state, 1, 'tamago', 1)
    state.players[1].field[0].attack = amount
    state.players[2].belly = 20
    state.players[2].digestStopTurns = 1
    state = step(state, end(state))
    const result = transitionMatch(deepFreeze(state), defend(state, true), keepOrder)
    assert.equal(result.error, undefined)
    assert.deepEqual([result.state.players[2].belly, result.state.players[2].gari], [20 + expectedDamage, 1])
    assert.deepEqual(result.events.find(event => event.type === 'damage'), { type: 'damage', playerId: 2, amount: expectedDamage })
    assert.deepEqual(result.events.find(event => event.type === 'defense_resolved'), {
      type: 'defense_resolved', playerId: 2, usedGari: true, reduction: expectedReduction,
    })
  }
})
test('防御中は攻撃者・第三者の回答と召喚・終了・追加注文を拒否する', () => {
  let state = make()
  putOnField(state, 1, 'tamago', 1)
  state = step(state, end(state))
  reject(state, defend(state, true, 1))
  reject(state, defend(state, true, 3))
  reject(state, defend(state, 'true'))
  reject(state, { type: 'respond_defense', playerId: 2 })
  reject(state, play(state, 'tamago', 1))
  reject(state, play(state, 'tamago', 2))
  reject(state, end(state, 1))
  reject(state, end(state, 2))
  reject(state, { type: 'complete_reorder', playerId: 2, cards: [] })
})
test('回答前は後処理を保留し、JSON復元後の回答で寿命・ドロー・交代を1回だけ行う', () => {
  let state = make({ deck: [byId('natto_maki'), ...copies('tamago', 9)] })
  putOnField(state, 1, 'natto_maki', 4)
  Object.assign(state.players[1], {
    drawBonus: 1, kiretaSpent: true, kiretaStack: 3,
    nikuMatsuri: true, thisTurnBases: ['納豆'], thisTurnArch: { makimono: 1 },
  })
  Object.assign(state.players[2], { belly: 20, ap: 0, apNextBonus: 2, digestStopTurns: 1 })
  const playersBefore = clone(state.players)
  state = step(state, end(state))
  assert.deepEqual(state.players, playersBefore)
  const answer = defend(state, false)
  const restored = deepFreeze(clone(state))
  const result = transitionMatch(restored, answer, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(restored, state)
  state = result.state
  assert.deepEqual([state.activePlayerId, state.turn, state.players[1].field[0].turnsLeft], [2, 2, 3])
  assert.equal(state.players[1].hand.length, playersBefore[1].hand.length + 2)
  assert.equal(state.players[1].deck.length, playersBefore[1].deck.length - 2)
  assert.deepEqual([state.players[1].kiretaStack, state.players[1].kiretaSpent, state.players[1].nikuMatsuri], [0, false, false])
  assert.deepEqual([state.players[1].thisTurnBases, state.players[1].thisTurnArch], [[], {}])
  assert.deepEqual([state.players[2].belly, state.players[2].digestStopTurns, state.players[2].ap, state.players[2].apNextBonus], [23, 0, 4, 0])
  assert.equal(result.events.filter(event => event.type === 'damage').length, 1)
  assert.equal(result.events.filter(event => event.type === 'turn_started').length, 1)
  assert.equal(result.events.filter(event => event.type === 'defense_resolved').length, 1)
  reject(state, answer)
})
test('ガリ使用は1攻撃1個までで、重複回答は追加消費せず拒否する', () => {
  let state = make({ deck: [byId('salmon'), ...copies('tamago', 9)] })
  putOnField(state, 1, 'salmon', 3)
  state = step(state, end(state))
  const answer = defend(state, true)
  state = step(state, answer)
  assert.equal(state.players[2].gari, 1)
  assert.equal(state.players[2].belly, 2) // 8の半分 - 消化2
  reject(state, answer)
  state = step(state, end(state)) // 防御側の空の手番を終える
  state = step(state, end(state))
  assert.equal(state.phase, 'defending', '別の攻撃では残り1個を使用できます')
  state = step(state, defend(state, true))
  assert.equal(state.players[2].gari, 0)
  reject(state, answer)
})
test('ガリが残り0なら攻撃は自動確定し、防御画面で停止しない', () => {
  let state = make({ deck: [byId('kohada'), ...copies('tamago', 9)] })
  state.players[1].ap = 4
  state.players[1].kiretaStack = 4
  state.players[2].gari = 0
  state = step(state, play(state, 'kohada'))
  assert.deepEqual([state.phase, state.pendingAttack, state.players[2].belly], ['playing', null, 12])
  state = step(state, end(state))
  assert.deepEqual([state.phase, state.activePlayerId, state.players[2].belly], ['playing', 2, 14])
})
test('先攻は1回使うとガリが尽き、次の通常攻撃は防御待ちなしで受ける', () => {
  let state = make({ p2Deck: [byId('salmon'), ...copies('tamago', 9)] })
  state.activePlayerId = 2
  putOnField(state, 2, 'salmon', 3)
  state = step(state, end(state))
  assert.equal(state.pendingAttack.defenderId, 1)
  state = step(state, defend(state, true))
  assert.equal(state.players[1].gari, 0)
  state = step(state, end(state))
  const result = transitionMatch(deepFreeze(state), end(state), keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual([result.state.phase, result.state.pendingAttack, result.state.players[1].gari], ['playing', null, 0])
  assert.deepEqual(result.events.find(event => event.type === 'damage'), { type: 'damage', playerId: 1, amount: 8 })
  assert.ok(!result.events.some(event => event.type.startsWith('defense_')))
})
test('ダメージ0ではガリがあっても防御を要求せず、消費もしない', () => {
  let state = make({ deck: [byId('kohada'), ...copies('tamago', 9)] })
  state.players[1].ap = 4
  state = step(state, play(state, 'kohada'))
  assert.equal(state.phase, 'playing')
  assert.equal(state.pendingAttack, null)
  state = step(state, end(state))
  assert.deepEqual([state.phase, state.activePlayerId, state.players[2].gari], ['playing', 2, 2])
})
test('防御中のガリ不足と、防御外の回答を拒否する', () => {
  let state = make()
  reject(state, defend(state, true, 2))
  putOnField(state = clone(state), 1, 'tamago', 1)
  state = clone(step(state, end(state)))
  state.players[2].gari = 0
  reject(state, defend(state, true))
  state = step(state, defend(state, false))
  assert.equal(state.players[2].gari, 0)
  reject(exhaust('two_player'), defend(state, false, 2))
})
test('終了攻撃への回答後に追加注文へ進んでも、ガリ数は保持する', () => {
  let state = make()
  putOnField(state, 1, 'tamago', 1)
  for (const player of Object.values(state.players)) {
    player.hand = []
    player.deck = []
  }
  state = step(state, end(state))
  assert.equal(state.phase, 'defending')
  state = step(state, defend(state, true))
  assert.equal(state.phase, 'reorder')
  assert.equal(state.reorderPlayerId, 2)
  assert.equal(state.players[2].gari, 1)
  assert.equal(state.pendingAttack, null)
})
test('CPUは16以上の攻撃か半減で致死回避できる攻撃にガリを使い、小さい攻撃には温存する', () => {
  for (const [cardId, belly, expected, phase] of [
    ['chutoro', 0, true, 'playing'], ['botan_ebi', 20, false, 'playing'],
    ['maguro', 0, false, 'playing'], ['maguro', 90, true, 'playing'], ['salmon', 20, false, 'playing'],
    ['tamago', 97, true, 'playing'], ['tamago', 98, false, 'over'], ['tamago', 20, false, 'playing'],
  ]) {
    let state = make({ mode: 'cpu', deck: [byId(cardId), ...copies('tamago', 9)] })
    putOnField(state, 1, cardId, 1)
    state.players[2].belly = belly
    state = step(state, end(state))
    const before = clone(state)
    const action = getCpuDefenseAction(deepFreeze(state))
    assert.deepEqual(action, { type: 'respond_defense', playerId: 2, useGari: expected })
    assert.deepEqual(state, before)
    state = step(state, action)
    assert.equal(state.players[2].gari, expected ? 1 : 2)
    assert.equal(state.phase, phase)
  }
})
test('CPUの防御操作は通常時・人間の防御待ち・2人対戦では生成しない', () => {
  assert.equal(getCpuDefenseAction(make({ mode: 'cpu' })), null)
  let state = make({ mode: 'cpu' })
  state.activePlayerId = 2
  const card = state.players[2].hand.find(card => card.attack > 0)
  assert.ok(card)
  putOnField(state, 2, card.id, 1)
  state = step(state, end(state))
  assert.equal(state.pendingAttack.defenderId, 1)
  assert.equal(getCpuDefenseAction(state), null)
  state = make()
  putOnField(state, 1, 'tamago', 1)
  state = step(state, end(state))
  assert.equal(getCpuDefenseAction(state), null)
  assert.deepEqual(getCpuActions(state), [])
})

console.log('\n[試合エンジン] 再現性・画面なしの対戦')
const seeded = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}
test('同じ乱数列と入力で、CPU山札と試合開始状態を再現できる', () => {
  const options = { deck: CARDS.slice(0, 20), mode: 'cpu', matchId: 'seeded-match' }
  assert.deepEqual(createMatch(options, seeded(42)), createMatch(options, seeded(42)))
})
test('CPUが返す操作は入力状態を変更せず、個体IDで1枚ずつ実行できる', () => {
  let state = make({ mode: 'cpu' })
  state = advance(state, end(state))
  const before = clone(state)
  const actions = getCpuActions(deepFreeze(state))
  assert.deepEqual(state, before)
  assert.ok(actions.length > 0)
  assert.equal(new Set(actions.map(action => action.cardInstanceId)).size, actions.length)
  for (const action of actions) {
    assert.equal(action.type, 'play_card')
    assert.equal(action.playerId, 2)
    state = advance(state, action)
    if (state.phase === 'over') break
  }
})
for (const mode of ['two_player', 'cpu']) {
  test(`${mode}: 毎操作JSONを往復しながら、画面・タイマーなしで1試合を完走できる`, () => {
    let state = createMatch({
      deck: copies('maguro', 20), p2Deck: copies('maguro', 20),
      mode, matchId: `headless-${mode}`,
    }, seeded(123))
    const random = seeded(456)
    let actionCount = 0
    while (state.phase !== 'over' && actionCount < 500) {
      let action
      if (state.phase === 'defending') {
        action = getCpuDefenseAction(state) ?? defend(state, true)
      } else if (state.phase === 'reorder') {
        action = { type: 'complete_reorder', playerId: state.reorderPlayerId, cards: copies('maguro', 5) }
      } else {
        const player = state.players[state.activePlayerId]
        const card = player.field.length < 8
          ? [...player.hand].sort((a, b) => b.attack - a.attack).find(c => c.cost <= player.ap)
          : undefined
        action = card
          ? { type: 'play_card', playerId: state.activePlayerId, cardInstanceId: card.instanceId }
          : end(state)
      }
      const result = transitionMatch(deepFreeze(clone(state)), action, random)
      assert.equal(result.error, undefined)
      assert.equal(result.state.revision, state.revision + 1)
      state = clone(result.state)
      for (const player of Object.values(state.players)) {
        assert.ok(player.hand.length <= 7)
        assert.ok(player.field.length <= 8)
        assert.ok(player.ap >= 0)
        assert.ok(player.gari >= 0 && player.gari <= INIT_GARI[player.id])
        assert.ok(player.belly >= 0 && player.belly <= 100)
      }
      const ids = allInstanceIds(state)
      assert.equal(new Set(ids).size, ids.length)
      actionCount++
    }
    assert.equal(state.phase, 'over', `500操作以内に終局する必要があります: ${state.phase}`)
    assert.ok(state.winnerId === 1 || state.winnerId === 2)
    assert.equal(state.players[state.winnerId === 1 ? 2 : 1].belly, 100)
  })
}

console.log(`\n試合進行: ${passed}件成功 / ${failed}件失敗`)
if (failed > 0) process.exitCode = 1
