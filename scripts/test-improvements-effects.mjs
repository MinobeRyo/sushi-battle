import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
const { toField, calcFieldDmg, hasNamahamuAura } = loadTs('src/game/battleRules.ts')
const { canReorderSideMenu } = loadTs('src/data/sideMenus.ts')
const byId = id => { const card = CARDS.find(card => card.id === id); assert.ok(card, id); return card }
const instance = (id, key, extra = {}) => ({ ...byId(id), instanceId: key, ...extra })
const make = (id, playerId = 1) => {
  const state = createMatch({ mode: 'two_player', deck: Array(9).fill(byId('tamago')),
    p2Deck: Array(9).fill(byId('tamago')) }, () => 0.999)
  state.activePlayerId = playerId
  for (const player of Object.values(state.players)) { player.ap = player.maxAP = 10; player.gari = 0 }
  state.players[playerId].hand = [instance(id, 'summoned')]
  return state
}
const play = (state, random = () => 0.999) => {
  const before = structuredClone(state)
  const result = transitionMatch(state, { type: 'play_card', playerId: state.activePlayerId,
    cardInstanceId: state.players[state.activePlayerId].hand[0].instanceId }, random)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before)
  return result
}

test('えび軍艦は手札へ非軍艦の巻物だけをサーチし、元の個体変更と残り順を保つ', () => {
  for (const playerId of [1, 2]) for (const roll of [0, 0.999]) {
    const state = make('ebi_gunkan', playerId)
    const deck = [instance('ikura_gunkan', 'excluded'), instance('kappa_maki', 'first', { cost: 0 }),
      instance('maguro', 'excluded-2'), instance('tekka_maki', 'last')]
    state.players[playerId].deck = deck
    const chosen = roll === 0 ? deck[1] : deck[3]
    let calls = 0
    const result = play(state, () => { calls++; return roll })
    assert.equal(calls, 1)
    assert.deepEqual(result.state.players[playerId].hand, [chosen])
    assert.deepEqual(result.state.players[playerId].deck, deck.filter(card => card !== chosen))
    assert.equal(result.state.players[playerId].field[0].attack, 12)
    assert.ok(!result.state.log.join(' ').includes(chosen.name), '公開ログに引いたカード名を載せない')
  }
})

test('えび軍艦は対象なし/手札満杯では抽選も消費もせず、召喚は成立する', () => {
  for (const full of [false, true]) {
    const state = make('ebi_gunkan')
    state.players[1].deck = [instance(full ? 'kappa_maki' : 'ikura_gunkan', 'deck')]
    if (full) state.players[1].hand.push(...Array.from({ length: 7 }, (_, i) => instance('tamago', `h${i}`)))
    const result = play(state, () => { throw new Error('対象なしでは抽選しない') })
    assert.deepEqual(result.state.players[1].deck, state.players[1].deck)
    assert.equal(result.state.players[1].ap, 7)
  }
})

test('いくら軍艦は1〜2APの非軍艦巻物を1枚生成し、既存カードの順序を変えない', () => {
  const candidates = CARDS.filter(card => card.cost >= 1 && card.cost <= 2
    && card.archetype.includes('makimono') && !card.archetype.includes('gunkan'))
  for (let index = 0; index < candidates.length; index++) {
    const state = make('ikura_gunkan')
    const beforeIds = state.players[1].deck.map(card => card.instanceId)
    let calls = 0
    const result = play(state, () => ++calls === 1 ? index / candidates.length : 0.5)
    assert.equal(calls, 2, '候補と挿入位置を各1回抽選')
    const added = result.state.players[1].deck.filter(card => !beforeIds.includes(card.instanceId))
    assert.equal(added.length, 1)
    assert.deepEqual(added[0], { ...candidates[index], instanceId: `local:p1:${state.nextInstanceId}` })
    assert.deepEqual(result.state.players[1].deck.filter(card => beforeIds.includes(card.instanceId)).map(card => card.instanceId), beforeIds)
    assert.equal(result.state.nextInstanceId, state.nextInstanceId + 1)
    assert.equal(result.state.players[1].hand.length, 0)
  }
})

test('ボタンエビは場の1枚ごとに海の幸成立時だけえびを生成し、再回答では生成しない', () => {
  const state = make('tako')
  state.players[1].field = [toField(byId('ika'), 'ika'), toField(byId('botan_ebi'), 'botan-1'), toField(byId('botan_ebi'), 'botan-2')]
  state.players[2].field = [{ ...toField(byId('iwashi_shoga'), 'defense'), defenseState: 'ready' }]
  let calls = 0
  const result = play(state, () => { calls++; return 0.5 })
  assert.equal(calls, 2)
  assert.equal(result.state.phase, 'defending')
  assert.equal(result.state.players[1].deck.filter(card => card.id === 'ebi').length, 2)
  const resolved = transitionMatch(result.state, { type: 'respond_defense', playerId: 2, useGari: false, useDefense: false }, () => { throw new Error('防御回答で再生成しない') })
  assert.equal(resolved.error, undefined)
  assert.deepEqual(resolved.state.players[1].deck, result.state.players[1].deck)
  const withoutCombo = make('botan_ebi')
  assert.deepEqual(play(withoutCombo).state.players[1].deck, withoutCombo.players[1].deck)
})

