#!/usr/bin/env node
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { summarizeDeck } = loadTs('src/game/deckSummary.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const { toBattleView } = loadTs('src/features/battle/battleView.ts')
const { toOnlineBattleView } = loadTs('src/features/online/onlineBattleView.ts')
const { createRoomService } = loadTs('server/roomService.ts')
const card = id => {
  const found = CARDS.find(value => value.id === id)
  assert.ok(found, `カードが見つかりません: ${id}`)
  return structuredClone(found)
}
const instance = (id, suffix = id) => ({ ...card(id), instanceId: `private:${suffix}` })
const copies = (id, count) => Array.from({ length: count }, () => card(id))
const keepOrder = () => 0.999
const make = () => createMatch({
  deck: copies('tamago', 8), p2Deck: copies('maguro', 7), mode: 'two_player', matchId: 'deck-summary',
}, keepOrder)
const view = (state, playerId = 1, phase = 'player') => toBattleView(state, playerId, phase, null)
const counts = summary => Object.fromEntries(summary.map(entry => [entry.card.id, entry.count]))
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(freeze)
  }
  return value
}
const step = (state, action, random = keepOrder) => {
  const result = transitionMatch(state, action, random)
  assert.equal(result.error, undefined)
  return result.state
}

test('同名を集計し、AP→カードID順で山札の並びに依存しない', () => {
  const deck = [
    { ...instance('tamago', 'z'), id: 'z', cost: 2 },
    { ...instance('maguro', 'a1'), id: 'a', cost: 2 },
    { ...instance('maguro', 'a2'), id: 'a', cost: 2 },
    { ...instance('ika', 'b'), id: 'b', cost: 1 },
    { ...instance('tako', 'prototype'), id: '__proto__', cost: 3 },
  ]
  const before = structuredClone(deck)
  const summary = summarizeDeck(freeze(deck))
  assert.deepEqual(summary.map(entry => [entry.card.id, entry.count]), [['b', 1], ['a', 2], ['z', 1], ['__proto__', 1]])
  assert.deepEqual(summarizeDeck([...deck].reverse()), summary)
  assert.deepEqual(deck, before, '集計で山札・カードを変更しない')
  assert.equal(summary.reduce((sum, entry) => sum + entry.count, 0), deck.length)
})

test('公開カードのフィールドだけをコピーし、個体ID・未知の情報・入力参照を残さない', () => {
  const source = instance('futomaki')
  source.privateFutureEffect = { nextDraw: 'secret' }
  source.archetype.privatePosition = 2
  source.subBases.privatePosition = 3
  const before = structuredClone(source)
  const [{ card: publicCard }] = summarizeDeck(freeze([source]))
  assert.deepEqual(Object.keys(publicCard).sort(), Object.keys(card('futomaki')).sort())
  assert.deepEqual(publicCard, card('futomaki'))
  assert.equal('instanceId' in publicCard, false)
  assert.equal('privateFutureEffect' in publicCard, false)
  assert.equal('privatePosition' in publicCard.archetype, false)
  assert.equal('privatePosition' in publicCard.subBases, false)
  publicCard.name = '表示側で変更'
  publicCard.archetype.push('general')
  publicCard.subBases.push('表示側で追加')
  assert.deepEqual(source, before, '表示データへの変更が元の山札に伝わらない')
})

test('同名でも割引と訳ありは実際の値を保って区別し、順序を公開しない', () => {
  const ordinary = instance('ikura_gunkan', 'normal')
  const cheap = { ...ordinary, instanceId: 'private:cheap', cost: 1 }
  const sideways = { ...ordinary, instanceId: 'private:sideways', variant: 'sideways', name: '真横を向いたいくら軍艦', attack: 5 }
  const summary = summarizeDeck([ordinary, cheap, sideways, { ...cheap, instanceId: 'private:cheap2' }])
  assert.equal(summary.length, 3)
  assert.equal(summary[0].card.cost, 1)
  assert.equal(summary[0].count, 2)
  assert.equal(summary.find(entry => entry.card.variant === 'sideways').card.attack, 5)
  assert.deepEqual(summarizeDeck([sideways, cheap, ordinary, cheap]), summary)
})

test('空の山札は空配列、ローカル表示は本人の残り山札だけを返す', () => {
  assert.deepEqual(summarizeDeck([]), [])
  const state = make()
  assert.deepEqual(counts(view(state, 1).pDeckSummary), { tamago: 3 })
  assert.deepEqual(counts(view(state, 2).pDeckSummary), { maguro: 2 })
  assert.equal('cDeckSummary' in view(state, 1), false)
  for (const playerId of [1, 2]) {
    assert.deepEqual(view(state, playerId, 'pass').pDeckSummary, [], '端末を渡す間は内訳を隠す')
    assert.deepEqual(view(state, playerId, 'pass').pHand, [])
  }
  state.players[1].deck = []
  assert.deepEqual(view(state).pDeckSummary, [])
  assert.equal(view(state).pDeckCount, 0)
})

