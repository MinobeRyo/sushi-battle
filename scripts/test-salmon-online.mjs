import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'

function fixture(t) {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.999 })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, state() {}, closed() {} })
  const host = peer('salmon-host'), guest = peer('salmon-guest')
  service.connect(host); service.connect(guest)
  const created = service.handle(host, 'room:create')
  assert.equal(created.ok, true)
  assert.equal(service.handle(guest, 'room:join', { code: created.session.code }).ok, true)
  let sequence = 0
  const read = player => structuredClone(service.snapshot(player).match)
  const draft = (player, command) => {
    const state = service.snapshot(player).draft
    assert.deepEqual(service.handle(player, 'draft:action', { draftId: state.draftId,
      expectedRevision: state.revision, actionId: `draft-${++sequence}`, ...command }), { ok: true })
  }
  const action = (player, command) => {
    const match = read(player)
    return { matchId: match.matchId, expectedRevision: match.revision, actionId: `battle-${++sequence}`, ...command }
  }
  const send = (player, command) => {
    const request = action(player, command)
    assert.deepEqual(service.handle(player, 'match:action', request), { ok: true })
    return request
  }
  const play = (player, cardId) => send(player, { type: 'play_card',
    cardInstanceId: read(player).you.hand.find(card => card.id === cardId).instanceId })
  const end = player => {
    send(player, { type: 'end_turn' })
    const pending = read(host).pendingAttack
    if (pending) send(pending.defenderId === 1 ? host : guest, { type: 'respond_defense', useGari: false })
  }
  for (const [player, ids] of [[host, ['salmon', 'salmon', 'tamago']], [guest, ['kappa_maki', 'kappa_maki', 'tamago']]]) {
    for (const cardId of ids) { draft(player, { type: 'order', cardId }); draft(player, { type: 'pickup' }) }
    draft(player, { type: 'complete' })
  }
  end(host)
  play(guest, 'kappa_maki'); play(guest, 'kappa_maki')
  end(guest)
  return { service, host, guest, peer, created, read, action, send }
}

test('オンラインで対象個体を転送・除去し、再送・改変拒否・再接続でも一度だけ適用する', t => {
  const f = fixture(t)
  const before = f.read(f.host)
  const [first, second] = before.opponent.field
  assert.equal(first.id, 'kappa_maki'); assert.equal(second.id, 'kappa_maki')
  const salmon = before.you.hand.find(card => card.id === 'salmon')
  const base = { type: 'play_card', cardInstanceId: salmon.instanceId }
  for (const [extra, error] of [
    [{}, 'target_required'], [{ targetFieldId: 'missing' }, 'invalid_target'],
    ...[null, 3, '', {}, 'x'.repeat(10_000)].map(targetFieldId => [{ targetFieldId }, 'invalid_action']),
  ]) {
    assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host, { ...base, ...extra })), { ok: false, error })
    assert.deepEqual(f.read(f.host), before)
  }
  const request = f.send(f.host, { ...base, targetFieldId: second.fid })
  const after = f.read(f.host)
  assert.deepEqual(after.opponent.field, [first])
  assert.deepEqual(f.read(f.guest).you.field, [first])
  assert.equal(after.you.ap, before.you.ap - 2)
  assert.equal(after.you.hand.length, before.you.hand.length - 1)
  assert.equal(after.opponent.belly, before.opponent.belly)
  assert.equal(after.opponent.gari, before.opponent.gari)
  assert.equal(after.pendingAttack, null)
  assert.equal('hand' in after.opponent, false)
  assert.deepEqual(f.service.handle(f.host, 'match:action', request), { ok: true })
  assert.deepEqual(f.read(f.host), after)
  for (const targetFieldId of [first.fid, undefined]) {
    assert.deepEqual(f.service.handle(f.host, 'match:action', { ...request, targetFieldId }),
      { ok: false, error: 'action_id_conflict' })
    assert.deepEqual(f.read(f.host), after)
  }
  f.service.disconnect(f.host)
  const resumed = f.peer('salmon-resumed'); f.service.connect(resumed)
  assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
  assert.deepEqual(f.read(resumed), after)
  assert.deepEqual(f.service.handle(resumed, 'match:action', request), { ok: true })
  assert.deepEqual(f.read(resumed), after)
})
