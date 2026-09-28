import assert from 'node:assert/strict'
import { createRoomService } from '../server/roomService.ts'
import { applyDraftAction, createOnlineDraft } from '../server/onlineDraft.ts'
import { CARDS } from '../src/data/cards.ts'

const realNow = Date.now
let now = 1_000_000
Date.now = () => now
let passed = 0
let actionId = 0
const services = []
function fixture() {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.5 })
  services.push(service)
  const peer = id => ({ id, data: {}, latest: null, state(value) { this.latest = structuredClone(value) }, closed() {} })
  const host = peer('host'), guest = peer('guest')
  service.connect(host)
  service.connect(guest)
  const created = service.handle(host, 'room:create')
  const joined = service.handle(guest, 'room:join', { code: created.session.code })
  const read = player => structuredClone(service.snapshot(player))
  const action = (player, command) => {
    const draft = read(player).draft
    return { draftId: draft.draftId, expectedRevision: draft.revision, actionId: `draft-test-${++actionId}`, ...command }
  }
  const send = (player, command) => service.handle(player, 'draft:action', action(player, command))
  const finish = () => {
    assert.deepEqual(send(host, { type: 'complete' }), { ok: true })
    assert.deepEqual(send(guest, { type: 'complete' }), { ok: true })
  }
  return { service, host, guest, created, joined, read, action, send, finish, peer }
}
async function test(name, run) {
  now = 1_000_000
  try { await run(); passed++; console.log(`  ✓ ${name}`) }
  finally { for (const service of services.splice(0)) service.close() }
}

