#!/usr/bin/env node
// 寿司はしご（ローグライク）のラン進行と、おかわり・開始お腹のエンジン対応を検証する。
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const run = loadTs('src/game/run.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const rules = loadTs('src/game/battleRules.ts')
const { HAND_LIMIT } = rules
const { ABURI, toAburi, canAburi } = loadTs('src/data/aburi.ts')
const { RELICS, REGULAR_SKILLS } = loadTs('src/data/runRelics.ts')
const { applyCardMods } = loadTs('src/game/runMods.ts')
const { NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { RUN_EVENTS } = loadTs('src/data/runEvents.ts')
const events = loadTs('src/game/runEvents.ts')
const { ENEMY_CHARACTERS, TAISHO, teaThreshold: ENEMY_TEA } = loadTs('src/data/runEnemies.ts')
const debug = loadTs('src/game/runDebug.ts')
const { createUnluckyCard, createRareCorn } = loadTs('src/data/cardVariants.ts')

let passed = 0
const test = (name, fn) => {
  fn()
  passed += 1
  console.log(`✓ ${name}`)
}
const seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const byId = id => CARDS.find(card => card.id === id)
/** 開始時の器の3択を済ませて地図から始める（器は持たない状態にそろえる）。 */
const begin = (archetype, random) => {
  const { startRelicIds: _, ...state } = run.createRun(archetype, random)
  return { ...state, status: 'map' }
}
const play = (state, id) => ({ type: 'play_card', playerId: 1, cardInstanceId: state.players[1].hand.find(card => card.id === id).instanceId })

test('地図は3本×8段＋大将で、どの段からも次の段へ進める', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const nodes = run.generateRunMap(seeded(seed))
    assert.equal(nodes.length, run.RUN_ROWS * run.RUN_COLS + 1)
    const boss = nodes.find(node => node.id === run.BOSS_NODE_ID)
    assert.equal(boss.kind, 'boss')
    assert.equal(boss.enemy.cpuDeckId, 'challenge')
    for (const node of nodes.filter(item => item.row === 0)) assert.equal(node.kind, 'battle')
    for (const node of nodes.filter(item => item.kind !== 'boss')) {
      assert.ok(node.next.length >= 1, `${node.id}から先がありません`)
      if (node.kind === 'battle') assert.ok(node.enemy)
      for (const nextId of node.next) {
        const next = nodes.find(item => item.id === nextId)
        assert.equal(next.row, node.row + 1)
        if (next.kind !== 'boss') assert.ok(Math.abs(next.col - node.col) <= 1)
      }
    }
    // 斜めの線が交差しない。
    for (let row = 0; row < run.RUN_ROWS - 1; row++) {
      for (let col = 0; col < run.RUN_COLS - 1; col++) {
        const right = nodes.find(n => n.id === run.nodeId(row, col)).next.includes(run.nodeId(row + 1, col + 1))
        const left = nodes.find(n => n.id === run.nodeId(row, col + 1)).next.includes(run.nodeId(row + 1, col))
        assert.ok(!(right && left), '斜めの線が交差しています')
      }
    }
  }
})

test('序盤の敵は最弱CPUで満腹ライン50、先へ進むほど上がり大将は150', () => {
  // random()=0 なら顔ぶれは先頭の「腹ペコの学生」（満腹ラインの増減なし）。
  assert.deepEqual(run.enemyForRow(0, 'battle', () => 0), { cpuDeckId: 'weak', maxBelly: 50, label: '腹ペコの学生', character: 'harapeko' })
  assert.equal(run.enemyForRow(2, 'battle', () => 0).cpuDeckId, 'weak')
  assert.notEqual(run.enemyForRow(3, 'battle', () => 0).cpuDeckId, 'weak')
  const caps = Array.from({ length: run.RUN_ROWS }, (_, row) => run.enemyForRow(row, 'battle', () => 0).maxBelly)
  assert.ok(caps.every((cap, i) => i === 0 || cap >= caps[i - 1]), '満腹ラインは下がらない')
  // ボスは幕ごと：店長100・親方125・大将150。
  assert.deepEqual([1, 2, 3].map(act => run.enemyForRow(run.RUN_ROWS, 'boss', () => 0, act).maxBelly), [100, 125, 150])
})

test('満腹ラインに届いた側が負け、お腹はラインを超えない', () => {
  let state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('otoro')), cpuDeckId: 'weak',
    maxBelly: { 2: 20 }, initialBelly: { 2: 60 } }, () => 0.999)
  assert.equal(state.players[2].maxBelly, 20)
  assert.equal(state.players[2].belly, 19, '開始お腹はラインの手前で止める')
  state = { ...state, players: { ...state.players, 1: { ...state.players[1], ap: 5 } } }
  state = transitionMatch(state, play(state, 'otoro'), () => 0.5).state
  state = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5).state
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  assert.equal(state.phase, 'over')
  assert.equal(state.winnerId, 1)
  assert.equal(state.players[2].belly, 20)
  assert.equal(createMatch({ mode: 'cpu', deck: [byId('tamago')] }, () => 0.5).players[2].maxBelly, undefined)
})

test('最初のデッキは汎用10枚＋系統の寿司（肉寿司だけ4枚、ほかは3枚）', () => {
  for (const { id } of run.RUN_ARCHETYPES) {
    const state = run.createRun(id, seeded(3))
    const size = 10 + (id === 'niku' ? 4 : 3)
    assert.equal(state.deck.length, size)
    assert.equal(run.runDeckCards(state).length, size, `${id}の寿司IDが存在しません`)
    assert.ok(run.ARCHETYPE_STARTERS[id].every(cardId => byId(cardId).archetype.includes(id)))
  }
  assert.deepEqual([...run.ARCHETYPE_STARTERS.akami].sort(), ['chutoro', 'maguro', 'otoro'], '赤身は三種盛りが揃う')
  assert.ok(run.ARCHETYPE_STARTERS.niku.includes('yakiniku'), '肉寿司は焼肉寿司から始まる')
  // 肉寿司は生ハムを増やすカード（牛タン・焼肉寿司）と、使うカード（カルビ・和牛）を両方持って始める。
  const niku = run.ARCHETYPE_STARTERS.niku.map(byId)
  const makes = niku.filter(card => /generate_namahamu|namahamu_deck/.test(card.effect ?? '')).length
  const uses = niku.reduce((sum, card) => sum + rules.getSacrificeLimit(card), 0)
  assert.ok(uses >= makes, `生ハムを使える数（${uses}）が増やすカード数（${makes}）以上`)
})

test('マスは隣の道にしか進めず、お茶でお腹が30減る', () => {
  let state = begin('akami', seeded(7))
  assert.deepEqual(run.reachableNodeIds(state), ['r0c0', 'r0c1', 'r0c2'])
  assert.throws(() => run.enterNode(state, 'r1c0'))
  state = run.enterNode(state, 'r0c1')
  assert.equal(state.status, 'battle')
  assert.deepEqual(run.reachableNodeIds(state), [], '対戦中は次に進めない')
  state = run.finishBattle(state, true, 61, () => 0)
  assert.equal(state.belly, 30, '勝利後はお腹を半分（切り捨て）にする')
  assert.equal(state.status, 'reward')
  const rest = { ...state, status: 'rest', belly: 40 }
  assert.equal(run.takeRest(rest).belly, 10)
  assert.equal(run.takeRest({ ...rest, belly: 12 }).belly, 0)
})

