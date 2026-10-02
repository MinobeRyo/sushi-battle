#!/usr/bin/env node
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { battleStatusDetails, cardAttackBuff } = loadTs('src/features/battle/battleStatusModel.ts')
const { CARDS } = loadTs('src/data/cards.ts')
const { toField, calcFieldDmg } = loadTs('src/game/battleRules.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const card = id => {
  const found = CARDS.find(c => c.id === id)
  assert.ok(found, `カード ${id} が必要です`)
  return found
}
const side = (overrides = {}) => ({
  summonedIds: [], combosFired: [], field: [], attackBuff: {}, drawBonus: 0,
  kiretaStack: 0, kiretaSpent: false, nikuMatsuri: false, sacrificedThisTurn: 0,
  digestStopTurns: 0, apNextBonus: 0, thisTurnArch: {}, ...overrides,
})
const effect = (player, id) => battleStatusDetails(player).effects.find(item => item.id === id)
const combo = (player, id) => battleStatusDetails(player).combos.find(item => item.id === id)
const keepOrder = () => 0.999
const match = ids => {
  const state = createMatch({
    mode: 'two_player', matchId: 'status',
    deck: [...ids.map(card), ...Array(8).fill(card('tamago'))],
    p2Deck: Array(10).fill(card('tamago')),
  }, keepOrder)
  state.players[1].ap = 30
  state.players[1].maxAP = 30
  return state
}
const step = (state, action) => {
  const result = transitionMatch(state, action, keepOrder)
  assert.equal(result.error, undefined)
  // このテストは攻撃の解決後の状態表示を確認するため、防御は温存して進める。
  if (result.state.phase === 'defending') {
    const defended = transitionMatch(result.state, {
      type: 'respond_defense', playerId: result.state.pendingAttack.defenderId, useGari: false,
    }, keepOrder)
    assert.equal(defended.error, undefined)
    return defended.state
  }
  return result.state
}
const play = (state, id, sacrificeCount = 0) => step(state, {
  type: 'play_card', playerId: state.activePlayerId, sacrificeCount,
  cardInstanceId: state.players[state.activePlayerId].hand.find(c => c.id === id).instanceId,
})
const end = state => step(state, { type: 'end_turn', playerId: state.activePlayerId })
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

test('切れ味0も明示し、存在しない強化は有効効果に出さない', () => {
  const details = battleStatusDetails(side())
  assert.deepEqual(details.effects.map(item => item.id), ['kireta'])
  assert.equal(details.effects[0].value, '0')
  assert.equal(details.combos.length, 6)
})

test('コハダの後は攻撃に残る切れ味と再消費不可を区別し、攻撃後の0へ追従する', () => {
  let state = match(['kohada'])
  state.players[1].kiretaStack = 4
  state = play(state, 'kohada')
  const pending = effect(state.players[1], 'kireta')
  assert.equal(pending.value, '4（ターン終了後0）')
  assert.match(pending.description, /攻撃には \+4/)
  assert.match(pending.description, /再消費できません/)
  state = end(state)
  assert.equal(effect(state.players[1], 'kireta').value, '0')
})

test('シメサバの2消費は即時減少として表示し、全消費待ちとは扱わない', () => {
  let state = match(['shime_saba'])
  state.players[1].kiretaStack = 4
  state = play(state, 'shime_saba')
  const item = effect(state.players[1], 'kireta')
  assert.equal(item.value, '2')
  assert.doesNotMatch(item.description, /再消費できません/)
})

test('次APは複数の予約を加算し、次の自分の手番に適用された後は効果一覧から消える', () => {
  let state = play(play(match(['inari', 'inari']), 'inari'), 'inari')
  assert.equal(effect(state.players[1], 'next-ap').value, '+2')
  assert.match(effect(state.players[1], 'next-ap').description, /現在のAPには加算されず/)
  state = end(end(state))
  assert.equal(state.players[1].maxAP, 5)
  assert.equal(effect(state.players[1], 'next-ap'), undefined)
})

test('消化停止は受けた側の次の消化を示し、実際にスキップされた後は消える', () => {
  let state = play(match(['duke_maguro']), 'duke_maguro')
  assert.equal(effect(state.players[1], 'digest-stop'), undefined)
  assert.equal(effect(state.players[2], 'digest-stop').value, '次の1回')
  state = end(state)
  assert.equal(effect(state.players[2], 'digest-stop'), undefined)
})

