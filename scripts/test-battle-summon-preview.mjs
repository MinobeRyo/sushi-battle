import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const { toBattleView } = loadTs('src/features/battle/battleView.ts')
const { previewBattleSummon } = loadTs('src/features/battle/battleSummonPreview.ts')
const { calcFieldDmg, toField, makimonoCount, MAKI_COMP_5, hasNamahamuAura } = loadTs('src/game/battleRules.ts')
const card = id => {
  const found = id === NAMAHAM_CARD.id ? NAMAHAM_CARD : CARDS.find(item => item.id === id)
  assert.ok(found, id)
  return found
}
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(freeze)
  }
  return value
}
const make = (id, field = []) => {
  const deck = Array(10).fill(card('tamago'))
  const state = createMatch({ mode: 'two_player', matchId: 'summon-preview', deck, p2Deck: deck }, () => .5)
  state.players[1].hand = [{ ...card(id), instanceId: 'selected' }]
  state.players[1].field = field.map((id, index) => toField(card(id), `own-${index}`))
  state.players[1].ap = state.players[1].maxAP = 10
  state.players[2].belly = 20
  return state
}

// 実際のtransitionMatch直後の公開盤面と照合する。入力は凍結して副作用も検出する。
function compare(state, options = {}, playerId = 1, random = () => .5) {
  const view = toBattleView(state, playerId, 'player', null)
  const selected = view.pHand[0]
  const snapshot = structuredClone(view)
  const actual = previewBattleSummon(freeze(view), selected, options)
  assert.equal(actual.ok, true, actual.reason)
  assert.deepEqual(view, snapshot, 'プレビューは状態を変更しない')
  const next = transitionMatch(state, { type: 'play_card', playerId, cardInstanceId: selected.instanceId, ...options }, random)
  assert.equal(next.error, undefined)
  const own = next.state.players[playerId]
  const enemy = next.state.players[playerId === 1 ? 2 : 1]
  const summoned = own.field.find(item => item.fid === selected.instanceId)
  assert.ok(summoned, '召喚された個体を比較する')
  assert.deepEqual(actual, {
    ok: true,
    apBefore: snapshot.pAP,
    apAfter: own.ap,
    fieldAttackBefore: calcFieldDmg(snapshot.pField, snapshot.pAttackBuff, snapshot.pKiretaStack, snapshot.cBelly),
    fieldAttackAfter: calcFieldDmg(own.field, own.attackBuff, own.kiretaStack, enemy.belly),
    cardAttack: calcFieldDmg([summoned], own.attackBuff, own.kiretaStack, enemy.belly, {
      gunkanBoost: makimonoCount(own.field) >= MAKI_COMP_5,
      namahamuBoost: hasNamahamuAura(own.field),
    }),
    awaitsDefense: next.state.phase === 'defending',
  })
  return actual
}

test('通常召喚でAP2→0・机の通常攻撃0→8を実エンジンと一致させる', () => {
  const state = make('salmon')
  state.players[1].ap = state.players[1].maxAP = 2
  const result = compare(state)
  assert.deepEqual([result.apBefore, result.apAfter, result.fieldAttackBefore, result.fieldAttackAfter, result.cardAttack], [2, 0, 0, 8, 8])
})

test('えび天は相手のお腹60で攻撃9→14になり、59では9のまま', () => {
  for (const [belly, expected] of [[59, 9], [60, 14], [88, 14]]) {
    const state = make('ebi_ten')
    state.players[2].belly = belly
    assert.equal(compare(state).cardAttack, expected)
  }
})

test('巻物5枚到達時の軍艦倍率と、カニ軍艦による既存巻物強化を反映する', () => {
  const gunkan = make('uni_gunkan', ['kappa_maki', 'tekka_maki', 'kanpyo_maki', 'natto_maki'])
  const result = compare(gunkan)
  assert.equal(result.cardAttack, Math.floor(card('uni_gunkan').attack * 1.5))
  const kani = make('kani_gunkan', ['kappa_maki', 'tekka_maki', 'kanpyo_maki', 'uni_gunkan'])
  const strengthened = compare(kani)
  assert.ok(strengthened.fieldAttackAfter > strengthened.fieldAttackBefore + card('kani_gunkan').attack)
})

