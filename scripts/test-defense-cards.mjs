import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions, getCpuReactionAction } = loadTs('src/game/matchEngine.ts')
const { toField, calcFieldDmg, calcKaisenReattackDamage, getDefenseCost, getDefenseTargets, getDefenseReserveError } = loadTs('src/game/battleRules.ts')
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
const respond = (state, useDefense, targetFieldId) => ({ type: 'respond_reaction', playerId: state.pendingReaction.defenderId,
  useDefense, ...(targetFieldId === undefined ? {} : { targetFieldId }) })
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

test('サバ・イワシ生姜は基本数値を保ち、両席とも任意予約だけ切れ味を払い旧+1を得ない', () => {
  for (const [id, attack, cost] of [['saba', 7, 1], ['iwashi_shoga', 6, 2]]) {
    assert.deepEqual([card(id).cost, card(id).price, card(id).attack, getDefenseCost(card(id))], [2, 150, attack, cost])
    for (const playerId of [1, 2]) for (const reserveDefense of [undefined, false, true]) {
      const state = make(playerId)
      const next = step(state, command(state, id, reserveDefense === undefined ? {} : { reserveDefense })).state
      assert.equal(next.players[playerId].kiretaStack, 3 - (reserveDefense ? cost : 0))
      assert.equal(next.players[playerId].field.at(-1).defenseState, reserveDefense ? 'reserved' : undefined)
      assert.equal(next.players[playerId].ap, 8)
    }
  }
})

test('予約の不正型・対応外・不足・コハダ消費済み・既存1枠を無変更で拒否し、通常召喚は許す', () => {
  const state = make()
  for (const value of [null, 1, 'true']) reject(state, command(state, 'saba', { reserveDefense: value }), 'invalid_reserve_defense')
  reject(state, command(state, 'tamago', { reserveDefense: true }), 'defense_not_supported')
  for (const kiretaSpent of [false, true]) {
    const limited = structuredClone(state); limited.players[1].kiretaStack = kiretaSpent ? 8 : 1
    limited.players[1].kiretaSpent = kiretaSpent
    reject(limited, command(limited, 'iwashi_shoga', { reserveDefense: true }), 'insufficient_kireta')
    assert.equal(step(limited, command(limited, 'iwashi_shoga', { reserveDefense: false })).state.players[1].field.length, 1)
  }
  for (const defenseState of ['reserved', 'ready']) {
    const occupied = structuredClone(state)
    occupied.players[1].field = [{ ...toField(card('saba'), 'existing'), defenseState }]
    reject(occupied, command(occupied, 'iwashi_shoga', { reserveDefense: true }), 'defense_already_reserved')
    assert.equal(step(occupied, command(occupied, 'iwashi_shoga')).state.players[1].field.length, 2)
    assert.equal(getDefenseReserveError(card('saba'), occupied.players[1].field, 3, false, true), 'defense_already_reserved')
  }
})

test('予約した即時カードは召喚ターン攻撃後にreadyとなり、1枠を使い攻撃しなくなる', () => {
  let state = make()
  state = step(state, command(state, 'saba', { reserveDefense: true })).state
  assert.equal(calcFieldDmg(state.players[1].field, {}, 2), 9)
  const result = end(state)
  assert.equal(damages(result), 9)
  const defense = result.state.players[1].field[0]
  assert.deepEqual([defense.id, defense.type, defense.turnsLeft, defense.defenseState], ['saba', 'instant', 1, 'ready'])
  assert.equal(calcFieldDmg([defense], {}, 2), 0)
  assert.equal(result.state.phase, 'playing')
  assert.equal(result.state.pendingReaction, null)
})