test('通常ドロー後に残数が減り、過去の内訳と相手の内訳は変わらない', () => {
  const state = make()
  const before = view(state).pDeckSummary
  const next = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(next.players[1].hand.length, 6)
  assert.deepEqual(counts(view(next).pDeckSummary), { tamago: 2 })
  assert.deepEqual(counts(before), { tamago: 3 })
  assert.deepEqual(counts(view(next, 2).pDeckSummary), { maguro: 2 })
})

test('カード効果のドローで最後の1枚を引くと内訳も空になる', () => {
  const state = make()
  const drawer = CARDS.find(value => value.effect === 'draw_1')
  assert.ok(drawer)
  state.players[1].hand = [{ ...drawer, instanceId: 'draw-effect' }]
  state.players[1].deck = [instance('tamago')]
  state.players[1].ap = 10
  const next = step(state, { type: 'play_card', playerId: 1, cardInstanceId: 'draw-effect' })
  assert.equal(next.players[1].hand[0].id, 'tamago')
  assert.equal(view(next).pDeckCount, 0)
  assert.deepEqual(view(next).pDeckSummary, [])
})

test('山札サーチは選ばれた種類だけを減らす', () => {
  const state = make()
  const searcher = CARDS.find(value => value.effect === 'draw_persist_ika_tako_1')
  assert.ok(searcher)
  state.players[1].hand = [{ ...searcher, instanceId: 'search-effect' }]
  state.players[1].deck = [instance('tamago'), instance('tako'), instance('ika', 'ika-1'), instance('ika', 'ika-2')]
  state.players[1].ap = 10
  const before = view(state).pDeckSummary
  const next = step(state, { type: 'play_card', playerId: 1, cardInstanceId: 'search-effect' }, () => 0.5)
  assert.equal(next.players[1].hand[0].id, 'ika')
  assert.deepEqual(counts(view(next).pDeckSummary), { tamago: 1, ika: 1, tako: 1 })
  assert.deepEqual(counts(before), { tamago: 1, ika: 2, tako: 1 })
})

test('ラストオーダー後は初期手札を除いた新しい山札を表示する', () => {
  const state = make()
  for (const player of Object.values(state.players)) {
    player.hand = []
    player.deck = []
  }
  let next = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(next.phase, 'reorder')
  assert.deepEqual(view(next, 2).pDeckSummary, [])
  next = step(next, { type: 'complete_reorder', playerId: 2, cards: [...copies('tamago', 5), ...copies('ika', 2)] })
  assert.deepEqual(counts(view(next, 2).pDeckSummary), { ika: 2 })
  assert.deepEqual(view(next, 1, 'pass').pDeckSummary, [])
  next = step(next, { type: 'complete_reorder', playerId: 1, cards: [...copies('maguro', 5), card('tako')] })
  assert.equal(next.phase, 'playing')
  assert.deepEqual(counts(view(next, 1).pDeckSummary), { tako: 1 })
  assert.deepEqual(counts(view(next, 2).pDeckSummary), { ika: 2 })
})

test('通信サービスは本人だけに内訳を送り、ドロー後と画面投影も更新する', t => {
  const service = createRoomService({ resumeTtlMs: 60_000, random: keepOrder })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, latest: null, state(value) { this.latest = structuredClone(value) }, closed() {} })
  const peers = [peer('summary-p1'), peer('summary-p2')]
  peers.forEach(player => service.connect(player))
  const created = service.handle(peers[0], 'room:create')
  assert.equal(created.ok, true)
  assert.equal(service.handle(peers[1], 'room:join', { code: created.session.code }).ok, true)
  let sequence = 0
  for (const player of peers) {
    const draft = player.latest.draft
    assert.deepEqual(service.handle(player, 'draft:action', {
      draftId: draft.draftId, expectedRevision: draft.revision,
      actionId: `summary-draft-${++sequence}`, type: 'complete',
    }), { ok: true })
  }
  for (const player of peers) {
    const match = player.latest.match
    assert.equal('deck' in match.you, false)
    assert.equal('deck' in match.opponent, false)
    assert.equal('hand' in match.opponent, false)
    assert.equal('deckSummary' in match.opponent, false)
    assert.equal(match.you.deckSummary.reduce((sum, entry) => sum + entry.count, 0), match.you.deckCount)
    for (const entry of match.you.deckSummary) assert.equal('instanceId' in entry.card, false)
    assert.deepEqual(toOnlineBattleView(match, 'player').pDeckSummary, match.you.deckSummary)
  }
  const before = peers[0].latest.match
  const otherBefore = peers[1].latest.match.you.deckSummary
  assert.deepEqual(service.handle(peers[0], 'match:action', {
    matchId: before.matchId, expectedRevision: before.revision, actionId: 'summary-draw', type: 'end_turn',
  }), { ok: true })
  const after = peers[0].latest.match
  const drawn = after.you.hand.at(-1)
  const expected = counts(before.you.deckSummary)
  expected[drawn.id] -= 1
  if (expected[drawn.id] === 0) delete expected[drawn.id]
  assert.deepEqual(counts(after.you.deckSummary), expected)
  assert.equal(after.you.deckCount, before.you.deckCount - 1)
  assert.deepEqual(peers[1].latest.match.you.deckSummary, otherBefore)
  assert.deepEqual(toOnlineBattleView(after, 'waiting').pDeckSummary, after.you.deckSummary)
})
