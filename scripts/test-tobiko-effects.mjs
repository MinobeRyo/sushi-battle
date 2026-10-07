import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { HAND_LIMIT, FIELD_MAX, toField } = loadTs('src/game/battleRules.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
const card = id => { const found = CARDS.find(item => item.id === id); assert.ok(found, id); return found }
const instance = (id, instanceId, extra = {}) => ({ ...structuredClone(card(id)), instanceId, ...extra })
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze)
  }
  return value
}
const make = (playerId = 1, mode = 'two_player') => {
  const deck = Array(10).fill(card('tamago'))
  const state = createMatch({ matchId: 'tobiko-effects', mode, deck, p2Deck: deck, p2SideMenu: null }, keepOrder)
  state.activePlayerId = playerId
  Object.assign(state.players[playerId], {
    hand: [instance('tobiko_gunkan', `original-p${playerId}`)], ap: 10, maxAP: 10,
  })
  return state
}
const action = (state, instanceId = state.players[state.activePlayerId].hand[0].instanceId) => ({
  type: 'play_card', playerId: state.activePlayerId, cardInstanceId: instanceId,
})
const step = (state, command, random) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), command, random)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before, '入力状態を変更しない')
  assert.equal(result.state.revision, state.revision + 1)
  return result
}
const allIds = state => Object.values(state.players).flatMap(player => [
  ...player.hand.map(item => item.instanceId), ...player.deck.map(item => item.instanceId), ...player.field.map(item => item.fid),
])

test('とびこ軍艦は既存の数値と軍艦タグを維持する', () => {
  const tobiko = card('tobiko_gunkan')
  assert.deepEqual([tobiko.cost, tobiko.price, tobiko.attack, tobiko.fullness, tobiko.type, tobiko.archetype, tobiko.effect],
    [3, 200, 10, 0, 'instant', ['makimono', 'gunkan'], 'generate_tobiko_hand_decreasing'])
})

test('両プレイヤーの初回召喚で1回だけ抽選し、0.75未満のみ成功する', () => {
  for (const playerId of [1, 2]) for (const value of [0, 0.75 - Number.EPSILON, 0.75, 1 - Number.EPSILON]) {
    const state = make(playerId)
    let calls = 0
    const result = step(state, action(state), () => { calls++; return value })
    const player = result.state.players[playerId]
    const success = value < 0.75
    assert.equal(calls, 1)
    assert.equal(player.ap, 7)
    assert.equal(player.field.length, 1)
    assert.equal(player.hand.length, Number(success))
    assert.equal(result.state.nextInstanceId, state.nextInstanceId + Number(success))
    assert.deepEqual(player.deck, state.players[playerId].deck)
    assert.deepEqual(result.state.players[playerId === 1 ? 2 : 1], state.players[playerId === 1 ? 2 : 1])
    assert.equal(result.events.filter(event => event.type === 'summon').length, 1)
    assert.equal(result.state.pendingAttack, null)
  }
})

test('生成は基本カードから行い、一時強化・防御状態・割引・元IDを引き継がない', () => {
  const state = make()
  Object.assign(state.players[1].hand[0], {
    cost: 0, attack: 40, turnAttackBonus: 8, fid: 'old-field', turnsLeft: 3,
    kaisenPaired: true, defenseReserved: true,
  })
  state.players[1].attackBuff = { 'とびこ': 2 }
  const master = structuredClone(CARDS)
  const next = step(state, action(state), () => 0).state
  const generated = next.players[1].hand[0]
  assert.deepEqual(generated, { ...card('tobiko_gunkan'), instanceId: `tobiko-effects:p1:${state.nextInstanceId}` })
  assert.notEqual(generated.instanceId, state.players[1].hand[0].instanceId)
  assert.notEqual(generated.archetype, card('tobiko_gunkan').archetype)
  assert.deepEqual(CARDS, master)
  assert.equal(new Set(allIds(next)).size, allIds(next).length)
})

test('生成したとびこも通常APで再召喚し、毎回新しいIDで再抽選する', () => {
  let state = make()
  state.players[1].ap = state.players[1].maxAP = 9
  const ids = []
  for (const [index, value] of [0, 0.49, 0.5].entries()) {
    ids.push(state.players[1].hand[0].instanceId)
    let calls = 0
    state = step(state, action(state), () => { calls++; return value }).state
    assert.equal(calls, 1)
    assert.equal(state.players[1].ap, 6 - index * 3)
    assert.equal(state.players[1].field.length, index + 1)
    assert.equal(state.players[1].hand.length, index < 2 ? 1 : 0)
  }
  assert.equal(new Set(ids).size, 3)
  assert.deepEqual(state.players[1].field.map(item => item.fid), ids)
  assert.ok(state.players[1].field.every(item => item.attack === 10 && item.cost === 3))
})

