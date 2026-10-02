#!/usr/bin/env node
// 実roomServiceを通し、購入→生成→選択→即時ダメージ→再送・復帰まで検証する。
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'
import { CARDS, NAMAHAM_CARD } from '../src/data/cards.ts'
import { canPlayOnlineCard } from '../src/features/online/onlineBattleActions.ts'

function fixture(t, sideMenu = null) {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.5 })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, state() {}, closed() {} })
  const host = peer('meat-host'), guest = peer('meat-guest')
  service.connect(host); service.connect(guest)
  const created = service.handle(host, 'room:create')
  assert.equal(created.ok, true)
  assert.equal(service.handle(guest, 'room:join', { code: created.session.code }).ok, true)
  let sequence = 0
  const read = player => structuredClone(service.snapshot(player))
  const draft = (player, command) => {
    const state = read(player).draft
    return service.handle(player, 'draft:action', {
      draftId: state.draftId, expectedRevision: state.revision, actionId: `draft-${++sequence}`, ...command,
    })
  }
  const action = (player, command) => {
    const match = read(player).match
    return { matchId: match.matchId, expectedRevision: match.revision, actionId: `battle-${++sequence}`, ...command }
  }
  const send = (player, command) => {
    const request = action(player, command)
    assert.deepEqual(service.handle(player, 'match:action', request), { ok: true })
    return request
  }
  const defend = (useGari = false) => {
    const pending = read(host).match.pendingAttack
    if (pending) send(pending.defenderId === 1 ? host : guest, { type: 'respond_defense', useGari })
  }
  const end = player => { send(player, { type: 'end_turn' }); defend() }
  const play = (id, sacrificeCount) => {
    const card = read(host).match.you.hand.find(card => card.id === id)
    assert.ok(card, `${id}が手札にある`)
    return send(host, { type: 'play_card', cardInstanceId: card.instanceId,
      ...(sacrificeCount === undefined ? {} : { sacrificeCount }) })
  }
  if (sideMenu) assert.deepEqual(draft(host, { type: 'buy_side_menu', sideMenuId: sideMenu }), { ok: true })
  for (const [player, ids] of [[host, ['gyutan', 'roast_beef', 'wagyu']], [guest, ['tamago']]]) {
    for (const cardId of ids) {
      assert.deepEqual(draft(player, { type: 'order', cardId }), { ok: true })
      assert.deepEqual(draft(player, { type: 'pickup' }), { ok: true })
    }
    assert.deepEqual(draft(player, { type: 'complete' }), { ok: true })
  }
  const prepareWagyu = () => {
    end(host); end(guest); end(host); end(guest)
    play('roast_beef')
    assert.equal(read(host).match.you.field.filter(c => c.id === NAMAHAM_CARD.id).length, 2)
    end(host); end(guest)
  }
  return { service, host, guest, peer, created, read, draft, action, send, defend, end, play, prepareWagyu }
}

test('オンラインで生ハムを2体生成・消費し、肉祭りはガリを消費せず即時に与える', t => {
  const f = fixture(t)
  f.prepareWagyu()
  const before = f.read(f.guest).match.you
  const request = f.play('wagyu', 2)
  const pending = f.read(f.host).match
  assert.equal(pending.you.field.filter(c => c.id === NAMAHAM_CARD.id).length, 0)
  assert.equal(pending.you.sacrificedThisTurn, 2)
  assert.equal(pending.you.field.find(c => c.id === 'wagyu').turnAttackBonus, 16)
  assert.equal(pending.pendingAttack, null)
  assert.equal(pending.phase, 'playing')
  assert.equal(pending.opponent.belly, before.belly + 5)
  assert.equal(pending.opponent.gari, before.gari)
  assert.equal(pending.comboEvents.filter(e => e.comboId === 'niku_matsuri').length, 1)
  assert.deepEqual(f.service.handle(f.host, 'match:action', request), { ok: true })
  assert.deepEqual(f.read(f.host).match, pending, '再送で生贄・コンボ・攻撃を重複させない')
  assert.deepEqual(f.service.handle(f.host, 'match:action', { ...request, sacrificeCount: 1 }),
    { ok: false, error: 'action_id_conflict' })
  const after = f.read(f.host).match
  assert.equal(after.phase, 'playing')
  assert.equal(after.activePlayerId, 1)
  assert.equal(after.opponent.gari, before.gari)
  assert.equal(after.opponent.belly, before.belly + 5)
  assert.equal('hand' in after.opponent, false)
  assert.equal('deck' in after.you, false)
  f.service.disconnect(f.host)
  const resumed = f.peer('meat-resumed')
  f.service.connect(resumed)
  assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
  assert.deepEqual(f.read(resumed).match, after, '復帰後も生成・生贄・コンボ状態を保持する')
})