test('報酬は系統・汎用・ランダムの重複なし3枚で、選ぶかスキップする', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const ids = run.rollRewardCards('hikari', seeded(seed))
    assert.equal(ids.length, 3)
    assert.equal(new Set(ids).size, 3)
    assert.ok(byId(ids[0]).archetype.includes('hikari'))
    assert.equal(byId(ids[1]).lane, 'general')
  }
  let state = run.enterNode(begin('niku', seeded(2)), 'r0c0')
  state = run.finishBattle(state, true, 20, seeded(5))
  assert.ok(state.reward.gold >= 250 && state.reward.gold <= 350)
  assert.equal(state.gold, state.reward.gold)
  const taken = run.chooseReward(state, state.reward.cardIds[2])
  assert.equal(taken.deck.length, state.deck.length + 1)
  assert.equal(taken.deck.at(-1), state.reward.cardIds[2])
  assert.equal(taken.status, 'map')
  assert.throws(() => run.chooseReward(state, 'otoro_not_offered'))
  const skipped = run.chooseReward(state, null)
  assert.equal(skipped.deck.length, state.deck.length)
  assert.equal(skipped.gold, state.gold + run.SKIP_REWARD_GOLD)
})

test('負けるとラン終了、大将に勝つとクリア', () => {
  const state = run.enterNode(begin('kaisen', seeded(9)), 'r0c2')
  assert.equal(run.finishBattle(state, false, 100).status, 'lost')
  // 1・2幕のボスに勝つと報酬（寿司＋器かサイド）を選んで次の幕の入口へ。3幕の大将に勝つとクリア。
  let current = state
  for (const act of [1, 2]) {
    const atBoss = { ...current, act, status: 'battle', currentNodeId: run.BOSS_NODE_ID, visited: [...current.visited, run.BOSS_NODE_ID] }
    const cleared = run.finishBattle(atBoss, true, 50, seeded(act))
    assert.equal(cleared.status, 'reward')
    assert.equal(cleared.reward.actClear, true)
    assert.ok(cleared.reward.gold >= 600)
    assert.equal(cleared.reward.relicIds.length, 3)
    const afterCard = run.chooseReward(cleared, cleared.reward.cardIds[0], seeded(10 + act))
    assert.equal(afterCard.status, 'reward', '器・サイドを選ぶまで次の幕へ進まない')
    current = run.chooseBonus(afterCard, { relic: cleared.reward.relicIds[0] }, seeded(20 + act))
    assert.equal(current.act, act + 1)
    assert.equal(current.status, 'map')
    assert.equal(current.currentNodeId, null)
    assert.deepEqual(current.visited, [])
    assert.equal(current.belly, 25, 'お腹は勝ったときに半分になったまま')
    assert.ok(current.relics.includes(cleared.reward.relicIds[0]))
    const boss = current.nodes.find(node => node.kind === 'boss')
    assert.equal(boss.enemy.boss, act === 1 ? 'oyakata' : 'taisho')
  }
  const finalBoss = { ...current, status: 'battle', currentNodeId: run.BOSS_NODE_ID, visited: [run.BOSS_NODE_ID] }
  const won = run.finishBattle(finalBoss, true, 50)
  assert.equal(won.status, 'won')
  assert.equal(won.reward, null)
})

test('3幕：幕が進むほど敵の満腹ラインと炙りの割合が上がり、最弱CPUは1幕だけ', () => {
  for (const row of [0, 4, 7]) {
    const caps = [1, 2, 3].map(act => run.enemyForRow(row, 'battle', () => 0, act).maxBelly)
    assert.ok(caps[0] < caps[1] && caps[1] < caps[2], `${row + 1}軒目：${caps}`)
    const rates = [1, 2, 3].map(act => run.enemyAburiRate(row, act))
    assert.ok(rates[0] < rates[1] && rates[1] < rates[2], `${row + 1}軒目の炙り：${rates}`)
  }
  assert.equal(run.enemyForRow(0, 'battle', () => 0, 1).cpuDeckId, 'weak')
  assert.notEqual(run.enemyForRow(0, 'battle', () => 0, 2).cpuDeckId, 'weak')
  assert.deepEqual(run.generateRunMap(seeded(3), 2).find(node => node.kind === 'boss').enemy.boss, 'oyakata')
})

test('3幕：ボスの専用ルールは幕ごと（店長はおすすめだけ、親方と大将は締めのお茶も）', () => {
  const mods = act => run.runMatchMods({ relics: [] }, run.enemyForRow(run.RUN_ROWS, 'boss', () => 0, act))[2].boss
  assert.deepEqual(mods(1), { name: '回転寿司の店長', osusumeEvery: 4, tea: false })
  assert.deepEqual(mods(2), { name: '立ち食いの親方', osusumeEvery: 3, tea: true })
  assert.deepEqual(mods(3), { name: '大将', osusumeEvery: 3, tea: true })
  // 親方（満腹125）の締めのお茶は83（2/3）を超えたとき。
  assert.equal(ENEMY_TEA(125), 83)
  // 3幕になる前の保存は1幕として読み、ボスに店長の印を付ける。
  const old = { ...begin('akami', seeded(2)) }
  delete old.act
  old.nodes = old.nodes.map(node => node.kind === 'boss' ? { ...node, enemy: { cpuDeckId: 'challenge', maxBelly: 150, label: '大将' } } : node)
  const parsed = run.parseRun(JSON.stringify(old))
  assert.equal(parsed.act, 1)
  assert.equal(parsed.nodes.find(node => node.kind === 'boss').enemy.boss, 'tencho')
})

test('保存は対戦の手前に戻し、壊れたデータは読まない', () => {
  let state = run.enterNode(begin('makimono', seeded(4)), 'r0c0')
  state = run.chooseReward(run.finishBattle(state, true, 10, seeded(1)), null)
  const next = state.nodes.find(node => node.id === state.currentNodeId).next[0]
  // 次のマスは対戦にそろえる（マスの種類は抽選なので、ハプニングや買い物のこともある）。
  state = { ...state, nodes: state.nodes.map(node => node.id === next
    ? { ...node, kind: 'battle', enemy: run.enemyForRow(node.row, 'battle', () => 0) } : node) }
  const inBattle = run.enterNode(state, next)
  assert.equal(inBattle.status, 'battle')
  const saved = run.runForSave(inBattle)
  assert.equal(saved.status, 'map')
  assert.equal(saved.currentNodeId, 'r0c0')
  assert.deepEqual(run.reachableNodeIds(saved), run.reachableNodeIds(state))
  assert.deepEqual(run.parseRun(JSON.stringify(saved)), saved)
  assert.equal(run.parseRun('{broken'), null)
  assert.equal(run.parseRun(JSON.stringify({ ...saved, version: 0 })), null)
  assert.equal(run.parseRun(null), null)
})

test('試合は指定したCPUデッキと開始お腹で始まる', () => {
  const state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'hikari',
    initialBelly: { 1: 42, 2: 30 }, refillOnEmpty: true }, seeded(1))
  assert.equal(state.players[2].maxBelly, undefined, '指定しなければ満腹ラインは100のまま')
  assert.equal(state.cpuDeckId, 'hikari')
  assert.equal(state.players[1].belly, 42)
  assert.equal(state.players[2].belly, 30)
  assert.equal(state.refill[1].length, 13)
  const plain = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')) }, seeded(1))
  assert.equal(plain.refill, undefined, '通常のCPU戦はおかわりなし')
})

test('はしごの試合は自分だけAP3から始まり、毎ターン+1で上限10', () => {
  let state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'weak',
    startAP: { 1: run.RUN_START_AP } }, () => 0.999)
  assert.equal(state.players[1].ap, 3)
  assert.equal(state.players[1].maxAP, 3)
  assert.equal(state.players[2].maxAP, 2, 'CPU側は変えない')
  const seen = []
  for (let i = 0; i < 40 && state.phase !== 'over' && seen.length < 10; i++) {
    const active = state.activePlayerId
    if (state.phase === 'defending') {
      state = transitionMatch(state, { type: 'respond_defense', playerId: state.pendingAttack.defenderId, useGari: false }).state
      continue
    }
    state = transitionMatch(state, { type: 'end_turn', playerId: active }, () => 0.5).state
    if (state.activePlayerId === 1 && state.phase === 'playing') seen.push(state.players[1].maxAP - state.players[1].apNextBonus)
  }
  assert.deepEqual(seen.slice(0, 8), [4, 5, 6, 7, 8, 9, 10, 10])
  assert.equal(createMatch({ mode: 'cpu', deck: [byId('tamago')] }, () => 0.5).players[1].ap, 2, '通常のCPU戦は2のまま')
})

