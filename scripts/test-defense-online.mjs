import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'

function fixture(t, defenseId = 'iwashi_shoga') {
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
  play(host, 'iwashi'); play(host, 'aji')
  return { service, peer, host, guest, created, read, action, send, play, end, randomCalls: () => randomCalls }
}

test('オンライン防御は召喚後に相手だけが回答でき、温存・再接続・再送後も一度だけ解決する', t => {
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
  const summon = f.play(f.guest, 'ebi')
  const waiting = f.read(f.host)
  assert.equal(waiting.phase, 'reacting')
  assert.equal(waiting.pendingReaction.defenderId, 1)
  assert.equal(waiting.pendingReaction.attackerId, 2)
  assert.equal(waiting.pendingReaction.defenseCardId, ready.you.field[0].fid)
  assert.equal(waiting.opponent.handCount, 2)
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
  bad(f.guest, { type: 'respond_reaction', useDefense: false }, 'not_defender')
  bad(f.guest, { type: 'end_turn' }, 'not_your_turn')
  bad(f.host, { type: 'respond_reaction', useDefense: true }, 'target_required')
  bad(f.host, { type: 'respond_reaction', useDefense: true, targetFieldId: 'old-or-private-card' }, 'invalid_target')
  for (const useDefense of [undefined, null, 1, 'true']) bad(f.host, { type: 'respond_reaction', useDefense }, 'invalid_action')
  for (const targetFieldId of [null, 0, '', 'x'.repeat(201)]) bad(f.host,
    { type: 'respond_reaction', useDefense: true, targetFieldId }, 'invalid_action')
  f.service.disconnect(f.host)
  const resumed = f.peer('defense-resumed'); f.service.connect(resumed)
  assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
  assert.deepEqual(f.read(resumed), waiting)
  const skip = f.send(resumed, { type: 'respond_reaction', useDefense: false })
  const skipped = f.read(resumed)
  assert.equal(skipped.phase, 'playing')
  assert.equal(skipped.pendingReaction, null)
  assert.equal(skipped.you.field[0].defenseState, 'ready')
  assert.deepEqual(f.service.handle(resumed, 'match:action', skip), { ok: true })
  assert.deepEqual(f.read(resumed), skipped)
  assert.equal(f.randomCalls(), calls)
  const ikaSummon = f.play(f.guest, 'ika')
  assert.equal(f.read(resumed).pendingReaction.fixedDamage, 3, 'いか召喚時の連鎖3')
  f.send(resumed, { type: 'respond_reaction', useDefense: false })
  const beforeCombo = f.read(resumed)
  f.play(f.guest, 'tako')
  const secondWait = f.read(resumed)
  assert.equal(secondWait.phase, 'reacting')
  assert.equal(secondWait.pendingReaction.fixedDamage, 13, 'いか・たこ連鎖6とえび固定7')
  assert.equal(secondWait.pendingReaction.kaisenReattack, true)
  assert.equal(secondWait.you.belly, beforeCombo.you.belly, '反応回答前は召喚ダメージが入らない')
  assert.equal(secondWait.opponent.summonedIds.filter(id => id === 'ika').length, 1)
  const ebi = secondWait.opponent.field.find(card => card.id === 'ebi')
  const used = f.send(resumed, { type: 'respond_reaction', useDefense: true, targetFieldId: ebi.fid })
  const resolved = f.read(resumed)
  assert.equal(resolved.phase, 'playing')
  assert.equal(resolved.pendingReaction, null)
  assert.equal(resolved.you.field.length, 0)
  assert.equal(resolved.opponent.field.find(card => card.fid === ebi.fid).attackHalved, true)
  assert.equal(resolved.you.belly, secondWait.you.belly + 17, '固定13は維持し、海鮮攻撃(2+3+3)の50%を切捨4')
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
  assert.equal(f.read(resumed).pendingReaction, null)
  assert.ok(f.read(resumed).opponent.field.every(card => !card.attackHalved))
})

test('サバの対象抽選は使用時一度だけで再送しても増えない', t => {
  const f = fixture(t, 'saba')
  f.play(f.host, 'saba', { reserveDefense: true }); f.end(f.host)
  f.play(f.guest, 'ebi')
  const waiting = f.read(f.host)
  const calls = f.randomCalls()
  const answer = f.send(f.host, { type: 'respond_reaction', useDefense: true })
  const after = f.read(f.host)
  assert.equal(f.randomCalls(), calls + 1)
  assert.equal(after.you.field.length, 0)
  assert.equal(after.opponent.field[0].attackHalved, true)
  assert.deepEqual(f.service.handle(f.host, 'match:action', answer), { ok: true })
  assert.deepEqual(f.read(f.host), after)
  assert.equal(f.randomCalls(), calls + 1)
  assert.equal(after.opponent.handCount, waiting.opponent.handCount)
})

test('使用を温存した防御札は相手終了で消え、終了攻撃には追加の反応を要求しない', t => {
  const f = fixture(t, 'saba')
  f.play(f.host, 'saba', { reserveDefense: true }); f.end(f.host)
  f.play(f.guest, 'ebi')
  f.send(f.host, { type: 'respond_reaction', useDefense: false })
  assert.equal(f.read(f.host).you.field[0].defenseState, 'ready')
  f.end(f.guest)
  assert.equal(f.read(f.host).phase, 'playing')
  assert.equal(f.read(f.host).activePlayerId, 1)
  assert.equal(f.read(f.host).you.field.length, 0)
  assert.equal(f.read(f.host).pendingReaction, null)
})
