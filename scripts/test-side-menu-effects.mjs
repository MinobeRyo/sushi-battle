import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getSideMenuUseError, getCpuActions } = loadTs('src/game/matchEngine.ts')
const { calcFieldDmg, toField } = loadTs('src/game/battleRules.ts')
const card = id => {
  const found = CARDS.find(item => item.id === id)
  assert.ok(found, id)
  return found
}
const copies = (id, n = 12) => Array.from({ length: n }, () => card(id))
const keepOrder = () => 0.999
const make = (sideMenu, options = {}) => createMatch({
  deck: copies('tamago'), p2Deck: copies('tamago'), mode: 'two_player',
  matchId: 'side-test', sideMenu, p2SideMenu: null, ...options,
}, keepOrder)
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(freeze)
  }
  return value
}
const step = (state, action) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before, '入力を変更しない')
  assert.equal(result.state.revision, state.revision + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.state)), result.state)
  return result.state
}
const use = (state, id = state.activePlayerId) => step(state, { type: 'use_side_menu', playerId: id })
const advance = (state, action) => {
  const next = step(state, action)
  return next.phase === 'defending'
    ? step(next, { type: 'respond_defense', playerId: next.pendingAttack.defenderId, useGari: false })
    : next
}
const end = state => advance(state, { type: 'end_turn', playerId: state.activePlayerId })
const play = (state, cardId) => {
  const player = state.players[state.activePlayerId]
  const chosen = cardId ? player.hand.find(item => item.id === cardId) : player.hand[0]
  assert.ok(chosen)
  return advance(state, { type: 'play_card', playerId: player.id, cardInstanceId: chosen.instanceId })
}
const reject = (state, error, playerId = state.activePlayerId) => {
  const before = structuredClone(state)
  assert.equal(getSideMenuUseError(freeze(state), playerId), error)
  const result = transitionMatch(state, { type: 'use_side_menu', playerId })
  assert.equal(result.error, error)
  assert.equal(result.state, state)
  assert.deepEqual(result.events, [])
  assert.deepEqual(state, before)
}
let passed = 0
function test(name, run) {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}

test('双方の一品は専用スロットで保持し、寿司の手札・机枚数に混ぜない', () => {
  const state = make('fries', { p2SideMenu: 'tempura' })
  assert.deepEqual(state.players[1].sideMenu, { id: 'fries', status: 'ready', turnsLeft: null, usedThisTurn: false })
  assert.equal(state.players[2].sideMenu.id, 'tempura')
  assert.equal(state.players[1].hand.length, 5)
  assert.equal(state.players[1].field.length, 0)
  assert.equal(getSideMenuUseError(state, 1), undefined)
  reject(state, 'not_your_turn', 2)
  reject(make(null), 'side_menu_missing')
})

test('0AP・寿司の机が満杯でもサイドを使用でき、設置は一度だけ', () => {
  let state = make('miso')
  state.players[1].ap = 0
  state.players[1].field = Array.from({ length: 8 }, (_, i) => toField(card('tamago'), `field-${i}`))
  state = use(state)
  assert.equal(state.players[1].ap, 0)
  assert.equal(state.players[1].field.length, 8)
  assert.equal(state.players[1].sideMenu.status, 'active')
  reject(state, 'side_menu_already_active')
})

