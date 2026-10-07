#!/usr/bin/env node
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { createDraftState, orderOmakase, completeDraft, orderShinkansen, pickupShinkansen, purchaseSideMenu, purchaseBeltCard } = loadTs('src/features/draft/draftEngine.ts')
const { createUnluckyCard, createRareCorn, canMakeUnlucky } = loadTs('src/data/cardVariants.ts')
const { canReorderSideMenu } = loadTs('src/data/sideMenus.ts')
const { createOnlineDraft, applyDraftAction, publicDraft } = loadTs('server/onlineDraft.ts')
const now = 1000
const fresh = () => createDraftState(3000, 90, now)
const sequence = (...values) => () => values.shift() ?? 0.5

test('通常セットは750円分の3皿を500円で購入し、元のカード定義を変えない', () => {
  const source = structuredClone(CARDS)
  for (const roll of [0, 0.25, 0.5, 0.99]) {
    const state = fresh()
    const result = orderOmakase(state, now, sequence(roll, 0.9))
    assert.equal(result.accepted, true)
    assert.equal(result.state.budget, 2500)
    assert.equal(result.state.deck.length, 3)
    assert.equal(result.state.deck.reduce((sum, card) => sum + card.price, 0), 750)
    assert.ok(result.state.deck.every(card => !card.variant))
    assert.deepEqual(result.state.omakaseCards, result.state.deck)
    assert.deepEqual(state.deck, [])
    assert.equal(result.state.shinkansenLeft, 2)
  }
  assert.deepEqual(CARDS, source)
})

test('訳ありは1枚だけ攻撃を半分にし、効果・タグ・コンボ用IDを引き継ぐ', () => {
  for (const id of ['ikura_gunkan', 'salmon']) {
    const card = CARDS.find(card => card.id === id)
    const variant = createUnluckyCard(card)
    assert.equal(variant.id, card.id)
    assert.equal(variant.attack, Math.floor(card.attack / 2))
    assert.equal(variant.effect, card.effect)
    assert.deepEqual(variant.archetype, card.archetype)
    assert.equal(variant.variant, id === 'ikura_gunkan' ? 'sideways' : 'neta_missing')
  }
  const result = orderOmakase(fresh(), now, sequence(0.4, 0.1, 0.5))
  assert.equal(result.state.deck.filter(card => card.variant).length, 1)
  assert.equal(result.state.deck.reduce((sum, card) => sum + card.price, 0), 750)
  assert.equal(canMakeUnlucky(CARDS.find(card => card.id === 'inari')), false)
  assert.equal(canMakeUnlucky(CARDS.find(card => card.id === 'tekka_maki')), false)
})

test('レアは2AP・攻撃12の横向きマヨコーン、セットの1枚だけが置き換わる', () => {
  const state = orderOmakase(fresh(), now, sequence(0.4, 0.02, 0.5)).state
  assert.equal(state.deck.filter(card => card.variant).length, 1)
  const corn = state.deck.find(card => card.variant === 'rare_corn')
  assert.equal(corn.name, '真横を向いたマヨコーン')
  assert.equal(corn.cost, 2)
  assert.equal(corn.attack, 12)
  assert.deepEqual(corn.archetype, ['makimono', 'gunkan'])
  assert.equal(state.deck.reduce((sum, card) => sum + card.price, 0), 750)
  assert.equal(createRareCorn(200).price, 200)
})

test('20%の訳あり・3%のレアを排他的に抽選する', () => {
  for (const [roll, expected] of [[0.029, 'rare_corn'], [0.03, 'unlucky'], [0.229, 'unlucky'], [0.23, undefined]]) {
    const state = orderOmakase(fresh(), now, sequence(0.4, roll, 0.5)).state
    const variant = state.deck.find(card => card.variant)?.variant
    if (expected === 'unlucky') assert.ok(['sideways', 'neta_missing'].includes(variant))
    else assert.equal(variant, expected)
  }
})

test('二重購入・残高不足・枠不足・期限切れ・終了後は乱数を使わず状態を保つ', () => {
  const used = orderOmakase(fresh(), now, () => 0.5).state
  const cases = [
    [used, now, 'omakase_used'],
    [{ ...fresh(), shinkansenLeft: 0 }, now, 'orders_used'],
    [{ ...fresh(), budget: 499 }, now, 'budget'],
    [{ ...fresh(), deck: Array(18).fill(CARDS[0]) }, now, 'full'],
    [fresh(), now + 90_000, 'expired'],
    [completeDraft(fresh()).state, now, 'completed'],
  ]
  for (const [state, time, reason] of cases) {
    const result = orderOmakase(state, time, () => { throw new Error('拒否時に抽選しない') })
    assert.equal(result.accepted, false)
    assert.equal(result.reason, reason)
    assert.equal(result.state, state)
  }
  const exact = orderOmakase({ ...fresh(), budget: 500, deck: Array(17).fill(CARDS[0]) }, now, () => 0.5)
  assert.equal(exact.state.budget, 0)
  assert.equal(exact.state.deck.length, 20)
  assert.equal(orderOmakase(createDraftState(1500, 45, now), now, () => 0.5).accepted, true)
})

