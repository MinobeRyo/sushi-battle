import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS, GENERATED_CARDS, NAMAHAM_CARD, getCardById, getCardsByLane } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch, getCpuActions } = loadTs('src/game/matchEngine.ts')
const { applySummon, calcFieldDmg, countNamahamu, getSacrificeLimit, getSacrificeBonus, getSacrificeError,
  getCpuDeck, getCpuReorderDeck, toField } = loadTs('src/game/battleRules.ts')
const card = id => {
  const found = CARDS.find(item => item.id === id)
  assert.ok(found, id)
  return found
}
const keepOrder = () => 0.999
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(freeze)
  }
  return value
}
const make = (ids = ['gyutan', 'roast_beef', 'karubi', 'wagyu'], options = {}) => {
  const state = createMatch({ matchId: 'meat-test', mode: 'two_player',
    deck: [...ids.map(card), ...Array(12).fill(card('tamago'))],
    p2Deck: Array(12).fill(card('tamago')), p2SideMenu: null, ...options }, keepOrder)
  state.players[1].ap = state.players[1].maxAP = 10
  return state
}
const hams = n => Array.from({ length: n }, (_, index) => toField(NAMAHAM_CARD, `ham-${index}`))
const fillers = n => Array.from({ length: n }, (_, index) => toField(card('yakiniku'), `filler-${index}`))
const actionFor = (state, id, sacrificeCount, playerId = state.activePlayerId) => {
  const chosen = state.players[playerId].hand.find(item => item.id === id)
  assert.ok(chosen, id)
  return { type: 'play_card', playerId, cardInstanceId: chosen.instanceId,
    ...(sacrificeCount === undefined ? {} : { sacrificeCount }) }
}
const step = (state, action) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, keepOrder)
  assert.equal(result.error, undefined)
  assert.deepEqual(state, before, '入力の状態を変更しない')
  assert.equal(result.state.revision, state.revision + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.state)), result.state)
  return result
}
const play = (state, id, count) => step(state, actionFor(state, id, count))
const end = state => {
  let next = step(state, { type: 'end_turn', playerId: state.activePlayerId }).state
  if (next.pendingAttack) next = step(next, { type: 'respond_defense', playerId: next.pendingAttack.defenderId, useGari: false }).state
  return next
}
const reject = (state, action, error) => {
  const before = structuredClone(state)
  const result = transitionMatch(freeze(state), action, keepOrder)
  assert.equal(result.error, error)
  assert.equal(result.state, state)
  assert.deepEqual(result.events, [])
  assert.deepEqual(state, before)
}
const summonInput = (overrides = {}) => ({
  card: card('tamago'), fieldId: 'summon-test', belly: 0, kireta: 0, field: [],
  summonedIds: [], summonedArch: {}, thisTurnBases: [], thisTurnArch: {}, combosFired: [],
  attackBuff: {}, drawBonus: 0, nikuMatsuri: false, kiretaSpent: false, enemyBelly: 0, ...overrides,
})
let passed = 0
function test(name, run) { run(); passed++; console.log(`  ✓ ${name}`) }

test('4種のAP・攻撃・生成/生贄効果を更新し、生ハムは購入とCPUデッキから除外する', () => {
  assert.deepEqual(['gyutan', 'roast_beef', 'karubi', 'wagyu'].map(id => [card(id).cost, card(id).attack, card(id).effect]), [
    [2, 5, 'generate_namahamu_1'], [4, 10, 'generate_namahamu_2'],
    [3, 9, 'sacrifice_namahamu_1_7'], [4, 12, 'sacrifice_namahamu_2_8'],
  ])
  assert.deepEqual([NAMAHAM_CARD.attack, NAMAHAM_CARD.type, NAMAHAM_CARD.fullness], [1, 'persist', 3])
  assert.deepEqual(GENERATED_CARDS, [NAMAHAM_CARD])
  assert.equal(getCardById(NAMAHAM_CARD.id), null)
  for (const cards of [CARDS, ...['general', 'build', 'shinkansen'].map(getCardsByLane), getCpuDeck(keepOrder), getCpuReorderDeck(keepOrder)]) {
    assert.equal(cards.some(item => item.id === NAMAHAM_CARD.id), false)
  }
})

