import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
const { toField } = loadTs('src/game/battleRules.ts')
const card = id => { const found = CARDS.find(c => c.id === id); assert.ok(found, id); return found }
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze)
  }
  return value
}
const make = (playerId = 1, mode = 'two_player') => {
  const deck = [card('salmon'), card('salmon'), ...Array(8).fill(card('tamago'))]
  const state = createMatch({ matchId: 'salmon-test', mode, deck, p2Deck: deck, p2SideMenu: null }, keepOrder)
  state.activePlayerId = playerId
  state.players[playerId].ap = state.players[playerId].maxAP = 6
  return state
}
const action = (state, targetFieldId, id = 'salmon') => ({
  type: 'play_card', playerId: state.activePlayerId,
  cardInstanceId: state.players[state.activePlayerId].hand.find(c => c.id === id).instanceId,
  ...(targetFieldId === undefined ? {} : { targetFieldId }),
})
const step = (state, command) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), command, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before)
  assert.equal(result.state.revision, state.revision + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.state)), result.state)
  return result
}
const reject = (state, command, error) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), command, keepOrder)
  assert.equal(result.error, error)
  assert.equal(result.state, state)
  assert.deepEqual(result.events, [])
  assert.deepEqual(state, before)
}
const end = state => {
  let next = step(state, { type: 'end_turn', playerId: state.activePlayerId }).state
  if (next.pendingAttack) next = step(next, { type: 'respond_defense', playerId: next.pendingAttack.defenderId, useGari: false }).state
  return next
}

for (const playerId of [1, 2]) test(`P${playerId}: サーモンは指定した持続個体1枚だけ除去し、通常の8攻撃は終了時まで待つ`, () => {
  assert.deepEqual([card('salmon').cost, card('salmon').attack, card('salmon').price, card('salmon').effect],
    [2, 8, 200, 'destroy_enemy_persist_1'])
  const state = make(playerId)
  const enemyId = playerId === 1 ? 2 : 1
  const enemy = state.players[enemyId]
  enemy.field = [toField(card('kappa_maki'), 'same-a'), toField(card('kappa_maki'), 'same-b'), toField(card('tamago'), 'instant')]
  enemy.combosFired = ['akami_mori']; enemy.attackBuff = { マグロ: 2 }; enemy.ap = 5; enemy.maxAP = 7
  const before = structuredClone(enemy)
  const next = step(state, action(state, 'same-b')).state
  assert.deepEqual(next.players[enemyId], { ...before, field: [before.field[0], before.field[2]] })
  assert.equal(next.players[playerId].ap, 4)
  assert.equal(next.players[playerId].hand.length, 4)
  assert.equal(next.players[playerId].field.at(-1).id, 'salmon')
  assert.equal(next.pendingAttack, null)
  assert.equal(next.activePlayerId, playerId)
  const attacking = step(next, { type: 'end_turn', playerId }).state
  assert.equal(attacking.pendingAttack.amount, 8)
  assert.equal(attacking.players[enemyId].gari, before.gari, '除去も防御待ちもガリを自動消費しない')
})

test('対象省略・自分・即時型・消滅済み・手札・山札・別カードの対象指定は無変更で拒否する', () => {
  const state = make()
  state.players[1].field = [toField(card('kappa_maki'), 'own')]
  state.players[2].field = [toField(card('kappa_maki'), 'valid'), toField(card('tamago'), 'instant')]
  reject(state, action(state), 'target_required')
  for (const target of ['own', 'instant', 'expired', state.players[2].hand[0].instanceId, state.players[2].deck[0].instanceId]) {
    reject(state, action(state, target), 'invalid_target')
  }
  reject(state, action(state, 'valid', 'tamago'), 'invalid_target')
  const poor = structuredClone(state); poor.players[1].ap = 1
  reject(poor, action(poor, 'valid'), 'insufficient_ap')
  reject(state, { ...action(state, 'valid'), cardInstanceId: 'not-in-hand' }, 'card_not_in_hand')
  const full = structuredClone(state)
  full.players[1].field = Array.from({ length: 8 }, (_, i) => toField(card('kappa_maki'), `own-${i}`))
  reject(full, action(full, 'valid'), 'field_full')
  const next = step(state, action(state, 'valid')).state
  reject(next, action(next, 'valid'), 'invalid_target') // 2枚目で除去済み個体を狙えない。
})