test('インバウン丼を購入・設置して復帰しても生贄強化を保持し、再送で重複しない', t => {
  const f = fixture(t, 'inbound_don')
  f.prepareWagyu()
  const before = f.read(f.host).match
  const install = f.send(f.host, { type: 'use_side_menu' })
  const installed = f.read(f.host).match
  assert.equal(installed.you.ap, before.you.ap)
  assert.equal(installed.you.sideMenu.status, 'active')
  assert.equal(installed.you.sideMenu.turnsLeft, null)
  assert.equal(installed.you.attackBuff['生ハム'], 2)
  assert.equal(installed.opponent.attackBuff['生ハム'] ?? 0, 0)
  assert.deepEqual(f.service.handle(f.host, 'match:action', install), { ok: true })
  assert.deepEqual(f.read(f.host).match, installed)
  assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host, { type: 'use_side_menu' })),
    { ok: false, error: 'side_menu_already_active' })
  f.service.disconnect(f.host)
  const resumed = f.peer('inbound-resumed')
  f.service.connect(resumed)
  assert.equal(f.service.handle(resumed, 'room:resume', f.created.session).ok, true)
  assert.deepEqual(f.read(resumed).match, installed)
  assert.deepEqual(f.service.handle(resumed, 'match:action', install), { ok: true })
  assert.deepEqual(f.read(resumed).match, installed)
  const wagyu = installed.you.hand.find(card => card.id === 'wagyu')
  const sacrifice = f.send(resumed, { type: 'play_card', cardInstanceId: wagyu.instanceId, sacrificeCount: 2 })
  const after = f.read(resumed).match
  assert.equal(after.you.field.find(card => card.id === 'wagyu').turnAttackBonus, 20)
  assert.equal(after.you.field.filter(card => card.id === NAMAHAM_CARD.id).length, 0)
  assert.equal(after.opponent.belly, installed.opponent.belly + 5)
  assert.equal(after.opponent.gari, installed.opponent.gari)
  assert.equal(after.pendingAttack, null)
  assert.deepEqual(f.service.handle(resumed, 'match:action', sacrifice), { ok: true })
  assert.deepEqual(f.read(resumed).match, after)
  assert.equal(f.read(f.guest).match.opponent.field.find(card => card.id === 'wagyu').turnAttackBonus, 20)
})

test('オンラインでも設置後の生成生ハムは通常攻撃3となり、ガリで切り上げ半減する', t => {
  const f = fixture(t, 'inbound_don')
  f.send(f.host, { type: 'use_side_menu' })
  f.play('gyutan')
  const generated = f.read(f.host).match
  assert.equal(generated.you.field.filter(card => card.id === NAMAHAM_CARD.id).length, 1)
  f.send(f.host, { type: 'end_turn' })
  assert.equal(f.read(f.host).match.pendingAttack.amount, 8, '牛タン5 + 生ハム3')
  f.defend()
  f.end(f.guest)
  const before = f.read(f.host).match.opponent
  f.send(f.host, { type: 'end_turn' })
  assert.equal(f.read(f.host).match.pendingAttack.amount, 3, '次のターンも生ハム3')
  f.defend(true)
  const after = f.read(f.host).match.opponent
  assert.equal(after.gari, before.gari - 1)
  assert.equal(after.belly, before.belly + 2 - 3, '攻撃3は切り上げて2、2巡目のターン開始で3消化')
})