test('机の消化カードの枚数に応じて追加消化を集計し、退場したカードは数えない', () => {
  const two = side({ field: [toField(card('kappa_maki'), 'a'), toField(card('kappa_maki'), 'b')] })
  assert.equal(effect(two, 'digest-boost').value, '+4')
  assert.equal(effect({ ...two, field: two.field.slice(1) }, 'digest-boost').value, '+2')
  assert.equal(effect(side(), 'digest-boost'), undefined)
})

test('赤身の進捗は指定3種類を数え、同じマグロの重複や他のマグロ系では増えない', () => {
  const st = side({ summonedIds: ['maguro', 'maguro', 'duke_maguro', 'chutoro'] })
  assert.equal(combo(st, 'akami_mori').value, '2/3種')
})

test('永続攻撃・ドローバフは机が空でも残り、発動履歴だけでは有効数値を捏造しない', () => {
  const st = side({
    combosFired: ['akami_mori', 'maki_comp_3'],
    attackBuff: { マグロ: 2, えび: 0 }, drawBonus: 1,
  })
  assert.equal(effect(st, 'attack:マグロ').value, '+2')
  assert.equal(effect(st, 'attack:えび'), undefined)
  assert.equal(effect(st, 'draw').value, '+1')
  assert.match(effect(st, 'draw').description, /ターン終了時/)
  assert.equal(combo(st, 'maki_comp_3').value, '達成済')
  assert.equal(effect(side({ combosFired: ['akami_mori'] }), 'attack:マグロ'), undefined)
})

test('軍艦倍率は累積履歴でなく現在の巻物5枚が条件で、軍艦も巻物として数える', () => {
  const field = Array.from({ length: 5 }, (_, i) => toField(card('corn_gunkan'), `${i}`))
  const st = side({ field })
  assert.equal(combo(st, 'maki_comp_5').value, '5/5枚')
  assert.equal(effect(st, 'gunkan').value, '×1.5')
  assert.equal(effect({ ...st, field: field.slice(1), combosFired: ['maki_comp_5'] }, 'gunkan'), undefined)
})

test('大葉進捗は大葉トッピングの累積で、重複を含め、普通の光り物は含めない', () => {
  const st = side({ summonedIds: ['saba', 'aji', 'saba_ohba', 'saba_ohba', 'unknown'] })
  assert.equal(combo(st, 'hikari_zanmai').value, '大葉 2/3枚')
  assert.equal(combo({ ...st, combosFired: ['hikari_zanmai'], kiretaStack: 0 }, 'hikari_zanmai').value, '達成済')
})

test('肉祭りは同ターンの生贄を数え、即時攻撃の発動済み表示を手番終了で消す', () => {
  let state = play(match(['roast_beef', 'karubi', 'wagyu']), 'roast_beef')
  assert.equal(combo(state.players[1], 'niku_matsuri').value, '0/2体（今ターン）')
  state = play(state, 'karubi', 1)
  assert.equal(combo(state.players[1], 'niku_matsuri').value, '1/2体（今ターン）')
  assert.equal(effect(state.players[1], 'niku'), undefined)
  state = play(state, 'wagyu', 1)
  assert.equal(combo(state.players[1], 'niku_matsuri').value, '今ターン発動済')
  assert.equal(effect(state.players[1], 'niku').value, '今ターン発動済')
  assert.match(effect(state.players[1], 'niku').description, /即時5ダメージ/)
  assert.equal(state.players[2].belly, 5)
  state = end(state)
  assert.equal(effect(state.players[1], 'niku'), undefined)
  assert.equal(combo(state.players[1], 'niku_matsuri').value, '0/2体（今ターン）')
})

test('肉寿司を複数召喚しただけでは肉祭りの生贄進捗を増やさない', () => {
  const state = play(play(match(['karubi', 'wagyu']), 'karubi'), 'wagyu')
  assert.equal(combo(state.players[1], 'niku_matsuri').value, '0/2体（今ターン）')
  assert.equal(effect(state.players[1], 'niku'), undefined)
  assert.equal(combo(side({ sacrificedThisTurn: undefined, thisTurnArch: { niku: 4 } }), 'niku_matsuri').value, '0/2体（今ターン）')
})

test('海鮮ペア候補は机にいる未使用カードだけを数え、発動済みカードを次の相方にしない', () => {
  let state = play(match(['ika', 'tako']), 'ika')
  assert.equal(combo(state.players[1], 'umi_zanmai').value, '未使用 いか1・たこ0')
  state = play(state, 'tako')
  assert.equal(state.players[1].field.length, 2)
  assert.equal(combo(state.players[1], 'umi_zanmai').value, '未使用 いか0・たこ0')
  assert.match(combo(state.players[1], 'umi_zanmai').description, /新しいペアなら何度でも/)
})