try {
  await test('初回購入は両者90秒・3000円で同時開始し、相手の購入内容は送信しない', () => {
    const f = fixture()
    const state = f.read(f.host)
    assert.equal(state.match, null)
    assert.equal(state.draft.you.deadlineAt - state.draft.startedAt, 90_000)
    assert.equal(state.draft.you.budget, 3000)
    assert.equal(state.draft.offers.length, 22)
    assert.deepEqual(Object.keys(state.draft).sort(), ['draftId', 'mode', 'startedAt', 'initialBudget', 'revision', 'you', 'offers', 'opponentCompleted'].sort())
    f.send(f.guest, { type: 'order', cardId: 'salmon' })
    assert.equal(f.read(f.host).draft.you.deck.length, 0)
    assert.equal('players' in f.read(f.host).draft, false)
    assert.equal('bags' in f.read(f.host).draft, false)
    assert.equal('purchasedIds' in f.read(f.host).draft.you, false)
  })

  await test('皿の購入はサーバー価格で確定し、再送・別IDの二重購入・なりすましを拒否する', () => {
    const f = fixture()
    const offer = f.read(f.host).draft.offers[5]
    const action = f.action(f.host, { type: 'buy', offerId: offer.id, price: -999, card: { id: 'ootoro' }, playerId: 2 })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', action), { ok: true })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', action), { ok: true })
    assert.equal(f.read(f.host).draft.you.budget, 3000 - offer.card.price)
    assert.equal(f.read(f.host).draft.you.deck[0].id, offer.card.id)
    assert.equal(f.read(f.guest).draft.you.budget, 3000)
    assert.deepEqual(f.send(f.host, { type: 'buy', offerId: offer.id }), { ok: false, error: 'draft_duplicate' })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', { ...action, type: 'complete' }), { ok: false, error: 'action_id_conflict' })
    assert.deepEqual(f.send(f.guest, { type: 'buy', offerId: offer.id }), { ok: false, error: 'draft_offer_expired' })
  })

  await test('不正な操作・古い購入状態・前回の購入ID・存在しないカードを拒否する', () => {
    const f = fixture()
    for (const value of [null, [], {}, { type: 'complete' }, f.action(f.host, { type: 'order', cardId: '' })]) {
      assert.deepEqual(f.service.handle(f.host, 'draft:action', value), { ok: false, error: 'invalid_action' })
    }
    const old = f.action(f.host, { type: 'complete' })
    f.send(f.host, { type: 'order', cardId: 'tamago' })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', old), { ok: false, error: 'stale_revision' })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', { ...old, draftId: 'previous' }), { ok: false, error: 'stale_draft' })
    assert.deepEqual(f.send(f.guest, { type: 'order', cardId: 'fake-card' }), { ok: false, error: 'invalid_action' })
  })

  await test('特急は1.5倍・50円切上げで3回まで、受領待ちの再注文と二重受領を防ぐ', () => {
    const f = fixture()
    const card = CARDS.find(card => card.id === 'salmon')
    const price = Math.ceil(card.price * 1.5 / 50) * 50
    for (let count = 0; count < 3; count++) {
      assert.deepEqual(f.send(f.host, { type: 'order', cardId: card.id }), { ok: true })
      assert.deepEqual(f.send(f.host, { type: 'order', cardId: card.id }), { ok: false, error: 'draft_delivery_pending' })
      assert.deepEqual(f.send(f.host, { type: 'pickup' }), { ok: true })
      assert.deepEqual(f.send(f.host, { type: 'pickup' }), { ok: false, error: 'draft_no_delivery' })
    }
    const draft = f.read(f.host).draft
    assert.equal(draft.you.deck.length, 3)
    assert.equal(draft.you.budget, 3000 - 3 * price)
    assert.deepEqual(f.send(f.host, { type: 'order', cardId: card.id }), { ok: false, error: 'draft_orders_used' })
  })

  await test('サーバー側でも残金と20枚上限を検証し、クライアントの残金指定を信用しない', () => {
    const draft = createOnlineDraft('initial', now, () => 0.5)
    const player = draft.players[1]
    const offer = player.offers[0]
    const buy = () => applyDraftAction(draft, 1, { draftId: draft.id, expectedRevision: player.revision,
      actionId: `limit-${++actionId}`, type: 'buy', offerId: offer.id, budget: 99999 }, now)
    player.state.budget = offer.card.price - 1
    assert.deepEqual(buy(), { ok: false, error: 'draft_budget' })
    player.state.budget = 3000
    player.state.deck = Array(20).fill(offer.card)
    assert.deepEqual(buy(), { ok: false, error: 'draft_full' })
    assert.equal(player.state.budget, 3000)
  })

  await test('周回後の古い皿を拒否し、表示用の更新だけでは購入revisionを変えない', () => {
    const f = fixture()
    const before = f.read(f.host).draft
    const offer = before.offers.find(offer => offer.lane === 'build' && offer.slot === 0)
    now += 2000
    assert.deepEqual(f.send(f.host, { type: 'buy', offerId: offer.id }), { ok: false, error: 'draft_offer_expired' })
    const after = f.read(f.host).draft
    assert.equal(after.revision, before.revision)
    assert.ok(after.offers.some(next => next.slot === offer.slot && next.lane === offer.lane && next.generation > offer.generation))
  })

  await test('購入・特急配送中の切断から復帰しても、デッキ・残金・締切を保持する', () => {
    const f = fixture()
    f.send(f.guest, { type: 'order', cardId: 'salmon' })
    const before = f.read(f.guest).draft
    f.service.disconnect(f.guest)
    assert.equal(f.read(f.host).connected[2], false)
    assert.deepEqual(f.send(f.host, { type: 'order', cardId: 'tamago' }), { ok: true })
    const replacement = f.peer('replacement')
    f.service.connect(replacement)
    const resumed = f.service.handle(replacement, 'room:resume', f.joined.session)
    assert.equal(resumed.ok, true)
    assert.deepEqual(resumed.snapshot.draft, before)
  })

  await test('先に終了した側は待機し、未受領の特急も対戦へ引き継ぐ。完了の再送で二重開始しない', () => {
    const f = fixture()
    f.send(f.host, { type: 'order', cardId: 'salmon' })
    const complete = f.action(f.host, { type: 'complete' })
    f.service.handle(f.host, 'draft:action', complete)
    assert.equal(f.read(f.host).match, null)
    assert.equal(f.read(f.guest).draft.opponentCompleted, true)
    assert.deepEqual(f.send(f.host, { type: 'order', cardId: 'tamago' }), { ok: false, error: 'draft_completed' })
    f.send(f.guest, { type: 'complete' })
    const match = f.read(f.host).match
    assert.equal(match.you.hand[0].id, 'salmon')
    assert.equal(match.you.hand.length, 1)
    assert.equal(match.opponent.handCount + match.opponent.deckCount, 10)
    assert.deepEqual(f.service.handle(f.host, 'draft:action', complete), { ok: true })
    assert.equal(f.read(f.host).match.matchId, match.matchId)
  })

  await test('両者無操作でもサーバーのタイマーで締め切り、購入済みカードを保持する', async () => {
    const f = fixture()
    f.send(f.host, { type: 'order', cardId: 'salmon' })
    const late = f.action(f.host, { type: 'order', cardId: 'tamago' })
    now += 90_000
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(f.host.latest.draft, null)
    assert.equal(f.host.latest.match.you.hand[0].id, 'salmon')
    assert.deepEqual(f.service.handle(f.host, 'draft:action', late), { ok: false, error: 'draft_not_started' })
  })

  await test('手札・山札が尽きると45秒・1500円の同時追加注文へ入り、0枚なら補充しない', () => {
    const f = fixture()
    for (const peer of [f.host, f.guest]) {
      f.send(peer, { type: 'order', cardId: 'tamago' })
      f.send(peer, { type: 'complete' })
    }
    const matchId = f.read(f.host).match.matchId
    const battle = (peer, command) => {
      const match = f.read(peer).match
      assert.deepEqual(f.service.handle(peer, 'match:action', { matchId, expectedRevision: match.revision,
        actionId: `battle-${++actionId}`, ...command }), { ok: true })
    }
    for (const peer of [f.host, f.guest]) {
      battle(peer, { type: 'play_card', cardInstanceId: f.read(peer).match.you.hand[0].instanceId })
      battle(peer, { type: 'end_turn' })
    }
    const before = f.read(f.host)
    assert.equal(before.match.phase, 'reorder')
    assert.equal(before.draft.mode, 'reorder')
    assert.equal(before.draft.you.budget, 1500)
    assert.equal(before.draft.you.deadlineAt - before.draft.startedAt, 45_000)
    f.send(f.guest, { type: 'order', cardId: 'salmon' })
    f.finish()
    const after = f.read(f.host)
    assert.equal(after.draft, null)
    assert.equal(after.match.matchId, matchId)
    assert.equal(after.match.phase, 'playing')
    assert.equal(after.match.you.hand.length + after.match.you.deckCount, 0)
    assert.equal(after.match.opponent.handCount, 1)
    assert.equal(after.match.turn, before.match.turn)
    assert.deepEqual(after.match.you.field, before.match.you.field)
    assert.equal(after.match.you.belly, before.match.you.belly)
  })
} finally { Date.now = realNow }
console.log(`\nオンライン購入: ${passed}件成功`)
