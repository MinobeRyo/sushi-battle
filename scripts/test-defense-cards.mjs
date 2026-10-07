import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions, getCpuDefenseAction, getAttackDefenseTargets } = loadTs('src/game/matchEngine.ts')
const { toField, calcFieldDmg, calcKaisenReattackDamage, getDefenseCost, getDefenseReserveError,
  withDefenseReduction, isDefenseCard } = loadTs('src/game/battleRules.ts')
const card = id => { const value = CARDS.find(c => c.id === id); assert.ok(value, id); return value }
const instance = (id, name) => ({ ...card(id), instanceId: name })
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze)
  }
  return value
}
function make(playerId = 1, ids = ['saba', 'iwashi_shoga', 'tamago'], mode = 'two_player') {
  const state = createMatch({ matchId: 'defense-cards', mode, deck: Array(8).fill(card('tamago')),
    p2Deck: Array(8).fill(card('tamago')), p2SideMenu: null }, keepOrder)
  state.activePlayerId = playerId
  for (const player of Object.values(state.players)) { player.ap = player.maxAP = 10; player.gari = 0 }
  state.players[playerId].hand = ids.map((id, index) => instance(id, `hand-p${playerId}-${index}`))
  state.players[playerId].kiretaStack = 3
  return state
}
const command = (state, id, options = {}) => ({ type: 'play_card', playerId: state.activePlayerId,
  cardInstanceId: state.players[state.activePlayerId].hand.find(c => c.id === id).instanceId, ...options })
const step = (state, action, random = keepOrder) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, random)
  assert.equal(result.error, undefined, JSON.stringify(action))
  assert.deepEqual(state, before)
  assert.equal(result.state.revision, state.revision + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.state)), result.state)
  return result
}
const reject = (state, action, error) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, () => { throw Error('拒否操作は抽選しない') })
  assert.equal(result.error, error)
  assert.equal(result.state, state)
  assert.deepEqual(result.events, [])
  assert.deepEqual(state, before)
}
const end = state => step(state, { type: 'end_turn', playerId: state.activePlayerId })
const respond = (state, useDefense, targetFieldId, useGari = false) => ({ type: 'respond_defense',
  playerId: state.pendingAttack.defenderId, useDefense, useGari,
  ...(targetFieldId === undefined ? {} : { targetFieldId }) })
function ready(defense = 'iwashi_shoga', defenderId = 1, ids = ['tamago', 'salmon'], mode = 'two_player') {
  let state = make(defenderId, [defense, 'tamago'], mode)
  state = step(state, command(state, defense, { reserveDefense: true })).state
  state = end(state).state
  const attackerId = state.activePlayerId
  state.players[attackerId].hand = ids.map((id, index) => instance(id, `attacker-${index}`))
  state.players[attackerId].ap = state.players[attackerId].maxAP = 10
  return state
}
const damages = result => result.events.filter(event => event.type === 'damage').reduce((sum, event) => sum + event.amount, 0)

test('サバ・イワシ生姜は予約時だけ切れ味を払い、通常攻撃後に待機する', () => {
  for (const [id, attack, cost] of [['saba', 7, 1], ['iwashi_shoga', 6, 2]]) {
    assert.deepEqual([card(id).cost, card(id).price, card(id).attack, getDefenseCost(card(id))], [2, 150, attack, cost])
    for (const playerId of [1, 2]) for (const reserveDefense of [undefined, false, true]) {
      const state = make(playerId)
      const next = step(state, command(state, id, reserveDefense === undefined ? {} : { reserveDefense })).state
      assert.equal(next.players[playerId].kiretaStack, 3 - (reserveDefense ? cost : 0))
      assert.equal(next.players[playerId].field.at(-1).defenseState, reserveDefense ? 'reserved' : undefined)
      const result = end(next)
      assert.equal(damages(result), attack + 3 - (reserveDefense ? cost : 0))
      assert.equal(result.state.players[playerId].field.length, reserveDefense ? 1 : 0)
      if (reserveDefense) assert.equal(result.state.players[playerId].field[0].defenseState, 'ready')
    }
  }
})

test('予約の不正型・対応外・不足・消費済み・既存1枠は無変更で拒否する', () => {
  const state = make()
  for (const value of [null, 1, 'true']) reject(state, command(state, 'saba', { reserveDefense: value }), 'invalid_reserve_defense')
  reject(state, command(state, 'tamago', { reserveDefense: true }), 'defense_not_supported')
  for (const kiretaSpent of [false, true]) {
    const limited = structuredClone(state); limited.players[1].kiretaStack = kiretaSpent ? 8 : 1
    limited.players[1].kiretaSpent = kiretaSpent
    reject(limited, command(limited, 'iwashi_shoga', { reserveDefense: true }), 'insufficient_kireta')
  }
  for (const defenseState of ['reserved', 'ready']) {
    const occupied = structuredClone(state)
    occupied.players[1].field = [{ ...toField(card('saba'), 'existing'), defenseState }]
    reject(occupied, command(occupied, 'iwashi_shoga', { reserveDefense: true }), 'defense_already_reserved')
    assert.equal(step(occupied, command(occupied, 'iwashi_shoga')).state.players[1].field.length, 2)
    assert.equal(getDefenseReserveError(card('saba'), occupied.players[1].field, 3, false, true), 'defense_already_reserved')
  }
})