test('インバウン丼は0APで永続設置し、在場の生ハムだけ攻撃1から3へ強化する', () => {
  let state = make('inbound_don')
  state.players[1].ap = 0
  state.players[1].field = [toField(NAMAHAM_CARD, 'own-ham'), toField(card('gyutan'), 'own-meat')]
  state.players[2].field = [toField(NAMAHAM_CARD, 'enemy-ham')]
  assert.equal(calcFieldDmg(state.players[1].field, state.players[1].attackBuff), 6)
  state = use(state)
  assert.equal(state.players[1].ap, 0)
  assert.equal(state.players[1].sideMenu.status, 'active')
  assert.equal(state.players[1].sideMenu.turnsLeft, null)
  assert.equal(calcFieldDmg(state.players[1].field, state.players[1].attackBuff), 8)
  assert.equal(calcFieldDmg(state.players[2].field, state.players[2].attackBuff), 1, '相手の生ハムには加算しない')
  assert.equal(calcFieldDmg([state.players[1].field[1]], state.players[1].attackBuff), 5, '肉寿司そのものには加算しない')
  reject(state, 'side_menu_already_active')
  let attack = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(attack.pendingAttack.amount, 8)
  state = step(attack, { type: 'respond_defense', playerId: 2, useGari: false })
  attack = step(state, { type: 'end_turn', playerId: 2 })
  assert.equal(attack.pendingAttack.amount, 1)
  state = step(attack, { type: 'respond_defense', playerId: 1, useGari: false })
  for (let round = 0; round < 3; round++) state = end(end(state))
  assert.equal(state.players[1].sideMenu.status, 'active', '3ターン後も設置効果は終了しない')
  assert.equal(state.players[1].sideMenu.turnsLeft, null)
})

test('設置後に生成する生ハムも攻撃3となり、手番をまたいでも通常攻撃の加算が続く', () => {
  let state = make('inbound_don', { deck: [card('gyutan'), ...copies('tamago')] })
  state = play(use(state), 'gyutan')
  const ham = state.players[1].field.find(item => item.id === NAMAHAM_CARD.id)
  assert.ok(ham)
  assert.equal(calcFieldDmg([ham], state.players[1].attackBuff), 3)
  let attack = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(attack.pendingAttack.amount, 8)
  state = step(attack, { type: 'respond_defense', playerId: 2, useGari: false })
  state = end(state)
  attack = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(attack.pendingAttack.amount, 3)
})

test('唐揚げは双方へ一度だけ15を加え、APを消費しない', () => {
  let state = make('karaage')
  state = use(state)
  assert.equal(state.players[1].belly, 15)
  assert.equal(state.players[2].belly, 15)
  assert.equal(state.players[1].ap, 2)
  assert.equal(state.players[1].sideMenu.status, 'used')
  reject(state, 'side_menu_spent')
})

for (const user of [1, 2]) test(`唐揚げで同時満腹ならP${user}の使用者が敗北する`, () => {
  let state = make('karaage', { p2SideMenu: 'karaage' })
  state.activePlayerId = user
  state.players[1].belly = 90
  state.players[2].belly = 90
  state = use(state)
  assert.equal(state.phase, 'over')
  assert.equal(state.winnerId, user === 1 ? 2 : 1)
  assert.equal(state.players[1].belly, 100)
  assert.equal(state.players[2].belly, 100)
  reject(state, 'game_over')
})

test('ラーメンはAP満タンでは設置もお腹増加もせず、最初の使用から始まる', () => {
  let state = make('ramen')
  reject(structuredClone(state), 'side_menu_ap_full')
  state.players[1].ap = 1
  state = use(state)
  assert.equal(state.players[1].belly, 5)
  assert.equal(state.players[1].ap, 2)
  assert.equal(state.players[1].sideMenu.turnsLeft, 3)
  reject(state, 'side_menu_used_this_turn')
})

for (const mode of ['two_player', 'cpu']) test(`${mode}のラーメンは設置ターンを含む自分の3ターンで期限切れになる`, () => {
  let state = make('ramen', { mode })
  state.players[1].ap = 0
  state = use(state)
  state = end(state)
  assert.equal(state.players[1].sideMenu.turnsLeft, 2)
  state = end(state)
  assert.equal(state.players[1].sideMenu.turnsLeft, 2, '相手ターンでは減らない')
  assert.equal(state.players[1].sideMenu.usedThisTurn, false)
  state.players[1].ap = 0
  state = use(state)
  assert.equal(state.players[1].sideMenu.turnsLeft, 2, '再使用で期限を延長しない')
  state = end(end(state))
  assert.equal(state.players[1].sideMenu.turnsLeft, 1)
  state = end(state) // 最終ターンに使わなくても期限は進む
  assert.equal(state.players[1].sideMenu.status, 'expired')
  state = end(state)
  reject(state, 'side_menu_spent')
})

