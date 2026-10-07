import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getAttackDefenseTargets } = loadTs('src/game/matchEngine.ts')
const { toField } = loadTs('src/game/battleRules.ts')
const { defensePreview } = loadTs('src/features/battle/defensePreview.ts')
const card = id => id === 'namahamu' ? NAMAHAM_CARD : CARDS.find(card => card.id === id)
const fieldCard = (id, fid = id, extra = {}) => ({ ...toField(card(id), fid), ...extra })

function setup(defenseId, field, buff = {}) {
  const deck = Array(10).fill(card('tamago'))
  const state = createMatch({ mode: 'two_player', deck, p2Deck: deck }, () => 0.999)
  state.players[1].field = field
  state.players[1].attackBuff = buff
  state.players[1].ap = state.players[1].maxAP = 10
  state.players[2].field = [fieldCard(defenseId, 'defender', { defenseState: 'ready' })]
  state.players[2].gari = 1
  return state
}

function endAttack(state) {
  const result = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.999)
  assert.equal(result.error, undefined)
  assert.equal(result.state.phase, 'defending')
  return result.state
}

function preview(state, useDefense, useGari, targetFieldId) {
  const attack = state.pendingAttack
  const attacker = state.players[attack.attackerId]
  const defender = state.players[attack.defenderId]
  const defense = defender.field.find(card => card.fid === attack.defenseCardId)
  const before = structuredClone(state)
  const result = defensePreview(attack, attacker.field, attacker.attackBuff, attacker.kiretaStack,
    defender.belly, defense, useDefense, useGari, targetFieldId)
  assert.deepEqual(state, before, 'プレビューで実状態を変更しない')
  return result
}

function received(state, useDefense, useGari, targetFieldId, roll = 0) {
  const before = structuredClone(state)
  let calls = 0
  const result = transitionMatch(state, { type: 'respond_defense', playerId: state.pendingAttack.defenderId,
    useDefense, useGari, ...(targetFieldId === undefined ? {} : { targetFieldId }) }, () => { calls++; return roll })
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before)
  const damage = result.events.filter(event => event.type === 'damage' && event.playerId === state.pendingAttack.defenderId)
    .reduce((sum, event) => sum + event.amount, 0)
  return { damage, calls }
}

function assertRandomBounds(state, useGari) {
  const shown = preview(state, true, useGari)
  const targets = getAttackDefenseTargets(state, state.pendingAttack)
  assert.deepEqual(shown.targets.map(card => card.fid), targets.map(card => card.fid))
  const results = targets.map((_, index) => received(state, true, useGari, undefined, (index + 0.5) / targets.length))
  assert.ok(results.every(result => result.calls === 1), '確定する対象抽選は1回だけ')
  assert.deepEqual([shown.min, shown.max], [Math.min(...results.map(result => result.damage)), Math.max(...results.map(result => result.damage))])
  return [shown.min, shown.max]
}

test('指定防御・ガリ・温存それぞれの表示値が実ダメージと一致する', () => {
  const state = endAttack(setup('iwashi_shoga', [fieldCard('maguro'), fieldCard('tamago')]))
  assert.equal(state.pendingAttack.amount, 16)
  for (const useGari of [false, true]) {
    for (const [target, expected] of [['maguro', useGari ? 5 : 10], ['tamago', useGari ? 7 : 14]]) {
      const shown = preview(state, true, useGari, target)
      const actual = received(state, true, useGari, target)
      assert.deepEqual([shown.min, shown.max, actual.damage, actual.calls], [expected, expected, expected, 0])
    }
    const shown = preview(state, false, useGari)
    const actual = received(state, false, useGari)
    const expected = useGari ? 8 : 16
    assert.deepEqual([shown.min, shown.max, actual.damage], [expected, expected, expected])
  }
})

