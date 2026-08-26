#!/usr/bin/env node
// バトルロジックの回帰テスト
//
//   node scripts/test-battle-logic.mjs
//
// BattleScreen.tsx の純関数部分（定数・calcFieldDmg・applySummon など）を
// そのまま切り出して実行する。テスト用にロジックを写経しないので、
// 本体を変えたらこのテストも自動的に新しいコードを見る。
// 追加の依存は不要（node_modules の typescript だけを使う）。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.SUSHI_ROOT ?? path.resolve(HERE, '..')
const require_ = createRequire(import.meta.url)
const ts = require_(path.join(ROOT, 'node_modules/typescript'))

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')
const toJs = src => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

// ─── BattleScreen.tsx から純関数部分だけを切り出す ───────────────────────────
const battle = read('src/features/battle/BattleScreen.tsx')
const START = '// ── Types'
const END = '// ── CardDetailSheet'          // ここから先は React コンポーネント
if (!battle.includes(START) || !battle.includes(END)) {
  throw new Error('BattleScreen.tsx の切り出し位置が見つかりません（見出しコメントが変わった可能性）')
}
const slice = battle.slice(battle.indexOf(START), battle.indexOf(END))
if (slice.includes('</')) throw new Error('切り出した範囲に JSX が混ざっています')

const EXPORTS = ['applySummon', 'calcFieldDmg', 'toField', 'digestBonus',
                 'makimonoCount', 'digestionAmount', 'COMBO_META']
for (const name of EXPORTS) {
  if (!slice.includes(name)) throw new Error(`切り出した範囲に ${name} がありません`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sushi-test-'))
fs.writeFileSync(path.join(tmp, 'cards.cjs'), toJs(read('src/data/cards.ts')))
fs.writeFileSync(path.join(tmp, 'engine.cjs'), toJs(
  `const { CARDS } = require('./cards.cjs')\n` + slice +
  `\nmodule.exports = { ${EXPORTS.join(', ')} }\n`
))
const { CARDS } = require_(path.join(tmp, 'cards.cjs'))
const E = require_(path.join(tmp, 'engine.cjs'))
const { applySummon, calcFieldDmg, toField, digestBonus, makimonoCount, digestionAmount } = E

// ─── テスト用ヘルパ ──────────────────────────────────────────────────────────
const byId = id => {
  const c = CARDS.find(x => x.id === id)
  if (!c) throw new Error(`カードが見つかりません: ${id}`)
  return c
}
let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
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
eq('シメサバ kireta_consume_2_draw_2', byId('shime_saba').effect, 'kireta_consume_2_draw_2')
eq('コハダ kireta_consume_x3', byId('kohada').effect, 'kireta_consume_x3')
eq('軍艦タグ 10枚', CARDS.filter(c => c.archetype.includes('gunkan')).length, 10)
eq('軍艦タグが付くのは名前に「軍艦」を含むカードだけ',
  CARDS.filter(c => c.archetype.includes('gunkan')).every(c => c.name.includes('軍艦')), true)
eq('太巻きの subBases', byId('futomaki').subBases, ['マグロ', 'えび'])

console.log('\n[2] 単体の効果')
eq('明太子で2枚ドロー', applySummon(blank({ card: byId('mentaiko') })).drawNow, 2)
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
}

console.log('\n[7] 肉祭り（同ターン肉寿司2枚・ターンに1回・ターンをまたげば何度でも）')
{
  eq('1枚では未発動', playAll(['wagyu']).firedNames.includes('niku_matsuri'), false)
  const two = playAll(['wagyu', 'roast_beef'])
  eq('2枚で発動', two.firedNames.includes('niku_matsuri'), true)
  eq('即時+12 は廃止（追加ダメージ0）', two.extra, 0)
  eq('同ターンに4枚出しても発動は1回',
    playAll(['wagyu', 'roast_beef', 'karubi', 'gyutan']).firedNames.filter(x => x === 'niku_matsuri').length, 1)
  const wagyu = toField(byId('wagyu')), rb = toField(byId('roast_beef'))
  eq('相手お腹70・通常 (12+8)*2 = 40', calcFieldDmg([wagyu, rb], {}, 0, 70), 40)
  eq('相手お腹70・肉祭り中 (12+16)*2 = 56', calcFieldDmg([wagyu, rb], {}, 0, 70, { nikuMatsuri: true }), 56)
  eq('相手お腹50では肉祭りでも増えない', calcFieldDmg([wagyu, rb], {}, 0, 50, { nikuMatsuri: true }), 24)
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
}

console.log('\n[9] 消化量')
eq('ラウンド1の消化 = 2', digestionAmount(1), 2)
eq('ラウンド4以降は上限5', digestionAmount(9), 5)
eq('かっぱ巻き込みで 2+2 = 4', digestionAmount(1) + digestBonus([toField(byId('kappa_maki'))]), 4)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n===== ${pass} 件成功 / ${fail} 件失敗 =====`)
process.exit(fail > 0 ? 1 : 0)