test('ポテトは複合寿司を一枚と数え、本当の二枚目で一枚だけ引く', () => {
  let state = make('fries', { deck: [card('futomaki'), ...copies('kappa_maki')] })
  state.players[1].ap = state.players[1].maxAP = 10
  state = use(state)
  const originalDeck = state.players[1].deck.length
  state = play(state, 'futomaki')
  assert.equal(state.players[1].thisTurnBases.length, 3)
  assert.equal(state.players[1].sushiPlayedThisTurn, 1)
  assert.equal(state.players[1].deck.length, originalDeck)
  state = play(state, 'kappa_maki')
  assert.equal(state.players[1].deck.length, originalDeck - 1)
  state = play(state, 'kappa_maki')
  assert.equal(state.players[1].deck.length, originalDeck - 1)
})

test('二枚目の後にポテトを設置しても遡及ドローはしない', () => {
  let state = make('fries', { deck: copies('kappa_maki') })
  state.players[1].ap = state.players[1].maxAP = 10
  state = play(play(state))
  const before = state.players[1].deck.length
  state = use(state)
  state = play(state)
  assert.equal(state.players[1].deck.length, before)
})

test('天ぷらは双方に効き、2枚設置しても最初の対象一枚へ+3だけ', () => {
  let state = make('tempura', { deck: copies('ebi'), p2Deck: copies('ebi'), p2SideMenu: 'tempura' })
  state.players[1].ap = state.players[1].maxAP = 10
  state = use(state)
  state = play(play(state))
  assert.equal(state.players[1].field[0].turnAttackBonus, 3)
  assert.equal(state.players[1].field[1].turnAttackBonus, undefined)
  assert.equal(calcFieldDmg(state.players[1].field, {}), card('ebi').attack * 2 + 3)
  state = end(state)
  state.players[2].ap = state.players[2].maxAP = 10
  state = use(state)
  state = play(play(state))
  assert.equal(state.players[2].field[0].turnAttackBonus, 3)
  assert.equal(state.players[2].field[1].turnAttackBonus, undefined)
})

test('天ぷらは設置前の対象へ遡及せず、そのターンの対象二枚目にも付かない', () => {
  let state = make('tempura', { deck: copies('ebi') })
  state.players[1].ap = state.players[1].maxAP = 10
  state = play(state)
  state = use(state)
  state = play(state)
  assert.ok(state.players[1].field.every(item => item.turnAttackBonus === undefined))
})

test('天ぷらはsubBasesにも対応し、永続寿司へ付いた+3は手番終了で消える', () => {
  let state = make('tempura', { deck: copies('futomaki') })
  state.players[1].ap = state.players[1].maxAP = 10
  state = play(use(state))
  assert.equal(state.players[1].field[0].turnAttackBonus, 3)
  state = end(state)
  assert.equal(state.players[1].field[0].turnAttackBonus, undefined)
  assert.equal(calcFieldDmg(state.players[1].field, {}), card('futomaki').attack)
})

test('鉄火巻きが増やしたAP上限までラーメンで回復できる', () => {
  let state = make('ramen')
  state.players[1].combosFired = ['akami_mori']
  state.players[1].field = [toField(card('tekka_maki'), 'tekka-ramen')]
  state.turn = 30
  state = end(end(state))
  assert.deepEqual([state.players[1].ap, state.players[1].maxAP], [11, 11])
  state.players[1].ap = 10
  state = use(state)
  assert.equal(state.players[1].ap, 11, '通常上限10に切り詰めない')
})