test('手札7枚から召喚して生成しても上限を超えず、後続のポテトドローも上限を守る', () => {
  const state = make()
  state.players[1].hand.push(...Array.from({ length: HAND_LIMIT - 1 }, (_, i) => instance('tamago', `remaining-${i}`)))
  state.players[1].sideMenu = { id: 'fries', status: 'active', turnsLeft: null, usedThisTurn: false }
  state.players[1].sushiPlayedThisTurn = 1
  const next = step(state, action(state), () => 0).state
  assert.equal(next.players[1].hand.length, HAND_LIMIT)
  assert.equal(next.players[1].hand.filter(item => item.id === 'tobiko_gunkan').length, 1)
  assert.deepEqual(next.players[1].deck, state.players[1].deck)
})

test('既に手札が上限に達する状態では追加を見送り、個体IDも消費しない', () => {
  const state = make()
  // 保存状態が上限を超えていても、召喚で7枚になった後へさらに追加しない。
  state.players[1].hand.push(...Array.from({ length: HAND_LIMIT }, (_, i) => instance('tamago', `saved-${i}`)))
  const next = step(state, action(state), () => 0).state
  assert.equal(next.players[1].hand.length, HAND_LIMIT)
  assert.equal(next.nextInstanceId, state.nextInstanceId)
  assert.ok(next.log.some(line => line.includes('手札上限のため追加なし')))
})

test('不正な操作と確定済み召喚の再送は抽選せず、状態を変更しない', () => {
  const rejectCases = [
    ['insufficient_ap', state => { state.players[1].ap = 2 }, {}],
    ['field_full', state => { state.players[1].field = Array.from({ length: FIELD_MAX }, (_, i) => toField(card('tamago'), `field-${i}`)) }, {}],
    ['invalid_sacrifice_count', () => {}, { sacrificeCount: 1 }],
    ['invalid_target', () => {}, { targetFieldId: 'missing' }],
    ['card_not_in_hand', () => {}, { cardInstanceId: 'missing' }],
    ['not_your_turn', state => { state.activePlayerId = 2 }, { playerId: 1, cardInstanceId: 'original-p1' }],
  ]
  for (const [error, prepare, patch] of rejectCases) {
    const state = make()
    prepare(state)
    const command = { ...action(state), ...patch }
    const before = structuredClone(state)
    const result = transitionMatch(freeze(state), command, () => { throw new Error('拒否操作で抽選してはいけない') })
    assert.equal(result.error, error)
    assert.equal(result.state, state)
    assert.deepEqual(result.events, [])
    assert.deepEqual(state, before)
  }
  const state = make()
  const command = action(state)
  const accepted = step(state, command, () => 0).state
  const replay = transitionMatch(freeze(accepted), command, () => { throw new Error('再送で再抽選してはいけない') })
  assert.equal(replay.error, 'card_not_in_hand')
  assert.equal(replay.state, accepted)
  assert.deepEqual(replay.events, [])
})

test('CPUはとびこの抽選前で計画を区切り、実際の成功・失敗後に手札を選び直す', () => {
  for (const value of [0, 0.75]) {
    const state = make(2, 'cpu')
    state.players[2].ap = state.players[2].maxAP = 6
    state.players[2].hand.push(instance('tamago', 'cpu-next-tamago'))
    const before = structuredClone(state)
    let commands
    const originalRandom = Math.random
    try {
      Math.random = () => { throw new Error('CPU先読み中に抽選してはいけない') }
      commands = getCpuActions(freeze(state))
    } finally { Math.random = originalRandom }
    assert.deepEqual(state, before)
    assert.deepEqual(commands, [action(state, 'original-p2')])
    const next = step(state, commands[0], () => value).state
    const replanned = getCpuActions(freeze(next))
    const expectedId = value < 0.75
      ? next.players[2].hand.find(item => item.id === 'tobiko_gunkan').instanceId : 'cpu-next-tamago'
    assert.equal(replanned[0].cardInstanceId, expectedId)
    const result = step(next, replanned[0], () => 0.9).state
    assert.equal(result.players[2].ap, value < 0.75 ? 0 : 2)
  }
})

test('累計召喚数で75・50・25・0%となり、別の元カードでもリセットされない', () => {
  for (const count of [0, 1, 2, 3, 8]) {
    const chance = Math.max(0, 0.75 - count * 0.25)
    for (const value of [0, Math.max(0, chance - Number.EPSILON), chance]) {
      const state = make()
      state.players[1].summonedIds = Array(count).fill('tobiko_gunkan')
      let calls = 0
      const next = step(state, action(state), () => { calls++; return value }).state
      assert.equal(next.players[1].hand.length, Number(value < chance))
      assert.equal(calls, chance > 0 ? 1 : 0)
      assert.equal(next.players[1].ap, 7)
      assert.equal(next.players[1].summonedIds.length, count + 1)
    }
  }
})