test('召喚だけでは止まらず、終了攻撃で防御とガリを一度に選び、対象半減の後にガリを適用する', () => {
  let state = ready()
  state.players[1].gari = 1
  state = step(state, command(state, 'tamago')).state
  assert.equal(state.phase, 'playing')
  state = step(state, command(state, 'salmon')).state
  state = end(state).state
  assert.equal(state.phase, 'defending')
  assert.equal(state.pendingReaction, null)
  assert.equal(state.pendingAttack.amount, 12)
  reject(state, { ...respond(state, true), playerId: 2 }, 'not_defender')
  reject(state, { ...respond(state, true), useDefense: 1 }, 'invalid_defense')
  reject(state, respond(state, true), 'target_required')
  for (const id of ['missing', state.players[1].field[0].fid]) reject(state, respond(state, true, id), 'invalid_target')
  reject(state, respond(state, false, 'attacker-0'), 'invalid_target')
  reject(state, { type: 'end_turn', playerId: 2 }, 'not_your_turn')
  const result = step(state, respond(state, true, 'attacker-1', true))
  assert.equal(damages(result), 4) // (たまご4 + サーモン8/2) / ガリ2
  assert.equal(result.state.players[1].gari, 0)
  assert.equal(result.state.players[1].field.length, 0)
  assert.equal(result.state.phase, 'playing')
  assert.equal(result.events.filter(event => event.type === 'defense_resolved').length, 1)
  reject(result.state, respond(state, true, 'attacker-1'), 'not_defending')
})

test('ランダム防御は確定時に一度だけ抽選し、ゼロ攻撃・待機中を対象にしない', () => {
  for (const roll of [0, 1 - Number.EPSILON]) {
    let state = ready('saba', 1, ['tamago'])
    state.players[2].field = [toField(card('tamago'), 'first'), toField(card('kohada'), 'zero'),
      { ...toField(card('saba'), 'inactive'), defenseState: 'ready' }]
    state = step(state, command(state, 'tamago')).state
    state = end(state).state
    const targets = getAttackDefenseTargets(state, state.pendingAttack)
    assert.deepEqual(targets.map(c => c.fid), ['first', 'attacker-0'])
    reject(state, respond(state, true, 'first'), 'invalid_target')
    let calls = 0
    const result = step(state, respond(state, true), () => { calls++; return roll })
    assert.equal(calls, 1)
    assert.equal(result.events[0].targetFieldId, targets[Math.floor(roll * targets.length)].fid)
    assert.equal(damages(result), 6)
    assert.deepEqual(result, step(state, respond(state, true), () => roll))
  }
})

test('チーズは切れ味なしで自動待機し、25%軽減、既存の1枠を上書きしない', () => {
  let state = make(1, ['cheese', 'cheese'])
  state.players[1].kiretaStack = 0
  state = step(state, command(state, 'cheese')).state
  state = step(state, command(state, 'cheese')).state
  assert.equal(state.players[1].field.filter(c => c.defenseState === 'reserved').length, 1)
  assert.equal(isDefenseCard(card('cheese')), true)
  const result = end(state)
  assert.equal(damages(result), 6)
  state = result.state
  state.players[2].field = [toField(card('maguro'), 'maguro')]
  state = end(state).state
  const used = step(state, respond(state, true), () => 0)
  assert.equal(damages(used), 9)
  assert.equal(used.state.players[1].field.length, 0)
  assert.equal(calcFieldDmg([withDefenseReduction(toField(card('saba')), card('cheese'))], {}, 0), 6)
})

test('半減はネタ・一時・切れ味・軍艦倍率と合鴨強化の後で計算する', () => {
  const uni = { ...toField(card('uni_gunkan'), 'uni'), turnAttackBonus: 2, attackHalved: true }
  const maki = Array.from({ length: 4 }, (_, i) => toField(card('kappa_maki'), `maki-${i}`))
  assert.equal(calcFieldDmg([...maki, uni], { [uni.base]: 3 }), 22)
  const saba = { ...toField(card('saba')), turnAttackBonus: 1, attackHalved: true }
  assert.equal(calcFieldDmg([saba], { サバ: 2 }, 3), 6)
  assert.equal(calcFieldDmg([toField(card('aigamo')), withDefenseReduction(toField(NAMAHAM_CARD), card('saba'))], { 生ハム: 2 }), 4)
})

