import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'

function fixture(t, defenseId = 'iwashi_shoga', prepareHikari = true) {
  let randomCalls = 0
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => { randomCalls++; return 0.999 } })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, state() {}, closed() {} })
  const host = peer('defense-host'), guest = peer('defense-guest')
  service.connect(host); service.connect(guest)
  const created = service.handle(host, 'room:create')
  assert.equal(created.ok, true)
  assert.equal(service.handle(guest, 'room:join', { code: created.session.code }).ok, true)
  let sequence = 0
  const read = player => structuredClone(service.snapshot(player).match)
  const action = (player, command) => {
    const current = read(player)
    return { matchId: current.matchId, expectedRevision: current.revision, actionId: `battle-${++sequence}`, ...command }
  }
  const send = (player, command) => {
    const request = action(player, command)
    assert.deepEqual(service.handle(player, 'match:action', request), { ok: true })
    return request
  }
  const play = (player, cardId, extra = {}) => send(player, { type: 'play_card',
    cardInstanceId: read(player).you.hand.find(card => card.id === cardId).instanceId, ...extra })
  const end = player => {
    send(player, { type: 'end_turn' })
    const pending = read(host).pendingAttack
    if (pending) send(pending.defenderId === 1 ? host : guest, { type: 'respond_defense', useGari: false })
  }
  for (const [player, ids] of [[host, ['iwashi', 'aji', defenseId]], [guest, ['ebi', 'ika', 'tako']]]) {
    const draft = command => {
      const state = service.snapshot(player).draft
      assert.deepEqual(service.handle(player, 'draft:action', { draftId: state.draftId,
        expectedRevision: state.revision, actionId: `draft-${++sequence}`, ...command }), { ok: true })
    }
    for (const cardId of ids) { draft({ type: 'order', cardId }); draft({ type: 'pickup' }) }
    draft({ type: 'complete' })
  }
  while (read(host).you.ap < 7) { end(host); end(guest) }
  if (prepareHikari) { play(host, 'iwashi'); play(host, 'aji') }
  return { service, peer, host, guest, created, read, action, send, play, end, randomCalls: () => randomCalls }
}

