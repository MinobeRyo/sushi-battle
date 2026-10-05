import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
const { battleStatusDetails } = loadTs('src/features/battle/battleStatusModel.ts')
const card = id => { const found = CARDS.find(c => c.id === id); assert.ok(found, id); return found }
const instance = (id, instanceId, changes = {}) => ({ ...structuredClone(card(id)), instanceId, ...changes })
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze)
  }
  return value
}
const make = (ids = ['tamago'], options = {}) => {
  const state = createMatch({ matchId: 'akami-support', mode: 'two_player',
    deck: [...ids.map(card), ...Array(10).fill(card('tamago'))],
    p2Deck: Array(10).fill(card('tamago')), p2SideMenu: null, ...options }, keepOrder)
  state.players[1].ap = state.players[1].maxAP = 10
  return state
}
const action = (state, id) => ({ type: 'play_card', playerId: state.activePlayerId,
  cardInstanceId: state.players[state.activePlayerId].hand.find(c => c.id === id).instanceId })
const step = (state, command, random = keepOrder) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), command, random)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before)
  assert.equal(result.state.revision, state.revision + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.state)), result.state)
  return result.state
}
const play = (state, id, random = keepOrder) => step(state, action(state, id), random)
const end = state => {
  let next = step(state, { type: 'end_turn', playerId: state.activePlayerId })
  if (next.pendingAttack) next = step(next, { type: 'respond_defense', playerId: next.pendingAttack.defenderId, useGari: false })
  return next
}
const allIds = state => Object.values(state.players).flatMap(p => [
  ...p.hand.map(c => c.instanceId), ...p.deck.map(c => c.instanceId), ...p.field.map(c => c.fid),
]).sort()
const stopStatus = player => battleStatusDetails(player).effects.find(item => item.id === 'digest-stop')

test('赤身支援3枚の既存数値を維持し、ツナ軍艦とツナサラダ軍艦を区別する', () => {
  assert.deepEqual(['tuna_gunkan', 'maguro', 'duke_maguro'].map(id => {
    const c = card(id); return [c.cost, c.price, c.attack, c.effect]
  }), [[2, 150, 6, 'reduce_random_akami_cost_1'], [3, 200, 12, 'draw_random_akami_1'],
    [3, 200, 9, 'digest_stop_akami_1_or_2']])
  assert.deepEqual(card('tuna_gunkan').archetype, ['makimono', 'akami', 'gunkan'])
  assert.equal(card('tuna_salad_gunkan').effect, 'draw_1')
})

test('ツナ軍艦は手札と山札の同名個体を等しく抽選し、0AP・タグなし・召喚した本人を除外する', () => {
  const state = make()
  const player = state.players[1]
  player.hand = [instance('tuna_gunkan', 'source'), instance('bintoro', 'hand-a'), instance('bintoro', 'hand-b'),
    instance('otoro', 'free', { cost: 0 }), instance('futomaki', 'base-only'), instance('tuna_salad_gunkan', 'salad')]
  player.deck = [instance('tamago', 'plain'), instance('bintoro', 'deck-c')]
  const master = structuredClone(CARDS)
  let publicLog
  for (const [index, value] of [0, 0.5, 1 - Number.EPSILON].entries()) {
    const targetId = ['hand-a', 'hand-b', 'deck-c'][index]
    const next = play(state, 'tuna_gunkan', () => value)
    for (const zone of ['hand', 'deck']) {
      const expected = player[zone].filter(c => c.instanceId !== 'source')
        .map(c => c.instanceId === targetId ? { ...c, cost: c.cost - 1 } : c)
      assert.deepEqual(next.players[1][zone], expected)
    }
    assert.equal(next.players[1].field[0].cost, 2)
    assert.equal(next.players[1].ap, 8)
    assert.deepEqual(next.players[2], state.players[2])
    assert.deepEqual(CARDS, master)
    assert.deepEqual(allIds(next), allIds(state))
    assert.equal(next.nextInstanceId, state.nextInstanceId)
    assert.deepEqual(next, play(state, 'tuna_gunkan', () => value))
    const log = next.log.join(' ')
    assert.equal(log.includes('ビントロ'), false)
    assert.equal(log.includes(targetId), false)
    if (publicLog) assert.deepEqual(next.log, publicLog, '公開ログから対象個体や場所を判別できない')
    publicLog = next.log
  }
})

