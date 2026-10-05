#!/usr/bin/env node
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { toField } = loadTs('src/game/battleRules.ts')
const { createMatch, getCpuActions, transitionMatch } = loadTs('src/game/matchEngine.ts')
const byId = id => {
  const card = id === NAMAHAM_CARD.id ? NAMAHAM_CARD : CARDS.find(item => item.id === id)
  assert.ok(card, id)
  return card
}
const field = (...ids) => ids.map((id, i) => toField(byId(id), `${id}:${i}`))
const hand = (...ids) => ids.map((id, i) => ({ ...byId(id), instanceId: `${id}:${i}` }))
function make(cards = [], menu = null) {
  const state = createMatch({ mode: 'cpu', cpuBattleMode: 'challenge', deck: [byId('tamago')], p2SideMenu: menu }, () => 0.999)
  state.activePlayerId = 2
  Object.assign(state.players[2], { hand: hand(...cards), ap: 5, maxAP: 5 })
  return state
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ('value' in descriptor) freeze(descriptor.value)
    }
  }
  return value
}
function forbidHidden(state) {
  for (const [id, key] of [[1, 'hand'], [1, 'deck'], [2, 'deck']]) {
    Object.defineProperty(state.players[id], key, { enumerable: true,
      get() { throw new Error(`非公開情報へのアクセス: P${id}.${key}`) } })
  }
  return freeze(state)
}
function first(state, random = 0) {
  const before = structuredClone(state)
  const actions = getCpuActions(freeze(state), () => random)
  assert.deepEqual(state, before)
  assert.ok(actions.length <= 1, '引く前の内容で後続手を計画しない')
  const result = transitionMatch(state, actions[0] ?? { type: 'end_turn', playerId: 2 }, () => 0.999)
  assert.equal(result.error, undefined, '提案した手は実際のゲームルールで実行できる')
  return actions[0]
}
let passed = 0
function test(name, run) { run(); passed++; console.log(`  ✓ ${name}`) }
console.log('\n[挑戦CPU] 公開盤面による行動判断')

test('80%で巻物コンボとAP効率を評価し、20%は従来の攻撃力順になる', () => {
  const state = make(['uni_gunkan', 'kappa_maki'])
  state.players[2].field = field('avocado_maki', 'natto_maki')
  assert.equal(first(state, 0.799).cardInstanceId, 'kappa_maki:1')
  assert.equal(first(state, 0.8).cardInstanceId, 'uni_gunkan:0')
  const smartCount = Array.from({ length: 100 }, (_, n) => getCpuActions(state, () => n / 100)[0])
    .filter(action => action.cardInstanceId === 'kappa_maki:1').length
  assert.equal(smartCount, 80)
})
test('ガリ込みでも今の場で勝てるなら、手札を使わず攻撃へ進む', () => {
  const state = make(['uni_gunkan'])
  state.players[1].belly = 90
  state.players[1].gari = 0
  state.players[2].field = field('roast_beef')
  assert.equal(first(state), undefined)
  const defended = structuredClone(state)
  defended.players[1].gari = 1
  assert.equal(first(defended).type, 'play_card')
})
test('除去はカードの素の攻撃だけでなく、場の強化込みの脅威を見る', () => {
  const state = make(['salmon'])
  state.players[1].field = field('namahamu', 'yakiniku')
  state.players[1].attackBuff['生ハム'] = 20
  assert.equal(first(state).targetFieldId, 'namahamu:0')
  assert.equal(first(state, 0.9).targetFieldId, 'yakiniku:1')
})
test('強化された生ハムを無駄に生贄にせず、未強化なら肉祭りへつなぐ', () => {
  const state = make(['wagyu'])
  state.players[2].field = field('namahamu', 'namahamu')
  state.players[2].attackBuff['生ハム'] = 20
  assert.equal(first(state).sacrificeCount, 0)
  const plain = structuredClone(state)
  plain.players[2].attackBuff = {}
  assert.equal(first(plain).sacrificeCount, 2)
})
test('茶碗蒸しを序盤に使い切らず、危険な盤面では回復する', () => {
  const state = make([], 'chawanmushi')
  state.players[2].belly = 20
  assert.equal(first(state), undefined)
  assert.equal(first(state, 0.9).type, 'use_side_menu')
  const danger = structuredClone(state)
  danger.players[2].belly = 90
  danger.players[1].field = field('uni_gunkan')
  assert.equal(first(danger).type, 'use_side_menu')
})
test('ラーメンは不足するAPで出せるカードが増えるときだけ使う', () => {
  const state = make(['kappa_maki'], 'ramen')
  state.players[2].ap = 1
  assert.equal(first(state).type, 'play_card')
  const needAP = structuredClone(state)
  needAP.players[2].ap = 0
  assert.equal(first(needAP).type, 'use_side_menu')
  const unsafe = structuredClone(needAP)
  unsafe.players[2].belly = 95
  assert.equal(first(unsafe), undefined)
})
test('唐揚げを序盤に浪費せず、勝ちを決める場面で使う', () => {
  const state = make(['gyutan'], 'karaage')
  state.players[1].belly = 20
  assert.equal(first(state).type, 'play_card')
  const lethal = structuredClone(state)
  lethal.players[1].belly = 90
  assert.equal(first(lethal).type, 'use_side_menu')
  const unsafe = structuredClone(lethal)
  unsafe.players[2].belly = 85
  assert.notEqual(first(unsafe)?.type, 'use_side_menu')
})
test('80%・20%の両方で相手の手札・山札と自分の山札を一切読まない', () => {
  for (const cards of [['tuna_salad_gunkan'], ['wagyu', 'roast_beef'], ['salmon'], ['kappa_maki', 'uni_gunkan']]) {
    for (const menu of [null, 'karaage', 'ramen', 'chawanmushi']) {
      const state = make(cards, menu)
      state.players[1].field = field('yakiniku')
      state.players[2].ap = 4
      const hidden = forbidHidden(state)
      for (const random of [0, 0.799, 0.8, 0.999]) assert.doesNotThrow(() => getCpuActions(hidden, () => random))
    }
  }
})
test('未知のドロー内容で行動を変えず、実際に引いてから次の一手を選ぶ', () => {
  const state = make(['tuna_salad_gunkan'])
  state.players[2].ap = 2
  state.players[2].deck = hand('kappa_maki')
  const other = structuredClone(state)
  other.players[2].deck = hand('uni_gunkan')
  assert.deepEqual(first(state), first(other))
  const next = transitionMatch(state, first(state), () => 0.999).state
  assert.equal(first(next).cardInstanceId, 'kappa_maki:0')
  const noAP = transitionMatch(other, first(other), () => 0.999).state
  assert.equal(first(noAP), undefined)
})
test('最弱と普通の攻撃力順は賢い判断用の乱数に影響されない', () => {
  for (const id of ['weak', 'makimono']) {
    const state = make(['uni_gunkan', 'kappa_maki'])
    state.cpuDeckId = id
    const actions = getCpuActions(freeze(state), () => { throw new Error('挑戦以外に80%抽選は不要') })
    assert.equal(actions[0].cardInstanceId, 'uni_gunkan:0')
  }
})
console.log(`\n挑戦CPUの行動判断: ${passed}件成功`)