test('各召喚で温存を選べ、後続の最新個体を指定して一度だけ消費する。不正反応中は状態を保つ', () => {
  let state = ready()
  const result = step(state, command(state, 'tamago'))
  state = result.state
  assert.equal(state.phase, 'reacting')
  assert.equal(damages(result), 0)
  assert.equal(result.events.filter(e => e.type === 'summon').length, 1)
  assert.equal(result.events.filter(e => e.type === 'reaction_requested').length, 1)
  reject(state, { ...respond(state, true), playerId: 2 }, 'not_defender')
  reject(state, { ...respond(state, true), useDefense: 1 }, 'invalid_reaction')
  reject(state, respond(state, true), 'target_required')
  for (const id of ['missing', state.players[1].field[0].fid, state.players[2].hand[0].instanceId]) {
    reject(state, respond(state, true, id), 'invalid_target')
  }
  reject(state, respond(state, false, state.players[2].field[0].fid), 'invalid_target')
  reject(state, { type: 'end_turn', playerId: 2 }, 'not_your_turn')
  reject(state, command(state, 'salmon'), 'not_your_turn')
  state = step(state, respond(state, false)).state
  assert.equal(state.players[1].field.length, 1)
  state = step(state, command(state, 'salmon')).state
  const target = state.players[2].field.at(-1)
  const used = step(state, respond(state, true, target.fid))
  assert.equal(used.state.players[1].field.length, 0)
  assert.equal(used.state.players[2].field[0].attackHalved, undefined)
  assert.equal(used.state.players[2].field.at(-1).attackHalved, true)
  assert.equal(used.events.filter(e => e.type === 'summon').length, 0)
  assert.equal(used.events[0].targetFieldId, target.fid)
  reject(used.state, respond(state, true, target.fid), 'not_reacting')
})

test('サバは攻撃可能な敵個体だけを均等抽選し、乱数の両端・同入力で同じ結果になる', () => {
  for (const roll of [0, 1 - Number.EPSILON]) {
    let state = ready('saba', 1, ['tamago'])
    state.players[2].field = [toField(card('tamago'), 'first'), toField(card('kohada'), 'zero'),
      { ...toField(card('saba'), 'inactive'), defenseState: 'ready' }]
    state = step(state, command(state, 'tamago')).state
    const targets = getDefenseTargets(state.players[2].field)
    assert.deepEqual(targets.map(c => c.fid), ['first', 'attacker-0'])
    reject(state, respond(state, true, 'first'), 'invalid_target')
    let calls = 0
    const result = step(state, respond(state, true), () => { calls++; return roll })
    assert.equal(calls, 1)
    assert.equal(result.events[0].targetFieldId, targets[Math.floor(roll * targets.length)].fid)
    assert.equal(result.state.players[2].field.filter(c => c.attackHalved).length, 1)
    assert.deepEqual(result, step(state, respond(state, true), () => roll))
  }
})

test('半減はネタ/一時/切れ味/腹条件/軍艦倍率の後で切り捨て、readyは対象に含めない', () => {
  const uni = { ...toField(card('uni_gunkan'), 'uni'), turnAttackBonus: 2, attackHalved: true }
  const maki = Array.from({ length: 4 }, (_, i) => toField(card('kappa_maki'), `maki-${i}`))
  assert.equal(calcFieldDmg([...maki, uni], { [uni.base]: 3 }), 4 + 18) // floor(floor(25*1.5)/2)
  assert.equal(getDefenseTargets([...maki, uni], { [uni.base]: 3 }).length, 5)
  const saba = { ...toField(card('saba')), turnAttackBonus: 1, attackHalved: true }
  assert.equal(calcFieldDmg([saba], { サバ: 2 }, 3), 6)
  const grill = { ...toField(card('yakiniku')), turnAttackBonus: 2, attackHalved: true }
  assert.equal(calcFieldDmg([grill], { [grill.base]: 3 }, 0, 50), 5)
  assert.equal(calcFieldDmg([{ ...uni, defenseState: 'ready' }], { [uni.base]: 100 }), 0)
})

test('海鮮50%部分だけ反応後に再計算し、連鎖6とえび固定7は維持する', () => {
  let state = ready('iwashi_shoga', 1, ['tako'])
  state.players[2].field = [toField(card('ebi'), 'ebi'), toField(card('ika'), 'ika')]
  state = step(state, command(state, 'tako')).state
  assert.deepEqual([state.pendingReaction.fixedDamage, state.pendingReaction.kaisenReattack], [13, true])
  const beforeDamage = calcKaisenReattackDamage(state.players[2].field, {}, 0, state.players[1].belly)
  const result = step(state, respond(state, true, 'ebi'))
  const reduced = calcKaisenReattackDamage(result.state.players[2].field, {}, 0, result.state.players[1].belly)
  assert.ok(reduced < beforeDamage)
  assert.equal(damages(result), 13 + reduced)
  assert.equal(result.events.filter(e => e.type === 'combo' || e.type === 'summon').length, 0)
  assert.equal(result.state.players[2].field.filter(c => c.kaisenPaired).length, 2)
  assert.equal(damages(end(result.state)), calcFieldDmg(result.state.players[2].field, {}, 0, result.state.players[1].belly))
})

