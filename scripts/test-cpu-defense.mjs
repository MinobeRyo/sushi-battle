#!/usr/bin/env node
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { shouldChallengeUseGari } = loadTs('src/game/cpuDefense.ts')
const { createMatch, getCpuDefenseAction } = loadTs('src/game/matchEngine.ts')
const { toField } = loadTs('src/game/battleRules.ts')
const byId = id => {
  const card = CARDS.find(candidate => candidate.id === id)
  assert.ok(card, id)
  return card
}
const make = ({ belly = 0, amount = 20, gari = 2, kappa = 0, miso = null,
  digestStopTurns = 0, turn = 4, cpuDeckId = 'challenge' } = {}) => {
  const state = createMatch({ mode: 'cpu', cpuBattleMode: 'challenge',
    deck: [byId('tamago')], p2SideMenu: null }, () => 0.999)
  state.cpuDeckId = cpuDeckId
  state.phase = 'defending'
  state.turn = turn
  state.pendingAttack = { attackerId: 1, defenderId: 2, amount, source: 'end_turn' }
  Object.assign(state.players[2], {
    belly, gari, digestStopTurns,
    field: Array.from({ length: kappa }, (_, index) => toField(byId('kappa_maki'), `kappa:${index}`)),
    sideMenu: miso ? { id: 'miso', status: miso, turnsLeft: null, usedThisTurn: false } : null,
  })
  return state
}
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    // 隠し情報のgetterを実行せず、データ属性だけを凍結します。
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ('value' in descriptor) freeze(descriptor.value)
    }
  }
  return value
}
const forbidHiddenCards = state => {
  for (const [playerId, key] of [[1, 'hand'], [1, 'deck'], [2, 'deck']]) {
    Object.defineProperty(state.players[playerId], key, {
      enumerable: true,
      get() { throw Error(`P${playerId}の${key}を判断に読んではいけません`) },
    })
  }
  return freeze(state)
}
const defense = useGari => ({ type: 'respond_defense', playerId: 2, useGari })
let passed = 0
const test = (name, run) => {
  run()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('\n[挑戦CPU] ガリの判断')
test('半減で敗北を避けられるなら小さな攻撃でも使い、救えない場合は使わない', () => {
  for (const [belly, amount, expected] of [[97, 4, true], [98, 4, false], [90, 12, true], [95, 20, false]]) {
    assert.equal(shouldChallengeUseGari(freeze(make({ belly, amount }))), expected)
  }
})
test('直後に大量の消化があっても、被弾時の敗北判定を優先する', () => {
  assert.equal(shouldChallengeUseGari(make({ belly: 90, amount: 12, kappa: 6, miso: 'active' })), true)
  assert.equal(shouldChallengeUseGari(make({ belly: 98, amount: 4, kappa: 6, miso: 'active' })), false)
})
test('余裕がある間は温存し、満腹が近いと小さな攻撃にも使う', () => {
  assert.equal(shouldChallengeUseGari(make({ amount: 16 })), false)
  assert.equal(shouldChallengeUseGari(make({ belly: 80, amount: 12 })), true)
  assert.equal(shouldChallengeUseGari(make({ belly: 45, amount: 16 })), true)
})
test('最後の1個は余裕がある間は残し、大きな攻撃か危険域で使う', () => {
  assert.equal(shouldChallengeUseGari(make({ amount: 20, gari: 2 })), true)
  assert.equal(shouldChallengeUseGari(make({ amount: 20, gari: 1 })), false)
  assert.equal(shouldChallengeUseGari(make({ amount: 24, gari: 1 })), true)
  assert.equal(shouldChallengeUseGari(make({ belly: 80, amount: 8, gari: 2 })), true)
  assert.equal(shouldChallengeUseGari(make({ belly: 80, amount: 8, gari: 1 })), false)
  assert.equal(shouldChallengeUseGari(make({ belly: 80, amount: 12, gari: 1 })), true)
})
test('かっぱ巻きと有効な味噌汁の消化で減る分を考慮する', () => {
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 3, miso: 'active' })), false)
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 2, miso: 'ready' })), true)
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 2, miso: 'active' })), false)
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 2, miso: 'used' })), true)
  assert.equal(shouldChallengeUseGari(make({ amount: 16, kappa: 6, miso: 'active' })), false)
})
test('消化停止中はかっぱ巻きと味噌汁の分も回復を見込まない', () => {
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 3, miso: 'active', digestStopTurns: 1 })), true)
})
test('序盤と終盤で変わる通常消化を使う', () => {
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 3, turn: 1 })), true)
  assert.equal(shouldChallengeUseGari(make({ amount: 20, kappa: 3, turn: 4 })), false)
})
test('ガリがない場合や半減しても軽減0の場合は使わない', () => {
  assert.equal(shouldChallengeUseGari(make({ belly: 90, amount: 12, gari: 0 })), false)
  assert.equal(shouldChallengeUseGari(make({ belly: 99, amount: 1 })), false)
  assert.equal(shouldChallengeUseGari(make({ amount: 0 })), false)
})
test('防御待ち以外やCPU以外への攻撃には判断を出さない', () => {
  for (const change of [state => { state.phase = 'playing' }, state => { state.mode = 'two_player' },
    state => { state.pendingAttack = null }, state => { state.pendingAttack.defenderId = 1 },
    state => { state.pendingAttack.source = 'summon' }]) {
    const state = make()
    change(state)
    assert.equal(shouldChallengeUseGari(freeze(state)), false)
  }
})
test('純関数の判断は相手手札・双方の山札を読まず、状態を変更しない', () => {
  const state = make({ belly: 80, amount: 12 })
  const before = structuredClone(state)
  assert.equal(shouldChallengeUseGari(freeze(state)), true)
  assert.deepEqual(state, before)
  assert.equal(shouldChallengeUseGari(forbidHiddenCards(make({ belly: 80, amount: 12 }))), true)
})
test('挑戦CPUは乱数0.8未満で賢い判断、0.8以上で従来判断に分岐する', () => {
  for (const [random, expected] of [[0, false], [0.799999, false], [0.8, true], [0.999, true]]) {
    let calls = 0
    const state = forbidHiddenCards(make({ amount: 16 }))
    assert.deepEqual(getCpuDefenseAction(state, () => { calls++; return random }), defense(expected))
    assert.equal(calls, 1, '判断ごとに方針を1回だけ抽選する')
  }
  assert.deepEqual(getCpuDefenseAction(forbidHiddenCards(make({ belly: 80, amount: 12 })), () => 0), defense(true))
  assert.deepEqual(getCpuDefenseAction(forbidHiddenCards(make({ belly: 80, amount: 12 })), () => 0.8), defense(false))
})
test('最弱と通常5軸は乱数も隠し情報も読まず、従来のガリ判断を保つ', () => {
  for (const cpuDeckId of ['weak', 'akami', 'makimono', 'hikari', 'kaisen', 'niku']) {
    for (const [belly, amount, expected] of [[0, 16, true], [20, 15, false], [80, 12, false], [97, 4, true]]) {
      const state = forbidHiddenCards(make({ cpuDeckId, belly, amount }))
      assert.deepEqual(getCpuDefenseAction(state, () => { throw Error('挑戦以外では抽選しない') }), defense(expected))
    }
  }
})

console.log(`\n${passed}件のガリ判断テストに成功しました。`)
