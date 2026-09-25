#!/usr/bin/env node
// React・ブラウザ・タイマーを使わず、実際の試合進行を検証する。
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
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
  state = step(state, action)
  assert.deepEqual(state.players[1].hand.map(c => c.instanceId), [second.instanceId])
  assert.deepEqual(state.players[1].field.map(c => c.fid), [first.instanceId])
  assert.equal(state.players[1].ap, 1)
  reject(state, action)
  state = step(state, play(state, 'tamago'))
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
  const next = step(state, end(state))
  assert.equal(next.players[1].hand.length, 7)
  assert.deepEqual(next.players[1].deck, deckBefore)
})
test('明太子の2枚ドローは空き1枠だけ引き、溢れる1枚は山札に残す', () => {
  const state = make({ deck: [byId('mentaiko'), ...copies('tamago', 9)] })
  const player = state.players[1]
  player.hand.push(...player.deck.splice(0, 2))
  player.ap = 3
  const deckBefore = player.deck.map(c => c.instanceId)
  const next = step(state, play(state, 'mentaiko'))
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
  state = step(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[2].ap], [2, 2, 2])
  assert.deepEqual([state.players[1].belly, state.players[2].belly], [10, 12])
  assert.equal(state.players[1].field.length, 0)
  assert.equal(state.players[2].field[0].turnsLeft, 4)
  const firstEnd = state
  reject(firstEnd, end(firstEnd, 1))
  state = step(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[1].ap], [1, 3, 3])
  assert.deepEqual([state.players[1].belly, state.players[2].belly], [11, 12])
  assert.equal(state.players[2].field[0].turnsLeft, 3)
})
test('CPUモードは双方の終了で1ラウンド進み、それぞれのAPを回復する', () => {
  let state = make({ mode: 'cpu' })
  state = step(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[2].ap], [2, 1, 3])
  state = step(state, end(state))
  assert.deepEqual([state.activePlayerId, state.turn, state.players[1].ap], [1, 2, 3])
})
test('消化停止は次の本人の開始時だけ消費され、その次は消化が再開する', () => {
  let state = make()
  state.players[2].belly = 10
  state.players[2].digestStopTurns = 1
  state = step(state, end(state))
  assert.deepEqual([state.players[2].belly, state.players[2].digestStopTurns], [10, 0])
  state = step(state, end(state))
  state = step(state, end(state))
  assert.equal(state.players[2].belly, 7)
})
test('次ターンAPボーナスは本人の開始時だけ使い、永続しない', () => {
  let state = make({ deck: [byId('inari'), ...copies('tamago', 9)] })
  state = step(state, play(state, 'inari'))
  assert.equal(state.players[1].apNextBonus, 1)
  state = step(state, end(state))
  assert.equal(state.players[1].apNextBonus, 1)
  state = step(state, end(state))
  assert.deepEqual([state.players[1].ap, state.players[1].apNextBonus], [4, 0])
  state = step(state, end(state))
  state = step(state, end(state))
  assert.equal(state.players[1].ap, 4)
})
test('コハダは追加ダメージと机の攻撃に切れ味を使ってからリセットする', () => {
  let state = make({ deck: [byId('kohada'), ...copies('tamago', 5)] })
  state.players[1].ap = 4
  state.players[1].kiretaStack = 6
  state = step(state, play(state, 'kohada'))
  assert.deepEqual([state.players[2].belly, state.players[1].kiretaStack], [18, 6])
  state = step(state, end(state))
  assert.equal(state.players[2].belly, 22) // 追加18 + 机6 - 消化2
  assert.deepEqual([state.players[1].kiretaStack, state.players[1].kiretaSpent], [0, false])
})

console.log('\n[試合エンジン] 勝敗・追加注文')
test('攻撃で満腹になった時点で終了し、消化で勝敗が取り消されない', () => {
  let state = make()
  state.players[2].belly = 98
  state = step(state, play(state, 'tamago'))
  state = step(state, end(state))
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
  const next = step(state, play(state, 'kohada'))
  assert.deepEqual([next.phase, next.winnerId, next.players[2].belly], ['over', 1, 100])
})
test('P2が勝っても固定のプレイヤーIDを保持する', () => {
  let state = make()
  state = step(state, end(state))
  state = clone(state)
  state.players[1].belly = 98
  state = step(state, play(state, 'tamago'))
  state = step(state, end(state))
  assert.deepEqual([state.phase, state.winnerId, state.players[1].id, state.players[2].id], ['over', 2, 1, 2])
})
const exhaust = mode => {
  let state = make({ mode })
  for (const player of Object.values(state.players)) {
    player.hand = []
    player.deck = []
  }
  state = step(state, end(state))
  if (state.phase !== 'reorder') state = step(state, end(state))
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
  const oldNextId = state.nextInstanceId
  const oldIds = allInstanceIds(make())
  reject(state, { type: 'complete_reorder', playerId: secondId, cards: copies('tamago', 2) })
  reject(state, end(state))
  state = step(state, { type: 'complete_reorder', playerId: firstId, cards: copies('tamago', 7) })
  assert.equal(state.phase, 'reorder')
  assert.equal(state.reorderPlayerId, secondId)
  reject(state, { type: 'complete_reorder', playerId: firstId, cards: copies('tamago', 7) })
  state = step(state, { type: 'complete_reorder', playerId: secondId, cards: copies('cheese', 3) })
  assert.equal(state.phase, 'playing')
  assert.equal(state.reorderPlayerId, null)
  assert.deepEqual([state.players[firstId].hand.length, state.players[firstId].deck.length], [5, 2])
  assert.equal(state.players[secondId].hand.length, 3)
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
  assert.equal(state.reorderPlayerId, 1)
  state = step(state, { type: 'complete_reorder', playerId: 1, cards: copies('tamago', 2) })
  assert.equal(state.phase, 'playing')
  assert.equal(state.players[1].hand.length, 2)
  assert.ok(state.players[2].hand.length > 0)
})
test('2P追加注文の0枚は無料補充せず、両者の完了後に対戦を再開する', () => {
  let state = exhaust('two_player')
  state = step(state, { type: 'complete_reorder', playerId: state.reorderPlayerId, cards: [] })
  state = step(state, { type: 'complete_reorder', playerId: state.reorderPlayerId, cards: [] })
  assert.equal(state.phase, 'playing')
  assert.equal(allInstanceIds(state).length, 0)
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
  state = step(state, end(state))
  const before = clone(state)
  const actions = getCpuActions(deepFreeze(state))
  assert.deepEqual(state, before)
  assert.ok(actions.length > 0)
  assert.equal(new Set(actions.map(action => action.cardInstanceId)).size, actions.length)
  for (const action of actions) {
    assert.equal(action.type, 'play_card')
    assert.equal(action.playerId, 2)
    state = step(state, action)
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
      if (state.phase === 'reorder') {
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
