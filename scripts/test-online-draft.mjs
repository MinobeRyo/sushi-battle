import assert from 'node:assert/strict'
import { createRoomService } from '../server/roomService.ts'
import { applyDraftAction, createOnlineDraft } from '../server/onlineDraft.ts'
import { CARDS } from '../src/data/cards.ts'
import { DRAFT_HOVER_LEASE_MS, onlineLaneElapsed, onlinePlatePosition } from '../src/game/draftOffers.ts'

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
  const hover = (player, lanes, sequence = ++actionId) => service.handle(player, 'draft:hover', {
    draftId: read(player).draft.draftId, lanes, sequence,
  })
  const finish = () => {
    assert.deepEqual(send(host, { type: 'complete' }), { ok: true })
    assert.deepEqual(send(guest, { type: 'complete' }), { ok: true })
  }
  return { service, host, guest, created, joined, read, action, send, hover, finish, peer }
}
async function test(name, run) {
  now = 1_000_000
  try { await run(); passed++; console.log(`  ✓ ${name}`) }
  finally { for (const service of services.splice(0)) service.close() }
}

function battleAction(f, peer, command = {}) {
  const match = f.read(peer).match
  return { matchId: match.matchId, expectedRevision: match.revision,
    actionId: `battle-${++actionId}`, type: 'end_turn', ...command }
}

function defenseFixture() {
  const f = fixture()
  assert.deepEqual(f.send(f.host, { type: 'order', cardId: 'tamago' }), { ok: true })
  f.finish()
  assert.deepEqual(f.service.handle(f.host, 'match:action', battleAction(f, f.host, {
    type: 'play_card', cardInstanceId: f.read(f.host).match.you.hand[0].instanceId,
  })), { ok: true })
  const beforeAttack = f.read(f.host).match
  assert.deepEqual(f.service.handle(f.host, 'match:action', battleAction(f, f.host)), { ok: true })
  return { ...f, beforeAttack }
}

