#!/usr/bin/env node
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CPU_DECKS, CHALLENGE_CPU_DECK, chooseCpuDeck, getCpuDeck, getCpuReorderDeck } = loadTs('src/data/cpuDecks.ts')
const { createMatch, transitionMatch, getCpuActions, getCpuDefenseAction } = loadTs('src/game/matchEngine.ts')
const { cpuChoose, FIELD_MAX, REORDER_BUDGET } = loadTs('src/game/battleRules.ts')
const { toBattleView } = loadTs('src/features/battle/battleView.ts')
const allDecks = [...CPU_DECKS, CHALLENGE_CPU_DECK]
const price = cards => cards.reduce((sum, card) => sum + card.price, 0)
const ids = cards => cards.map(card => card.id).sort()
const held = state => [...state.players[2].hand, ...state.players[2].deck]
const playerDeck = getCpuDeck('akami')
function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
}
function start(definition, seed = 1) {
  const random = seeded(seed)
  let selecting = true
  const cpuBattleMode = ['weak', 'challenge'].includes(definition.id) ? definition.id : 'random'
  return createMatch({ deck: playerDeck, mode: 'cpu', cpuBattleMode }, () => {
    if (selecting && cpuBattleMode === 'random') {
      selecting = false
      return (CPU_DECKS.indexOf(definition) + 0.5) / CPU_DECKS.length
    }
    return random()
  })
}
let passed = 0
function test(label, run) {
  run()
  passed++
  console.log(`  ✓ ${label}`)
}