test('サバ・チーズのランダム上下限がガリ併用時も全対象の実ダメージと一致する', () => {
  for (const [defenseId, plain, guarded] of [['saba', [14, 22], [7, 11]], ['cheese', [19, 23], [10, 12]]]) {
    const state = endAttack(setup(defenseId, [fieldCard('uni_gunkan'), fieldCard('tamago'),
      fieldCard('kohada', 'zero'), fieldCard('saba', 'already-ready', { defenseState: 'ready' })]))
    assert.equal(state.pendingAttack.amount, 24)
    assert.deepEqual(assertRandomBounds(state, false), plain)
    assert.deepEqual(assertRandomBounds(state, true), guarded)
    assert.deepEqual(preview(state, true, false).targets.map(card => card.fid), ['uni_gunkan', 'tamago'])
  }
})

test('巻物5枚の軍艦1.5倍を維持して1体を軽減し、表示と確定結果を揃える', () => {
  const field = [...Array.from({ length: 4 }, (_, index) => fieldCard('kappa_maki', `maki-${index}`)), fieldCard('uni_gunkan')]
  const targeted = endAttack(setup('iwashi_shoga', field))
  assert.equal(targeted.pendingAttack.amount, 34)
  for (const [target, expected] of [['uni_gunkan', 10], ['maki-0', 17]]) {
    const shown = preview(targeted, true, true, target)
    assert.deepEqual([shown.min, shown.max, received(targeted, true, true, target).damage], [expected, expected, expected])
  }
  assert.deepEqual(assertRandomBounds(endAttack(setup('saba', field)), true), [10, 17])
  assert.deepEqual(assertRandomBounds(endAttack(setup('cheese', field)), true), [14, 17])
})

test('場全体の合鴨オーラと永続強化を含めて生ハム1体を軽減し、合鴨同士は重複しない', () => {
  const field = [fieldCard('aigamo', 'duck-1'), fieldCard('aigamo', 'duck-2'), fieldCard('namahamu'), fieldCard('tamago')]
  const state = endAttack(setup('iwashi_shoga', field, { 生ハム: 4 }))
  assert.equal(state.pendingAttack.amount, 15, '合鴨2+2、生ハム1+4+2、たまご4')
  const shown = preview(state, true, true, 'namahamu')
  assert.deepEqual([shown.min, shown.max, received(state, true, true, 'namahamu').damage], [6, 6, 6])
  assert.deepEqual(assertRandomBounds(endAttack(setup('saba', field, { 生ハム: 4 })), true), [6, 7])
})

test('海鮮再攻撃は海鮮部分だけ防御し、場全体の軍艦倍率とえび固定7を維持する', () => {
  for (const defenseId of ['iwashi_shoga', 'saba', 'cheese']) {
    const field = [...Array.from({ length: 4 }, (_, index) => fieldCard('kappa_maki', `maki-${index}`)),
      fieldCard('seafood_gunkan'), fieldCard('ebi'), fieldCard('ika', 'ika', { effect: null })]
    const initial = setup(defenseId, field)
    initial.players[1].hand = [{ ...card('takowasa'), instanceId: 'takowasa' }]
    const result = transitionMatch(initial, { type: 'play_card', playerId: 1, cardInstanceId: 'takowasa' }, () => 0.999)
    assert.equal(result.error, undefined)
    const state = result.state
    assert.equal(state.phase, 'defending')
    assert.equal(state.pendingAttack.source, 'summon')
    assert.equal(state.pendingAttack.fixedDamage, 7, '連鎖を持たないいかで、固定追加はえび7だけ')
    assert.equal(state.pendingAttack.amount, 18, '海鮮(9+5+3+6)の50%切捨11+えび7')
    assert.deepEqual(preview(state, true, false, 'seafood_gunkan').targets.map(card => card.fid),
      ['seafood_gunkan', 'ebi', 'ika', 'takowasa'])
    if (defenseId === 'iwashi_shoga') {
      const shown = preview(state, true, false, 'seafood_gunkan')
      assert.deepEqual([shown.min, shown.max, received(state, true, false, 'seafood_gunkan').damage], [16, 16, 16])
    } else {
      assert.deepEqual(assertRandomBounds(state, false), defenseId === 'saba' ? [16, 17] : [17, 18])
    }
  }
})
