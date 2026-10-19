#!/usr/bin/env node
// 寿司はしご（ローグライク）のラン進行と、おかわり・開始お腹のエンジン対応を検証する。
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const run = loadTs('src/game/run.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const { HAND_LIMIT } = loadTs('src/game/battleRules.ts')

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

test('序盤の敵は最弱CPUで満腹ライン50、先へ進むほど上がり大将は100', () => {
  assert.deepEqual(run.enemyForRow(0, 'battle', () => 0), { cpuDeckId: 'weak', maxBelly: 50, label: '大食い客' })
  assert.equal(run.enemyForRow(2, 'battle', () => 0).cpuDeckId, 'weak')
  assert.notEqual(run.enemyForRow(3, 'battle', () => 0).cpuDeckId, 'weak')
  const caps = Array.from({ length: run.RUN_ROWS }, (_, row) => run.enemyForRow(row, 'battle', () => 0).maxBelly)
  assert.ok(caps.every((cap, i) => i === 0 || cap >= caps[i - 1]), '満腹ラインは下がらない')
  assert.equal(run.enemyForRow(run.RUN_ROWS, 'boss', () => 0).maxBelly, 100)
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

test('最初のデッキは汎用10枚＋系統3枚の13枚', () => {
  for (const { id } of run.RUN_ARCHETYPES) {
    const state = run.createRun(id, seeded(3))
    assert.equal(state.deck.length, 13)
    assert.equal(run.runDeckCards(state).length, 13, `${id}の寿司IDが存在しません`)
    assert.ok(run.ARCHETYPE_STARTERS[id].every(cardId => byId(cardId).archetype.includes(id)))
  }
})

test('マスは隣の道にしか進めず、お茶でお腹が30減る', () => {
  let state = run.createRun('akami', seeded(7))
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
  let state = run.enterNode(run.createRun('niku', seeded(2)), 'r0c0')
  state = run.finishBattle(state, true, 20, seeded(5))
  assert.ok(state.reward.gold >= 250 && state.reward.gold <= 350)
  assert.equal(state.gold, state.reward.gold)
  const taken = run.chooseReward(state, state.reward.cardIds[2])
  assert.equal(taken.deck.length, 14)
  assert.equal(taken.deck.at(-1), state.reward.cardIds[2])
  assert.equal(taken.status, 'map')
  assert.throws(() => run.chooseReward(state, 'otoro_not_offered'))
  const skipped = run.chooseReward(state, null)
  assert.equal(skipped.deck.length, 13)
  assert.equal(skipped.gold, state.gold + run.SKIP_REWARD_GOLD)
})

test('負けるとラン終了、大将に勝つとクリア', () => {
  const state = run.enterNode(run.createRun('kaisen', seeded(9)), 'r0c2')
  assert.equal(run.finishBattle(state, false, 100).status, 'lost')
  const atBoss = { ...state, currentNodeId: run.BOSS_NODE_ID, visited: [...state.visited, run.BOSS_NODE_ID] }
  const won = run.finishBattle(atBoss, true, 50)
  assert.equal(won.status, 'won')
  assert.equal(won.reward, null)
})

test('保存は対戦の手前に戻し、壊れたデータは読まない', () => {
  let state = run.enterNode(run.createRun('makimono', seeded(4)), 'r0c0')
  state = run.chooseReward(run.finishBattle(state, true, 10, seeded(1)), null)
  const next = state.nodes.find(node => node.id === state.currentNodeId).next[0]
  const inBattle = run.enterNode(state, next)
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

console.log(`\n${passed}件のテストに合格しました`)
