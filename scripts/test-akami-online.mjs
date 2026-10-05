import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'
import { CARDS } from '../src/data/cards.ts'

function fixture(t) {
  const realNow = Date.now
  let now = 1_000_000
  Date.now = () => now
  t.after(() => { Date.now = realNow })
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.999 })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, state() {}, closed() {} })
  const host = peer('akami-host'), guest = peer('akami-guest')
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
  const send = (player, command) => {
    const state = read(player)
    const request = { matchId: state.matchId, expectedRevision: state.revision, actionId: `battle-${++sequence}`, ...command }
    assert.deepEqual(service.handle(player, 'match:action', request), { ok: true })
    return request
  }
  const play = (player, id) => {
    const chosen = read(player).you.hand.find(c => c.id === id)
    assert.ok(chosen, id)
    return send(player, { type: 'play_card', cardInstanceId: chosen.instanceId })
  }
  const end = player => {
    send(player, { type: 'end_turn' })
    const attack = read(player).pendingAttack
    if (attack) send(attack.defenderId === 1 ? host : guest, { type: 'respond_defense', useGari: false })
  }
  // 特急は3回までなので、追加の中トロ・大トロは通常レーンから購入する。
  const beltNeeded = new Set(['chutoro', 'otoro'])
  for (; beltNeeded.size && now < 1_089_000; now += 1000) {
    const offers = service.snapshot(host).draft.offers
    for (const offer of offers) {
      if (!offer.sold && beltNeeded.has(offer.card?.id)) {
        draft(host, { type: 'buy', offerId: offer.id })
        beltNeeded.delete(offer.card.id)
      }
    }
  }
  assert.equal(beltNeeded.size, 0, '購入時間内に追加の2枚が通常レーンへ流れる')
  for (const [player, ids] of [[host, ['maguro', 'chutoro', 'otoro']],
    [guest, ['maguro', 'chutoro', 'tamago']]]) {
    for (const cardId of ids) { draft(player, { type: 'order', cardId }); draft(player, { type: 'pickup' }) }
    draft(player, { type: 'complete' })
  }
  return { service, host, guest, peer, created, read, send, play, end }
}

test('オンラインの成立後中トロ回復・大トロ供給/回復/次APは再送や復帰で重複せず、生成ビントロを通常ドローできる', t => {
  const f = fixture(t)
  f.end(f.host); f.end(f.guest)
  f.play(f.host, 'maguro'); f.end(f.host)
  f.play(f.guest, 'maguro'); f.end(f.guest)
  const beforeMid = f.read(f.host)
  f.play(f.host, 'chutoro')
  assert.equal(f.read(f.host).you.belly, beforeMid.you.belly, '成立前の中トロでは回復しない')
  f.end(f.host); f.end(f.guest)
  f.play(f.host, 'otoro')
  const unlocked = f.read(f.host)
  assert.ok(unlocked.you.combosFired.includes('akami_mori'))
  assert.equal(unlocked.you.deckCount, 0, '成立させる大トロ自身では生成しない')
  assert.equal(unlocked.you.apNextBonus, 0)
  f.end(f.host)
  f.play(f.guest, 'chutoro'); f.end(f.guest)
  const beforeHeal = f.read(f.host)
  assert.ok(beforeHeal.you.belly >= 10)
  const healing = f.play(f.host, 'chutoro')
  const healed = f.read(f.host)
  assert.equal(healed.you.belly, beforeHeal.you.belly - 10)
  assert.equal(f.read(f.guest).opponent.belly, healed.you.belly)
  assert.deepEqual(f.service.handle(f.host, 'match:action', healing), { ok: true })
  assert.deepEqual(f.read(f.host), healed)
  f.end(f.host); f.end(f.guest)
  const beforeSupply = f.read(f.host)
  const supply = f.play(f.host, 'otoro')
  const supplied = f.read(f.host)
  assert.equal(supplied.you.deckCount, beforeSupply.you.deckCount + 1)
  assert.equal(supplied.you.hand.length, beforeSupply.you.hand.length - 1)
  assert.equal(supplied.you.field.some(c => c.id === 'bintoro'), false)
  assert.equal(supplied.you.belly, Math.max(0, beforeSupply.you.belly - 5))
  assert.equal(supplied.you.ap, beforeSupply.you.ap - 5)
  assert.equal(supplied.you.apNextBonus, beforeSupply.you.apNextBonus + 1)
  assert.equal('deck' in supplied.you, false)
  assert.equal('hand' in supplied.opponent, false)
  assert.equal(f.read(f.guest).opponent.deckCount, supplied.you.deckCount)
  assert.deepEqual(f.service.handle(f.host, 'match:action', supply), { ok: true })
  assert.deepEqual(f.read(f.host), supplied)
  assert.deepEqual(f.service.handle(f.host, 'match:action', { ...supply, cardInstanceId: 'altered' }),
    { ok: false, error: 'action_id_conflict' })
  f.service.disconnect(f.host)
  const resumed = f.peer('akami-resumed'); f.service.connect(resumed)
  assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
  assert.deepEqual(f.read(resumed), supplied)
  assert.deepEqual(f.service.handle(resumed, 'match:action', supply), { ok: true })
  assert.deepEqual(f.read(resumed), supplied)
  f.send(resumed, { type: 'end_turn' })
  if (f.read(resumed).pendingAttack) f.send(f.guest, { type: 'respond_defense', useGari: false })
  const drawnState = f.read(resumed)
  const drawn = drawnState.you.hand.find(c => c.id === 'bintoro')
  assert.ok(drawn)
  const { instanceId, ...data } = drawn
  assert.ok(instanceId)
  assert.deepEqual(data, CARDS.find(c => c.id === 'bintoro'))
  assert.equal(drawnState.you.deckCount, 0)
  assert.equal(drawnState.you.apNextBonus, 1, '相手開始ではAP予約が残る')
  f.send(f.guest, { type: 'end_turn' })
  assert.deepEqual([f.read(resumed).you.ap, f.read(resumed).you.maxAP, f.read(resumed).you.apNextBonus], [9, 9, 0])
})