test('はしごの試合は最初の手札6枚・毎ターン2枚引く。CPU側は変えない', () => {
  const deck = Array(13).fill(byId('tamago'))
  let state = createMatch({ mode: 'cpu', deck, cpuDeckId: 'weak', refillOnEmpty: true,
    openingHand: { 1: run.RUN_OPENING_HAND }, drawBonus: { 1: run.RUN_DRAW_PER_TURN - 1 } }, () => 0.999)
  assert.equal(state.players[1].hand.length, 6)
  assert.equal(state.players[2].hand.length, 5)
  state = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5).state
  assert.equal(state.players[1].hand.length, Math.min(6 + 2, HAND_LIMIT), '手札上限までは2枚引く')
  const plain = createMatch({ mode: 'cpu', deck }, () => 0.999)
  assert.equal(plain.players[1].hand.length, 5)
  assert.equal(plain.players[1].drawBonus, 0)
})

test('おかわり：山札が尽きたら追加注文せず、使った寿司を戻して引き続ける', () => {
  const deck = Array(6).fill(byId('tamago'))
  let state = createMatch({ mode: 'two_player', deck, p2Deck: deck, refillOnEmpty: true }, () => 0.999)
  let reshuffled = 0
  for (let turn = 0; turn < 30 && state.phase !== 'over'; turn++) {
    const player = state.players[state.activePlayerId]
    const card = player.hand.find(item => item.cost <= player.ap)
    const action = card
      ? { type: 'play_card', playerId: player.id, cardInstanceId: card.instanceId }
      : { type: 'end_turn', playerId: player.id }
    const result = transitionMatch(state, action, () => 0.5)
    assert.equal(result.error, undefined)
    state = result.state
    if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: state.pendingAttack.defenderId, useGari: false }).state
    assert.notEqual(state.phase, 'reorder', 'おかわりの試合では追加注文にならない')
    reshuffled = state.log.filter(line => line.includes('おかわり')).length || reshuffled
    for (const p of Object.values(state.players)) assert.ok(p.hand.length <= HAND_LIMIT)
  }
  assert.ok(reshuffled > 0, 'おかわりが一度も起きていません')
})

// ── 第2段：炙り・器・常連さん ────────────────────────────────────────────

/** 自分の手番で、指定カードを手札に入れて出せる状態を作る。 */
function setup({ hand = [], field = [], runMods, deck = Array(13).fill(byId('tamago')), ap = 10 } = {}) {
  const state = createMatch({ mode: 'cpu', deck, cpuDeckId: 'weak', p2SideMenu: null, refillOnEmpty: true, runMods }, seeded(11))
  const me = state.players[1]
  me.hand = hand.map((card, index) => ({ ...structuredClone(card), instanceId: `t:${index}` }))
  me.field = field.map((card, index) => rules.toField(structuredClone(card), `f:${index}`))
  me.ap = ap
  me.maxAP = ap
  return state
}
const playAt = (state, index = 0, extra = {}) => {
  const result = transitionMatch(state, { type: 'play_card', playerId: 1, cardInstanceId: state.players[1].hand[index].instanceId, ...extra }, () => 0.5)
  assert.equal(result.error, undefined)
  return result.state
}
const aburi = id => toAburi(byId(id))

test('炙り：全55種に専用の強化があり、生ハムと訳ありは炙れない', () => {
  assert.equal(CARDS.length, 55)
  for (const card of CARDS) {
    assert.ok(ABURI[card.id], `${card.name}の炙りがありません`)
    const roasted = toAburi(card)
    assert.equal(roasted.aburi, true)
    assert.equal(roasted.name, `炙り${card.name}`)
    assert.equal(roasted.id, card.id, '効果・コンボ判定のIDは元のまま')
    assert.ok(roasted.attack >= card.attack, `${card.name}の攻撃が下がっています`)
    assert.equal(canAburi(roasted), false, '1枚につき1回まで')
  }
  assert.equal(canAburi(NAMAHAM_CARD), false)
  assert.equal(canAburi({ ...byId('maguro'), variant: 'neta_missing' }), false)
  assert.equal(aburi('tuna_salad_gunkan').cost, 0)
  assert.equal(aburi('natto_maki').fullness, 6)
})

test('炙り：デッキIDに炙りフラグを付けて保存し、お茶マスで1枚だけ炙れる', () => {
  let state = { ...run.createRun('akami', seeded(3)), status: 'rest' }
  const index = state.deck.indexOf('maguro')
  const roasted = run.aburiAtRest(state, index)
  assert.equal(roasted.deck[index], 'maguro#aburi')
  assert.equal(roasted.status, 'map')
  assert.equal(roasted.belly, state.belly, '炙るときはお腹は減らない')
  const cards = run.runDeckCards(roasted)
  assert.equal(cards[index].aburi, true)
  assert.equal(cards[index].attack, 18)
  assert.throws(() => run.aburiAtRest({ ...roasted, status: 'rest' }, index), '同じ1枚を二度炙れない')
  assert.throws(() => run.aburiAtRest(roasted, 0), 'お茶マス以外では炙れない')
  assert.equal(run.parseRun(JSON.stringify(roasted)).deck[index], 'maguro#aburi')
})

test('炙り：主な効果の数値がエンジンに反映される', () => {
  // たまご：自腹−10
  let state = setup({ hand: [aburi('tamago')] })
  state.players[1].belly = 30
  assert.equal(playAt(state).players[1].belly, 20)
  // いなり：次AP+2
  assert.equal(playAt(setup({ hand: [aburi('inari')] })).players[1].apNextBonus, 2)
  // 明太子：3枚引く
  state = setup({ hand: [aburi('mentaiko')] })
  assert.equal(playAt(state).players[1].hand.length, 3)
  // チーズ：50%軽減、サバは無料・イワシ生姜は切れ味1で予約
  assert.equal(rules.getDefenseReductionRate(aburi('cheese')), 0.5)
  assert.equal(rules.getDefenseReductionRate(byId('cheese')), 0.25)
  assert.equal(rules.getDefenseCost(aburi('saba')), 0)
  assert.equal(rules.getDefenseCost(aburi('iwashi_shoga')), 1)
  state = playAt(setup({ hand: [aburi('saba')] }), 0, { reserveDefense: true })
  assert.equal(state.players[1].field.at(-1).defenseState, 'reserved', '切れ味0でも炙りサバは予約できる')
  // 切れ味+2、コハダ×5
  assert.equal(playAt(setup({ hand: [aburi('aji')] })).players[1].kiretaStack, 2)
  state = setup({ hand: [aburi('kohada')] })
  state.players[1].kiretaStack = 4
  const before = state.players[2].belly
  assert.equal(playAt(state).players[2].belly - before, 20)
  // いか・たこの連鎖+6、炙りシーフード軍艦でも連鎖
  state = setup({ hand: [byId('seafood_gunkan')], field: [aburi('ika')] })
  const plainSeafood = playAt(state).players[2].belly - state.players[2].belly
  state = setup({ hand: [aburi('seafood_gunkan')], field: [aburi('ika')] })
  assert.equal(playAt(state).players[2].belly - state.players[2].belly, 6, '炙りシーフード軍艦がいかの連鎖+6を起こす')
  assert.equal(plainSeafood, 0)
  // 肉：和牛は3体まで各+6、牛タンは生ハム2体
  assert.equal(rules.getSacrificeLimit(aburi('wagyu')), 3)
  assert.equal(rules.getSacrificeBonus(aburi('wagyu')), 6)
  state = playAt(setup({ hand: [aburi('gyutan')] }))
  assert.equal(rules.countNamahamu(state.players[1].field), 2)
  // 天ぷら：相手お腹50以上で+10、焼肉は40以上で+4
  assert.equal(rules.calcFieldDmg([rules.toField(aburi('ebi_ten'))], {}, 0, 50), 23)
  assert.equal(rules.calcFieldDmg([rules.toField(byId('ebi_ten'))], {}, 0, 50), 9)
  assert.equal(rules.calcFieldDmg([rules.toField(aburi('yakiniku'))], {}, 0, 40), 10)
  // 巻物：炙り太巻きは2枚分、炙りかっぱ巻きは消化+4、炙り鉄火巻きは三種盛り前からAP+1
  assert.equal(rules.makimonoCount([rules.toField(aburi('futomaki'))]), 2)
  assert.equal(rules.digestBonus([rules.toField(aburi('kappa_maki'))]), 4)
  assert.equal(rules.tekkaApBonus([rules.toField(aburi('tekka_maki'))], []), 1)
  assert.equal(rules.tekkaApBonus([rules.toField(byId('tekka_maki'))], []), 0)
})