test('牛タンは1体・ローストビーフは2体を直接机へ生成し、通常召喚は1枚だけ数える', () => {
  for (const [id, expected] of [['gyutan', 1], ['roast_beef', 2]]) {
    const result = play(make([id]), id)
    const player = result.state.players[1]
    assert.equal(countNamahamu(player.field), expected)
    assert.equal(player.field.length, 1 + expected)
    assert.equal(new Set(player.field.map(item => item.fid)).size, 1 + expected)
    assert.ok(player.field.filter(item => item.id === NAMAHAM_CARD.id).every(item => item.turnsLeft === 3))
    assert.deepEqual(player.summonedIds, [id])
    assert.deepEqual(player.summonedArch, { niku: 1 })
    assert.deepEqual(player.thisTurnArch, { niku: 1 })
    assert.equal(player.sushiPlayedThisTurn, 1)
    assert.equal(result.events.filter(event => event.type === 'summon').length, 1)
    assert.equal(player.sacrificedThisTurn, 0)
    assert.equal(player.nikuMatsuri, false)
  }
})

test('空き枠だけ生ハムを生成し、作れない数はログに残す', () => {
  for (const [occupied, generated] of [[6, 1], [7, 0]]) {
    const state = make(['roast_beef'])
    state.players[1].field = fillers(occupied)
    const result = play(state, 'roast_beef')
    assert.equal(result.state.players[1].field.length, 8)
    assert.equal(countNamahamu(result.state.players[1].field), generated)
    assert.ok(result.state.log.some(line => line.includes(`生ハム${2 - generated}体を生成できませんでした`)))
  }
  const full = make(['gyutan'])
  full.players[1].field = fillers(8)
  reject(full, actionFor(full, 'gyutan'), 'field_full')
})

test('同じ料理を複数回出しても生成生ハムのfield IDは重複しない', () => {
  let state = play(make(['gyutan', 'gyutan']), 'gyutan').state
  state = play(state, 'gyutan').state
  assert.equal(countNamahamu(state.players[1].field), 2)
  assert.equal(new Set(state.players[1].field.map(item => item.fid)).size, 4)
  assert.equal(state.players[1].nikuMatsuri, false, '肉寿司2枚の召喚だけでは肉祭りにならない')
})

test('生ハムは自分のターン終了3回で消え、相手のターン終了では寿命を減らさない', () => {
  let state = play(make(['gyutan']), 'gyutan').state
  const fid = state.players[1].field.find(item => item.id === NAMAHAM_CARD.id).fid
  for (const remaining of [2, 1, 0]) {
    state = end(state)
    assert.equal(state.players[1].field.find(item => item.fid === fid)?.turnsLeft ?? 0, remaining)
    state = end(state)
    assert.equal(state.players[1].field.find(item => item.fid === fid)?.turnsLeft ?? 0, remaining)
  }
})

test('省略・明示0では生贄なし、カルビ1体は+7、和牛2体は+16。古い生ハムから消費する', () => {
  for (const [id, count, expected] of [['karubi', undefined, 9], ['karubi', 0, 9], ['karubi', 1, 16], ['wagyu', 1, 20], ['wagyu', 2, 28]]) {
    const state = make([id])
    state.players[1].field = [hams(3)[0], ...fillers(1), ...hams(3).slice(1)]
    const result = play(state, id, count)
    const field = result.state.players[1].field
    assert.deepEqual(field.filter(item => item.id === NAMAHAM_CARD.id).map(item => item.fid), hams(3).slice(count ?? 0).map(item => item.fid))
    assert.equal(calcFieldDmg([field.at(-1)], {}, 0, 99), expected)
    assert.equal(result.state.players[1].sacrificedThisTurn, count ?? 0)
    assert.ok(field.some(item => item.fid === 'filler-0'), '通常の肉寿司は生贄にしない')
  }
})

test('不正な生贄数・別カードの生贄・在場数不足は、AP・手札・机・履歴すべて不変で拒否する', () => {
  for (const count of [-1, 0.5, NaN, Infinity, '1', null, 3]) {
    const state = make(['wagyu'])
    state.players[1].field = hams(2)
    reject(state, actionFor(state, 'wagyu', count), 'invalid_sacrifice_count')
  }
  const tooMany = make(['karubi'])
  tooMany.players[1].field = hams(2)
  reject(tooMany, actionFor(tooMany, 'karubi', 2), 'invalid_sacrifice_count')
  const missing = make(['wagyu'])
  missing.players[1].field = [NAMAHAM_CARD].map((item, index) => toField(item, `actual-${index}`))
  reject(missing, actionFor(missing, 'wagyu', 2), 'not_enough_namahamu')
  const ordinary = make(['tamago'])
  ordinary.players[1].field = hams(1)
  reject(ordinary, actionFor(ordinary, 'tamago', 1), 'invalid_sacrifice_count')
})

test('純関数も不正な生贄を無変更で拒否し、カウンタ省略は0として扱う', () => {
  const input = summonInput({ card: card('karubi'), field: hams(1), sacrificeCount: 2 })
  const before = structuredClone(input)
  assert.throws(() => applySummon(freeze(input)), /invalid_sacrifice_count/)
  assert.deepEqual(input, before)
  assert.equal(applySummon(summonInput()).sacrificedThisTurn, 0)
  assert.equal(getSacrificeLimit(card('wagyu')), 2)
  assert.equal(getSacrificeBonus(card('karubi')), 7)
  assert.equal(getSacrificeError(card('wagyu'), [], 1), 'not_enough_namahamu')
})