test('オンラインでもサーバー抽選結果だけを購入し、古いrevision・再注文で再抽選しない', () => {
  const draft = createOnlineDraft('initial', now, () => 0.5)
  const action = { type: 'omakase', draftId: draft.id, actionId: 'omakase-1', expectedRevision: 0 }
  assert.deepEqual(applyDraftAction(draft, 1, action, now, sequence(0.4, 0.02, 0.5)), { ok: true })
  const state = publicDraft(draft, 1)
  assert.equal(state.you.budget, 2500)
  assert.equal(state.you.omakaseCards.length, 3)
  assert.ok(state.you.deck.some(card => card.variant === 'rare_corn'))
  assert.equal('purchasedIds' in state.you, false)
  const noRandom = () => { throw new Error('重複で抽選しない') }
  assert.deepEqual(applyDraftAction(draft, 1, action, now, noRandom), { ok: false, error: 'stale_revision' })
  assert.deepEqual(applyDraftAction(draft, 1, { ...action, expectedRevision: 1 }, now, noRandom), { ok: false, error: 'draft_omakase_used' })
  assert.deepEqual(publicDraft(draft, 1), state)
  assert.equal(publicDraft(draft, 2).you.omakaseCards, null)
})

test('後半サイドは未購入または使用済み使い切りで購入数2回未満の時だけ許可する', () => {
  const side = (id, status, purchaseCount = 1) => ({ id, status, purchaseCount, turnsLeft: null, usedThisTurn: false })
  assert.equal(canReorderSideMenu(null), true)
  for (const id of ['karaage', 'chawanmushi']) {
    assert.equal(canReorderSideMenu(side(id, 'used')), true)
    assert.equal(canReorderSideMenu(side(id, 'ready')), false)
    assert.equal(canReorderSideMenu(side(id, 'used', 2)), false)
  }
  for (const id of ['miso', 'ramen', 'fries']) {
    for (const status of ['ready', 'active', 'used', 'expired']) assert.equal(canReorderSideMenu(side(id, status)), false)
  }
  const draft = createOnlineDraft('reorder', now, () => 0.5, { 1: true, 2: false })
  assert.equal(publicDraft(draft, 1).you.sideMenuEnabled, true)
  assert.equal(publicDraft(draft, 2).you.sideMenuEnabled, false)
})

test('特急・大将3皿・サイドが各1回を共有し、普通のレーン寿司は回数を使わない', () => {
  let state = orderShinkansen(fresh(), 'express-1', CARDS[0], now).state
  assert.equal(state.shinkansenLeft, 2)
  state = orderOmakase(state, now, () => 0.5).state
  assert.equal(state.shinkansenLeft, 1)
  assert.equal(state.deck.length, 4)
  state = purchaseSideMenu(state, 'ramen', now).state
  assert.equal(state.shinkansenLeft, 0)
  state = pickupShinkansen(state).state
  const before = state
  assert.equal(orderShinkansen(state, 'express-2', CARDS[0], now).reason, 'orders_used')
  assert.equal(orderOmakase(state, now, () => { throw Error('再抽選不可') }).state, before)
  assert.equal(purchaseSideMenu(state, 'miso', now).state, before)
  const belt = purchaseBeltCard(state, 'regular-1', CARDS[0], now)
  assert.equal(belt.accepted, true)
  assert.equal(belt.state.shinkansenLeft, 0)
  assert.equal(belt.state.deck.length, 5)
})

test('オンライン共通枠は大将・レーンのサイド・特急で尽き、拒否時には変化しない', () => {
  const draft = createOnlineDraft('initial', now, () => 0.5)
  const send = command => applyDraftAction(draft, 1, { ...command, draftId: draft.id,
    expectedRevision: draft.players[1].revision, actionId: `shared-${draft.players[1].revision}` }, now, () => 0.5)
  assert.deepEqual(send({ type: 'omakase' }), { ok: true })
  const sideOffer = draft.players[1].offers.find(offer => offer.sideMenuId)
  assert.deepEqual(send({ type: 'buy', offerId: sideOffer.id }), { ok: true })
  assert.deepEqual(send({ type: 'order', cardId: 'tamago' }), { ok: true })
  assert.equal(draft.players[1].state.shinkansenLeft, 0)
  assert.deepEqual(send({ type: 'pickup' }), { ok: true })
  const before = structuredClone(publicDraft(draft, 1))
  assert.deepEqual(send({ type: 'order', cardId: 'tamago' }), { ok: false, error: 'draft_orders_used' })
  assert.deepEqual(publicDraft(draft, 1), before)
  const ordinary = draft.players[1].offers.find(offer => offer.card)
  assert.deepEqual(send({ type: 'buy', offerId: ordinary.id }), { ok: true })
  assert.equal(draft.players[1].state.shinkansenLeft, 0)
  const exhausted = createOnlineDraft('initial', now, () => 0.5)
  exhausted.players[1].state.shinkansenLeft = 0
  for (const command of [{ type: 'omakase' }, { type: 'buy_side_menu', sideMenuId: 'ramen' },
    { type: 'buy', offerId: exhausted.players[1].offers.find(offer => offer.sideMenuId).id }]) {
    const before = structuredClone(publicDraft(exhausted, 1))
    assert.deepEqual(applyDraftAction(exhausted, 1, { ...command, draftId: exhausted.id, expectedRevision: 0,
      actionId: 'exhausted' }, now, () => { throw Error('回数終了後に抽選しない') }), { ok: false, error: 'draft_orders_used' })
    assert.deepEqual(publicDraft(exhausted, 1), before)
  }
})