test('いかにぎりのたこ条件によるAP払い戻しと上限を反映する', () => {
  for (const [field, ap, maxAP, expected] of [[[], 2, 2, 0], [['tako'], 2, 2, 1], [['takowasa'], 3, 3, 2], [['tako', 'takowasa'], 2, 2, 1]]) {
    const state = make('ika_instant', field)
    state.players[1].ap = ap
    state.players[1].maxAP = maxAP
    assert.equal(compare(state).apAfter, expected)
  }
})

test('召喚時の固定ダメージで腹の閾値を越えた既存カードも再計算する', () => {
  const state = make('kohada', ['ebi_ten'])
  state.players[1].kiretaStack = 3
  state.players[2].belly = 58
  const result = compare(state)
  assert.equal(result.fieldAttackBefore, 9)
  assert.equal(result.fieldAttackAfter - result.cardAttack, 14)
})

test('天ぷらは双方の設置と設置前の肉・えび召喚履歴を判定する', () => {
  for (const owner of [1, 2]) {
    const first = make('ebi_ten')
    first.players[owner].sideMenu = { id: 'tempura', status: 'active', turnsLeft: null, usedThisTurn: false }
    assert.equal(compare(first).cardAttack, 12)
    const afterMeat = make('ebi_ten')
    afterMeat.players[owner].sideMenu = { id: 'tempura', status: 'active', turnsLeft: null, usedThisTurn: false }
    afterMeat.players[1].tempuraTriggeredThisTurn = true
    afterMeat.players[1].thisTurnArch = { niku: 1 }
    assert.equal(compare(afterMeat).cardAttack, 9)
    const afterEbi = make('ebi_ten')
    afterEbi.players[owner].sideMenu = { id: 'tempura', status: 'active', turnsLeft: null, usedThisTurn: false }
    afterEbi.players[1].tempuraTriggeredThisTurn = true
    afterEbi.players[1].thisTurnBases = ['えび']
    assert.equal(compare(afterEbi).cardAttack, 9)
  }
})

test('選択した生贄・インバウン丼・防御予約・破壊対象を実処理と一致させる', () => {
  const meat = make('wagyu', ['namahamu', 'namahamu', 'aigamo'])
  meat.players[1].sideMenu = { id: 'inbound_don', status: 'active', turnsLeft: null, usedThisTurn: false }
  meat.players[1].attackBuff = { '生ハム': 2 }
  compare(meat, { sacrificeCount: 2 })
  const guard = make('saba')
  guard.players[1].kiretaStack = 3
  compare(guard, { reserveDefense: true })
  const destruction = make('salmon')
  destruction.players[2].field = [toField(card('ebi'), 'target')]
  compare(destruction, { targetFieldId: 'target' })
})

test('海鮮再攻撃が相手の防御待ちなら確定後の攻撃を予想しない', () => {
  const state = make('ika_instant', ['tako', 'ebi_ten'])
  state.players[2].belly = 58
  state.players[2].field = [{ ...toField(card('saba'), 'guard'), defenseState: 'ready' }]
  const result = compare(state)
  assert.equal(result.awaitsDefense, true)
})

test('山札や複製の乱数結果に依存せず、表示対象のAP・場攻撃だけを予測する', () => {
  const left = compare(make('tobiko_gunkan'), {}, 1, () => 0)
  const right = compare(make('tobiko_gunkan'), {}, 1, () => .999)
  assert.deepEqual(left, right)
})

test('AP不足・場満杯・未指定の破壊対象・不正な予約は予測値を出さない', () => {
  const cases = [
    { state: make('otoro'), edit: state => { state.players[1].ap = 0 }, expected: 'insufficient_ap' },
    { state: make('tamago', Array(8).fill('ebi')), expected: 'field_full' },
    { state: make('salmon'), edit: state => { state.players[2].field = [toField(card('ebi'))] }, expected: 'target_required' },
    { state: make('saba'), options: { reserveDefense: true }, expected: 'insufficient_kireta' },
    { state: make('wagyu'), options: { sacrificeCount: 1 }, expected: 'not_enough_namahamu' },
  ]
  for (const item of cases) {
    item.edit?.(item.state)
    const view = toBattleView(item.state, 1, 'player', null)
    assert.deepEqual(previewBattleSummon(view, view.pHand[0], item.options), { ok: false, reason: item.expected })
  }
  const view = toBattleView(make('tamago'), 1, 'waiting', null)
  assert.deepEqual(previewBattleSummon(view, view.pHand[0]), { ok: false, reason: 'not_your_turn' })
})
