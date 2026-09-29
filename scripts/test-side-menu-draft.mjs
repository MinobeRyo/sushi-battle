import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { SIDE_MENUS, SIDE_MENU_BY_ID, isSideMenuId } = loadTs('src/data/sideMenus.ts')
const { CARDS } = loadTs('src/data/cards.ts')
const { createDraftState, purchaseSideMenu, purchaseBeltCard, orderShinkansen, completeDraft } = loadTs('src/features/draft/draftEngine.ts')
const now = 10_000
const fresh = () => createDraftState(3000, 90, now)
const card = CARDS.find(item => item.id === 'tamago')
let passed = 0
function test(name, run) {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
function rejected(state, id, reason, at = now) {
  const before = structuredClone(state)
  const result = purchaseSideMenu(state, id, at)
  assert.equal(result.accepted, false)
  assert.equal(result.reason, reason)
  assert.equal(result.state, state)
  assert.deepEqual(state, before)
}

test('全6品は300円で、3Dと共通のIDだけを受け付ける', () => {
  assert.deepEqual(SIDE_MENUS.map(menu => menu.id), ['karaage', 'fries', 'tempura', 'ramen', 'miso', 'chawanmushi'])
  for (const menu of SIDE_MENUS) {
    assert.equal(menu.price, 300)
    assert.equal(SIDE_MENU_BY_ID[menu.id], menu)
    assert.equal(isSideMenuId(menu.id), true)
  }
  for (const id of ['potato', 'aosa', '__proto__', 'constructor', {}, null]) assert.equal(isSideMenuId(id), false)
})

test('購入は残金と専用枠だけを更新し、入力と寿司・特急を変更しない', () => {
  const state = fresh()
  Object.freeze(state)
  const result = purchaseSideMenu(state, 'ramen', now)
  assert.equal(result.accepted, true)
  assert.equal(result.state.sideMenu, 'ramen')
  assert.equal(result.state.budget, 2700)
  assert.equal(state.sideMenu, null)
  assert.equal(state.budget, 3000)
  assert.equal(result.state.deck, state.deck)
  assert.equal(result.state.shinkansenLeft, 3)
  assert.deepEqual(result.state.purchasedIds, [])
})

test('同じ品・別の品への二重購入をともに拒否する', () => {
  const state = purchaseSideMenu(fresh(), 'karaage', now).state
  rejected(state, 'karaage', 'side_menu_owned')
  rejected(state, 'miso', 'side_menu_owned')
})

test('追加注文ではサイドを買えず、初期購入のみ許可する', () => {
  const state = createDraftState(1500, 45, now, false)
  assert.equal(state.sideMenuEnabled, false)
  rejected(state, 'fries', 'side_menu_disabled')
  assert.equal(purchaseSideMenu(fresh(), 'fries', now).accepted, true)
})

test('締切ちょうど・完了済み・残金不足を拒否する', () => {
  rejected(fresh(), 'tempura', 'expired', now + 90_000)
  rejected(completeDraft(fresh()).state, 'miso', 'completed')
  rejected(createDraftState(299, 90, now), 'miso', 'budget')
  assert.equal(purchaseSideMenu(createDraftState(300, 90, now), 'miso', now).state.budget, 0)
})

test('未知のIDを拒否し、価格などを含むオブジェクトも信用しない', () => {
  rejected(fresh(), 'free-menu', 'invalid_side_menu')
  rejected(fresh(), { id: 'fries', price: -1000 }, 'invalid_side_menu')
})

test('寿司20枚・特急残数0・受領待ちでもサイド専用枠を購入できる', () => {
  const state = fresh()
  state.deck = Array(20).fill(card)
  state.shinkansenLeft = 0
  state.shinkansenPlate = { card, orderId: 'pending' }
  const result = purchaseSideMenu(state, 'chawanmushi', now)
  assert.equal(result.accepted, true)
  assert.equal(result.state.deck.length, 20)
  assert.equal(result.state.shinkansenLeft, 0)
  assert.deepEqual(result.state.shinkansenPlate, state.shinkansenPlate)
})

test('寿司・特急・サイドは同じ予算を使い、完了時も購入を保持する', () => {
  let state = purchaseBeltCard(fresh(), 'plate-1', card, now).state
  state = orderShinkansen(state, 'order-1', card, now).state
  const before = state.budget
  state = purchaseSideMenu(state, 'fries', now).state
  assert.equal(state.budget, before - 300)
  assert.equal(state.deck.length, 2)
  assert.equal(state.shinkansenLeft, 2)
  assert.equal(completeDraft(state).state.sideMenu, 'fries')
})

console.log(`サイドメニュー購入: ${passed}件成功`)
