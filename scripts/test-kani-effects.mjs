import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { applySummon, calcFieldDmg, toField } = loadTs('src/game/battleRules.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const card = id => { const found = CARDS.find(item => item.id === id); assert.ok(found, id); return found }
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze)
  }
  return value
}
const inputFor = (field = [], overrides = {}) => ({
  card: card('kani_gunkan'), fieldId: 'kani-new', field, belly: 0, kireta: 0,
  summonedIds: [], summonedArch: {}, thisTurnBases: [], thisTurnArch: {}, combosFired: [],
  attackBuff: {}, drawBonus: 0, nikuMatsuri: false, kiretaSpent: false, enemyBelly: 0, ...overrides,
})
const summon = input => {
  const before = structuredClone(input)
  const result = applySummon(freeze(input))
  assert.deepEqual(input, before, '入力のカード・机・既存補正を変更しない')
  return result
}
const step = (state, action) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before)
  return result
}

test('カニ軍艦は5AP・400円・攻撃16を保ち、軍艦以外の既存巻物だけを強化する', () => {
  assert.deepEqual([card('kani_gunkan').cost, card('kani_gunkan').price, card('kani_gunkan').attack,
    card('kani_gunkan').type, card('kani_gunkan').archetype, card('kani_gunkan').effect],
  [5, 400, 16, 'instant', ['makimono', 'gunkan'], 'buff_current_makimono_2'])
  const ids = ['tekka_maki', 'ume_shiso_maki', 'kappa_maki', 'uni_gunkan', 'kani_gunkan', 'ebi']
  const input = inputFor(ids.map((id, index) => toField(card(id), `existing-${index}`)))
  const result = summon(input)
  assert.deepEqual(result.field.map(item => item.turnAttackBonus ?? 0), [2, 2, 2, 0, 0, 0, 0])
  assert.equal(result.field[1].type, 'instant', '梅しそ巻きも持続型条件なしで対象になる')
  assert.equal(result.field[0].attack, 4, '基本攻撃へ強化を焼き込まない')
  assert.deepEqual(result.attackBuff, {}, '永続バフへ強化を残さない')
})

test('カニの強化は既存補正へ加算し、後出し巻物は次のカニから対象になる', () => {
  const tekka = { ...toField(card('tekka_maki'), 'tekka'), turnAttackBonus: 3 }
  const first = summon(inputFor([tekka]))
  assert.equal(first.field[0].turnAttackBonus, 5)
  const later = summon(inputFor(first.field, { ...first, card: card('kappa_maki'), fieldId: 'later-roll' }))
  assert.equal(later.field[0].turnAttackBonus, 5)
  assert.equal(later.field.at(-1).turnAttackBonus, undefined)
  const second = summon(inputFor(later.field, { ...later, card: card('kani_gunkan'), fieldId: 'kani-second' }))
  assert.deepEqual(second.field.map(item => item.turnAttackBonus ?? 0), [7, 0, 2, 0])
})

test('終了時攻撃と防御待ちでは強化を維持し、解決後と次の自分ターンには解除する', () => {
  for (const useGari of [false, true]) {
    const deck = [card('kani_gunkan'), ...Array(9).fill(card('tamago'))]
    let state = createMatch({ matchId: 'kani-test', mode: 'two_player', deck, p2Deck: deck }, keepOrder)
    state.players[1].ap = state.players[1].maxAP = 10
    state.players[1].field = [
      { ...toField(card('tekka_maki'), 'tekka'), turnAttackBonus: 3 },
      toField(card('kappa_maki'), 'kappa'), toField(card('ume_shiso_maki'), 'ume'),
    ]
    state.players[2].field = [toField(card('tekka_maki'), 'enemy-tekka')]
    const enemyBefore = structuredClone(state.players[2])
    state = step(state, { type: 'play_card', playerId: 1, cardInstanceId: state.players[1].hand[0].instanceId }).state
    assert.deepEqual(state.players[2], enemyBefore, '敵の巻物へは加算しない')
    const attack = calcFieldDmg(state.players[1].field, {})
    assert.equal(attack, 35)
    state = step(state, { type: 'end_turn', playerId: 1 }).state
    assert.equal(state.phase, 'defending')
    assert.equal(state.pendingAttack.amount, attack)
    assert.deepEqual(state.players[1].field.map(item => item.turnAttackBonus ?? 0), [5, 2, 2, 0])
    const resolved = step(state, { type: 'respond_defense', playerId: 2, useGari })
    state = resolved.state
    assert.equal(resolved.events.find(event => event.type === 'damage').amount, useGari ? 18 : 35)
    assert.deepEqual(state.players[1].field.map(item => item.fid), ['tekka', 'kappa'])
    assert.ok(state.players[1].field.every(item => item.turnAttackBonus === undefined))
    state = step(state, { type: 'end_turn', playerId: 2 }).state
    state = step(state, { type: 'respond_defense', playerId: 1, useGari: false }).state
    assert.equal(state.activePlayerId, 1)
    assert.equal(calcFieldDmg(state.players[1].field, {}), 5, '次ターンの巻物は基本攻撃に戻る')
  }
})

for (const count of [3, 4]) test(`巻物コンプ完成後のカニの寄与は非軍艦巻物${count}枚で${24 + count * 2}ダメージ`, () => {
  const rolls = ['tekka_maki', 'kappa_maki', 'salmon_maki', 'kanpyo_maki'].slice(0, count)
    .map((id, index) => toField(card(id), `roll-${index}`))
  const existing = [...rolls, toField(card('uni_gunkan'), 'uni')]
  const result = summon(inputFor(existing))
  const gunkanBoost = true // 完成時点の倍率を固定し、カニ1枚＋巻物強化の寄与を比較する。
  assert.equal(calcFieldDmg([result.field.find(item => item.id === 'uni_gunkan')], {}, 0, 0, { gunkanBoost }), 30)
  assert.equal(calcFieldDmg([result.field.at(-1)], {}, 0, 0, { gunkanBoost }), 24)
  assert.equal(calcFieldDmg(result.field, {}) - calcFieldDmg(existing, {}, 0, 0, { gunkanBoost }), 24 + count * 2)
})