test('状態を変更せず公開情報だけから生成し、手札や山札にアクセスしない', () => {
  const st = freeze(side({ kiretaStack: 2, attackBuff: { マグロ: 2 }, field: [toField(card('ika'))] }))
  const before = structuredClone(st)
  const publicOnly = new Proxy(st, {
    get(target, key) {
      assert.ok(key !== 'hand' && key !== 'deck', '非公開情報へのアクセスは禁止')
      return Reflect.get(target, key)
    },
  })
  const details = battleStatusDetails(publicOnly)
  assert.equal(effect(publicOnly, 'kireta').value, '2')
  assert.deepEqual(st, before)
  assert.doesNotThrow(() => JSON.stringify(details))
})

for (const viewer of [1, 2]) test(`P${viewer}視点でローカル・オンラインの相手公開情報を取り違えない`, () => {
  const { toBattleView } = loadTs('src/features/battle/battleView.ts')
  const { toOnlineBattleView } = loadTs('src/features/online/onlineBattleView.ts')
  const state = match(['inari'])
  Object.assign(state.players[1], {
    ap: 2, maxAP: 7, kiretaStack: 4, kiretaSpent: false,
    digestStopTurns: 1, apNextBonus: 2, thisTurnArch: { niku: 1 }, sacrificedThisTurn: 1,
    attackBuff: { マグロ: 2 },
  })
  Object.assign(state.players[2], {
    ap: 1, maxAP: 5, kiretaStack: 6, kiretaSpent: true,
    digestStopTurns: 0, apNextBonus: 1, thisTurnArch: { makimono: 2 },
    attackBuff: {},
  })
  const own = state.players[viewer]
  const enemy = state.players[viewer === 1 ? 2 : 1]
  const { deck: ownDeck, ...you } = own
  const { hand: enemyHand, deck: enemyDeck, ...opponent } = enemy
  const publicMatch = {
    matchId: state.matchId, revision: state.revision, activePlayerId: state.activePlayerId,
    turn: state.turn, phase: state.phase, winnerId: state.winnerId, log: state.log,
    you: { ...you, deckCount: ownDeck.length },
    opponent: { ...opponent, handCount: enemyHand.length, deckCount: enemyDeck.length },
  }
  for (const view of [toBattleView(state, viewer, 'player', null), toOnlineBattleView(publicMatch, 'player')]) {
    assert.equal(view.activePlayer, viewer)
    assert.deepEqual([
      view.cAP, view.cMaxAP, view.cKiretaStack, view.cKiretaSpent,
      view.cDigestStopTurns, view.cApNextBonus, view.cThisTurnArch, view.cAttackBuff, view.cSacrificedThisTurn,
    ], [
      enemy.ap, enemy.maxAP, enemy.kiretaStack, enemy.kiretaSpent,
      enemy.digestStopTurns, enemy.apNextBonus, enemy.thisTurnArch, enemy.attackBuff, enemy.sacrificedThisTurn,
    ])
    assert.deepEqual([
      view.pAP, view.pMaxAP, view.pKiretaStack, view.pKiretaSpent,
      view.pDigestStopTurns, view.pApNextBonus, view.pThisTurnArch, view.pAttackBuff, view.pSacrificedThisTurn,
    ], [
      own.ap, own.maxAP, own.kiretaStack, own.kiretaSpent,
      own.digestStopTurns, own.apNextBonus, own.thisTurnArch, own.attackBuff, own.sacrificedThisTurn,
    ])
  }
})


test('太巻きの兼用ネタの攻撃強化は机の実効攻撃と同じ最大値を表示する', () => {
  const futomaki = card('futomaki')
  for (const [buffs, expected] of [
    [{ マグロ: 2 }, 2],
    [{ マグロ: 2, えび: 3 }, 3],
    [{ 太巻き: 5, マグロ: 2, えび: 3 }, 5],
    [{ サーモン: 8 }, 0],
  ]) {
    assert.equal(cardAttackBuff(futomaki, buffs), expected)
    assert.equal(futomaki.attack + cardAttackBuff(futomaki, buffs), calcFieldDmg([toField(futomaki)], buffs))
  }
})

test('通常のネタはそのbaseだけの強化を表示し、他のネタの強化を混ぜない', () => {
  const maguro = card('maguro')
  assert.equal(cardAttackBuff(maguro, { マグロ: 2, えび: 9 }), 2)
  assert.equal(cardAttackBuff(maguro, { えび: 9 }), 0)
  assert.equal(cardAttackBuff(maguro, {}), 0)
})