test('炙り：サーモンは相手の持続型を2枚まで壊す', () => {
  const state = setup({ hand: [aburi('salmon')] })
  state.players[2].field = [byId('natto_maki'), byId('kappa_maki'), byId('ika')].map((card, i) => rules.toField(card, `e:${i}`))
  const next = playAt(state, 0, { targetFieldId: 'e:0' })
  assert.deepEqual(next.players[2].field.map(card => card.id), ['kappa_maki'])
})

test('器：通常の器18種（各系統3種＋汎用3種）', () => {
  assert.equal(RELICS.length, 18)
  for (const archetype of ['akami', 'makimono', 'hikari', 'kaisen', 'niku', 'general']) {
    assert.equal(RELICS.filter(relic => relic.archetype === archetype).length, 3, archetype)
  }
  assert.equal(new Set(RELICS.map(relic => relic.id)).size, 18)
})

test('器：1枚ごとの強化（七輪・巻きす・名工の出刃・軍艦の型枠・海苔缶）', () => {
  const mods = relics => ({ relics })
  assert.equal(applyCardMods(aburi('maguro'), mods(['shichirin'])).attack, 22)
  assert.equal(applyCardMods(byId('maguro'), mods(['shichirin'])).attack, 12, '炙っていない寿司には乗らない')
  assert.equal(applyCardMods(byId('natto_maki'), mods(['makisu'])).fullness, 6)
  const deba = rules.toField(applyCardMods(byId('aji'), mods(['meiko_deba'])))
  assert.equal(rules.calcFieldDmg([deba], {}, 3, 0), 7 + 6)
  const kata = ['kappa_maki', 'kanpyo_maki', 'natto_maki', 'avocado_maki', 'uni_gunkan']
    .map(id => rules.toField(applyCardMods(byId(id), mods(['gunkan_kata']))))
  assert.equal(rules.calcFieldDmg(kata.slice(4), {}, 0, 0, { gunkanBoost: true }), 60, '軍艦の攻撃3倍')
  const nori = [rules.toField(applyCardMods(byId('kappa_maki'), mods(['norikan'])))]
  assert.equal(rules.makimonoCount(nori), 3)
  assert.equal(rules.makimonoCount([]), 0)
})

test('器：試合開始時（砥石・名入れ湯呑み）と、通常対戦への非干渉', () => {
  const state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'weak',
    runMods: { 1: { relics: ['toishi', 'nairei_yunomi'] } } }, seeded(1))
  assert.equal(state.players[1].kiretaStack, 3)
  assert.equal(state.players[1].gari, 2)
  const plain = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'weak' }, seeded(1))
  assert.equal(plain.players[1].mods, undefined)
  assert.equal(plain.players[1].gari, 1)
  assert.ok([...plain.players[1].hand, ...plain.players[1].deck, ...plain.players[2].hand, ...plain.players[2].deck]
    .every(card => !card.aburi && !card.boost), '通常のCPU戦のカードには炙りも器も付かない')
})

test('器：赤身（わさび壺・一本釣りの竿・本鮪の柵箱）', () => {
  let state = setup({ hand: [byId('chutoro')], runMods: { 1: { relics: ['wasabi_tsubo'] } } })
  state.players[1].summonedIds = ['maguro']
  state = playAt(state)
  assert.ok(state.players[1].combosFired.includes('akami_mori'), '2種で三種盛りが成立')
  state = setup({ hand: [byId('bintoro')], runMods: { 1: { relics: ['ipponzuri'] } } })
  state.players[1].combosFired = ['akami_mori']
  assert.equal(playAt(state).players[2].belly - state.players[2].belly, 10)
  state = setup({ hand: [byId('bintoro'), byId('maguro'), byId('tamago')], runMods: { 1: { relics: ['saku_bako'] } } })
  state = playAt(state)
  assert.equal(state.players[1].hand.find(card => card.id === 'maguro').cost, 2)
  assert.equal(state.players[1].hand.find(card => card.id === 'tamago').cost, 1)
  state = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5).state
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  const maguro = [...state.players[1].hand].find(card => card.id === 'maguro')
  assert.equal(maguro.cost, 3, 'ターン終了で元に戻る')
})

test('器：海鮮（たこ壺・大漁旗・網元の網）', () => {
  const ika = applyCardMods(byId('ika'), { relics: ['tako_tsubo', 'amimoto_ami'] })
  const tako = applyCardMods(byId('tako'), { relics: ['tako_tsubo', 'amimoto_ami'] })
  let state = setup({ hand: [tako], field: [ika], runMods: { 1: { relics: ['tako_tsubo', 'amimoto_ami'] } } })
  const reattackPlain = rules.calcKaisenReattackDamage([rules.toField(byId('ika')), rules.toField(byId('tako'))], {}, 0, 0)
  const flag = applyCardMods(byId('ika'), { relics: ['tairyo_bata'] })
  const reattackFlag = rules.calcKaisenReattackDamage([rules.toField(flag), rules.toField(applyCardMods(byId('tako'), { relics: ['tairyo_bata'] }))], {}, 0, 0)
  assert.equal(reattackPlain, 3)
  assert.equal(reattackFlag, 6, '再攻撃が100%')
  state = playAt(state)
  assert.ok(state.log.some(line => line.includes('連鎖攻撃') && line.includes('+12')), 'たこ壺で連鎖が1枚3+3、2枚で+12')
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  state = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5).state
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  const ikaOnField = state.players[1].field.find(card => card.id === 'ika')
  assert.equal(ikaOnField.turnsLeft, 3, '網元の網でいかの持続が減らない')
})

test('器：肉寿司（鉄板・秘伝のタレ・焼き網）', () => {
  let state = setup({ hand: [byId('gyutan')], runMods: { 1: { relics: ['teppan'] } } })
  state = playAt(state)
  assert.equal(rules.countNamahamu(state.players[1].field), 2, '鉄板でもう1体')
  assert.equal(state.players[1].teppanLeft, 2)
  const ham = applyCardMods(NAMAHAM_CARD, { relics: ['hiden_tare', 'yakiami'] })
  state = setup({ hand: [byId('karubi'), byId('karubi')], field: [ham, ham, ham], runMods: { 1: { relics: ['hiden_tare', 'yakiami'] } } })
  const deckBefore = state.players[1].deck.length
  state = playAt(state, 0, { sacrificeCount: 1 })
  assert.equal(state.players[1].deck.length, deckBefore + 1, '秘伝のタレで生贄が山札へ')
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  state = playAt(state, 0, { sacrificeCount: 1 })
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  assert.ok(state.players[1].nikuMatsuri)
  state.players[1].hand.push({ ...structuredClone(byId('karubi')), instanceId: 't:x' })
  const fires = state.log.filter(line => line.includes('肉祭り')).length
  state = playAt(state, state.players[1].hand.length - 1, { sacrificeCount: 1 })
  assert.equal(state.log.filter(line => line.includes('肉祭り')).length, fires + 1, '焼き網で同じターンにもう一度')
})