test('海鮮再攻撃は攻撃時に防御だけを選べ、固定効果では割り込まず、復帰・再送しても一度だけ解決する', t => {
  const f = fixture(t)
  const before = f.read(f.host)
  const cardInstanceId = before.you.hand.find(card => card.id === 'iwashi_shoga').instanceId
  for (const reserveDefense of [null, 1, 'yes', {}]) {
    assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host,
      { type: 'play_card', cardInstanceId, reserveDefense })), { ok: false, error: 'invalid_action' })
    assert.deepEqual(f.read(f.host), before)
  }
  const reservation = f.play(f.host, 'iwashi_shoga', { reserveDefense: true })
  const reserved = f.read(f.host)
  assert.equal(reserved.you.kiretaStack, before.you.kiretaStack - 2)
  assert.equal(reserved.you.field.at(-1).defenseState, 'reserved')
  assert.deepEqual(f.service.handle(f.host, 'match:action', reservation), { ok: true })
  assert.deepEqual(f.service.handle(f.host, 'match:action', { ...reservation, reserveDefense: false }),
    { ok: false, error: 'action_id_conflict' })
  assert.deepEqual(f.read(f.host), reserved)
  f.end(f.host)
  const ready = f.read(f.host)
  assert.equal(ready.you.field.length, 1)
  assert.equal(ready.you.field[0].defenseState, 'ready')
  assert.equal(ready.activePlayerId, 2)
  f.play(f.guest, 'ebi')
  assert.equal(f.read(f.host).phase, 'playing', '攻撃のない召喚では防御を要求しない')
  const beforeChain = f.read(f.host)
  const ikaSummon = f.play(f.guest, 'ika')
  const afterChain = f.read(f.host)
  assert.equal(afterChain.phase, 'playing', '固定3点だけの連鎖では割り込まない')
  assert.equal(afterChain.you.belly, beforeChain.you.belly + 3)
  assert.equal(afterChain.you.field[0].defenseState, 'ready')
  const summon = f.play(f.guest, 'tako')
  const waiting = f.read(f.host)
  assert.equal(waiting.phase, 'defending')
  assert.equal(waiting.pendingReaction, null)
  assert.equal(waiting.pendingAttack.source, 'summon')
  assert.equal(waiting.pendingAttack.defenderId, 1)
  assert.equal(waiting.pendingAttack.attackerId, 2)
  assert.equal(waiting.pendingAttack.defenseCardId, ready.you.field[0].fid)
  assert.equal(waiting.pendingAttack.fixedDamage, 13, '連鎖6とえび固定7は半減しない')
  assert.equal(waiting.pendingAttack.kaisenReattack, true)
  assert.equal(waiting.pendingAttack.amount, 18, '固定13と海鮮再攻撃5')
  assert.equal(waiting.you.belly, afterChain.you.belly, '回答前は再攻撃に付随する固定分も保留する')
  assert.equal('hand' in waiting.opponent, false)
  assert.equal('deck' in waiting.opponent, false)
  const calls = f.randomCalls()
  assert.deepEqual(f.service.handle(f.guest, 'match:action', summon), { ok: true })
  assert.equal(f.randomCalls(), calls)
  const bad = (player, command, error) => {
    assert.deepEqual(f.service.handle(player, 'match:action', f.action(player, command)), { ok: false, error })
    assert.deepEqual(f.read(f.host), waiting)
    assert.equal(f.randomCalls(), calls)
  }
  bad(f.guest, { type: 'respond_defense', useGari: false }, 'not_defender')
  bad(f.guest, { type: 'end_turn' }, 'not_your_turn')
  bad(f.host, { type: 'respond_reaction', useDefense: false }, 'not_reacting')
  bad(f.host, { type: 'respond_defense', useGari: true, useDefense: true }, 'gari_not_allowed')
  bad(f.host, { type: 'respond_defense', useGari: false, useDefense: true }, 'target_required')
  for (const targetFieldId of ['old-or-private-card', waiting.you.field[0].fid]) {
    bad(f.host, { type: 'respond_defense', useGari: false, useDefense: true, targetFieldId }, 'invalid_target')
  }
  for (const useDefense of [null, 1, 'true', {}]) bad(f.host,
    { type: 'respond_defense', useGari: false, useDefense }, 'invalid_action')
  for (const useGari of [undefined, null, 1, 'true']) bad(f.host,
    { type: 'respond_defense', useGari, useDefense: true }, 'invalid_action')
  for (const targetFieldId of [null, 0, '', 'x'.repeat(201)]) bad(f.host,
    { type: 'respond_defense', useGari: false, useDefense: true, targetFieldId }, 'invalid_action')
  const ebi = waiting.opponent.field.find(card => card.id === 'ebi')
  bad(f.host, { type: 'respond_defense', useGari: false, useDefense: false, targetFieldId: ebi.fid }, 'invalid_target')
  f.service.disconnect(f.host)
  const resumed = f.peer('defense-resumed'); f.service.connect(resumed)
  assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
  assert.deepEqual(f.read(resumed), waiting)
  const used = f.send(resumed, { type: 'respond_defense', useGari: false, useDefense: true, targetFieldId: ebi.fid })
  const resolved = f.read(resumed)
  assert.equal(resolved.phase, 'playing')
  assert.equal(resolved.pendingAttack, null)
  assert.equal(resolved.pendingReaction, null)
  assert.equal(resolved.you.field.length, 0)
  assert.equal(resolved.you.gari, waiting.you.gari, '海鮮再攻撃ではガリを消費しない')
  assert.equal(resolved.opponent.field.find(card => card.fid === ebi.fid).attackHalved, true)
  assert.equal(resolved.you.belly, waiting.you.belly + 17, '固定13を維持し、海鮮(2+3+3)の50%を切捨4')
  assert.deepEqual(f.service.handle(f.guest, 'match:action', ikaSummon), { ok: true })
  assert.deepEqual(f.service.handle(resumed, 'match:action', used), { ok: true })
  assert.deepEqual(f.read(resumed), resolved)
  assert.deepEqual(f.service.handle(resumed, 'match:action', { ...used, useDefense: false }),
    { ok: false, error: 'action_id_conflict' })
  assert.deepEqual(f.service.handle(resumed, 'match:action', { ...used, actionId: 'stale-answer' }),
    { ok: false, error: 'stale_revision' })
  assert.equal(f.randomCalls(), calls)
  f.send(f.guest, { type: 'end_turn' })
  if (f.read(resumed).pendingAttack) f.send(resumed, { type: 'respond_defense', useGari: false })
  assert.ok(f.read(resumed).opponent.field.every(card => !card.attackHalved))
})