test('天ぷらの+3は海鮮再攻撃と通常の攻撃予測で同じ値を使う', () => {
  let base = make('tempura', { deck: [card('tako'), card('ika_ten'), ...copies('tamago')] })
  base.players[1].ap = base.players[1].maxAP = 10
  base = play(base, 'tako')
  let buffed = use(structuredClone(base))
  const beforeEnemy = base.players[2].belly
  const plain = play(structuredClone(base), 'ika_ten')
  buffed = play(buffed, 'ika_ten')
  const fieldBefore = calcFieldDmg(plain.players[1].field, {})
  assert.equal(calcFieldDmg(buffed.players[1].field, {}), fieldBefore + 3)
  assert.equal(buffed.players[2].belly - plain.players[2].belly, Math.floor((fieldBefore + 3) / 2) - Math.floor(fieldBefore / 2))
  assert.ok(buffed.players[2].belly > beforeEnemy)
})

test('味噌汁は設置後に自分の消化だけ+2し、消化停止時には追加分も止まる', () => {
  let state = make('miso')
  state.players[1].belly = 40
  state.players[2].belly = 40
  state = use(state)
  state = end(state)
  assert.equal(state.players[2].belly, 38)
  state = end(state)
  assert.equal(state.players[1].belly, 36)
  state.players[1].digestStopTurns = 1
  const before = state.players[1].belly
  state = end(end(state))
  assert.equal(state.players[1].belly, before)
  assert.equal(state.players[1].skippedDigestionThisTurn, 5)
})

test('茶碗蒸しは-15と停止解除に加えて、その開始時に失った消化を一度だけ戻す', () => {
  let state = make(null, { p2SideMenu: 'chawanmushi' })
  state.players[2].belly = 50
  state.players[2].digestStopTurns = 1
  state.players[2].field = [toField(card('kappa_maki'), 'kappa')]
  state = end(state)
  assert.equal(state.players[2].belly, 50)
  assert.equal(state.players[2].skippedDigestionThisTurn, 4)
  state = use(state)
  assert.equal(state.players[2].belly, 31)
  assert.equal(state.players[2].digestStopTurns, 0)
  assert.equal(state.players[2].skippedDigestionThisTurn, 0)
  reject(state, 'side_menu_spent')
})

test('停止された消化は実際に減らせた量までとし、持ち越して取り戻せない', () => {
  let state = make(null, { p2SideMenu: 'chawanmushi' })
  state.players[2].belly = 1
  state.players[2].digestStopTurns = 1
  state = end(state)
  assert.equal(state.players[2].skippedDigestionThisTurn, 1)
  state = end(end(state))
  assert.equal(state.players[2].skippedDigestionThisTurn, 0)
  state.players[2].belly = 20
  state = use(state)
  assert.equal(state.players[2].belly, 5)
})

test('茶碗蒸しのお腹減少は0で下限となる', () => {
  let state = make('chawanmushi')
  state.players[1].belly = 5
  state.players[1].digestStopTurns = 2
  state = use(state)
  assert.equal(state.players[1].belly, 0)
  assert.equal(state.players[1].digestStopTurns, 0)
})

test('追加注文を終えても、使用済みメニューを復活させず既存スロットを保つ', () => {
  let state = use(make('karaage'))
  state.phase = 'reorder'
  state.reorderPlayerId = 1
  const menu = structuredClone(state.players[1].sideMenu)
  state = step(state, { type: 'complete_reorder', playerId: 1, cards: copies('tamago', 3) })
  state = step(state, { type: 'complete_reorder', playerId: 2, cards: copies('tamago', 3) })
  assert.deepEqual(state.players[1].sideMenu, menu)
  reject(state, 'side_menu_spent')
})