test('赤身10・コハダ18・肉祭り5の固定ダメージは半減せず、効果と生成は再適用しない', () => {
  for (const [id, expected] of [['otoro', 10], ['kohada', 18], ['wagyu', 5]]) {
    let state = ready('iwashi_shoga', 1, [id])
    const player = state.players[2]
    if (id === 'otoro') player.summonedIds = ['maguro', 'chutoro']
    if (id === 'kohada') player.kiretaStack = 6
    if (id === 'wagyu') player.field = [toField(NAMAHAM_CARD, 'ham-1'), toField(NAMAHAM_CARD, 'ham-2')]
    state = step(state, command(state, id, id === 'wagyu' ? { sacrificeCount: 2 } : {})).state
    const before = structuredClone(state.players[2])
    const result = step(state, respond(state, true, state.players[2].field.at(-1).fid))
    assert.equal(damages(result), expected)
    assert.deepEqual(result.state.players[2], { ...before, field: before.field.map(c => ({ ...c, attackHalved: true })) })
    assert.equal(result.state.nextInstanceId, state.nextInstanceId)
  }
})

test('反応の回答でランダム複製・ポテトドロー・召喚履歴を二重実行しない', () => {
  let state = ready('iwashi_shoga', 1, ['tobiko_gunkan'])
  state.players[2].sideMenu = { id: 'fries', status: 'active', turnsLeft: null, usedThisTurn: false }
  state.players[2].sushiPlayedThisTurn = 1
  let calls = 0
  const random = () => { calls++; return 0 }
  const result = step(state, command(state, 'tobiko_gunkan'), random)
  state = result.state
  assert.equal(calls, 1)
  assert.equal(state.players[2].hand.length, 2, '複製1枚とポテト1枚')
  const before = structuredClone(state.players[2])
  const next = step(state, respond(state, false), random)
  assert.equal(calls, 1)
  assert.deepEqual(next.state.players[2], before)
  assert.equal(next.state.nextInstanceId, state.nextInstanceId)
  assert.equal(next.events.some(e => e.type === 'summon' || e.type === 'combo'), false)
})

test('終了時には新たな反応を開かず、ガリ回答後に未使用readyを失効する', () => {
  let state = ready()
  state.players[1].gari = 1
  state = step(state, command(state, 'tamago')).state
  state = step(state, respond(state, false)).state
  state = end(state).state
  assert.equal(state.phase, 'defending')
  assert.equal(state.pendingReaction, null)
  assert.equal(state.players[1].field[0].defenseState, 'ready')
  const result = step(state, { type: 'respond_defense', playerId: 1, useGari: true })
  assert.equal(damages(result), 2)
  assert.equal(result.state.players[1].field.length, 0)
  assert.equal(result.state.players[1].gari, 0)
  assert.equal(result.events.some(e => e.type === 'reaction_requested'), false)
})

test('持続カードの半減は相手ターンだけで終了時に消え、次回攻撃は元の強さに戻る', () => {
  let state = ready('iwashi_shoga', 1, ['yakiniku'])
  state = step(state, command(state, 'yakiniku')).state
  state = step(state, respond(state, true, 'attacker-0')).state
  assert.equal(calcFieldDmg(state.players[2].field, {}), 2)
  state = end(state).state
  assert.equal(state.players[2].field[0].attackHalved, undefined)
  assert.equal(state.players[2].field[0].turnsLeft, 2)
  assert.equal(calcFieldDmg(state.players[2].field, {}), 4)
})

test('対象攻撃が0なら反応窓を開かず、予約は相手終了まで保持する', () => {
  let state = ready('saba', 1, ['kohada'])
  state = step(state, command(state, 'kohada')).state
  assert.equal(state.phase, 'playing')
  assert.equal(state.pendingReaction, null)
  assert.equal(state.players[1].field[0].defenseState, 'ready')
  state = end(state).state
  assert.equal(state.players[1].field.length, 0)
})