test('器：光り物の研ぎ桶と、汎用の竹皮の包み', () => {
  let state = setup({ hand: [byId('kohada')], runMods: { 1: { relics: ['togi_oke'] } } })
  state.players[1].kiretaStack = 6
  state = playAt(state)
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  state = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5).state
  if (state.phase === 'defending') state = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }).state
  assert.equal(state.players[1].kiretaStack, 3, '使った6の半分が戻る')
  state = setup({ hand: [byId('mentaiko')], deck: Array(3).fill(byId('tamago')), runMods: { 1: { relics: ['takekawa'] } } })
  state.players[1].deck = []
  const ap = state.players[1].ap
  state = playAt(state)
  assert.ok(state.log.some(line => line.includes('竹皮の包み')))
  assert.equal(state.players[1].ap, ap - 3 + 2)
})

test('常連さん：地図に出て、得意技と1段強いデッキを持つ', () => {
  let regulars = 0
  for (let seed = 1; seed <= 40; seed++) {
    for (const node of run.generateRunMap(seeded(seed))) {
      if (node.kind !== 'regular') continue
      regulars += 1
      assert.ok(node.row > 0, '1マス目は必ず対戦')
      assert.ok(REGULAR_SKILLS.some(skill => skill.id === node.enemy.skill))
      assert.notEqual(node.enemy.cpuDeckId, 'weak')
    }
  }
  assert.ok(regulars > 0)
  assert.equal(run.enemyForRow(5, 'regular', () => 0).cpuDeckId, 'challenge')
  assert.equal(run.enemyForRow(5, 'regular', () => 0).maxBelly, run.enemyForRow(5, 'battle', () => 0).maxBelly, '満腹ラインは同じ段の大食い客と同じ')
  assert.equal(REGULAR_SKILLS.length, 6)
})

test('常連さん：得意技はCPU側だけに効く', () => {
  const make = skill => createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'akami',
    p2SideMenu: null, runMods: { 2: { skill } } }, seeded(2))
  assert.equal(make('gari_yama').players[2].gari, 5)
  assert.equal(make('gari_yama').players[1].gari, 1)
  assert.equal(make('joren_tokken').players[2].hand.length, 7)
  assert.equal(make('joren_tokken').players[1].hand.length, 5)
  // 炙り好きはデッキの半分ほど（全部ではない）を炙る。
  const zuki = make('aburi_zuki')
  const zukiCards = [...zuki.players[2].hand, ...zuki.players[2].deck]
  const zukiAburi = zukiCards.filter(card => card.aburi).length
  assert.ok(zukiAburi > 0 && zukiAburi < zukiCards.length, `炙りは一部だけ（${zukiAburi}/${zukiCards.length}）`)
  assert.ok([...zuki.players[1].hand, ...zuki.players[1].deck].every(card => !card.aburi))
  // 早食い・底なし胃袋は相手の手番の始まりに効く
  for (const skill of ['hayagui', 'sokonashi']) {
    let state = make(skill)
    state.players[2].belly = 40
    const plain = make('gari_yama')
    plain.players[2].belly = 40
    const end = s => transitionMatch(s, { type: 'end_turn', playerId: 1 }, () => 0.5).state
    const a = end(state), b = end(plain)
    if (skill === 'hayagui') assert.equal(a.players[2].maxAP, b.players[2].maxAP + 1)
    else assert.equal(40 - a.players[2].belly, (40 - b.players[2].belly) * 2)
  }
  // 皿積み：机の寿司はそれぞれ+1。合計は枚数分だけ増える（8枚で+8。以前は1枚ごとに+枚数で+64になった）。
  const plates = [byId('natto_maki'), byId('kappa_maki')].map(card => rules.toField(applyCardMods(card, { skill: 'sarazumi' })))
  assert.equal(rules.calcFieldDmg(plates, {}, 0, 0), (3 + 1) + (1 + 1))
  const eight = Array.from({ length: 8 }, () => rules.toField(applyCardMods(byId('kappa_maki'), { skill: 'sarazumi' })))
  assert.equal(rules.calcFieldDmg(eight, {}, 0, 0), 8 * 1 + 8)
})

test('常連さんの報酬：寿司3枚（炙り1枚）＋器3つかサイドメニュー3品', () => {
  let state = begin('hikari', seeded(5))
  state = run.enterNode(state, 'r0c0')
  const node = state.nodes.find(item => item.id === 'r0c0')
  node.kind = 'regular'
  node.enemy = run.enemyForRow(0, 'regular', seeded(1))
  assert.deepEqual(run.runMatchMods(state, node.enemy), { 2: { skill: node.enemy.skill } })
  state = run.finishBattle(state, true, 30, seeded(8))
  assert.ok(state.reward.gold >= 450 && state.reward.gold <= 550)
  assert.equal(state.reward.cardIds.filter(id => id.endsWith('#aburi')).length, 1)
  assert.equal(state.reward.relicIds.length, 3)
  assert.equal(RELICS.find(relic => relic.id === state.reward.relicIds[0]).archetype, 'hikari')
  assert.equal(state.reward.sideMenuIds.length, 3)
  const aburiId = state.reward.cardIds.find(id => id.endsWith('#aburi'))
  state = run.chooseReward(state, aburiId)
  assert.equal(state.status, 'reward', '寿司のあとに器を選ぶ')
  assert.equal(state.deck.at(-1), aburiId)
  const relic = state.reward.relicIds[1]
  const withRelic = run.chooseBonus(state, { relic })
  assert.equal(withRelic.status, 'map')
  assert.deepEqual(withRelic.relics, [relic])
  assert.deepEqual(run.runMatchMods(withRelic, undefined), { 1: { relics: [relic] } })
  const withMenu = run.chooseBonus(state, { sideMenu: state.reward.sideMenuIds[0] })
  assert.equal(withMenu.sideMenu, state.reward.sideMenuIds[0])
  assert.throws(() => run.chooseBonus(state, { relic: 'not_offered' }))
  assert.equal(run.chooseBonus(state, null).status, 'map')
  // 同じ器は二度出ない
  for (let seed = 1; seed <= 30; seed++) {
    const owned = RELICS.slice(0, 15).map(item => item.id)
    const ids = run.rollRelicChoices({ archetype: 'akami', relics: owned }, seeded(seed))
    assert.ok(ids.every(id => !owned.includes(id)))
    assert.equal(new Set(ids).size, ids.length)
  }
})

test('保存：第1段（満腹ライン版 version 2）の保存は器なしで読み、version 1 は読まない', () => {
  const v2 = run.createRun('niku', seeded(1))
  const { relics: _r, sideMenu: _s, ...rest } = v2
  assert.equal(run.parseRun(JSON.stringify({ ...rest, version: 1 })), null)
  const loaded = run.parseRun(JSON.stringify({ ...rest, version: 2 }))
  assert.equal(loaded.version, run.RUN_VERSION)
  assert.deepEqual(loaded.relics, [])
  assert.equal(loaded.sideMenu, null)
  assert.equal(run.parseRun(JSON.stringify({ ...v2, relics: ['bogus'] })), null)
})