test('通常攻撃はガリとサバ防御を同時に使い、対象抽選と両方の消費を再送で重ねない', t => {
  const f = fixture(t, 'saba')
  f.play(f.host, 'saba', { reserveDefense: true }); f.end(f.host)
  f.play(f.guest, 'ebi'); f.play(f.guest, 'ika')
  assert.equal(f.read(f.host).phase, 'playing')
  f.send(f.guest, { type: 'end_turn' })
  const waiting = f.read(f.host)
  assert.equal(waiting.phase, 'defending')
  assert.equal(waiting.pendingAttack.source, 'end_turn')
  assert.equal(waiting.pendingAttack.amount, 8)
  assert.equal(waiting.you.belly, 3)
  assert.ok(waiting.pendingAttack.defenseCardId)
  const calls = f.randomCalls()
  assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host, {
    type: 'respond_defense', useGari: true, useDefense: true, targetFieldId: waiting.opponent.field[0].fid,
  })), { ok: false, error: 'invalid_target' }, 'ランダム防御の対象をクライアントが指定できない')
  assert.equal(f.randomCalls(), calls)
  assert.deepEqual(f.read(f.host), waiting)
  const answer = f.send(f.host, { type: 'respond_defense', useGari: true, useDefense: true })
  const after = f.read(f.host)
  assert.equal(f.randomCalls(), calls + 1)
  assert.equal(after.you.field.length, 0)
  assert.equal(after.you.gari, waiting.you.gari - 1)
  assert.equal(after.you.belly, 1, 'いかを半減して合計6、ガリで3、元のお腹3から着弾後に5消化')
  assert.equal(after.phase, 'playing')
  assert.equal(after.activePlayerId, 1)
  assert.equal(after.pendingAttack, null)
  assert.ok(after.opponent.field.every(card => !card.attackHalved), '半減はターン終了後に解除する')
  assert.deepEqual(f.service.handle(f.host, 'match:action', answer), { ok: true })
  assert.deepEqual(f.read(f.host), after)
  assert.equal(f.randomCalls(), calls + 1)
  assert.deepEqual(f.service.handle(f.host, 'match:action', { ...answer, useGari: false }),
    { ok: false, error: 'action_id_conflict' })
})

test('防御を温存するとガリと札を使わず着弾し、待機札は相手終了攻撃の後に失効する', t => {
  const f = fixture(t, 'saba')
  f.play(f.host, 'saba', { reserveDefense: true }); f.end(f.host)
  f.play(f.guest, 'ebi'); f.play(f.guest, 'ika')
  f.send(f.guest, { type: 'end_turn' })
  const waiting = f.read(f.host)
  assert.equal(waiting.you.field[0].defenseState, 'ready')
  const calls = f.randomCalls()
  const answer = f.send(f.host, { type: 'respond_defense', useGari: false, useDefense: false })
  const after = f.read(f.host)
  assert.equal(after.you.belly, 6, '元のお腹3 + 攻撃8 - 消化5')
  assert.equal(after.you.gari, waiting.you.gari)
  assert.equal(after.phase, 'playing')
  assert.equal(after.activePlayerId, 1)
  assert.equal(after.you.field.length, 0)
  assert.equal(after.pendingAttack, null)
  assert.equal(f.randomCalls(), calls)
  assert.deepEqual(f.service.handle(f.host, 'match:action', answer), { ok: true })
  assert.deepEqual(f.read(f.host), after)
})

test('チーズは切れ味0でも自動で防御待機し、ランダム1体を25%だけ軽減する', t => {
  const f = fixture(t, 'cheese', false)
  const before = f.read(f.host)
  assert.equal(before.you.kiretaStack, 0)
  f.play(f.host, 'cheese')
  assert.equal(f.read(f.host).you.kiretaStack, 0)
  assert.equal(f.read(f.host).you.field[0].defenseState, 'reserved')
  f.end(f.host)
  f.play(f.guest, 'ika'); f.play(f.guest, 'ebi')
  f.send(f.guest, { type: 'end_turn' })
  const waiting = f.read(f.host)
  const calls = f.randomCalls()
  assert.equal(waiting.pendingAttack.amount, 8)
  assert.equal(waiting.you.belly, 6, 'いか自身と次のえび召喚で連鎖3が2回')
  const answer = f.send(f.host, { type: 'respond_defense', useGari: false, useDefense: true })
  const after = f.read(f.host)
  assert.equal(f.randomCalls(), calls + 1)
  assert.equal(after.you.belly, 8, 'えび5から25%の軽減量1を引いて4、いか3と合計7、元の6から着弾後に5消化')
  assert.equal(after.you.gari, waiting.you.gari)
  assert.equal(after.you.field.length, 0)
  assert.ok(after.opponent.field.every(card => card.attackReductionRate === undefined), 'ターンをまたいで25%軽減が残らない')
  assert.deepEqual(f.service.handle(f.host, 'match:action', answer), { ok: true })
  assert.deepEqual(f.read(f.host), after)
  assert.equal(f.randomCalls(), calls + 1)
})