console.log('\n[CPU] 固定デッキ・挑戦モード')
test('最弱は従来と同じ汎用デッキを生成し、普通の抽選に混ぜない', () => {
  assert.equal(chooseCpuDeck('weak', () => { throw Error('最弱では軸を抽選しない') }).id, 'weak')
  const expected = ['tamago', 'salmon', 'ebi', 'mentaiko', 'cheese', 'inari', 'tuna_salad_gunkan',
    'corn_gunkan', 'seafood_gunkan', 'botan_ebi', 'onion_salmon', 'ebi_avocado', 'tuna_gunkan', 'ika_instant']
  assert.deepEqual(getCpuDeck('weak', () => 0.999999).map(card => card.id), expected)
  const state = start({ id: 'weak' })
  assert.equal(state.cpuDeckId, 'weak')
  assert.deepEqual(ids(held(state)), [...expected].sort())
  assert.equal(toBattleView(state, 1, 'player', null).cDeckLabel, '最弱')
  assert.ok(!CPU_DECKS.some(deck => deck.id === 'weak'))
})
test('最弱の追加注文は従来のランダム購入で、予算と8枚上限を守る', () => {
  const expected = ['tamago', 'salmon', 'ebi', 'botan_ebi', 'inari', 'onion_salmon', 'ebi_avocado', 'mentaiko']
  assert.deepEqual(getCpuReorderDeck('weak', () => 0.999999).map(card => card.id), expected)
  for (const seed of [3, 5]) {
    const cards = getCpuReorderDeck('weak', seeded(seed))
    assert.ok(cards.length > 0 && cards.length <= 8)
    assert.ok(price(cards) <= REORDER_BUDGET)
  }
  let state = start({ id: 'weak' })
  state.phase = 'reorder'
  state.reorderPlayerId = 1
  const result = transitionMatch(state, { type: 'complete_reorder', playerId: 1, cards: playerDeck }, () => 0.999999)
  assert.equal(result.error, undefined)
  state = result.state
  assert.equal(state.cpuDeckId, 'weak')
  assert.deepEqual(ids(held(state)), [...expected].sort())
  assert.deepEqual(start({ id: 'weak' }, 3), start({ id: 'weak' }, 3), '同じ乱数なら従来CPUも再現できる')
})
test('通常戦は5軸の各3000円、20枚以内で低APのカードも含む', () => {
  assert.deepEqual(CPU_DECKS.map(deck => deck.id), ['akami', 'makimono', 'hikari', 'kaisen', 'niku'])
  for (const definition of CPU_DECKS) {
    const cards = getCpuDeck(definition.id)
    assert.equal(price(cards), 3000, definition.name)
    assert.ok(cards.length >= 5 && cards.length <= 20, definition.name)
    assert.ok(cards.some(card => card.cost <= 2), definition.name)
  }
})
test('通常の抽選は5つの等幅区間に対応し、挑戦デッキを含めない', () => {
  for (const [index, definition] of CPU_DECKS.entries()) {
    for (const offset of [0, 0.5, 0.999999]) {
      assert.equal(chooseCpuDeck('random', () => (index + offset) / 5).id, definition.id)
    }
  }
  assert.equal(chooseCpuDeck('challenge', () => { throw Error('挑戦モードでは抽選しない') }).id, 'challenge')
})
test('挑戦は4500円・20枚、巻物12枚と肉寿司8枚の混合デッキ', () => {
  const cards = getCpuDeck('challenge')
  assert.equal(price(cards), 4500)
  assert.equal(cards.length, 20)
  assert.equal(cards.filter(card => card.archetype.includes('makimono')).length, 12)
  assert.equal(cards.filter(card => card.archetype.includes('niku')).length, 8)
})
test('各CPUはシャッフルが変わっても同じ構成を使い、表示と個体IDが対応する', () => {
  for (const definition of allDecks) {
    const first = start(definition, 1)
    const second = start(definition, 2)
    for (const state of [first, second]) {
      assert.equal(state.cpuDeckId, definition.id)
      assert.deepEqual(ids(held(state)), ids(getCpuDeck(definition.id)))
      assert.equal(new Set(held(state).map(card => card.instanceId)).size, held(state).length)
      assert.ok(toBattleView(state, 1, 'player', null).cDeckLabel.includes(definition.name))
      assert.ok(state.log.some(line => line.includes(definition.name)))
    }
    assert.notDeepEqual(held(first).map(card => card.id), held(second).map(card => card.id))
  }
})
test('追加注文はJSON保存後も同じ軸・1500円で、繰り返しても構成を維持する', () => {
  for (const definition of allDecks) {
    let state = start(definition)
    const oldIds = new Set(held(state).map(card => card.instanceId))
    const expected = getCpuReorderDeck(definition.id)
    assert.equal(price(expected), REORDER_BUDGET, definition.name)
    assert.ok(expected.length > 0 && expected.length <= 8)
    for (let round = 1; round <= 2; round++) {
      state = JSON.parse(JSON.stringify(state))
      state.phase = 'reorder'
      state.reorderPlayerId = 1
      const before = structuredClone(state)
      const result = transitionMatch(state, { type: 'complete_reorder', playerId: 1, cards: playerDeck }, seeded(round))
      assert.equal(result.error, undefined)
      assert.deepEqual(state, before, '補充前の状態を変更しない')
      state = result.state
      assert.equal(state.phase, 'playing')
      assert.equal(state.cpuDeckId, definition.id)
      assert.deepEqual(ids(held(state)), ids(expected))
      for (const card of held(state)) {
        assert.ok(!oldIds.has(card.instanceId))
        oldIds.add(card.instanceId)
      }
    }
  }
})
test('通常戦の再生成で抽選し直せるが、挑戦戦は常に同じデッキを使う', () => {
  const normal = random => createMatch({ deck: playerDeck, mode: 'cpu' }, () => random)
  assert.equal(normal(0).cpuDeckId, 'akami')
  assert.equal(normal(0.999999).cpuDeckId, 'niku')
  for (const random of [0, 0.4, 0.999999]) {
    const state = createMatch({ deck: playerDeck, mode: 'cpu', cpuBattleMode: 'challenge' }, () => random)
    assert.equal(state.cpuDeckId, 'challenge')
    assert.equal(price(held(state)), 4500)
  }
})
test('2人対戦ではCPU設定を使わず、渡されたP2デッキを保持する', () => {
  const state = createMatch({ deck: playerDeck, p2Deck: playerDeck, mode: 'two_player', cpuBattleMode: 'challenge' }, seeded(9))
  assert.equal(state.cpuDeckId, null)
  assert.equal(toBattleView(state, 1, 'player', null).cDeckLabel, null)
  assert.deepEqual(ids(held(state)), ids(playerDeck))
})
test('最弱と全6固定デッキでCPUの操作・防御・追加注文を通して終局まで進められる', () => {
  for (const definition of [...allDecks, { id: 'weak', name: '最弱' }]) {
    let state = start(definition, 13)
    const random = seeded(42)
    for (let steps = 0; steps < 1000 && state.phase !== 'over'; steps++) {
      let action
      if (state.phase === 'defending') {
        action = getCpuDefenseAction(state) ?? { type: 'respond_defense', playerId: state.pendingAttack.defenderId, useGari: true }
      } else if (state.phase === 'reorder') {
        action = { type: 'complete_reorder', playerId: 1, cards: getCpuReorderDeck('akami') }
      } else if (state.activePlayerId === 2) {
        action = getCpuActions(state)[0] ?? { type: 'end_turn', playerId: 2 }
      } else {
        const player = state.players[1]
        const card = player.field.length < FIELD_MAX ? cpuChoose(player.hand, player.ap)[0] : null
        action = card ? { type: 'play_card', playerId: 1, cardInstanceId: card.instanceId } : { type: 'end_turn', playerId: 1 }
      }
      const result = transitionMatch(state, action, random)
      assert.equal(result.error, undefined, definition.name)
      state = result.state
      assert.equal(state.cpuDeckId, definition.id)
    }
    assert.equal(state.phase, 'over', definition.name)
  }
})
console.log(`\nCPU固定デッキ: ${passed}件成功`)