test('机が8枚でも選んだ生贄で空きを作って召喚でき、0体では満杯として拒否する', () => {
  const state = make(['karubi'])
  state.players[1].field = [...hams(1), ...fillers(7)]
  reject(state, actionFor(state, 'karubi', 0), 'field_full')
  const result = play(state, 'karubi', 1)
  assert.equal(result.state.players[1].field.length, 8)
  assert.equal(countNamahamu(result.state.players[1].field), 0)
  assert.equal(result.state.players[1].field.at(-1).id, 'karubi')
})

test('同じターンの1体+1体の生贄で肉祭りが即時5ダメージ、一度発動したら重複しない', () => {
  let state = make(['karubi', 'karubi', 'karubi'])
  state.players[2].gari = 0
  state.players[1].field = hams(3)
  let result = play(state, 'karubi', 1)
  assert.equal(result.state.players[1].sacrificedThisTurn, 1)
  assert.equal(result.events.some(event => event.type === 'combo'), false)
  result = play(result.state, 'karubi', 1)
  assert.equal(result.state.players[2].belly, 5)
  assert.equal(result.state.players[1].nikuMatsuri, true)
  assert.deepEqual(result.events.filter(event => event.type === 'combo').map(event => event.comboId), ['niku_matsuri'])
  result = play(result.state, 'karubi', 1)
  assert.equal(result.state.players[1].sacrificedThisTurn, 3)
  assert.equal(result.state.players[2].belly, 5)
  assert.equal(result.events.some(event => event.type === 'combo'), false)
})

test('和牛2体の肉祭りはガリを消費せず即時5ダメージを与え、通常攻撃だけ半減する', () => {
  const state = make(['wagyu'])
  state.players[1].field = hams(2)
  const result = play(state, 'wagyu', 2)
  assert.equal(result.state.phase, 'playing')
  assert.equal(result.state.pendingAttack, null)
  assert.equal(result.state.players[2].belly, 5)
  assert.equal(result.state.players[2].gari, 2)
  assert.equal(result.state.players[1].sacrificedThisTurn, 2)
  assert.equal(countNamahamu(result.state.players[1].field), 0)
  assert.equal(result.state.players[1].ap, 6)
  assert.equal(result.state.activePlayerId, 1)
  const attack = step(result.state, { type: 'end_turn', playerId: 1 }).state
  assert.equal(attack.pendingAttack.amount, 28)
  assert.equal(attack.players[2].belly, 5)
  const defended = step(attack, { type: 'respond_defense', playerId: 2, useGari: true }).state
  assert.equal(defended.players[2].gari, 1)
  assert.equal(defended.players[2].belly, 17, '即時5 + 通常28の半分14 - ターン開始の消化2')
  assert.equal(defended.phase, 'playing')
  assert.equal(defended.activePlayerId, 2)
})

test('ターンをまたぐ生贄は合算せず、肉祭りは次の自分ターンに再び発動できる', () => {
  let state = make(['karubi', 'karubi', 'wagyu'])
  state.players[2].gari = 0
  state.players[1].field = hams(4)
  state = play(state, 'karubi', 1).state
  state = end(state)
  assert.equal(state.players[1].sacrificedThisTurn, 0)
  state = end(state)
  let result = play(state, 'karubi', 1)
  assert.equal(result.state.players[1].sacrificedThisTurn, 1)
  assert.equal(result.events.some(event => event.type === 'combo'), false)
  state = structuredClone(result.state)
  state.players[1].ap = 10
  result = play(state, 'wagyu', 2)
  assert.equal(result.events.filter(event => event.type === 'combo' && event.comboId === 'niku_matsuri').length, 1)
  state = end(result.state)
  assert.equal(state.players[1].nikuMatsuri, false)
  assert.equal(state.players[1].sacrificedThisTurn, 0)
  state = end(state)
  state.players[1].field = hams(2)
  state.players[1].hand.unshift({ ...card('wagyu'), instanceId: 'wagyu-again' })
  state.players[1].ap = 10
  result = play(state, 'wagyu', 2)
  assert.equal(result.events.filter(event => event.type === 'combo' && event.comboId === 'niku_matsuri').length, 1)
})