test('相手に持続型がなければ対象なしで通常召喚でき、即時型は残る', () => {
  for (const field of [[], [toField(card('tamago'), 'instant-only')]]) {
    const state = make(); state.players[2].field = field
    const next = step(state, action(state)).state
    assert.deepEqual(next.players[2], state.players[2])
    assert.equal(next.players[1].ap, 4)
    assert.equal(next.players[1].field[0].id, 'salmon')
  }
})

test('破壊した焼肉寿司は次の終了時に攻撃も生ハム生成もしない', () => {
  const state = make()
  state.players[2].field = [toField(card('yakiniku'), 'grill')]
  let next = step(state, action(state, 'grill')).state
  const nextId = next.nextInstanceId
  next = end(next)
  const enemyEnd = step(next, { type: 'end_turn', playerId: 2 })
  assert.equal(enemyEnd.state.nextInstanceId, nextId)
  assert.equal(enemyEnd.state.pendingAttack, null)
  assert.equal(enemyEnd.events.some(event => event.type === 'damage'), false)
})

test('鉄火巻きの除去は現在APや永続バフを巻き戻さず、次の開始時の追加APを止める', () => {
  const state = make(); state.turn = 30
  Object.assign(state.players[2], { field: [toField(card('tekka_maki'), 'tekka')], ap: 11, maxAP: 11,
    combosFired: ['akami_mori'], attackBuff: { マグロ: 2 } })
  let next = step(state, action(state, 'tekka')).state
  assert.deepEqual([next.players[2].ap, next.players[2].maxAP], [11, 11])
  next = end(next)
  assert.deepEqual([next.players[2].ap, next.players[2].maxAP], [10, 10])
  assert.deepEqual(next.players[2].attackBuff, { マグロ: 2 })
  assert.deepEqual(next.players[2].combosFired, ['akami_mori'])
})

test('除去済みのいかは次のたこ召喚の連鎖や海の幸三昧に参加しない', () => {
  const state = make()
  state.players[2].field = [toField(card('ika'), 'ika-target')]
  state.players[2].hand[0] = { ...card('tako'), instanceId: 'tako-in-hand' }
  let next = step(state, action(state, 'ika-target')).state
  next = end(next)
  const belly = next.players[1].belly
  const result = step(next, action(next, undefined, 'tako'))
  assert.equal(result.state.players[1].belly, belly + 3, 'たこ自身の連鎖3だけが発動')
  assert.equal(result.events.some(event => event.type === 'combo' && event.comboId === 'umi_zanmai'), false)
  assert.equal(result.state.players[2].field.length, 1)
})

test('CPUは相手の持続型だけを指定し、対象がなければ通常召喚する', () => {
  for (const hasTarget of [false, true]) {
    const state = make(2, 'cpu')
    state.players[2].hand = [{ ...card('salmon'), instanceId: 'cpu-salmon' }]
    state.players[1].field = [toField(card('tamago'), 'instant'),
      ...(hasTarget ? [toField(card('kappa_maki'), 'persist-a'), toField(card('kappa_maki'), 'persist-b')] : [])]
    const before = structuredClone(state)
    const commands = getCpuActions(freeze(state))
    assert.deepEqual(state, before)
    assert.equal(commands.length, 1)
    assert.equal(commands[0].cardInstanceId, 'cpu-salmon')
    if (hasTarget) assert.ok(['persist-a', 'persist-b'].includes(commands[0].targetFieldId))
    else assert.equal(commands[0].targetFieldId, undefined)
    const next = step(state, commands[0]).state
    assert.equal(next.players[1].field.length, hasTarget ? 2 : 1)
    assert.ok(next.players[1].field.some(card => card.fid === 'instant'))
  }
})