test('同じ赤身個体を繰り返し軽減でき、0AP到達後は通常召喚だけ行う', () => {
  let state = make()
  state.players[1].hand = [0, 1, 2].map(i => instance('tuna_gunkan', `tuna-${i}`))
  state.players[1].deck = [instance('bintoro', 'target')]
  state.players[1].ap = 6
  for (const expected of [1, 0, 0]) {
    state = play(state, 'tuna_gunkan', keepOrder)
    assert.equal(state.players[1].deck[0].cost, expected)
    assert.equal(state.players[1].deck[0].instanceId, 'target')
  }
  assert.equal(state.players[1].ap, 0)
  assert.equal(state.players[1].field.length, 3)
  assert.ok(state.log.some(line => line.includes('軽減できる赤身カードなし')))
})

test('両プレイヤーとも山札の割引をマグロで引き継ぎ、割引後の実APで召喚する', () => {
  for (const playerId of [1, 2]) {
    let state = make()
    state.activePlayerId = playerId
    Object.assign(state.players[playerId], { ap: 9,
      hand: [instance('tuna_gunkan', `p${playerId}-tuna`), instance('maguro', `p${playerId}-maguro`)],
      deck: [instance('otoro', `p${playerId}-otoro`)] })
    state = play(state, 'tuna_gunkan', keepOrder)
    assert.equal(state.players[playerId].deck[0].cost, 4)
    state = play(state, 'maguro')
    assert.equal(state.players[playerId].hand[0].instanceId, `p${playerId}-otoro`)
    assert.equal(state.players[playerId].hand[0].cost, 4)
    assert.equal(state.players[playerId].ap, 4)
    state = play(state, 'otoro')
    assert.equal(state.players[playerId].ap, 0)
    assert.equal(state.players[playerId].field.at(-1).cost, 4)
  }
})

test('マグロは山札の赤身個体だけをランダム移動し、同名・割引・残り順序を保持して対象を公開しない', () => {
  const state = make(['maguro'])
  state.players[1].deck = [instance('futomaki', 'no-akami-tag'), instance('bintoro', 'copy-a', { cost: 0 }),
    instance('tamago', 'plain'), instance('bintoro', 'copy-b'), instance('tekka_maki', 'copy-c')]
  const candidates = state.players[1].deck.filter(c => c.archetype.includes('akami'))
  let publicLog
  for (const [index, value] of [0, 0.5, 1 - Number.EPSILON].entries()) {
    const selected = candidates[index]
    const next = play(state, 'maguro', () => value)
    assert.deepEqual(next.players[1].hand, [...state.players[1].hand.slice(1), selected])
    assert.deepEqual(next.players[1].deck, state.players[1].deck.filter(c => c.instanceId !== selected.instanceId))
    assert.deepEqual(next.players[2], state.players[2])
    assert.deepEqual(allIds(next), allIds(state))
    assert.equal(next.nextInstanceId, state.nextInstanceId)
    assert.equal(next.players[1].ap, 7)
    assert.deepEqual(next, play(state, 'maguro', () => value))
    const log = next.log.join(' ')
    assert.equal(log.includes(selected.name), false)
    assert.equal(log.includes(selected.instanceId), false)
    if (publicLog) assert.deepEqual(next.log, publicLog)
    publicLog = next.log
  }
})

test('マグロは手札上限7を守り、対象なし・空山札でも通常召喚する', () => {
  for (const ids of [[], ['futomaki', 'tamago'], ['bintoro']]) {
    const state = make(['maguro'])
    state.players[1].hand.push(...state.players[1].deck.splice(0, 2))
    state.players[1].deck = ids.map((id, i) => instance(id, `deck-${i}`))
    const next = play(state, 'maguro')
    const draws = ids.includes('bintoro') ? 1 : 0
    assert.equal(next.players[1].hand.length, 6 + draws)
    assert.equal(next.players[1].deck.length, ids.length - draws)
    assert.equal(next.players[1].ap, 7)
    assert.equal(next.players[1].field[0].id, 'maguro')
    if (!draws) assert.deepEqual(next.players[1].deck, state.players[1].deck)
  }
})

