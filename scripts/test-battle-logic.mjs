#!/usr/bin/env node
// バトルロジックの回帰テスト: node scripts/test-battle-logic.mjs
// 画面の文字列を切り出さず、実際の battleEngine.ts とその依存を読み込む。
import { loadTs } from './load-ts.mjs'

const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { applySummon, calcFieldDmg, toField, digestBonus, makimonoCount, digestionAmount } =
  loadTs('src/features/battle/battleEngine.ts')

// ─── テスト用ヘルパ ──────────────────────────────────────────────────────────
const byId = id => {
  const c = CARDS.find(x => x.id === id)
  if (!c) throw new Error(`カードが見つかりません: ${id}`)
  return c
}
let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? '✓' : '✗'} ${label}` +
    (ok ? '' : `\n      期待=${JSON.stringify(want)} 実際=${JSON.stringify(got)}`))
}
const blank = (over = {}) => ({
  card: byId('tamago'), belly: 0, kireta: 0, field: [],
  summonedIds: [], summonedArch: {}, thisTurnBases: [], thisTurnArch: {},
  combosFired: [], attackBuff: {}, drawBonus: 0, nikuMatsuri: false, enemyBelly: 0,
  ...over,
})
function playAll(ids, over = {}) {
  let st = blank(over)
  let extra = 0
  const firedNames = [], logs = []
  for (const id of ids) {
    const r = applySummon({ ...st, card: byId(id) })
    extra += r.extraDmg
    firedNames.push(...r.fired.map(f => f.id))
    logs.push(...r.logs)
    st = { ...st, ...r }
  }
  return { st, extra, firedNames, logs }
}

// ─── テスト ──────────────────────────────────────────────────────────────────
console.log('\n[1] カードデータ')
eq('かっぱ巻き 攻撃1・digest_boost_2', [byId('kappa_maki').attack, byId('kappa_maki').effect], [1, 'digest_boost_2'])
eq('梅しそ巻き self_digest_5', byId('ume_shiso_maki').effect, 'self_digest_5')
eq('明太子 3AP・draw_2', [byId('mentaiko').cost, byId('mentaiko').effect], [3, 'draw_2'])
eq('えび 3AP・200円・攻撃5・2ターン持続・対象限定ドロー',
  [byId('ebi').cost, byId('ebi').price, byId('ebi').attack, byId('ebi').type, byId('ebi').fullness, byId('ebi').effect],
  [3, 200, 5, 'persist', 2, 'draw_persist_ika_tako_1'])
eq('えびは海鮮再攻撃に参加する', byId('ebi').archetype.includes('kaisen'), true)
eq('シメサバ kireta_consume_2_draw_2', byId('shime_saba').effect, 'kireta_consume_2_draw_2')
eq('コハダ kireta_consume_x3', byId('kohada').effect, 'kireta_consume_x3')
eq('軍艦タグ 10枚', CARDS.filter(c => c.archetype.includes('gunkan')).length, 10)
eq('軍艦タグが付くのは名前に「軍艦」を含むカードだけ',
  CARDS.filter(c => c.archetype.includes('gunkan')).every(c => c.name.includes('軍艦')), true)
eq('太巻きの subBases', byId('futomaki').subBases, ['マグロ', 'えび'])

console.log('\n[2] 単体の効果')
eq('明太子で2枚ドロー', applySummon(blank({ card: byId('mentaiko') })).drawNow, 2)
eq('えびは通常ドローせず、対象限定ドローを要求する',
  (r => [r.drawNow, r.drawPersistIkaTako])(applySummon(blank({ card: byId('ebi') }))), [0, true])
eq('梅しそ巻きで お腹 -5', applySummon(blank({ card: byId('ume_shiso_maki'), belly: 20 })).belly, 15)
eq('シメサバ スタック1では不発（消費もしない）',
  (r => [r.kireta, r.drawNow])(applySummon(blank({ card: byId('shime_saba'), kireta: 1 }))), [1, 0])
eq('シメサバ スタック3なら 2消費・2ドロー',
  (r => [r.kireta, r.drawNow])(applySummon(blank({ card: byId('shime_saba'), kireta: 3 }))), [1, 2])
eq('コハダ スタック5で ×3 = 15ダメージ', applySummon(blank({ card: byId('kohada'), kireta: 5 })).extraDmg, 15)
eq('コハダ スタック0では不発', applySummon(blank({ card: byId('kohada'), kireta: 0 })).extraDmg, 0)
eq('かっぱ巻き1枚で消化 +2', digestBonus([toField(byId('kappa_maki'))]), 2)
eq('かっぱ巻き2枚で消化 +4', digestBonus([toField(byId('kappa_maki')), toField(byId('kappa_maki'))]), 4)

console.log('\n[2b] コハダの切れ味は攻撃解決後に消える')
{
  const r = applySummon(blank({ card: byId('kohada'), kireta: 6 }))
  eq('追加ダメージ 6×3 = 18', r.extraDmg, 18)
  eq('召喚時点ではスタックが残る（0にしない）', r.kireta, 6)
  eq('使い切りフラグが立つ', r.kiretaSpent, true)
  eq('コハダ自身が切れ味ボーナス+6を受ける（攻撃0 → 6）',
    calcFieldDmg(r.field, {}, r.kireta), 6)
  eq('そのターンの実効ダメージ = 机6 + 追加18 = 24', calcFieldDmg(r.field, {}, r.kireta) + r.extraDmg, 24)

  // 同ターンに出した他の光り物もボーナスを受け続ける
  const withAji = playAll(['aji_tataki', 'kohada'], { kireta: 5 })
  eq('アジたたき→コハダ: 追加ダメージは 6×3 = 18', withAji.extra, 18)
  eq('机の攻撃 アジたたき(11+6) + コハダ(0+6) = 23',
    calcFieldDmg(withAji.st.field, {}, withAji.st.kireta), 23)

  // 二重取りの防止
  const twice = playAll(['kohada', 'kohada'], { kireta: 6 })
  eq('同ターンに2枚目のコハダは0ダメージ', twice.extra, 18)
  eq('2枚目は「使い切っている」と出る',
    twice.logs.some(l => l.includes('すでに切れ味を使い切っている')), true)

  // 使い切ったあとはシメサバも消費できない
  const afterKohada = playAll(['kohada', 'shime_saba'], { kireta: 6 })
  eq('コハダ後のシメサバはドローできない', afterKohada.st.kireta, 6)
  eq('シメサバも不発ログを出す',
    afterKohada.logs.some(l => l.includes('すでに切れ味を使い切っている')), true)
}

console.log('\n[3] 巻物コンプ① 机に同時3枚（即時型も数える・1試合1回・永続ドロー+1）')
{
  const r = playAll(['kappa_maki', 'avocado_maki', 'kanpyo_maki'])
  eq('持続巻物3枚で発動', r.firedNames.includes('maki_comp_3'), true)
  eq('ドロー+1', r.st.drawBonus, 1)
  eq('軍艦3枚（即時型）でも発動する',
    playAll(['corn_gunkan', 'tuna_salad_gunkan', 'seafood_gunkan']).firedNames.includes('maki_comp_3'), true)
  eq('4枚目では再発動しない',
    playAll(['kappa_maki', 'avocado_maki', 'kanpyo_maki', 'natto_maki'])
      .firedNames.filter(x => x === 'maki_comp_3').length, 1)
}

console.log('\n[4] 巻物コンプ② 机に同時5枚 → 軍艦のみ1.5倍（状態継続）')
{
  const four = ['kappa_maki', 'avocado_maki', 'kanpyo_maki', 'natto_maki'].map(byId).map(toField)
  const uni = toField(byId('uni_gunkan'))
  eq('巻物4枚のみ（軍艦なし）', calcFieldDmg(four, {}), 1 + 2 + 3 + 3)
  eq('巻物4枚 + うに軍艦 = 5枚 → うに20が30に', calcFieldDmg([...four, uni], {}), 1 + 2 + 3 + 3 + 30)
  eq('巻物3枚 + うに軍艦 = 4枚 → 倍率なし', calcFieldDmg([...four.slice(0, 3), uni], {}), 1 + 2 + 3 + 20)
  eq('持続巻物は1.5倍を受けない', calcFieldDmg([...four, uni], {}) - 30, 9)
  const r = playAll(['kappa_maki', 'avocado_maki', 'kanpyo_maki', 'natto_maki', 'uni_gunkan'])
  eq('5枚目で通知が出る', r.firedNames.includes('maki_comp_5'), true)
  eq('机の巻物枚数', makimonoCount(r.st.field), 5)
}

console.log('\n[5] 光り物三昧（大葉の累計3枚・1試合1回）')
{
  eq('大葉2枚では未発動', playAll(['saba_ohba', 'aji_ohba']).firedNames.includes('hikari_zanmai'), false)
  const three = playAll(['saba_ohba', 'aji_ohba', 'saba_ohba'])
  eq('大葉3枚で発動', three.firedNames.includes('hikari_zanmai'), true)
  eq('切れ味 = 大葉3枚ぶん+3 とコンボ+3 で計6', three.st.kireta, 6)
  eq('4枚目で再発動しない',
    playAll(['saba_ohba', 'aji_ohba', 'saba_ohba', 'aji_ohba'])
      .firedNames.filter(x => x === 'hikari_zanmai').length, 1)
}

console.log('\n[6] 海の幸三昧（いか＋たこのペアを消費・何度でも）')
{
  const r1 = playAll(['ika', 'tako'])
  eq('いか→たこ でペア成立', r1.firedNames.includes('umi_zanmai'), true)
  eq('追加ダメージ内訳 連鎖3 + 連鎖6 + 再攻撃3 = 12', r1.extra, 12)
  eq('再攻撃は 場の海鮮6 の50% = 3', r1.logs.some(l => l.includes('場の海鮮2枚が再攻撃 +3')), true)
  eq('両方がペア消費済み', r1.st.field.map(c => c.kaisenPaired), [true, true])
  eq('消費済みでも海鮮タグは残る（再攻撃の対象）',
    r1.st.field.filter(c => c.archetype.includes('kaisen')).length, 2)
  eq('消費済みでも連鎖効果は残る',
    r1.st.field.filter(c => c.effect === 'chain_on_kaisen_summon').length, 2)
  eq('同ターンに2組で2回発動',
    playAll(['ika', 'tako', 'ika_instant', 'takowasa']).firedNames.filter(x => x === 'umi_zanmai').length, 2)
  eq('えびはペア対象外',
    playAll(['ika', 'tako', 'ebi_gunkan']).firedNames.filter(x => x === 'umi_zanmai').length, 1)
  eq('相手がいない3枚目のいかでは発動しない',
    playAll(['ika', 'tako', 'ika_instant']).firedNames.filter(x => x === 'umi_zanmai').length, 1)
  const prev = applySummon(blank({ card: byId('tako') }))
  const next = applySummon(blank({ card: byId('ika'), field: prev.field }))
  eq('ターンをまたいで机のたことペアを組める', next.fired.map(f => f.id).includes('umi_zanmai'), true)
  for (const [count, reattack] of [[1, 12], [2, 22]]) {
    const ebi = playAll([...Array(count).fill('ebi'), 'ika', 'tako'])
    eq(`えび${count}枚: 海鮮全体の50%を切り捨てた後、1枚ごと+7`, ebi.extra, 9 + reattack)
    eq(`えび${count}枚はペアを消費しない`, ebi.st.field.filter(c => c.id === 'ebi').some(c => c.kaisenPaired), false)
    eq(`えび${count}枚の通常攻撃に+7を載せない`, calcFieldDmg(ebi.st.field, {}), count * 5 + 6)
  }
  eq('えび召喚の連鎖に+7を載せない', playAll(['ika', 'ebi']).extra, 6)
  eq('えびといかだけではペアにならない', playAll(['ebi', 'ika']).firedNames.includes('umi_zanmai'), false)

}

console.log('\n[7] 肉祭り（同ターンに生ハム累計2体生贄・即時+5・ターンに1回）')
{
  eq('肉寿司2枚の通常召喚では未発動', playAll(['wagyu', 'roast_beef']).firedNames.includes('niku_matsuri'), false)
  const first = applySummon(blank({ card: byId('karubi'), sacrificeCount: 1,
    field: [0, 1, 2].map(index => toField(NAMAHAM_CARD, `ham-${index}`)) }))
  eq('生贄1体では未発動', first.nikuMatsuri, false)
  const second = applySummon({ ...first, card: byId('karubi'), sacrificeCount: 1, enemyBelly: 0 })
  eq('生贄累計2体で発動', second.fired.map(item => item.id), ['niku_matsuri'])
  eq('肉祭りは即時+5', second.extraDmg, 5)
  eq('肉祭りで山札用の生ハム1枚を要求する', second.generateNamahamuDeck, 1)
  eq('肉祭りで生ハムを永続+1', second.attackBuff['生ハム'], 1)
  const third = applySummon({ ...second, card: byId('karubi'), sacrificeCount: 1, enemyBelly: 0 })
  eq('同じターンは追加発動しない', [third.extraDmg, third.fired.length], [0, 0])
  eq('同ターンの追加生贄では生成・強化を重ねない', [third.generateNamahamuDeck, third.attackBuff['生ハム']], [0, 1])
  const field = [toField(byId('yakiniku')), toField(byId('ebi_ten'))]
  eq('肉祭りで腹条件ボーナスを倍増しない', calcFieldDmg(field, {}, 0, 70, { nikuMatsuri: true }), 20)
  eq('置換された和牛とローストビーフは腹条件で強化されない',
    calcFieldDmg([toField(byId('wagyu')), toField(byId('roast_beef'))], {}, 0, 99), 22)
}

console.log('\n[8] 赤身三種盛り（累積・1試合1回・永続バフが青天井にならないこと）')
{
  const r = playAll(['maguro', 'chutoro', 'otoro'])
  eq('3種で発動', r.firedNames.includes('akami_mori'), true)
  eq('即時+10', r.extra, 10)
  eq('マグロに+2のバフ', r.st.attackBuff['マグロ'], 2)
  const more = playAll(['maguro', 'chutoro', 'otoro', 'bintoro', 'tekka_maki'])
  eq('その後カードを出しても再発動しない', more.firedNames.filter(x => x === 'akami_mori').length, 1)
  eq('バフは+2のまま', more.st.attackBuff['マグロ'], 2)
  eq('即時ダメージも10のまま', more.extra, 10)
  eq('太巻きも subBases でマグロバフを受ける', calcFieldDmg([toField(byId('futomaki'))], { 'マグロ': 2 }), 5 + 2)
  for (const [unlocked, belly, expected] of [[false, 5, [0, 5]], [true, 5, [2, 2]], [true, 1, [2, 0]]]) {
    const result = applySummon(blank({ card: byId('bintoro'), belly,
      combosFired: unlocked ? ['akami_mori'] : [] }))
    eq(`ビントロ: 三種盛り${unlocked ? '成立後' : '成立前'}・お腹${belly}`,
      [result.drawNow, result.belly], expected)
  }
  const unlock = applySummon(blank({ card: byId('otoro'), belly: 5,
    summonedIds: ['maguro', 'chutoro', 'bintoro'], field: [toField(byId('bintoro'))] }))
  eq('三種盛り成立で既存ビントロの効果は遡及しない', [unlock.drawNow, unlock.belly], [0, 5])

}

console.log('\n[9] 消化量')
eq('ラウンド1の消化 = 2', digestionAmount(1), 2)
eq('ラウンド4以降は上限5', digestionAmount(9), 5)
eq('かっぱ巻き込みで 2+2 = 4', digestionAmount(1) + digestBonus([toField(byId('kappa_maki'))]), 4)

console.log('\n[10] 召喚操作の重複・手札の消費')
{
  const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
  const tamago = byId('tamago')
  const play = (state, cardInstanceId) => transitionMatch(state, {
    type: 'play_card', playerId: 1, cardInstanceId,
  }).state
  let game = createMatch({ deck: [tamago], mode: 'cpu' })
  const instanceId = game.players[1].hand[0].instanceId
  game = play(game, instanceId)
  game = play(game, instanceId)
  const player = game.players[1]
  eq('手札1枚で二重に召喚操作しても、机1枚・AP消費1のみ',
    [player.hand.length, player.field.length, player.ap], [0, 1, 1])
  eq('重複操作で召喚履歴は増えない', player.summonedIds, ['tamago'])

  const notInHand = play(createMatch({ deck: [tamago], mode: 'cpu' }), 'absent-cheese')
  eq('手札にないカードは出せない',
    [notInHand.players[1].hand.length, notInHand.players[1].field.length, notInHand.players[1].ap], [1, 0, 2])

  let duplicates = createMatch({ deck: [tamago, tamago], mode: 'cpu' })
  duplicates = play(duplicates, duplicates.players[1].hand[0].instanceId)
  eq('同じカードを2枚所持していても1回の操作では1枚消費',
    [duplicates.players[1].hand.length, duplicates.players[1].field.length, duplicates.players[1].ap], [1, 1, 1])
  duplicates = play(duplicates, duplicates.players[1].hand[0].instanceId)
  eq('残りの同名カードは別の召喚操作で使用できる',
    [duplicates.players[1].hand.length, duplicates.players[1].field.length, duplicates.players[1].ap], [0, 2, 0])

  const noAP = createMatch({ deck: [tamago], mode: 'cpu' })
  noAP.players[1].ap = 0
  const rejected = play(noAP, noAP.players[1].hand[0].instanceId)
  eq('AP不足の操作では手札を消費しない',
    [rejected.players[1].hand.length, rejected.players[1].field.length, rejected.players[1].ap], [1, 0, 0])
}

console.log(`\n===== ${pass} 件成功 / ${fail} 件失敗 =====`)
process.exit(fail > 0 ? 1 : 0)