test('CPUは予約可能な1枚を予約し、反応では高い攻撃を指定して、人間の反応後も再計画する', () => {
  let state = make(2, ['saba', 'saba'], 'cpu')
  const plan = getCpuActions(state)
  assert.equal(plan[0].reserveDefense, true)
  assert.equal(plan[1].reserveDefense, undefined)
  for (const action of plan) state = step(state, action).state
  assert.equal(state.players[2].field.filter(c => c.defenseState === 'reserved').length, 1)
  state = ready('iwashi_shoga', 2, ['uni_gunkan'], 'cpu')
  state.players[1].field = [toField(card('tamago'), 'small')]
  state = step(state, command(state, 'uni_gunkan')).state
  const response = getCpuReactionAction(state)
  assert.deepEqual(response, { type: 'respond_reaction', playerId: 2, useDefense: true, targetFieldId: 'attacker-0' })
  state = step(state, response).state
  assert.equal(getCpuReactionAction(state), null)
  state = ready('saba', 1, ['tamago', 'tamago'], 'cpu')
  const beforeResponse = getCpuActions(state)
  assert.equal(beforeResponse.length, 1)
  state = step(state, beforeResponse[0]).state
  assert.deepEqual(getCpuActions(state), [])
  state = step(state, respond(state, false)).state
  assert.equal(getCpuActions(state)[0].cardInstanceId, 'attacker-1')
})

test('固定ダメージで決着する場合も反応回答後だけ確定し、pending状態を残さない', () => {
  let state = ready('iwashi_shoga', 1, ['otoro'])
  state.players[1].belly = 95
  state.players[2].summonedIds = ['maguro', 'chutoro']
  state = step(state, command(state, 'otoro')).state
  assert.equal(state.phase, 'reacting')
  assert.equal(state.players[1].belly, 95)
  state = step(state, respond(state, true, 'attacker-0')).state
  assert.deepEqual([state.phase, state.winnerId, state.pendingReaction, state.pendingAttack], ['over', 2, null, null])
})


test('挑戦CPUの80%評価と20%従来判断の双方で、切れ味・消費済み・予約1枠を共通に守る', () => {
  for (const roll of [0, 0.8]) for (const id of ['saba', 'iwashi_shoga']) {
    for (const condition of ['available', 'empty', 'spent', 'reserved', 'ready']) {
      const state = make(2, [id], 'cpu')
      state.cpuDeckId = 'challenge'
      if (condition === 'empty') state.players[2].kiretaStack = 0
      if (condition === 'spent') state.players[2].kiretaSpent = true
      if (condition === 'reserved' || condition === 'ready') {
        state.players[2].field = [{ ...toField(card('saba'), 'existing-defense'), defenseState: condition }]
      }
      const before = structuredClone(state)
      const plan = getCpuActions(freeze(state), () => roll)
      assert.deepEqual(state, before)
      assert.equal(plan.length, 1)
      assert.equal(plan[0].reserveDefense, condition === 'available' ? true : undefined)
      const next = step(state, plan[0]).state
      assert.equal(next.players[2].kiretaStack,
        state.players[2].kiretaStack - (condition === 'available' ? getDefenseCost(card(id)) : 0))
    }
  }
})

test('挑戦CPUの両判断経路は反応中に抽選せず停止し、防御使用後の実際の場から次を選ぶ', () => {
  for (const roll of [0, 0.8]) {
    let state = ready('saba', 1, ['tamago', 'tamago'], 'cpu')
    state.cpuDeckId = 'challenge'
    const first = getCpuActions(state, () => roll)
    assert.equal(first.length, 1)
    state = step(state, first[0]).state
    assert.equal(state.phase, 'reacting')
    assert.deepEqual(getCpuActions(state, () => { throw Error('反応待ちでは判断経路を抽選しない') }), [])
    state = step(state, respond(state, true), () => 0).state
    assert.equal(state.players[2].field[0].attackHalved, true)
    const next = getCpuActions(state, () => roll)
    assert.equal(next.length, 1)
    assert.equal(next[0].cardInstanceId, 'attacker-1')
    state = step(state, next[0]).state
    assert.equal(state.phase, 'playing')
    assert.equal(calcFieldDmg(state.players[2].field, {}), 6)
  }
})