test('生贄数省略は0体として生ハムを残し、0体指定の再送も同じ操作として扱う', t => {
  const f = fixture(t)
  f.prepareWagyu()
  const request = f.play('wagyu')
  const after = f.read(f.host).match
  assert.equal(after.you.field.filter(c => c.id === NAMAHAM_CARD.id).length, 2)
  assert.equal(after.you.sacrificedThisTurn, 0)
  assert.equal(after.phase, 'playing')
  assert.deepEqual(f.service.handle(f.host, 'match:action', { ...request, sacrificeCount: 0 }), { ok: true })
  assert.deepEqual(f.read(f.host).match, after)
})

test('不正な数値・上限超過・対象不足は手札/AP/場を変更せず拒否する', t => {
  const f = fixture(t)
  f.prepareWagyu()
  const before = f.read(f.host).match
  const wagyu = before.you.hand.find(card => card.id === 'wagyu')
  for (const count of [-1, 0.5, '2', null, NaN, Infinity, 3]) {
    const reply = f.service.handle(f.host, 'match:action', f.action(f.host, {
      type: 'play_card', cardInstanceId: wagyu.instanceId, sacrificeCount: count,
    }))
    assert.equal(reply.ok, false, String(count))
    assert.deepEqual(f.read(f.host).match, before)
  }
  f.end(f.host); f.end(f.guest); f.end(f.host); f.end(f.guest)
  const expired = f.read(f.host).match
  assert.equal(expired.you.field.filter(c => c.id === NAMAHAM_CARD.id).length, 0)
  assert.deepEqual(f.service.handle(f.host, 'match:action', f.action(f.host, {
    type: 'play_card', cardInstanceId: wagyu.instanceId, sacrificeCount: 1,
  })), { ok: false, error: 'not_enough_namahamu' })
  assert.deepEqual(f.read(f.host).match, expired)
})

test('満場の召喚可否は実際の手札と消費可能な生ハムで判断する', () => {
  const card = { ...CARDS.find(c => c.id === 'wagyu'), instanceId: 'own-wagyu' }
  const token = { ...NAMAHAM_CARD, fid: 'ham-1', turnsLeft: 2 }
  const field = [...Array.from({ length: 7 }, (_, i) => ({ id: 'tamago', fid: `field-${i}` })), token]
  const match = { you: { hand: [card], field, ap: 4 } }
  assert.equal(canPlayOnlineCard(match, true, card), true)
  assert.equal(canPlayOnlineCard(match, false, card), false)
  assert.equal(canPlayOnlineCard({ you: { ...match.you, ap: 3 } }, true, card), false)
  assert.equal(canPlayOnlineCard({ you: { ...match.you, field: Array(8).fill({ id: 'tamago' }) } }, true, card), false)
  const plain = { ...CARDS.find(c => c.id === 'tamago'), instanceId: 'own-tamago' }
  assert.equal(canPlayOnlineCard({ you: { ...match.you, hand: [plain] } }, true, { ...plain, effect: card.effect }), false)
})

test('生成専用の生ハムをオンライン注文で買えない', t => {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.5 })
  t.after(() => service.close())
  const host = { id: 'buy-token-host', data: {}, state() {}, closed() {} }
  const guest = { id: 'buy-token-guest', data: {}, state() {}, closed() {} }
  service.connect(host); service.connect(guest)
  const created = service.handle(host, 'room:create')
  service.handle(guest, 'room:join', { code: created.session.code })
  const before = structuredClone(service.snapshot(host).draft)
  assert.deepEqual(service.handle(host, 'draft:action', {
    type: 'order', cardId: NAMAHAM_CARD.id, draftId: before.draftId,
    expectedRevision: before.revision, actionId: 'buy-generated-token',
  }), { ok: false, error: 'invalid_action' })
  const after = service.snapshot(host).draft
  assert.deepEqual(after.you, before.you)
  assert.equal(after.revision, before.revision)
})