test('図鑑の器：企画書8章の31種を並べ、実装済みの18種はすべて runRelics.ts の器', () => {
  const { RELIC_CATALOG, relicStatusCounts } = loadTs('src/features/catalog/relicCatalogData.ts')
  assert.equal(RELIC_CATALOG.length, 31)
  assert.equal(new Set(RELIC_CATALOG.map(entry => entry.id)).size, 31)
  assert.equal(RELIC_CATALOG.filter(entry => entry.kind === 'aimori').length, 6)
  assert.equal(RELIC_CATALOG.filter(entry => entry.kind === 'taisho').length, 7)
  for (const relic of RELICS) assert.ok(RELIC_CATALOG.some(entry => entry.id === relic.id && entry.status !== 'todo'), relic.name)
  for (const entry of RELIC_CATALOG.filter(item => item.status === 'todo')) assert.ok(!RELICS.some(relic => relic.id === entry.id))
  for (const entry of RELIC_CATALOG.filter(item => item.status !== 'done')) assert.ok(entry.note, `${entry.name}に足りないものの説明がありません`)
  const counts = relicStatusCounts()
  assert.equal(counts.done + counts.partial, RELICS.length)
  assert.equal(counts.todo, 13)
})

test('開始時の器：系統を選んだ直後に3つから1つ受け取り、それまで地図に進めない', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const state = run.createRun('hikari', seeded(seed))
    assert.equal(state.status, 'start_relic')
    assert.deepEqual(state.relics, [])
    assert.equal(state.startRelicIds.length, 3)
    assert.equal(new Set(state.startRelicIds).size, 3)
    assert.equal(RELICS.find(relic => relic.id === state.startRelicIds[0]).archetype, 'hikari', '1つは選んだ系統の器')
    assert.ok(state.startRelicIds.every(id => RELICS.some(relic => relic.id === id)), '通常の器だけ（大将の器は出さない）')
    assert.deepEqual(run.reachableNodeIds(state), [], '選ぶまで地図に進めない')
  }
  const state = run.createRun('niku', seeded(4))
  assert.throws(() => run.chooseStartRelic(state, 'not_offered'))
  const chosen = run.chooseStartRelic(state, state.startRelicIds[1])
  assert.equal(chosen.status, 'map')
  assert.deepEqual(chosen.relics, [state.startRelicIds[1]])
  assert.equal(chosen.startRelicIds, undefined)
  assert.deepEqual(run.reachableNodeIds(chosen), ['r0c0', 'r0c1', 'r0c2'])
  assert.throws(() => run.chooseStartRelic(chosen, state.startRelicIds[0]), '二度は選べない')
  // 地図は器の抽選の前に作るので、同じ乱数なら第2段までと同じ地図になる。
  assert.deepEqual(state.nodes, run.generateRunMap(seeded(4)))
})

test('開始時の器：選ぶ前に中断しても同じ3択で再開できる', () => {
  const state = run.createRun('akami', seeded(6))
  const saved = run.runForSave(state)
  const loaded = run.parseRun(JSON.stringify(saved))
  assert.equal(loaded.status, 'start_relic')
  assert.deepEqual(loaded.startRelicIds, state.startRelicIds)
  assert.equal(run.parseRun(JSON.stringify({ ...saved, startRelicIds: [] })), null)
  assert.equal(run.parseRun(JSON.stringify({ ...saved, startRelicIds: ['bogus'] })), null)
})

// ── 第3段：ハプニング・買い物・敵の個性・大将 ─────────────────────────────

test('地図：ハプニングと買い物のマスも出る', () => {
  const kinds = new Set()
  for (let seed = 1; seed <= 40; seed++) for (const node of run.generateRunMap(seeded(seed))) kinds.add(node.kind)
  for (const kind of ['battle', 'regular', 'rest', 'event', 'shop', 'boss']) assert.ok(kinds.has(kind), `${kind}のマスが出ない`)
})

/** 1段目の左を指定の種類のマスにして入る。 */
const enterAs = (kind, archetype = 'akami', random = seeded(5), patch = {}) => {
  const state = { ...begin(archetype, random), ...patch }
  const nodes = state.nodes.map(node => node.id === 'r0c0' ? { ...node, kind, enemy: undefined } : node)
  return run.enterNode({ ...state, nodes }, 'r0c0', random)
}

test('ハプニング：入ると1つ選ばれ、同じものはなるべく出ない', () => {
  const state = enterAs('event')
  assert.equal(state.status, 'event')
  assert.ok(RUN_EVENTS.some(event => event.id === state.event.id))
  assert.deepEqual(state.seenEvents, [state.event.id])
  const seen = RUN_EVENTS.map(event => event.id).filter(id => id !== 'birthday')
  const only = enterAs('event', 'akami', seeded(9), { seenEvents: seen })
  assert.equal(only.event.id, 'birthday', '未出のものを優先する')
})

test('ハプニング：全選択肢が選べて、結果を見てから地図へ戻る', () => {
  for (const event of RUN_EVENTS) {
    for (const choice of event.choices) {
      const start = { ...enterAs('event', 'niku', seeded(3), { gold: 500 }), event: { id: event.id } }
      assert.equal(events.eventChoiceBlocked(start, choice.id), undefined, `${event.id}:${choice.id}が選べない`)
      const done = events.resolveEvent(start, choice.id, seeded(11))
      assert.equal(typeof done.event.result, 'string', `${event.id}:${choice.id}の結果がない`)
      assert.ok(done.belly >= 0 && done.belly < run.MAX_RUN_BELLY)
      assert.ok(done.gold >= 0)
      assert.ok(run.runDeckCards(done).length === done.deck.length, `${event.id}:${choice.id}で読めない寿司が入った`)
      assert.throws(() => events.resolveEvent(done, choice.id), '2回は選べない')
      const back = events.leaveEvent(done)
      assert.equal(back.status, 'map')
      assert.equal(back.event, undefined)
    }
  }
})

test('ハプニング：お金やデッキが足りない選択肢は選べない', () => {
  const poor = { ...enterAs('event'), gold: 0, event: { id: 'gacha' } }
  assert.ok(events.eventChoiceBlocked(poor, 'spin'))
  assert.throws(() => events.resolveEvent(poor, 'spin'))
  const thin = { ...enterAs('event'), deck: run.STARTER_DECK.slice(0, 10), event: { id: 'kodomo' } }
  assert.ok(events.eventChoiceBlocked(thin, 'give'))
  const gari = events.resolveEvent({ ...enterAs('event'), event: { id: 'gari_tabehoudai' } }, 'take')
  assert.equal(gari.nextBattleGari, 2)
})

test('買い物：下げてもらうは100円から50円ずつ上がり、10枚未満にはできない', () => {
  let state = enterAs('shop', 'akami', seeded(5), { gold: 1000 })
  assert.equal(state.status, 'shop')
  assert.equal(run.removeCost(state), 100)
  state = run.removeCardAtShop(state, 0)
  assert.equal(state.deck.length, 12)
  assert.equal(state.gold, 900)
  assert.equal(run.removeCost(state), 150)
  state = run.removeCardAtShop(state, 0)
  state = run.removeCardAtShop(state, 0)
  assert.equal(state.deck.length, 10)
  assert.equal(state.gold, 1000 - 100 - 150 - 200)
  assert.equal(run.canRemoveCard(state), false)
  assert.throws(() => run.removeCardAtShop(state, 0))
  assert.equal(run.leaveShop(state).status, 'map')
})

test('買い物：回転レーンで買った寿司（訳あり・レアのマヨコーン含む）をデッキに入れ、残金を持ち金にする', () => {
  const state = enterAs('shop', 'akami', seeded(5), { gold: 800 })
  const bought = [byId('maguro'), createUnluckyCard(byId('tuna_gunkan')), createRareCorn(0)]
  const after = run.finishShopLane(state, bought, 'fries', 120)
  assert.deepEqual(after.deck.slice(-3), ['maguro', `tuna_gunkan${run.WAKEARI_SUFFIX}`, run.RARE_CORN_ID])
  assert.equal(after.gold, 120)
  assert.equal(after.sideMenu, 'fries')
  assert.throws(() => run.finishShopLane(after, [], null, 0), '回転レーンは1回だけ')
  const cards = run.runDeckCards(after).slice(-3)
  assert.equal(cards[1].attack, Math.floor(byId('tuna_gunkan').attack / 2), '訳ありは攻撃半分')
  assert.equal(cards[2].attack, 12)
  assert.equal(run.runCard(run.aburiDeckId(`tuna_gunkan${run.WAKEARI_SUFFIX}`)).aburi, true, '炙ると訳ありが直る')
  assert.equal(run.finishShopLane(state, [], null, 99999).gold, 800, '残金は持ち金を超えない')
})

