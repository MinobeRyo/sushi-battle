import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { toField } = loadTs('src/game/battleRules.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
const card = id => { const found = CARDS.find(item => item.id === id); assert.ok(found, id); return found }
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze)
  }
  return value
}
const make = (mode = 'two_player') => {
  const deck = [card('ika_instant'), ...Array(9).fill(card('tamago'))]
  return createMatch({ matchId: 'ika-refund', mode, deck, p2Deck: deck, p2SideMenu: null }, keepOrder)
}
const actionFor = state => ({ type: 'play_card', playerId: state.activePlayerId,
  cardInstanceId: state.players[state.activePlayerId].hand.find(item => item.id === 'ika_instant').instanceId })
const step = (state, action) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before, '入力の状態は変更しない')
  return result
}
const end = state => {
  let next = step(state, { type: 'end_turn', playerId: state.activePlayerId }).state
  if (next.pendingAttack) next = step(next, {
    type: 'respond_defense', playerId: next.pendingAttack.defenderId, useGari: false,
  }).state
  return next
}

test('いかにぎりは2AP・攻撃7を維持し、自分の召喚前の机にあるたこだけでAPを1回復する', () => {
  assert.deepEqual([card('ika_instant').cost, card('ika_instant').attack, card('ika_instant').price,
    card('ika_instant').type, card('ika_instant').archetype, card('ika_instant').effect],
  [2, 7, 200, 'instant', ['general', 'kaisen'], 'refund_ap_1_if_tako'])
  const tako = toField(card('tako'), 'own-tako')
  const cases = [
    { label: 'たこなし', own: [], expected: 0 },
    { label: '自分のたこ', own: [tako], expected: 1 },
    { label: '自分のたこわさ', own: [toField(card('takowasa'), 'own-wasa')], expected: 1 },
    { label: 'ペア消費済みたこ', own: [{ ...tako, kaisenPaired: true }], expected: 1 },
    { label: '複数でも1回だけ', own: [tako, toField(card('takowasa'), 'own-wasa')], expected: 1 },
    { label: 'subBasesたこ', own: [{ ...toField(card('tamago'), 'sub-tako'), subBases: ['たこ'] }], expected: 1 },
    { label: '相手のたこだけ', own: [], enemy: [tako], expected: 0 },
    { label: '手札と山札のたこだけ', own: [], hidden: true, expected: 0 },
    { label: '召喚する自身のsubBasesは数えない', own: [], selfSubBase: true, expected: 0 },
  ]
  for (const item of cases) {
    const state = make()
    state.players[1].field = structuredClone(item.own)
    state.players[2].field = structuredClone(item.enemy ?? [])
    if (item.hidden) {
      state.players[1].hand[1] = { ...card('tako'), instanceId: 'hidden-hand' }
      state.players[1].deck[0] = { ...card('takowasa'), instanceId: 'hidden-deck' }
    }
    if (item.selfSubBase) state.players[1].hand[0].subBases = ['たこ']
    const result = step(state, actionFor(state))
    assert.equal(result.state.players[1].ap, item.expected, item.label)
    assert.equal(result.state.players[1].maxAP, 2, item.label)
    assert.equal(result.state.players[1].apNextBonus, 0, item.label)
  }
})

test('AP1では回復を先取りできず、たこがいても手札・AP・場はすべて不変で拒否する', () => {
  const state = make()
  state.players[1].ap = 1
  state.players[1].field = [toField(card('tako'), 'tako')]
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), actionFor(state), keepOrder)
  assert.equal(result.error, 'insufficient_ap')
  assert.equal(result.state, state)
  assert.deepEqual(result.events, [])
  assert.deepEqual(state, before)
})

test('AP回復と海鮮連鎖・再攻撃は併発し、それぞれ1回だけ解決する', () => {
  const state = make()
  state.players[1].field = [toField(card('tako'), 'tako'), toField(card('ebi'), 'ebi')]
  const result = step(state, actionFor(state))
  assert.equal(result.state.players[1].ap, 1)
  assert.equal(result.state.players[2].belly, 17, '連鎖3＋再攻撃floor((3+5+7)/2)＋えび追加7')
  assert.equal(result.events.filter(event => event.type === 'combo' && event.comboId === 'umi_zanmai').length, 1)
  assert.equal(result.events.filter(event => event.type === 'summon').length, 1)
  assert.equal(result.state.players[1].field.filter(item => item.kaisenPaired).length, 2)
  assert.equal(result.state.pendingAttack, null, 'AP回復と追加攻撃にガリ待ちは挟まない')
})

test('鉄火巻き込みの11AP上限を維持し、回復は現在APのみで次ターンへ加算しない', () => {
  let state = make()
  state.turn = 19
  Object.assign(state.players[1], { ap: 11, maxAP: 11, combosFired: ['akami_mori'],
    field: [toField(card('tako'), 'tako'), toField(card('tekka_maki'), 'tekka')] })
  state = step(state, actionFor(state)).state
  assert.deepEqual([state.players[1].ap, state.players[1].maxAP, state.players[1].apNextBonus], [10, 11, 0])
  state = end(end(state))
  assert.equal(state.activePlayerId, 1)
  assert.deepEqual([state.players[1].ap, state.players[1].maxAP, state.players[1].apNextBonus], [11, 11, 0])
})

test('コストが軽減された個体でもAP回復は現在の上限を超えない', () => {
  for (const maxAP of [2, 11]) {
    const state = make()
    state.players[1].field = [toField(card('tako'), 'tako')]
    state.players[1].ap = state.players[1].maxAP = maxAP
    // コスト軽減された個体を渡し、支払い後に回復余地がない境界を確認する。
    state.players[1].hand[0].cost = 0
    const result = step(state, actionFor(state))
    assert.deepEqual([result.state.players[1].ap, result.state.players[1].maxAP], [maxAP, maxAP])
  }
  assert.equal(card('ika_instant').cost, 2, '基本コストは変更しない')
})

test('CPUは実際の回復APで後続の1APカードを合法に召喚する', () => {
  const state = make('cpu')
  state.activePlayerId = 2
  state.players[2].hand = [
    { ...card('ika_instant'), instanceId: 'cpu-ika' }, { ...card('tamago'), instanceId: 'cpu-tamago' },
  ]
  state.players[2].field = [toField(card('tako'), 'cpu-tako')]
  const before = structuredClone(state)
  const commands = getCpuActions(freeze(state))
  assert.deepEqual(state, before)
  assert.deepEqual(commands.map(action => action.cardInstanceId), ['cpu-ika', 'cpu-tamago'])
  let next = state
  for (const command of commands) next = step(next, command).state
  assert.equal(next.players[2].ap, 0)
  assert.deepEqual(next.players[2].field.map(item => item.id), ['tako', 'ika_instant', 'tamago'])
})
