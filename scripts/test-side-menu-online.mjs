#!/usr/bin/env node
// 実際のroomServiceで購入から使用・再送・復帰までを検証する。
// 実行: node --import tsx scripts/test-side-menu-online.mjs
import assert from 'node:assert/strict'
import { createRoomService } from '../server/roomService.ts'
import { SIDE_MENUS } from '../src/data/sideMenus.ts'

const realNow = Date.now
let now = 1_000_000
Date.now = () => now
let passed = 0
let nextActionId = 0
const services = []

function fixture() {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.5 })
  services.push(service)
  const peer = id => ({ id, data: {}, state() {}, closed() {} })
  const host = peer('host'), guest = peer('guest')
  service.connect(host)
  service.connect(guest)
  const created = service.handle(host, 'room:create')
  const joined = service.handle(guest, 'room:join', { code: created.session.code })
  assert.equal(joined.ok, true)
  const read = player => structuredClone(service.snapshot(player))
  const draftAction = (player, command) => {
    const draft = read(player).draft
    return { draftId: draft.draftId, expectedRevision: draft.revision,
      actionId: `side-draft-${++nextActionId}`, ...command }
  }
  const draft = (player, command) => service.handle(player, 'draft:action', draftAction(player, command))
  const battleAction = (player, command) => {
    const match = read(player).match
    return { matchId: match.matchId, expectedRevision: match.revision,
      actionId: `side-battle-${++nextActionId}`, ...command }
  }
  const battle = (player, command) => service.handle(player, 'match:action', battleAction(player, command))
  const buy = (player, sideMenuId) => draft(player, { type: 'buy_side_menu', sideMenuId })
  const finish = () => {
    assert.deepEqual(draft(host, { type: 'complete' }), { ok: true })
    assert.deepEqual(draft(guest, { type: 'complete' }), { ok: true })
  }
  const use = player => battle(player, { type: 'use_side_menu' })
  const end = player => assert.deepEqual(battle(player, { type: 'end_turn' }), { ok: true })
  return { service, host, guest, created, joined, peer, read, draftAction, draft, battleAction, battle, buy, finish, use, end }
}

function assertPrivate(match) {
  assert.equal('deck' in match.you, false)
  assert.equal('hand' in match.opponent, false)
  assert.equal('deck' in match.opponent, false)
  assert.equal('players' in match, false)
}

function test(name, run) {
  now = 1_000_000
  try { run(); passed++; console.log(`  ✓ ${name}`) }
  finally { for (const service of services.splice(0)) service.close() }
}