try {
  await test('初回購入は両者90秒・3000円で同時開始し、相手の購入内容は送信しない', () => {
    const f = fixture()
    const state = f.read(f.host)
    assert.equal(state.match, null)
    assert.equal(state.draft.you.deadlineAt - state.draft.startedAt, 90_000)
    assert.equal(state.draft.you.budget, 3000)
    assert.equal(state.draft.offers.length, 22)
    assert.deepEqual(Object.keys(state.draft).sort(), ['draftId', 'mode', 'startedAt', 'initialBudget', 'revision', 'you', 'offers', 'laneClocks', 'opponentCompleted'].sort())
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

  await test('hoverは本人の該当レーンだけ停止し、相手・別レーン・締切は進む。停止中の皿を購入できる', () => {
    const f = fixture()
    const before = f.read(f.host).draft
    const offer = before.offers.find(offer => offer.lane === 'build' && offer.slot === 0)
    assert.deepEqual(f.hover(f.host, ['build']), { ok: true })
    now += 2000
    const stopped = f.read(f.host).draft
    assert.equal(onlineLaneElapsed(stopped.startedAt, stopped.laneClocks.build, now), 0)
    assert.equal(onlineLaneElapsed(stopped.startedAt, stopped.laneClocks.general, now), 2000)
    const guest = f.read(f.guest).draft
    assert.equal(onlineLaneElapsed(guest.startedAt, guest.laneClocks.build, now), 2000)
    assert.ok(guest.offers.some(item => item.lane === 'build' && item.slot === 0 && item.generation > 0))
    assert.equal(stopped.you.deadlineAt, before.you.deadlineAt)
    assert.equal(stopped.you.deadlineAt - now, 88_000)
    assert.equal(stopped.revision, before.revision)
    assert.deepEqual(f.send(f.host, { type: 'buy', offerId: offer.id }), { ok: true })
    assert.equal(f.read(f.host).draft.you.deck[0].id, offer.card.id)
  })

  await test('hoverを更新して長く停止しても、解除時に飛ばずその位置から再開する', () => {
    const f = fixture()
    now += 100
    f.hover(f.host, ['build'])
    const before = f.read(f.host).draft
    const beforePosition = onlinePlatePosition('build', 4, onlineLaneElapsed(before.startedAt, before.laneClocks.build, now))
    for (let i = 0; i < 5; i++) { now += 1000; f.hover(f.host, ['build']) }
    const stopped = f.read(f.host).draft
    assert.deepEqual(onlinePlatePosition('build', 4, onlineLaneElapsed(stopped.startedAt, stopped.laneClocks.build, now)), beforePosition)
    f.hover(f.host, [])
    const resumed = f.read(f.host).draft
    assert.equal(resumed.laneClocks.build.pausedAt, null)
    assert.equal(onlineLaneElapsed(resumed.startedAt, resumed.laneClocks.build, now), 100)
    now += 100
    assert.equal(onlineLaneElapsed(resumed.startedAt, resumed.laneClocks.build, now), 200)
    assert.equal(resumed.you.deadlineAt, before.you.deadlineAt)
  })

  await test('停止期限切れは表示とサーバーの双方で再開し、hover解除より古い通信は再停止させない', () => {
    const f = fixture()
    f.hover(f.host, ['build'], 10)
    const stopped = f.read(f.host).draft
    now += DRAFT_HOVER_LEASE_MS + 2000
    assert.equal(onlineLaneElapsed(stopped.startedAt, stopped.laneClocks.build, now), 2000)
    const expired = f.read(f.host).draft
    assert.equal(expired.laneClocks.build.pausedAt, null)
    assert.equal(onlineLaneElapsed(expired.startedAt, expired.laneClocks.build, now), 2000)
    assert.ok(expired.offers.some(item => item.lane === 'build' && item.slot === 0 && item.generation > 0))
    f.hover(f.host, ['build'], 11)
    f.hover(f.host, [], 12)
    assert.deepEqual(f.hover(f.host, ['build'], 11), { ok: true })
    assert.equal(f.read(f.host).draft.laneClocks.build.pausedAt, null)
  })

  await test('不正なhover・別の購入タイム・未参加者による停止を拒否する', () => {
    const f = fixture()
    const draftId = f.read(f.host).draft.draftId
    for (const value of [null, {}, { draftId, lanes: ['fake'], sequence: 1 },
      { draftId, lanes: ['build', 'build'], sequence: 1 }, { draftId, lanes: ['build'], sequence: 0 },
      { draftId, lanes: ['build'], sequence: NaN }]) {
      assert.deepEqual(f.service.handle(f.host, 'draft:hover', value), { ok: false, error: 'invalid_action' })
    }
    assert.deepEqual(f.service.handle(f.host, 'draft:hover', { draftId: 'old', lanes: ['build'], sequence: 1 }), { ok: false, error: 'stale_draft' })
    assert.deepEqual(f.service.handle(f.peer('outsider'), 'draft:hover', { draftId, lanes: ['build'], sequence: 1 }), { ok: false, error: 'not_in_room' })
  })

  await test('切断と復帰でhoverを解除し、再接続側はレーンを操作できる', () => {
    const f = fixture()
    f.hover(f.host, ['general', 'build'])
    now += 500
    f.service.disconnect(f.host)
    now += 1000
    const replacement = f.peer('replacement')
    f.service.connect(replacement)
    const resumed = f.service.handle(replacement, 'room:resume', f.created.session)
    assert.equal(resumed.ok, true)
    assert.equal(resumed.snapshot.draft.laneClocks.build.pausedAt, null)
    assert.equal(onlineLaneElapsed(resumed.snapshot.draft.startedAt, resumed.snapshot.draft.laneClocks.build, now), 1000)
    assert.deepEqual(f.hover(replacement, ['build'], 1), { ok: true })
    assert.notEqual(f.read(replacement).draft.laneClocks.build.pausedAt, null)
    // 同じ席を新しい画面で開き直した場合も古いカーソル状態を引き継がない。
    const another = f.peer('another')
    f.service.connect(another)
    const switched = f.service.handle(another, 'room:resume', f.created.session)
    assert.equal(switched.snapshot.draft.laneClocks.build.pausedAt, null)
    assert.deepEqual(f.service.handle(replacement, 'draft:hover', { draftId: switched.snapshot.draft.draftId, lanes: ['build'], sequence: 2 }), { ok: false, error: 'not_in_room' })
  })

  await test('両レーンを停止していても締切で購入を終了し、完了後のhoverは受付しない', () => {
    const f = fixture()
    const draftId = f.read(f.host).draft.draftId
    for (let i = 0; i < 89; i++) { f.hover(f.host, ['general', 'build']); now += 1000 }
    f.hover(f.host, ['general', 'build'])
    now += 1000
    assert.equal(f.read(f.host).draft, null)
    assert.ok(f.read(f.host).match)
    assert.deepEqual(f.service.handle(f.host, 'draft:hover', { draftId, lanes: ['build'], sequence: ++actionId }), { ok: false, error: 'draft_not_started' })
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
      const defender = peer === f.host ? f.guest : f.host
      battle(defender, { type: 'respond_defense', useGari: false })
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

  await test('攻撃を両者へ保留状態で公開し、防御側以外の回答と回答中の通常操作を拒否する', () => {
    const f = defenseFixture()
    const host = f.read(f.host).match, guest = f.read(f.guest).match
    assert.equal(host.phase, 'defending')
    assert.deepEqual(host.pendingAttack, { attackerId: 1, defenderId: 2, amount: 4, source: 'end_turn' })
    assert.deepEqual(guest.pendingAttack, host.pendingAttack)
    assert.equal(host.you.gari, 2)
    assert.equal(host.opponent.gari, 2)
    assert.equal(guest.you.gari, 2)
    assert.equal(host.opponent.belly, f.beforeAttack.opponent.belly)
    assert.deepEqual(host.you.field, f.beforeAttack.you.field)
    assert.equal(host.activePlayerId, 1)
    assert.equal(host.turn, f.beforeAttack.turn)
    assert.equal('hand' in host.opponent, false)
    assert.equal('deck' in guest.you, false)
    for (const peer of [f.host, f.guest]) {
      assert.equal(f.service.handle(peer, 'match:action', battleAction(f, peer)).ok, false)
      assert.deepEqual(f.service.handle(peer, 'match:action', battleAction(f, peer, {
        type: 'use_side_menu',
      })), { ok: false, error: 'not_your_turn' })
    }
    assert.deepEqual(f.service.handle(f.guest, 'match:action', battleAction(f, f.guest, {
      type: 'play_card', cardInstanceId: guest.you.hand[0].instanceId,
    })), { ok: false, error: 'not_your_turn' })
    assert.deepEqual(f.service.handle(f.host, 'match:action', battleAction(f, f.host, {
      type: 'respond_defense', useGari: true, playerId: 2,
    })), { ok: false, error: 'not_defender' })
    for (const useGari of [undefined, null, 1, 'true']) {
      assert.deepEqual(f.service.handle(f.guest, 'match:action', battleAction(f, f.guest, {
        type: 'respond_defense', useGari,
      })), { ok: false, error: 'invalid_action' })
    }
    assert.deepEqual(f.read(f.host).match, host)
  })

  await test('ガリの回答を一度だけ反映し、同じ回答の再送・別回答への改変・古い状態で二重消費しない', () => {
    const f = defenseFixture()
    const before = f.read(f.guest).match
    const response = battleAction(f, f.guest, { type: 'respond_defense', useGari: true })
    assert.deepEqual(f.service.handle(f.guest, 'match:action', response), { ok: true })
    const after = f.read(f.guest).match
    assert.equal(after.you.gari, 1)
    assert.equal(after.you.belly, 0)
    assert.equal(after.revision, before.revision + 1)
    assert.equal(after.phase, 'playing')
    assert.equal(after.pendingAttack, null)
    assert.equal(after.activePlayerId, 2)
    assert.equal(f.read(f.host).match.opponent.gari, 1)
    assert.deepEqual(f.service.handle(f.guest, 'match:action', response), { ok: true })
    assert.deepEqual(f.service.handle(f.guest, 'match:action', { ...response, useGari: false }),
      { ok: false, error: 'action_id_conflict' })
    assert.deepEqual(f.service.handle(f.guest, 'match:action', { ...response, actionId: 'stale-defense' }),
      { ok: false, error: 'stale_revision' })
    assert.deepEqual(f.service.handle(f.guest, 'match:action', battleAction(f, f.guest, {
      type: 'respond_defense', useGari: true,
    })), { ok: false, error: 'not_defending' })
    assert.deepEqual(f.read(f.guest).match, after)
  })

  await test('温存を選ぶとガリを減らさず着弾してから次のターンの消化を進める', () => {
    const f = defenseFixture()
    assert.deepEqual(f.service.handle(f.guest, 'match:action', battleAction(f, f.guest, {
      type: 'respond_defense', useGari: false,
    })), { ok: true })
    const after = f.read(f.guest).match
    assert.equal(after.you.gari, 2)
    assert.equal(after.you.belly, 2, 'たまごの4ダメージが確定した後、次のターン開始時に2消化する')
    assert.equal(after.activePlayerId, 2)
    assert.equal(after.pendingAttack, null)
  })

  await test('防御待ちの切断・再接続で攻撃とガリを保持し、復帰した本人だけが回答できる', () => {
    const f = defenseFixture()
    const before = f.read(f.guest).match
    f.service.disconnect(f.guest)
    assert.deepEqual(f.service.handle(f.host, 'match:action', battleAction(f, f.host, {
      type: 'respond_defense', useGari: true,
    })), { ok: false, error: 'players_disconnected' })
    const resumed = f.peer('resumed-guest')
    f.service.connect(resumed)
    const reply = f.service.handle(resumed, 'room:resume', f.joined.session)
    assert.equal(reply.ok, true)
    assert.deepEqual(reply.snapshot.match, before)
    assert.deepEqual(f.service.handle(f.guest, 'match:action', {
      matchId: before.matchId, expectedRevision: before.revision, actionId: 'old-peer-defense',
      type: 'respond_defense', useGari: true,
    }), { ok: false, error: 'not_in_room' })
    assert.deepEqual(f.service.handle(resumed, 'match:action', battleAction(f, resumed, {
      type: 'respond_defense', useGari: true,
    })), { ok: true })
    assert.equal(f.read(f.host).match.opponent.gari, 1)
    assert.equal(f.read(resumed).match.pendingAttack, null)
  })
} finally { Date.now = realNow }
console.log(`\nオンライン購入・防御: ${passed}件成功`)