test('たまごは召喚時だけお腹5を回復し、0を下回らず攻撃4を保つ', () => {
  for (const belly of [0, 3, 40]) {
    const state = make('tamago'); state.players[1].belly = belly
    const next = play(state).state
    assert.equal(next.players[1].belly, Math.max(0, belly - 5))
    assert.equal(calcFieldDmg(next.players[1].field, {}), 4)
  }
})

test('シーフード・ボタンエビは海鮮、たこわさは海鮮/巻物/軍艦として扱う', () => {
  for (const id of ['seafood_gunkan', 'botan_ebi']) assert.ok(byId(id).archetype.includes('kaisen'))
  for (const tag of ['kaisen', 'makimono', 'gunkan']) assert.ok(byId('takowasa').archetype.includes(tag))
})

test('合鴨は生ハムのみに常時+2、複数枚で重複せず、退場とともに解除する', () => {
  const duck = toField(byId('aigamo'), 'duck')
  const ham = toField(NAMAHAM_CARD, 'ham')
  assert.deepEqual([duck.cost, duck.price, duck.attack, duck.turnsLeft], [3, 250, 2, 4])
  assert.equal(calcFieldDmg([duck, ham], {}), 5)
  assert.equal(calcFieldDmg([duck, { ...duck, fid: 'duck-2' }, ham], {}), 7)
  assert.equal(calcFieldDmg([ham], {}), 1)
  assert.equal(calcFieldDmg([duck, ham], { 生ハム: 4 }), 9, 'インバウン丼/肉祭りと加算')
  assert.equal(calcFieldDmg([ham], { 生ハム: 4 }, 0, 0, { namahamuBoost: hasNamahamuAura([duck, ham]) }), 7)
  const state = make('gyutan')
  state.players[1].field = [duck]
  const next = play(state).state
  assert.equal(calcFieldDmg(next.players[1].field, {}), 10, '後から生成された生ハムにも適用')
  const opposing = make('salmon', 2)
  opposing.players[1].field = [duck, ham]
  const destroyed = transitionMatch(opposing, { type: 'play_card', playerId: 2, cardInstanceId: 'summoned', targetFieldId: 'duck' }, () => 0.999)
  assert.equal(destroyed.error, undefined)
  assert.equal(calcFieldDmg(destroyed.state.players[1].field, {}), 1)
})

test('合鴨は自分の4回の終了攻撃まで有効で、寿命終了後に強化が消える', () => {
  let state = make('aigamo')
  state = play(state).state
  state.players[1].field.push({ ...toField(NAMAHAM_CARD, 'long-lived-ham'), turnsLeft: 6 })
  for (let count = 0; count < 4; count++) {
    const own = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.999)
    assert.equal(own.error, undefined)
    assert.equal(own.events.find(event => event.type === 'damage').amount, 5)
    state = transitionMatch(own.state, { type: 'end_turn', playerId: 2 }, () => 0.999).state
  }
  assert.equal(hasNamahamuAura(state.players[1].field), false)
  assert.equal(calcFieldDmg(state.players[1].field, {}), 1)
})

test('サイドは初回未購入でも後半購入でき、使用済instantは通算2回まで買い直せる', () => {
  for (const previous of [null, { id: 'karaage', status: 'used', turnsLeft: null, usedThisTurn: true }]) {
    const state = make('tamago')
    state.phase = 'reorder'; state.reorderPlayerId = 1; state.players[1].sideMenu = previous
    const result = transitionMatch(state, { type: 'complete_reorder', playerId: 1, cards: [byId('tamago')], sideMenu: 'chawanmushi' }, () => 0.999)
    assert.equal(result.error, undefined)
    assert.deepEqual(result.state.players[1].sideMenu, { id: 'chawanmushi', status: 'ready', turnsLeft: null,
      usedThisTurn: false, purchaseCount: previous ? 2 : 1 })
  }
  for (const side of [
    { id: 'chawanmushi', status: 'used', purchaseCount: 2 },
    { id: 'chawanmushi', status: 'ready', purchaseCount: 1 },
    { id: 'ramen', status: 'expired', purchaseCount: 1 },
  ]) {
    assert.equal(canReorderSideMenu(side), false)
    const state = make('tamago'); state.phase = 'reorder'; state.reorderPlayerId = 1
    state.players[1].sideMenu = { ...side, turnsLeft: null, usedThisTurn: false }
    const before = structuredClone(state)
    const result = transitionMatch(state, { type: 'complete_reorder', playerId: 1, cards: [], sideMenu: 'karaage' }, () => { throw Error('拒否時は抽選しない') })
    assert.equal(result.error, 'side_menu_unavailable')
    assert.deepEqual(state, before)
  }
})

test('CPUは新しいランダムサーチ・生成の直前で計画を区切る', () => {
  for (const id of ['ebi_gunkan', 'ikura_gunkan']) {
    const state = make(id, 2); state.mode = 'cpu'; state.cpuDeckId = 'weak'
    state.players[2].hand.push(instance('tamago', 'extra'))
    const original = Math.random
    try {
      Math.random = () => { throw Error('先読みに非公開乱数を使わない') }
      assert.equal(getCpuActions(state).length, 1)
    } finally { Math.random = original }
  }
})