try {
  test('専用枠の購入は300円で確定し、再送・二重購入・別商品へのactionId使い回しを防ぐ', () => {
    const f = fixture()
    const action = f.draftAction(f.host, { type: 'buy_side_menu', sideMenuId: 'karaage', price: -999, playerId: 2 })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', action), { ok: true })
    const purchased = f.read(f.host).draft
    assert.equal(purchased.you.sideMenu, 'karaage')
    assert.equal(purchased.you.budget, 2700)
    assert.equal(purchased.you.deck.length, 0)
    assert.equal(f.read(f.guest).draft.you.sideMenu, null)
    assert.equal(f.read(f.guest).draft.you.budget, 3000)
    assert.deepEqual(f.service.handle(f.host, 'draft:action', action), { ok: true })
    assert.deepEqual(f.read(f.host).draft, purchased)
    assert.deepEqual(f.buy(f.host, 'fries'), { ok: false, error: 'draft_side_menu_owned' })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', { ...action, sideMenuId: 'ramen' }),
      { ok: false, error: 'action_id_conflict' })
    assert.equal('purchasedIds' in purchased.you, false)
    assert.equal('players' in purchased, false)
    assert.equal('opponentSideMenu' in f.read(f.guest).draft, false)
  })

  test('不正な商品ID・古いrevision・前回の購入IDはサーバーで拒否する', () => {
    const f = fixture()
    const before = f.read(f.host).draft
    for (const sideMenuId of [undefined, null, '', 'potato', 'aosa', 'fake', '__proto__', {}, 1]) {
      assert.deepEqual(f.buy(f.host, sideMenuId), { ok: false, error: 'invalid_action' })
    }
    assert.deepEqual(f.read(f.host).draft, before)
    const stale = f.draftAction(f.host, { type: 'buy_side_menu', sideMenuId: 'fries' })
    assert.deepEqual(f.draft(f.host, { type: 'order', cardId: 'tamago' }), { ok: true })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', stale), { ok: false, error: 'stale_revision' })
    assert.deepEqual(f.service.handle(f.host, 'draft:action', { ...stale, draftId: 'previous' }),
      { ok: false, error: 'stale_draft' })
    assert.equal(f.read(f.host).draft.you.sideMenu, null)
  })

  test('購入締切後や購入完了後はサイドメニューを追加できない', () => {
    const f = fixture()
    assert.deepEqual(f.draft(f.host, { type: 'complete' }), { ok: true })
    assert.deepEqual(f.buy(f.host, 'miso'), { ok: false, error: 'draft_completed' })
    const late = f.draftAction(f.guest, { type: 'buy_side_menu', sideMenuId: 'ramen' })
    now += 90_000
    assert.deepEqual(f.service.handle(f.guest, 'draft:action', late), { ok: false, error: 'draft_not_started' })
    assert.equal(f.read(f.host).match.you.sideMenu, null)
    assert.equal(f.read(f.host).match.opponent.sideMenu, null)
  })

  test('6品の購入状態を両者の対戦へ引き継ぎ、寿司の手札・山札には混ぜない', () => {
    for (const menu of SIDE_MENUS) {
      const f = fixture()
      assert.deepEqual(f.buy(f.host, menu.id), { ok: true })
      assert.deepEqual(f.buy(f.guest, 'chawanmushi'), { ok: true })
      f.finish()
      const host = f.read(f.host).match, guest = f.read(f.guest).match
      assert.equal(host.you.sideMenu.id, menu.id)
      assert.equal(host.you.sideMenu.status, 'ready')
      assert.equal(host.opponent.sideMenu.id, 'chawanmushi')
      assert.deepEqual(guest.opponent.sideMenu, host.you.sideMenu)
      assert.equal(host.you.hand.length + host.you.deckCount, 10)
      assert.equal(host.opponent.handCount + host.opponent.deckCount, 10)
      assertPrivate(host)
      assertPrivate(guest)
      const wire = JSON.stringify(host)
      for (const card of guest.you.hand) assert.equal(wire.includes(card.instanceId), false)
    }
  })

  test('唐揚げは本人の手番に1回だけ両腹＋15。再送・なりすまし・操作ID競合で効果を重ねない', () => {
    const f = fixture()
    f.buy(f.host, 'karaage')
    f.buy(f.guest, 'chawanmushi')
    f.finish()
    assert.deepEqual(f.battle(f.guest, { type: 'use_side_menu', playerId: 1 }), { ok: false, error: 'not_your_turn' })
    const action = f.battleAction(f.host, { type: 'use_side_menu', playerId: 2, sideMenuId: 'chawanmushi' })
    assert.deepEqual(f.service.handle(f.host, 'match:action', action), { ok: true })
    const after = f.read(f.host).match
    assert.equal(after.you.belly, 15)
    assert.equal(after.opponent.belly, 15)
    assert.equal(after.you.sideMenu.status, 'used')
    assert.equal(after.opponent.sideMenu.status, 'ready')
    assert.deepEqual(f.service.handle(f.host, 'match:action', action), { ok: true })
    assert.deepEqual(f.read(f.host).match, after)
    assert.deepEqual(f.use(f.host), { ok: false, error: 'side_menu_spent' })
    assert.deepEqual(f.service.handle(f.host, 'match:action', { ...action, type: 'end_turn' }),
      { ok: false, error: 'action_id_conflict' })
    assertPrivate(after)
  })

  test('未購入と設置済みの再使用を拒否し、設置は0APで共有される', () => {
    const f = fixture()
    f.buy(f.guest, 'miso')
    f.finish()
    assert.deepEqual(f.use(f.host), { ok: false, error: 'side_menu_missing' })
    f.end(f.host)
    const before = f.read(f.guest).match
    assert.deepEqual(f.use(f.guest), { ok: true })
    const after = f.read(f.guest).match
    assert.equal(after.you.ap, before.you.ap)
    assert.equal(after.you.sideMenu.status, 'active')
    assert.deepEqual(f.read(f.host).match.opponent.sideMenu, after.you.sideMenu)
    assert.deepEqual(f.use(f.guest), { ok: false, error: 'side_menu_already_active' })
  })

  test('ラーメンはAP満タンでは消費せず、初回から回復し、同じ手番の二重使用と3手番後の使用を拒否する', () => {
    const f = fixture()
    f.buy(f.host, 'ramen')
    f.draft(f.host, { type: 'order', cardId: 'tamago' })
    f.finish()
    const before = f.read(f.host).match
    assert.deepEqual(f.use(f.host), { ok: false, error: 'side_menu_ap_full' })
    assert.deepEqual(f.read(f.host).match, before)
    const card = before.you.hand[0]
    assert.deepEqual(f.battle(f.host, { type: 'play_card', cardInstanceId: card.instanceId }), { ok: true })
    const played = f.read(f.host).match
    assert.deepEqual(f.use(f.host), { ok: true })
    const used = f.read(f.host).match
    assert.equal(used.you.ap, played.you.ap + 1)
    assert.equal(used.you.belly, played.you.belly + 5)
    assert.equal(used.you.sideMenu.status, 'active')
    assert.equal(used.you.sideMenu.turnsLeft, 3)
    assert.equal(used.you.sideMenu.usedThisTurn, true)
    assert.deepEqual(f.use(f.host), { ok: false, error: 'side_menu_used_this_turn' })
    for (const turnsLeft of [2, 1, 0]) {
      f.end(f.host)
      assert.equal(f.read(f.host).match.you.sideMenu.turnsLeft, turnsLeft)
      f.end(f.guest)
    }
    assert.equal(f.read(f.host).match.you.sideMenu.status, 'expired')
    assert.deepEqual(f.use(f.host), { ok: false, error: 'side_menu_spent' })
  })

  test('切断復帰で購入品と使用済み状態を保持し、新接続からの再送でも効果を重ねない', () => {
    const f = fixture()
    f.buy(f.host, 'karaage')
    const purchased = f.read(f.host).draft
    f.service.disconnect(f.host)
    const resumed = f.peer('resumed')
    f.service.connect(resumed)
    const join = f.service.handle(resumed, 'room:resume', f.created.session)
    assert.equal(join.ok, true)
    assert.deepEqual(join.snapshot.draft, purchased)
    assert.deepEqual(f.draft(resumed, { type: 'complete' }), { ok: true })
    assert.deepEqual(f.draft(f.guest, { type: 'complete' }), { ok: true })
    const action = f.battleAction(resumed, { type: 'use_side_menu' })
    assert.deepEqual(f.service.handle(resumed, 'match:action', action), { ok: true })
    const used = f.read(resumed).match
    f.service.disconnect(resumed)
    const again = f.peer('again')
    f.service.connect(again)
    const second = f.service.handle(again, 'room:resume', f.created.session)
    assert.equal(second.ok, true)
    assert.deepEqual(second.snapshot.match, used)
    assert.deepEqual(f.service.handle(again, 'match:action', action), { ok: true })
    assert.deepEqual(f.read(again).match, used)
    assert.deepEqual(f.use(again), { ok: false, error: 'side_menu_spent' })
  })

  test('追加注文で未購入者の新規購入も買い替えも禁止し、設置中の効果を対戦へ維持する', () => {
    const f = fixture()
    f.buy(f.host, 'miso')
    for (const player of [f.host, f.guest]) f.draft(player, { type: 'order', cardId: 'tamago' })
    f.finish()
    assert.deepEqual(f.use(f.host), { ok: true })
    for (const player of [f.host, f.guest]) {
      const card = f.read(player).match.you.hand[0]
      assert.deepEqual(f.battle(player, { type: 'play_card', cardInstanceId: card.instanceId }), { ok: true })
      f.end(player)
    }
    const before = f.read(f.host)
    assert.equal(before.draft.mode, 'reorder')
    assert.equal(before.draft.you.sideMenuEnabled, false)
    for (const player of [f.host, f.guest]) {
      assert.deepEqual(f.buy(player, 'ramen'), { ok: false, error: 'draft_side_menu_disabled' })
      assert.equal(f.read(player).draft.you.budget, 1500)
    }
    f.finish()
    const after = f.read(f.host).match
    assert.deepEqual(after.you.sideMenu, before.match.you.sideMenu)
    assert.equal(after.you.sideMenu.status, 'active')
    assert.equal(after.opponent.sideMenu, null)
    assertPrivate(after)
  })

  test('古い対戦状態と相手切断中のサイド操作は受理しない', () => {
    const f = fixture()
    f.buy(f.host, 'tempura')
    f.finish()
    const stale = f.battleAction(f.host, { type: 'use_side_menu' })
    f.end(f.host)
    assert.deepEqual(f.service.handle(f.host, 'match:action', stale), { ok: false, error: 'stale_revision' })
    f.end(f.guest)
    f.service.disconnect(f.guest)
    const before = f.read(f.host).match
    assert.deepEqual(f.use(f.host), { ok: false, error: 'players_disconnected' })
    assert.deepEqual(f.read(f.host).match, before)
  })
} finally {
  Date.now = realNow
}

console.log(`\nオンラインのサイドメニュー: ${passed}件成功`)
