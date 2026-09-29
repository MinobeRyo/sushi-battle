#!/usr/bin/env node
// 追加注文で手札を補充しても、サイドの状態と対戦中の使用権限を失わない。
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'
import { SIDE_MENUS } from '../src/data/sideMenus.ts'
import { toOnlineBattleView } from '../src/features/online/onlineBattleView.ts'

function fixture(t) {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.5 })
  t.after(() => service.close())
  const peer = id => ({ id: `side-reorder-${id}`, data: {}, state() {}, closed() {} })
  const peers = { 1: peer(1), 2: peer(2) }
  Object.values(peers).forEach(player => service.connect(player))
  const created = service.handle(peers[1], 'room:create')
  assert.equal(created.ok, true)
  assert.equal(service.handle(peers[2], 'room:join', { code: created.session.code }).ok, true)
  let sequence = 0
  const read = id => structuredClone(service.snapshot(peers[id]))
  const draft = (id, command) => {
    const state = read(id).draft
    return service.handle(peers[id], 'draft:action', {
      draftId: state.draftId, expectedRevision: state.revision,
      actionId: `reorder-draft-${++sequence}`, ...command,
    })
  }
  const battle = (id, command) => {
    const match = read(id).match
    return service.handle(peers[id], 'match:action', {
      matchId: match.matchId, expectedRevision: match.revision,
      actionId: `reorder-battle-${++sequence}`, ...command,
    })
  }
  const ok = response => assert.deepEqual(response, { ok: true })
  const finish = () => {
    ok(draft(1, { type: 'complete' }))
    ok(draft(2, { type: 'complete' }))
  }
  const end = id => {
    ok(battle(id, { type: 'end_turn' }))
    const pending = read(id).match.pendingAttack
    if (pending) ok(battle(pending.defenderId, { type: 'respond_defense', useGari: false }))
  }
  const play = id => {
    const tamago = read(id).match.you.hand.find(card => card.id === 'tamago')
    assert.ok(tamago)
    ok(battle(id, { type: 'play_card', cardInstanceId: tamago.instanceId }))
  }
  return { read, draft, battle, ok, finish, end, play }
}

for (const menu of SIDE_MENUS) for (const ownerId of [1, 2]) for (const usedBefore of [false, true]) {
  test(`P${ownerId} ${menu.name} ${usedBefore ? '初回使用済み' : '未使用'}を追加注文後も保持する`, t => {
    const f = fixture(t)
    f.ok(f.draft(ownerId, { type: 'buy_side_menu', sideMenuId: menu.id }))
    for (const id of [1, 2]) f.ok(f.draft(id, { type: 'order', cardId: 'tamago' }))
    f.finish()
    // 両者の手札を尽くして、実際のターン進行から追加注文に入る。
    for (const id of [1, 2]) {
      f.play(id)
      if (id === ownerId && usedBefore) f.ok(f.battle(id, { type: 'use_side_menu' }))
      f.end(id)
    }
    const before = f.read(ownerId)
    assert.equal(before.match.phase, 'reorder')
    assert.equal(before.draft.mode, 'reorder')
    assert.equal(before.draft.you.sideMenuEnabled, false)
    assert.equal(before.match.you.sideMenu.id, menu.id)
    // 追加注文は寿司だけを補充し、サイドを初期化しない。
    for (const id of [1, 2]) f.ok(f.draft(id, { type: 'order', cardId: 'tamago' }))
    f.finish()
    const after = f.read(ownerId)
    assert.equal(after.draft, null)
    assert.equal(after.match.matchId, before.match.matchId)
    assert.equal(after.match.phase, 'playing')
    assert.deepEqual(after.match.you.sideMenu, before.match.you.sideMenu)
    assert.deepEqual(f.read(ownerId === 1 ? 2 : 1).match.opponent.sideMenu, after.match.you.sideMenu)
    if (ownerId === 2) f.end(1)
    f.play(ownerId) // ラーメンを試せるよう、正規の召喚でAPを消費する。
    const current = f.read(ownerId)
    assert.equal(current.connected[1] && current.connected[2], true)
    assert.equal(current.match.activePlayerId, ownerId)
    assert.equal(current.match.phase, 'playing')
    assert.deepEqual(toOnlineBattleView(current.match, 'player').pSideMenu, current.match.you.sideMenu)
    const response = f.battle(ownerId, { type: 'use_side_menu' })
    const expected = !usedBefore || menu.id === 'ramen' ? { ok: true }
      : ['karaage', 'chawanmushi'].includes(menu.id) ? { ok: false, error: 'side_menu_spent' }
        : { ok: false, error: 'side_menu_already_active' }
    assert.deepEqual(response, expected)
    const final = f.read(ownerId).match
    if (!response.ok) assert.deepEqual(final, current.match, '使用済み・設置済みを再操作しても状態を変えない')
    if (menu.id === 'ramen' && response.ok) {
      assert.equal(final.you.ap, current.match.you.ap + 1)
      assert.equal(final.you.belly, current.match.you.belly + 5)
      assert.equal(final.you.sideMenu.turnsLeft, usedBefore ? 2 : 3)
    }
    assert.equal('deck' in final.you, false)
    assert.equal('hand' in final.opponent, false)
    assert.equal('deck' in final.opponent, false)
  })
}