test('敵の個性：大食い客には顔ぶれがあり、ギミックが満腹ラインに入る', () => {
  const names = new Set()
  for (let i = 0; i < 60; i++) {
    // 最初の乱数で顔ぶれが決まるので、0〜1を均等に試す。
    const enemy = run.enemyForRow(4, 'battle', () => (i + 0.5) / 60)
    const character = ENEMY_CHARACTERS.find(item => item.id === enemy.character)
    assert.ok(character)
    names.add(character.id)
    assert.equal(enemy.maxBelly, run.ENEMY_MAX_BELLY_BY_ROW[4] + (character.gimmick.maxBellyDelta ?? 0))
    assert.equal(enemy.aburiRate, 0.2)
  }
  assert.equal(names.size, ENEMY_CHARACTERS.length)
  assert.equal(run.enemyForRow(0, 'battle', seeded(1)).aburiRate, undefined, '序盤は炙りなし')
  assert.equal(run.enemyForRow(7, 'battle', seeded(1)).aburiRate, 0.4)
})

test('敵の個性：追加のガリはCPU側だけ、炙り率で敵デッキの一部が炙り版になる', () => {
  const deck = Array(13).fill(byId('tamago'))
  const state = createMatch({ mode: 'cpu', deck, cpuDeckId: 'akami', extraGari: { 2: 2 },
    runMods: { 2: { aburiRate: 0.5 } } }, seeded(7))
  assert.equal(state.players[2].gari, rules.INIT_GARI[2] + 2)
  assert.equal(state.players[1].gari, rules.INIT_GARI[1])
  const cpuCards = [...state.players[2].hand, ...state.players[2].deck]
  const aburi = cpuCards.filter(card => card.aburi).length
  assert.ok(aburi > 0 && aburi < cpuCards.length, `炙り版が一部だけ混ざる（${aburi}/${cpuCards.length}）`)
  assert.ok([...state.players[1].hand, ...state.players[1].deck].every(card => !card.aburi), '自分のデッキは変えない')
})

test('大将：3ターンごとに本日のおすすめ（炙った高級寿司・0AP）を手札に加える', () => {
  let state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'challenge',
    maxBelly: { 2: TAISHO.maxBelly }, runMods: { 2: { boss: { name: '大将', osusumeEvery: 3, tea: true } } } }, seeded(2))
  assert.equal(state.players[2].maxBelly, 150)
  const osusume = []
  for (let i = 0; i < 40 && state.turn < 7; i++) {
    const active = state.activePlayerId
    if (state.phase === 'defending') {
      state = transitionMatch(state, { type: 'respond_defense', playerId: state.pendingAttack.defenderId, useGari: false }, seeded(i)).state
      continue
    }
    const result = transitionMatch(state, { type: 'end_turn', playerId: active }, seeded(i))
    state = result.state
    for (const event of result.events) if (event.type === 'combo' && event.comboId === 'taisho_osusume') osusume.push(state.turn)
  }
  assert.deepEqual(osusume, [3, 6])
  const gift = state.players[2].hand.filter(card => card.cost === 0 && card.aburi)
  assert.ok(gift.length >= 1, '0APの炙り寿司が手札にある')
})

test('大将：お腹が100を超えた最初の1回だけ、締めのお茶でお腹−30', () => {
  let state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('otoro')), cpuDeckId: 'challenge',
    maxBelly: { 2: 150 }, initialBelly: { 2: 95 }, runMods: { 2: { boss: { name: '大将', osusumeEvery: 3, tea: true } } } }, () => 0.999)
  state = { ...state, players: { ...state.players, 1: { ...state.players[1], ap: 5 } } }
  const result = transitionMatch(state, play(state, 'otoro'), () => 0.5)
  state = result.state
  let after = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5)
  state = after.state
  if (state.phase === 'defending') {
    after = transitionMatch(state, { type: 'respond_defense', playerId: 2, useGari: false }, () => 0.5)
    state = after.state
  }
  assert.equal(state.players[2].teaUsed, true)
  assert.ok(after.events.some(event => event.type === 'combo' && event.comboId === 'taisho_ocha'))
  assert.ok(state.players[2].belly < 100, `お茶でお腹が減る（${state.players[2].belly}）`)
  const plain = createMatch({ mode: 'cpu', deck: [byId('tamago')], cpuDeckId: 'challenge' }, () => 0.5)
  assert.equal(plain.players[2].mods, undefined, '通常の挑戦CPUには大将ルールがない')
})

test('満腹ラインが低い敵にも「相手のお腹○以上」が効く（焼肉寿司・天ぷら）', () => {
  assert.equal(rules.boostBelly(25, 50), 50)
  assert.equal(rules.boostBelly(42, 100), 42, '満腹ライン100ならそのまま')
  const yakiniku = rules.toField(byId('yakiniku'))
  const ebiTen = rules.toField(byId('ebi_ten'))
  // 満腹ライン50の敵のお腹25は「半分」なので、焼肉寿司（50以上）は効き、えび天（60以上）はまだ効かない。
  assert.equal(rules.calcFieldDmg([yakiniku], {}, 0, rules.boostBelly(25, 50)), byId('yakiniku').attack + 2)
  assert.equal(rules.calcFieldDmg([ebiTen], {}, 0, rules.boostBelly(25, 50)), byId('ebi_ten').attack)
  assert.equal(rules.calcFieldDmg([ebiTen], {}, 0, rules.boostBelly(30, 50)), byId('ebi_ten').attack + 5)
  // エンジン：満腹ライン50・お腹25の敵へのターン終了攻撃に焼肉寿司の+2が乗る。
  let state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('yakiniku')), cpuDeckId: 'weak',
    maxBelly: { 2: 50 }, initialBelly: { 2: 25 } }, () => 0.999)
  state = { ...state, players: { ...state.players, 1: { ...state.players[1], ap: 3 } } }
  state = transitionMatch(state, play(state, 'yakiniku'), () => 0.5).state
  const before = state.players[2].belly
  let result = transitionMatch(state, { type: 'end_turn', playerId: 1 }, () => 0.5)
  if (result.state.phase === 'defending') result = transitionMatch(result.state, { type: 'respond_defense', playerId: 2, useGari: false }, () => 0.5)
  const dealt = result.events.filter(event => event.type === 'damage' && event.playerId === 2).reduce((sum, event) => sum + event.amount, 0)
  assert.equal(dealt, byId('yakiniku').attack + 2, `焼肉寿司の強化込みで${byId('yakiniku').attack + 2}（実際は${dealt}、開始時お腹${before}）`)
})

test('はしごの試合は自分だけ手札上限10枚。CPUと通常対戦は7枚のまま', () => {
  let state = createMatch({ mode: 'cpu', deck: Array(20).fill(byId('tamago')), cpuDeckId: 'weak',
    openingHand: { 1: run.RUN_OPENING_HAND }, drawBonus: { 1: run.RUN_DRAW_PER_TURN - 1 },
    handLimit: { 1: run.RUN_HAND_LIMIT } }, () => 0.999)
  assert.equal(state.players[1].handLimit, 10)
  assert.equal(state.players[2].handLimit, undefined)
  const sizes = []
  for (let i = 0; i < 12 && state.phase !== 'over'; i++) {
    if (state.phase === 'defending') {
      state = transitionMatch(state, { type: 'respond_defense', playerId: state.pendingAttack.defenderId, useGari: false }, () => 0.5).state
      continue
    }
    const active = state.activePlayerId
    state = transitionMatch(state, { type: 'end_turn', playerId: active }, () => 0.5).state
    if (active === 1) sizes.push(state.players[1].hand.length)
  }
  assert.deepEqual(sizes.slice(0, 3), [8, 10, 10], '6→8→10で止まる')
  assert.ok(state.players[2].hand.length <= rules.HAND_LIMIT)
  assert.equal(createMatch({ mode: 'cpu', deck: [byId('tamago')] }, () => 0.5).players[1].handLimit, undefined)
})