test('CPUは消費したAPをラーメンで回復した後に手札を再計画し、同じ操作で実行する', () => {
  let state = make(null, { mode: 'cpu', p2SideMenu: 'ramen' })
  state.activePlayerId = 2
  state.players[2].hand = ['tamago', 'kappa_maki'].map((id, i) => ({ ...card(id), instanceId: `cpu-${i}` }))
  const before = structuredClone(state)
  const actions = getCpuActions(freeze(state))
  assert.deepEqual(state, before)
  assert.deepEqual(actions.map(action => action.type), ['play_card', 'use_side_menu', 'play_card'])
  for (const action of actions) state = step(state, action)
  assert.equal(state.players[2].hand.length, 0)
  assert.equal(state.players[2].field.length, 2)
  assert.equal(state.players[2].sideMenu.turnsLeft, 3)
})

test('CPUは即死する唐揚げを使わず、苦しいときは茶碗蒸しを使う', () => {
  let state = make(null, { mode: 'cpu', p2SideMenu: 'karaage' })
  state.activePlayerId = 2
  state.players[2].belly = 90
  state.players[1].belly = 90
  assert.ok(getCpuActions(state).every(action => action.type !== 'use_side_menu'))
  state = make(null, { mode: 'cpu', p2SideMenu: 'chawanmushi' })
  state.activePlayerId = 2
  state.players[2].belly = 50
  assert.equal(getCpuActions(state)[0].type, 'use_side_menu')
})

test('サイドメニューのお腹増減はガリ防御を要求せず、所持数も変えない', () => {
  for (const [id, belly, expected] of [['karaage', 20, 35], ['ramen', 20, 25], ['chawanmushi', 20, 5]]) {
    let state = make(id)
    state.players[1].belly = belly
    state.players[1].ap = 1
    state = use(state)
    assert.equal(state.players[1].belly, expected)
    assert.equal(state.phase, 'playing')
    assert.equal(state.pendingAttack, null)
    assert.deepEqual([state.players[1].gari, state.players[2].gari], [1, 2])
  }
})

test('ラーメンの残りターンと味噌汁の消化はガリ回答後に一度だけ進む', () => {
  let state = make('ramen', { p2SideMenu: 'miso' })
  state.players[1].ap = 1
  state.players[1].field = [toField(card('maguro'), 'attacker')]
  state.players[2].belly = 40
  state.players[2].sideMenu.status = 'active'
  state = use(state)
  state = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(state.phase, 'defending')
  assert.equal(state.players[1].sideMenu.turnsLeft, 3)
  assert.equal(state.players[2].belly, 40)
  assert.equal(state.activePlayerId, 1)
  reject(state, 'not_your_turn', 1)
  reject(state, 'not_your_turn', 2)
  state = step(state, { type: 'respond_defense', playerId: 2, useGari: true })
  assert.equal(state.phase, 'playing')
  assert.equal(state.players[1].sideMenu.turnsLeft, 2)
  assert.equal(state.players[2].belly, 42, 'お腹40 + 攻撃12の半分6 - 消化4')
  assert.equal(state.players[2].gari, 1)
  assert.equal(state.players[2].sideMenu.status, 'active')
})

test('天ぷらの攻撃増加は防御する攻撃へ含め、回答まで維持してから解除する', () => {
  let state = make('tempura', { deck: copies('futomaki') })
  state.players[1].ap = 10
  state.players[2].belly = 20
  state = play(use(state))
  const total = calcFieldDmg(state.players[1].field, {})
  assert.equal(state.players[1].field[0].turnAttackBonus, 3)
  state = step(state, { type: 'end_turn', playerId: 1 })
  assert.equal(state.pendingAttack.amount, total)
  assert.equal(state.players[1].field[0].turnAttackBonus, 3)
  assert.equal(state.players[2].belly, 20)
  state = step(state, { type: 'respond_defense', playerId: 2, useGari: true })
  assert.equal(state.players[1].field[0].turnAttackBonus, undefined)
  assert.equal(state.players[2].belly, 20 + Math.ceil(total / 2) - 2)
  assert.equal(state.players[1].sideMenu.status, 'active')
})

console.log(`サイドメニュー効果: ${passed}件成功`)
