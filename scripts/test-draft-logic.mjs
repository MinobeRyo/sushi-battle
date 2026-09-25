#!/usr/bin/env node
// ドラフト購入・終了境界の回帰テスト: node scripts/test-draft-logic.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const {
  createDraftState, purchaseBeltCard, orderShinkansen, pickupShinkansen,
  completeDraft, draftSecondsLeft, shinkansenPrice,
} = loadTs('src/features/draft/draftEngine.ts')
const tamago = CARDS.find(card => card.id === 'tamago')
const expensive = CARDS.find(card => card.name === '大トロ')
const startedAt = 100_000
const fresh = (budget = 3000, seconds = 90) => createDraftState(budget, seconds, startedAt)

test('購入0枚で完了しても勝手にカードを追加しない（代替デッキは初回対戦開始時に決める）', () => {
  const initial = completeDraft(fresh())
  const reorder = completeDraft(fresh(1500, 45))
  assert.equal(initial.accepted, true)
  assert.deepEqual(initial.state.deck, [])
  assert.deepEqual(reorder.state.deck, [])
})

test('同じ皿を連続購入しても1枚分だけ確定する', () => {
  const first = purchaseBeltCard(fresh(), 'plate:1', tamago, startedAt)
  const second = purchaseBeltCard(first.state, 'plate:1', tamago, startedAt)
  assert.equal(first.accepted, true)
  assert.equal(second.reason, 'duplicate')
  assert.equal(second.state.deck.length, 1)
  assert.equal(second.state.budget, 3000 - tamago.price)
})

test('同じカードでも別の皿ならそれぞれ購入できる', () => {
  const first = purchaseBeltCard(fresh(), 'plate:1', tamago, startedAt)
  const second = purchaseBeltCard(first.state, 'plate:2', tamago, startedAt)
  assert.equal(second.accepted, true)
  assert.equal(second.state.deck.length, 2)
  assert.equal(second.state.budget, 3000 - tamago.price * 2)
})

test('残高ちょうどで購入でき、直後の別皿購入で残高を負にしない', () => {
  const first = purchaseBeltCard(fresh(tamago.price), 'plate:1', tamago, startedAt)
  const second = purchaseBeltCard(first.state, 'plate:2', tamago, startedAt)
  assert.equal(first.accepted, true)
  assert.equal(second.reason, 'budget')
  assert.equal(second.state.budget, 0)
  assert.equal(second.state.deck.length, 1)
})

test('特急は50円単位に切り上げた価格で支払い時点に確定する', () => {
  assert.equal(shinkansenPrice(expensive), Math.ceil(expensive.price * 1.5 / 50) * 50)
  const ordered = orderShinkansen(fresh(), 'order:1', expensive, startedAt)
  assert.equal(ordered.accepted, true)
  assert.equal(ordered.state.budget, 3000 - shinkansenPrice(expensive))
  assert.deepEqual(ordered.state.deck, [expensive])
  assert.equal(ordered.state.shinkansenLeft, 2)
  assert.equal(ordered.state.shinkansenPlate.card.id, expensive.id)
})

test('特急を受領前に終了しても購入済みカードが残る', () => {
  const ordered = orderShinkansen(fresh(), 'order:1', expensive, startedAt)
  const finished = completeDraft(ordered.state)
  assert.deepEqual(finished.state.deck, [expensive])
  assert.equal(finished.state.budget, 3000 - shinkansenPrice(expensive))
})

test('特急受領はカードを追加せず、同じ受領を繰り返しても増えない', () => {
  const ordered = orderShinkansen(fresh(), 'order:1', tamago, startedAt)
  const picked = pickupShinkansen(ordered.state)
  const repeated = pickupShinkansen(picked.state)
  assert.equal(picked.accepted, true)
  assert.equal(picked.state.shinkansenPlate, null)
  assert.equal(repeated.reason, 'no_delivery')
  assert.deepEqual(repeated.state.deck, [tamago])
})

test('特急配送中は次の注文を受け付けず二重決済しない', () => {
  const ordered = orderShinkansen(fresh(), 'order:1', tamago, startedAt)
  const repeated = orderShinkansen(ordered.state, 'order:2', expensive, startedAt)
  assert.equal(repeated.reason, 'delivery_pending')
  assert.equal(repeated.state, ordered.state)
})

test('受領後に同じ注文IDが再送されても再購入しない', () => {
  const ordered = orderShinkansen(fresh(), 'order:1', tamago, startedAt)
  const picked = pickupShinkansen(ordered.state)
  const repeated = orderShinkansen(picked.state, 'order:1', tamago, startedAt)
  assert.equal(repeated.reason, 'duplicate')
  assert.equal(repeated.state.shinkansenLeft, 2)
})

