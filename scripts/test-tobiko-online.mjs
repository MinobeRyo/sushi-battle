import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'
import { CARDS } from '../src/data/cards.ts'

function fixture(t) {
  let roll = 0.999, calls = 0, sequence = 0
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => { calls++; return roll } })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, state() {}, closed() {} })
  const host = peer('tobiko-host'), guest = peer('tobiko-guest')
  service.connect(host); service.connect(guest)
  const created = service.handle(host, 'room:create')
  assert.equal(created.ok, true)
  assert.equal(service.handle(guest, 'room:join', { code: created.session.code }).ok, true)
  const read = player => structuredClone(service.snapshot(player).match)
  const draft = (player, command) => {
    const state = service.snapshot(player).draft
    assert.deepEqual(service.handle(player, 'draft:action', {
      draftId: state.draftId, expectedRevision: state.revision, actionId: `draft-${++sequence}`, ...command,
    }), { ok: true })
  }
  for (const [player, ids] of [[host, ['tobiko_gunkan', 'tamago']], [guest, ['tamago']]]) {
    for (const cardId of ids) { draft(player, { type: 'order', cardId }); draft(player, { type: 'pickup' }) }
    draft(player, { type: 'complete' })
  }
  const action = (player, command) => {
    const state = read(player)
    return { matchId: state.matchId, expectedRevision: state.revision, actionId: `battle-${++sequence}`, ...command }
  }
  const send = (player, command) => {
    const request = action(player, command)
    assert.deepEqual(service.handle(player, 'match:action', request), { ok: true })
    return request
  }
  return { service, host, guest, peer, created, read, action, send,
    setRoll: value => { roll = value }, calls: () => calls }
}

for (const roll of [0.5 - Number.EPSILON, 0.5]) {
  const success = roll < 0.5
  test(`とびこ複製${success ? '成功' : '不発'}は通信再送・復帰で再抽選せず、不正召喚と相手の手札公開を防ぐ`, t => {
    const f = fixture(t)
    const initial = f.read(f.host)
    const source = initial.you.hand.find(card => card.id === 'tobiko_gunkan')
    const hiddenCard = initial.you.hand.find(card => card.id === 'tamago')
    const play = { type: 'play_card', cardInstanceId: source.instanceId }
    let calls = f.calls()
    assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host, play)),
      { ok: false, error: 'insufficient_ap' })
    assert.deepEqual(f.read(f.host), initial)
    assert.equal(f.calls(), calls)
    f.send(f.host, { type: 'end_turn' }); f.send(f.guest, { type: 'end_turn' })
    const before = f.read(f.host)
    calls = f.calls()
    for (const [command, error] of [
      [{ ...play, cardInstanceId: 'absent' }, 'card_not_in_hand'],
      [{ ...play, sacrificeCount: 1 }, 'invalid_sacrifice_count'],
      [{ ...play, targetFieldId: 'forged-target' }, 'invalid_target'],
    ]) {
      assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host, command)), { ok: false, error })
      assert.deepEqual(f.read(f.host), before)
      assert.equal(f.calls(), calls, '拒否した召喚は抽選しない')
    }
    f.setRoll(roll)
    const request = f.send(f.host, play)
    const after = f.read(f.host)
    assert.equal(f.calls(), calls + 1, '確定した召喚だけ1回抽選する')
    assert.equal(after.revision, before.revision + 1)
    assert.equal(after.you.ap, before.you.ap - 3)
    assert.equal(after.you.hand.length, before.you.hand.length - 1 + Number(success))
    assert.equal(after.you.field.length, before.you.field.length + 1)
    assert.equal(after.you.field.at(-1).fid, source.instanceId)
    assert.equal(after.you.summonedIds.filter(id => id === 'tobiko_gunkan').length, 1)
    const generated = after.you.hand.find(card => card.id === 'tobiko_gunkan')
    if (success) {
      assert.ok(generated)
      assert.notEqual(generated.instanceId, source.instanceId)
      const { instanceId: _, ...data } = generated
      assert.deepEqual(data, CARDS.find(card => card.id === 'tobiko_gunkan'))
    } else assert.equal(generated, undefined)
    const opponentView = f.read(f.guest)
    assert.equal('hand' in opponentView.opponent, false)
    assert.equal('deck' in opponentView.opponent, false)
    assert.equal(opponentView.opponent.handCount, after.you.hand.length)
    assert.equal(JSON.stringify(opponentView).includes(hiddenCard.instanceId), false)
    if (generated) assert.equal(JSON.stringify(opponentView).includes(generated.instanceId), false)

    // 次の乱数を逆の成否にしても、同じ確定済み操作は抽選を呼び直さない。
    f.setRoll(success ? 0.9 : 0.1)
    assert.deepEqual(f.service.handle(f.host, 'match:action', request), { ok: true })
    assert.deepEqual(f.read(f.host), after)
    for (const [retry, error] of [
      [{ ...request, actionId: `${request.actionId}-stale` }, 'stale_revision'],
      [{ ...request, cardInstanceId: hiddenCard.instanceId }, 'action_id_conflict'],
      [f.action(f.host, play), 'card_not_in_hand'],
    ]) {
      assert.deepEqual(f.service.handle(f.host, 'match:action', retry), { ok: false, error })
      assert.deepEqual(f.read(f.host), after)
    }
    assert.equal(f.calls(), calls + 1)
    f.service.disconnect(f.host)
    const resumed = f.peer('tobiko-resumed'); f.service.connect(resumed)
    assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
    assert.deepEqual(f.read(resumed), after)
    assert.deepEqual(f.service.handle(resumed, 'match:action', request), { ok: true })
    assert.deepEqual(f.read(resumed), after)
    assert.deepEqual(f.read(f.guest), opponentView)
    assert.equal(f.calls(), calls + 1, '再接続とその後の再送も再抽選しない')
  })
}