test('海鮮再攻撃だけは召喚時に防御でき、海鮮以外を対象にせずガリも使えない', () => {
  let state = ready('iwashi_shoga', 1, ['tako'])
  state.players[1].gari = 1
  state.players[2].field = [toField(card('ebi'), 'ebi'), toField(card('ika'), 'ika'), toField(card('maguro'), 'maguro')]
  state = step(state, command(state, 'tako')).state
  assert.equal(state.phase, 'defending')
  assert.deepEqual([state.pendingAttack.fixedDamage, state.pendingAttack.kaisenReattack], [13, true])
  reject(state, respond(state, true, 'ebi', true), 'gari_not_allowed')
  reject(state, respond(state, true, 'maguro'), 'invalid_target')
  const result = step(state, respond(state, true, 'ebi'))
  const reduced = calcKaisenReattackDamage(result.state.players[2].field, {}, 0, result.state.players[1].belly)
  assert.equal(damages(result), 13 + reduced)
  assert.equal(result.events.filter(e => e.type === 'combo' || e.type === 'summon').length, 0)
  assert.equal(result.state.players[2].field.filter(c => c.kaisenPaired).length, 2)
  assert.equal(result.state.players[1].gari, 1)
})

test('固定ダメージは割り込みなしで確定し、防御待機を消費しない', () => {
  for (const [id, expected] of [['otoro', 10], ['kohada', 18], ['wagyu', 5]]) {
    let state = ready('iwashi_shoga', 1, [id])
    const player = state.players[2]
    if (id === 'otoro') player.summonedIds = ['maguro', 'chutoro']
    if (id === 'kohada') player.kiretaStack = 6
    if (id === 'wagyu') player.field = [toField(NAMAHAM_CARD, 'ham-1'), toField(NAMAHAM_CARD, 'ham-2')]
    const result = step(state, command(state, id, id === 'wagyu' ? { sacrificeCount: 2 } : {}))
    assert.equal(damages(result), expected)
    assert.equal(result.state.phase, 'playing')
    assert.equal(result.state.pendingAttack, null)
    assert.equal(result.state.players[1].field[0].defenseState, 'ready')
  }
})

test('固定ダメージの即時決着でもpending状態を残さない', () => {
  let state = ready('iwashi_shoga', 1, ['otoro'])
  state.players[1].belly = 95
  state.players[2].summonedIds = ['maguro', 'chutoro']
  state = step(state, command(state, 'otoro')).state
  assert.deepEqual([state.phase, state.winnerId, state.pendingReaction, state.pendingAttack], ['over', 2, null, null])
})

test('温存した防御は相手終了時に失効し、持続カードの弱体化も終了時に消える', () => {
  for (const useDefense of [true, false]) {
    let state = ready('iwashi_shoga', 1, ['yakiniku'])
    state = step(state, command(state, 'yakiniku')).state
    state = end(state).state
    const result = step(state, respond(state, useDefense, useDefense ? 'attacker-0' : undefined))
    assert.equal(damages(result), useDefense ? 2 : 4)
    assert.equal(result.state.players[1].field.length, 0)
    assert.equal(result.state.players[2].field[0].attackHalved, undefined)
    assert.equal(result.state.players[2].field[0].turnsLeft, 2)
    assert.equal(calcFieldDmg(result.state.players[2].field, {}), 4)
  }
})

test('攻撃0では防御画面を開かない', () => {
  let state = ready('saba', 1, ['kohada'])
  state = step(state, command(state, 'kohada')).state
  state = end(state).state
  assert.equal(state.phase, 'playing')
  assert.equal(state.players[1].field.length, 0)
})

test('CPUは1枠を守って予約し、統合防御で高い攻撃を対象にする', () => {
  let state = make(2, ['saba', 'saba'], 'cpu')
  const plan = getCpuActions(state)
  assert.equal(plan[0].reserveDefense, true)
  assert.equal(plan[1].reserveDefense, undefined)
  for (const action of plan) state = step(state, action).state
  assert.equal(state.players[2].field.filter(c => c.defenseState === 'reserved').length, 1)
  state = ready('iwashi_shoga', 2, ['uni_gunkan'], 'cpu')
  state.players[1].field = [toField(card('tamago'), 'small')]
  state = step(state, command(state, 'uni_gunkan')).state
  assert.equal(state.phase, 'playing')
  state = end(state).state
  const response = getCpuDefenseAction(state)
  assert.deepEqual(response, { type: 'respond_defense', playerId: 2, useGari: false, useDefense: true, targetFieldId: 'attacker-0' })
  state = step(state, response).state
  assert.equal(getCpuDefenseAction(state), null)
})