test('生成した生ハムはポテトのドローや天ぷらの+3を追加発動しない', () => {
  let state = make(['gyutan', 'tamago'], { sideMenu: 'fries', p2SideMenu: 'tempura' })
  state.players[1].sideMenu.status = 'active'
  state.players[2].sideMenu.status = 'active'
  const before = state.players[1]
  state = play(state, 'gyutan').state
  assert.equal(state.players[1].deck.length, before.deck.length)
  assert.equal(state.players[1].hand.length, before.hand.length - 1)
  assert.equal(state.players[1].sushiPlayedThisTurn, 1)
  assert.equal(state.players[1].field.find(item => item.id === 'gyutan').turnAttackBonus, 3)
  assert.equal(state.players[1].field.find(item => item.id === 'namahamu').turnAttackBonus, undefined)
  state = play(state, 'tamago').state
  assert.equal(state.players[1].deck.length, before.deck.length - 1)
  assert.equal(state.players[1].sushiPlayedThisTurn, 2)
})

test('肉祭りは従来の腹条件ボーナスを倍増せず、生贄強化と天ぷらは足し合わせる', () => {
  const field = [toField(card('yakiniku')), toField(card('ebi_ten'))]
  assert.equal(calcFieldDmg(field, {}, 0, 70, { nikuMatsuri: true }), 20)
  assert.equal(calcFieldDmg(field, {}, 0, 70), 20)
  const result = applySummon(summonInput({ card: card('karubi'), field: hams(1), sacrificeCount: 1, turnAttackBonus: 3 }))
  assert.equal(calcFieldDmg(result.field, {}), 19)
  assert.equal(result.summonedArch.niku, 1)
})

test('CPUは最大数を選び、机が満杯でも生贄で空けて召喚できる', () => {
  const state = make([], { mode: 'cpu' })
  state.activePlayerId = 2
  state.players[2].hand = [{ ...card('wagyu'), instanceId: 'cpu-wagyu' }]
  state.players[2].field = [...hams(3), ...fillers(5)]
  state.players[2].ap = 4
  const before = structuredClone(state)
  const actions = getCpuActions(freeze(state))
  assert.deepEqual(state, before)
  assert.deepEqual(actions, [{ type: 'play_card', playerId: 2, cardInstanceId: 'cpu-wagyu', sacrificeCount: 2 }])
  const result = step(state, actions[0])
  assert.equal(countNamahamu(result.state.players[2].field), 1)
  assert.equal(result.state.players[2].field.length, 7)
  assert.equal(result.state.pendingAttack, null)
  assert.equal(result.state.players[1].belly, 5)
  assert.equal(result.state.players[1].gari, 1)
})

test('CPUは満杯の机でもラーメンでAPを補い、生贄召喚まで進める', () => {
  const state = make([], { mode: 'cpu', p2SideMenu: 'ramen' })
  state.activePlayerId = 2
  state.players[2].hand = [{ ...card('wagyu'), instanceId: 'cpu-ramen-wagyu' }]
  state.players[2].field = [...hams(2), ...fillers(6)]
  state.players[2].ap = 3
  state.players[2].maxAP = 4
  const actions = getCpuActions(freeze(state))
  assert.deepEqual(actions, [
    { type: 'use_side_menu', playerId: 2 },
    { type: 'play_card', playerId: 2, cardInstanceId: 'cpu-ramen-wagyu', sacrificeCount: 2 },
  ])
  let result = state
  for (const action of actions) result = step(result, action).state
  assert.equal(result.players[2].belly, 5)
  assert.equal(result.players[2].ap, 0)
  assert.equal(result.players[2].field.length, 7)
})

for (const [id, count, expected] of [['karubi', 0, 9], ['karubi', 1, 18], ['wagyu', 1, 22], ['wagyu', 2, 32]]) {
  test(`インバウン丼の設置後は${id}の生贄${count}体で攻撃${expected}、肉祭りは5のまま`, () => {
    let state = make([id], { sideMenu: 'inbound_don' })
    state.players[1].field = hams(count)
    state = step(state, { type: 'use_side_menu', playerId: 1 }).state
    const result = play(state, id, count)
    assert.equal(calcFieldDmg(result.state.players[1].field, {}), expected)
    assert.equal(result.state.players[2].belly, count === 2 ? 5 : 0)
    assert.equal(result.state.players[2].gari, 2)
    assert.equal(result.state.pendingAttack, null)
  })
}

test('未設置・相手だけ設置したインバウン丼は自分の生贄攻撃を強化しない', () => {
  for (const activeEnemy of [false, true]) {
    const state = make(['wagyu'], { sideMenu: 'inbound_don', p2SideMenu: 'inbound_don' })
    state.players[1].field = hams(2)
    if (activeEnemy) state.players[2].sideMenu.status = 'active'
    const result = play(state, 'wagyu', 2)
    assert.equal(calcFieldDmg(result.state.players[1].field, {}), 28)
    assert.equal(result.state.players[2].belly, 5)
  }
})

console.log(`\n肉寿司の生成・生贄: ${passed}件成功`)