test('特急は3回まで。4回目でカード・残高・回数を変更しない', () => {
  let state = fresh()
  for (let i = 0; i < 3; i++) {
    const ordered = orderShinkansen(state, `order:${i}`, tamago, startedAt)
    assert.equal(ordered.accepted, true)
    state = pickupShinkansen(ordered.state).state
  }
  const fourth = orderShinkansen(state, 'order:4', tamago, startedAt)
  assert.equal(fourth.reason, 'orders_used')
  assert.equal(fourth.state, state)
  assert.equal(state.shinkansenLeft, 0)
})

test('19枚から未受領の特急で20枚になった時点で、通常皿も特急も追加不可', () => {
  let state = fresh(10_000)
  for (let i = 0; i < 19; i++) state = purchaseBeltCard(state, `plate:${i}`, tamago, startedAt).state
  const ordered = orderShinkansen(state, 'order:1', expensive, startedAt)
  assert.equal(ordered.accepted, true)
  assert.equal(ordered.state.deck.length, 20)
  assert.equal(purchaseBeltCard(ordered.state, 'plate:20', tamago, startedAt).reason, 'full')
  const picked = pickupShinkansen(ordered.state)
  assert.equal(picked.state.deck.length, 20)
  assert.equal(orderShinkansen(picked.state, 'order:2', tamago, startedAt).reason, 'full')
  assert.equal(completeDraft(picked.state).state.deck.length, 20)
})

test('20枚の通常購入後は次の通常購入を拒否する', () => {
  let state = fresh(10_000)
  for (let i = 0; i < 20; i++) state = purchaseBeltCard(state, `plate:${i}`, tamago, startedAt).state
  const extra = purchaseBeltCard(state, 'plate:21', tamago, startedAt)
  assert.equal(extra.reason, 'full')
  assert.equal(extra.state, state)
})

test('残高不足の特急は回数も配送状態も消費しない', () => {
  const state = fresh(shinkansenPrice(expensive) - 1)
  const result = orderShinkansen(state, 'order:1', expensive, startedAt)
  assert.equal(result.reason, 'budget')
  assert.equal(result.state, state)
  assert.equal(result.state.shinkansenLeft, 3)
  assert.equal(result.state.shinkansenPlate, null)
})

test('期限1ms前の購入は保持し、期限ちょうど以降の購入は拒否する', () => {
  const state = fresh()
  const purchased = purchaseBeltCard(state, 'plate:1', tamago, state.deadlineAt - 1)
  assert.equal(purchased.accepted, true)
  assert.equal(purchaseBeltCard(purchased.state, 'plate:2', tamago, state.deadlineAt).reason, 'expired')
  assert.equal(orderShinkansen(purchased.state, 'order:1', tamago, state.deadlineAt).reason, 'expired')
  assert.deepEqual(completeDraft(purchased.state).state.deck, [tamago])
})

test('画面が止まっても、残り時間は経過した実時間から求める', () => {
  const state = fresh()
  assert.equal(draftSecondsLeft(state, startedAt), 90)
  assert.equal(draftSecondsLeft(state, startedAt + 45_500), 45)
  assert.equal(draftSecondsLeft(state, state.deadlineAt - 1), 1)
  assert.equal(draftSecondsLeft(state, state.deadlineAt), 0)
  assert.equal(draftSecondsLeft(state, state.deadlineAt + 60_000), 0)
})

test('手動終了と時間切れ終了が重なっても、完了として受理するのは一度だけ', () => {
  const first = completeDraft(fresh())
  const second = completeDraft(first.state)
  assert.equal(first.accepted, true)
  assert.equal(second.accepted, false)
  assert.equal(second.state, first.state)
})

test('終了後は購入・特急注文・受領で状態を変えない', () => {
  const ordered = orderShinkansen(fresh(), 'order:1', tamago, startedAt)
  const state = completeDraft(ordered.state).state
  for (const result of [
    purchaseBeltCard(state, 'plate:1', tamago, startedAt),
    orderShinkansen(state, 'order:2', expensive, startedAt),
    pickupShinkansen(state),
  ]) {
    assert.equal(result.reason, 'completed')
    assert.equal(result.state, state)
  }
})

test('購入処理は入力状態を書き換えない', () => {
  const state = fresh()
  Object.freeze(state.deck)
  Object.freeze(state.purchasedIds)
  Object.freeze(state)
  assert.equal(purchaseBeltCard(state, 'plate:1', tamago, startedAt).accepted, true)
  assert.equal(orderShinkansen(state, 'order:1', tamago, startedAt).accepted, true)
  assert.deepEqual(state.deck, [])
  assert.equal(state.budget, 3000)
})