test('デバッグ：好きなマスへ飛び、抜けたら今の続きから進める', () => {
  const start = begin('akami', seeded(4))
  const shop = debug.debugJump(start, 'shop', seeded(1))
  assert.equal(shop.status, 'shop')
  const node = shop.nodes.find(item => item.id === shop.currentNodeId)
  assert.equal(node.debug, true)
  assert.equal(run.leaveShop(shop).status, 'map')
  assert.deepEqual(run.reachableNodeIds(run.leaveShop(shop)), ['r0c0', 'r0c1', 'r0c2'], '入口から飛んだら1段目へ')
  const event = debug.debugJump(start, 'event', seeded(1), 'gacha')
  assert.equal(event.event.id, 'gacha')
  for (const kind of ['battle', 'regular']) {
    const battle = debug.debugJump(start, kind, seeded(2))
    assert.equal(battle.status, 'battle')
    assert.ok(battle.nodes.find(item => item.id === battle.currentNodeId).enemy)
    const won = debug.debugFinishBattle(battle, true, seeded(3))
    assert.equal(won.status, 'reward')
    assert.equal(debug.debugFinishBattle(battle, false).status, 'lost')
  }
  const boss = debug.debugJump(start, 'boss')
  assert.equal(boss.currentNodeId, run.BOSS_NODE_ID)
  assert.equal(boss.status, 'battle')
  // 仮のマスは次に飛ぶと置き換わり、増え続けない。
  const twice = debug.debugJump(debug.debugJump(start, 'rest'), 'rest')
  assert.equal(twice.nodes.filter(item => item.debug).length, 2)
  const thrice = debug.debugJump(run.takeRest(twice), 'rest')
  assert.equal(thrice.nodes.filter(item => item.debug).length, 2)
})

test('デバッグ：持ち金・お腹・器・寿司・炙り・次の幕', () => {
  let state = begin('hikari', seeded(5))
  state = debug.debugGold(state, 500)
  assert.equal(state.gold, 500)
  assert.equal(debug.debugBelly(state, 150).belly, run.MAX_RUN_BELLY - 1)
  state = debug.debugAddRelic(state, 'toishi')
  assert.deepEqual(debug.debugAddRelic(state, 'toishi').relics, ['toishi'], '同じ器は重ねない')
  state = debug.debugAddCard(state, run.aburiDeckId('maguro'))
  assert.equal(run.runDeckCards(state).at(-1).aburi, true)
  const all = debug.debugAburiAll(state)
  assert.ok(all.deck.every(id => !run.canAburiDeckId(id)))
  const next = debug.debugNextAct(state, seeded(6))
  assert.equal(next.act, 2)
  assert.equal(debug.debugNextAct({ ...state, act: 3 }).act, 3, '最後の幕より先へは行かない')
})

test('机の寿司を下げる・手札の寿司を残す：寿司はしごの自分の手番だけ、0APでできる', () => {
  const deck = Array(13).fill(byId('gyutan'))
  let state = createMatch({ mode: 'cpu', deck, cpuDeckId: 'weak', allowDiscard: true }, () => 0.999)
  state = { ...state, players: { ...state.players, 1: { ...state.players[1], ap: 5 } } }
  state = transitionMatch(state, play(state, 'gyutan'), () => 0.5).state
  const ham = state.players[1].field.find(card => card.id === NAMAHAM_CARD.id)
  assert.ok(ham, '牛タンで生ハムが机に出る')
  const ap = state.players[1].ap
  const lowered = transitionMatch(state, { type: 'discard_field', playerId: 1, fieldId: ham.fid }, () => 0.5)
  assert.equal(lowered.error, undefined)
  assert.equal(lowered.state.players[1].field.some(card => card.fid === ham.fid), false)
  assert.equal(lowered.state.players[1].ap, ap, 'APは減らない')
  const handCard = lowered.state.players[1].hand[0]
  const left = transitionMatch(lowered.state, { type: 'discard_hand', playerId: 1, cardInstanceId: handCard.instanceId }, () => 0.5)
  assert.equal(left.error, undefined)
  assert.equal(left.state.players[1].hand.length, lowered.state.players[1].hand.length - 1)
  assert.equal(transitionMatch(left.state, { type: 'discard_hand', playerId: 2, cardInstanceId: left.state.players[2].hand[0].instanceId }).error, 'not_your_turn')
  assert.equal(transitionMatch(left.state, { type: 'discard_field', playerId: 1, fieldId: 'nope' }).error, 'card_not_on_field')
  // 通常のCPU戦・オンライン（allowDiscard なし）ではできない。
  const plain = createMatch({ mode: 'cpu', deck, cpuDeckId: 'weak' }, () => 0.999)
  assert.equal(transitionMatch(plain, { type: 'discard_hand', playerId: 1, cardInstanceId: plain.players[1].hand[0].instanceId }).error, 'discard_not_allowed')
})

test('シールド：回復・効果なし・インフラ系の寿司で張り、相手の攻撃を受けて、次の自分の手番で消える', () => {
  assert.equal(rules.shieldOf(byId('tamago')), 4)
  assert.equal(rules.shieldOf(toAburi(byId('tamago'))), 6, '炙りは1.5倍（切り上げ）')
  assert.equal(rules.shieldOf(byId('maguro')), 0, '攻撃役の寿司には付かない')
  let state = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('uni_gunkan')), cpuDeckId: 'weak', shieldEnabled: true }, () => 0.999)
  state = { ...state, players: { ...state.players, 1: { ...state.players[1], ap: 5 } } }
  state = transitionMatch(state, play(state, 'uni_gunkan'), () => 0.5).state
  assert.equal(state.players[1].shield, 6)
  // 相手の攻撃をシールドが先に受ける。
  const hit = structuredClone(state)
  const before = hit.players[1].belly
  hit.players[2].field = [rules.toField(byId('maguro'))]
  hit.activePlayerId = 2
  let result = transitionMatch(hit, { type: 'end_turn', playerId: 2 }, () => 0.5)
  if (result.state.phase === 'defending') result = transitionMatch(result.state, { type: 'respond_defense', playerId: 1, useGari: false }, () => 0.5)
  const dealt = result.events.filter(event => event.type === 'damage' && event.playerId === 1).reduce((sum, event) => sum + event.amount, 0)
  assert.equal(dealt, byId('maguro').attack - 6, `マグロ${byId('maguro').attack}のうち6をシールドが受ける（お腹は${before}から）`)
  assert.ok(result.state.log.some(line => line.includes('シールドが 6 を防いだ')))
  assert.equal(result.state.players[1].shield, 0, '自分の手番の始めに消える')
  // CPUは同じ寿司を出しても張らない。
  const cpu = structuredClone(state)
  cpu.activePlayerId = 2
  cpu.players[2].hand = [{ ...byId('uni_gunkan'), instanceId: 'cpu-uni' }]
  cpu.players[2].ap = 5
  assert.equal(transitionMatch(cpu, { type: 'play_card', playerId: 2, cardInstanceId: 'cpu-uni' }, () => 0.5).state.players[2].shield, undefined)
  const plain = createMatch({ mode: 'cpu', deck: Array(13).fill(byId('tamago')), cpuDeckId: 'weak' }, () => 0.999)
  assert.equal(transitionMatch(plain, play(plain, 'tamago'), () => 0.5).state.players[1].shield, undefined, '通常のCPU戦では張らない')
})

console.log(`\n${passed}件のテストに合格しました`)
