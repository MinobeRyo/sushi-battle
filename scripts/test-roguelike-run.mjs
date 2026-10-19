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
  assert.deepEqual([...run.ARCHETYPE_STARTERS.akami].sort(), ['chutoro', 'maguro', 'otoro'], '赤身は三種盛りが揃う')
  assert.ok(run.ARCHETYPE_STARTERS.niku.includes('yakiniku'), '肉寿司は焼肉寿司から始まる')
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
  const zuki = make('aburi_zuki')
  assert.ok([...zuki.players[2].hand, ...zuki.players[2].deck].every(card => card.aburi))
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
  // 皿積み：机の寿司1枚につき、すべての攻撃+1
  const plates = [byId('natto_maki'), byId('kappa_maki')].map(card => rules.toField(applyCardMods(card, { skill: 'sarazumi' })))
  assert.equal(rules.calcFieldDmg(plates, {}, 0, 0), (3 + 2) + (1 + 2))
})

test('常連さんの報酬：寿司3枚（炙り1枚）＋器3つかサイドメニュー3品', () => {
  let state = run.createRun('hikari', seeded(5))
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

console.log(`\n${passed}件のテストに合格しました`)