test('CPUはツナ軍艦とマグロで計画を区切り、実際の軽減・ドロー結果で再計画する', () => {
  for (const source of ['tuna_gunkan', 'maguro']) for (const value of [0, 1 - Number.EPSILON]) {
    const state = make([], { mode: 'cpu' }); state.activePlayerId = 2
    state.players[2].ap = 5
    state.players[2].hand = [instance(source, 'cpu-source'),
      ...(source === 'tuna_gunkan' ? [instance('tekka_maki', 'cpu-tekka')] : [])]
    state.players[2].deck = source === 'tuna_gunkan'
      ? [instance('maguro', 'deck-maguro')]
      : [instance('tuna_gunkan', 'draw-tuna'), instance('bintoro', 'draw-bintoro')]
    const before = structuredClone(state)
    const commands = getCpuActions(freeze(state))
    assert.deepEqual(state, before)
    assert.deepEqual(commands, [{ type: 'play_card', playerId: 2, cardInstanceId: 'cpu-source' }])
    let next = step(state, commands[0], () => value)
    const chosen = next.players[2].hand[0]
    const remaining = next.players[2].ap - chosen.cost
    const following = getCpuActions(freeze(next))
    assert.equal(following[0].cardInstanceId, chosen.instanceId)
    for (const command of following) next = step(next, command, () => value)
    assert.equal(next.players[2].ap, remaining)
  }
})

test('づけマグロは三種盛り成立前1回・成立後2回を付与し、残回数を加算も短縮もしない', () => {
  for (const unlocked of [false, true]) for (const remaining of [0, 1, 2, 3]) {
    let state = make(['duke_maguro', 'duke_maguro'])
    state.players[1].combosFired = unlocked ? ['akami_mori'] : []
    state.players[2].digestStopTurns = remaining
    const expected = Math.max(remaining, unlocked ? 2 : 1)
    state = play(state, 'duke_maguro')
    assert.equal(state.players[2].digestStopTurns, expected)
    state = play(state, 'duke_maguro')
    assert.equal(state.players[2].digestStopTurns, expected)
    assert.equal(stopStatus(state.players[2]).value, `次の${expected}回`)
  }
})

test('2回の消化停止は相手本人の開始時だけ減り、表示が追従して茶碗蒸しでも解除できる', () => {
  let state = make(['duke_maguro'], { p2SideMenu: 'chawanmushi' })
  state.players[1].combosFired = ['akami_mori']
  state.players[2].belly = 30
  state = play(state, 'duke_maguro')
  assert.equal(stopStatus(state.players[2]).value, '次の2回')
  const firstStart = end(state)
  assert.equal(firstStart.players[2].belly, 39, '通常攻撃9を受け、消化は停止する')
  assert.equal(firstStart.players[2].digestStopTurns, 1)
  assert.equal(stopStatus(firstStart.players[2]).value, '次の1回')
  state = end(firstStart)
  assert.equal(state.players[2].digestStopTurns, 1, '付与した側の開始では消費しない')
  state = end(state)
  assert.equal(state.players[2].digestStopTurns, 0)
  assert.equal(state.players[2].belly, 39)
  assert.equal(stopStatus(state.players[2]), undefined)
  state = end(end(state))
  assert.ok(state.players[2].belly < 39, '2回終了後は通常の消化へ戻る')
  let cleared = step(firstStart, { type: 'use_side_menu', playerId: 2 })
  assert.equal(cleared.players[2].digestStopTurns, 0)
  assert.equal(cleared.players[2].skippedDigestionThisTurn, 0)
  assert.equal(stopStatus(cleared.players[2]), undefined)
  const belly = cleared.players[2].belly
  cleared = end(end(cleared))
  assert.ok(cleared.players[2].belly < belly)
})
