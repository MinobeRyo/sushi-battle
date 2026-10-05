#!/usr/bin/env node
// 固定30ケースだけを実エンジンで比較する。npm testには登録しない。
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadTs } from './load-ts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXED_COMMIT = '64fd6ba1b96f073178d696590ddd00805b3fbc14'
const SEED = 1000
const { CARDS, NAMAHAM_CARD } = loadTs('src/data/cards.ts')
const { createMatch, transitionMatch } = loadTs('src/game/matchEngine.ts')
const { toField, calcFieldDmg, tekkaApBonus } = loadTs('src/game/battleRules.ts')
const card = id => { const c = id === NAMAHAM_CARD.id ? NAMAHAM_CARD : CARDS.find(c => c.id === id); assert.ok(c, id); return c }
const sha256 = input => createHash('sha256').update(input).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
const pastAkami = ['maguro', 'chutoro', 'otoro']
const rolls2 = ['kappa_maki', 'kanpyo_maki']
const rolls3 = [...rolls2, 'natto_maki']
const hamCombo = ['roast_beef', { id: 'wagyu', sacrificeCount: 2 }, 'namahamu', 'namahamu']
const declare = (number, build, label, hand, order, options = {}) => ({
  number, build, label, seed: SEED, turn: 17, initialAP: 10, maxAP: 10,
  ownBelly: 0, enemyBelly: 0, kireta: 0, hand, deck: [], field: [], enemyField: [],
  history: [], combosFired: [], attackBuff: {}, drawBonus: 0, order,
  priorConstructionNote: '事前構築なし。通常AP上限10に到達した手番を比較。', ...options,
})
const akami = { history: pastAkami, combosFired: ['akami_mori'], attackBuff: { マグロ: 2 },
  priorConstructionNote: '過去に別個体のマグロ・中トロ・大トロを召喚済み（過去AP12、購入計1000円）。3枚は退場済み。現在の手札/山札と同一個体ではない。' }
const priorRolls = ids => ({ field: ids, ...(ids.length === 3 ? { combosFired: ['maki_comp_3'], drawBonus: 1 } : {}),
  priorConstructionNote: `持続巻物${ids.length}枚を前の自分手番で召喚済み。場の残存個体を購入履歴と重複計上しない。過去AP${ids.reduce((sum, id) => sum + card(id).cost, 0)}。` })

// 実行前に確定した全30件。ケース追加・総当たり・seed反復・先後反復はしない。
const CASES = [
  declare(1, '赤身', 'ビントロ・未成立', ['bintoro'], ['bintoro'], { deck: ['maguro', 'tekka_maki'], ownBelly: 5 }),
  declare(2, '赤身', 'ビントロ・成立後', ['bintoro'], ['bintoro'], { deck: ['maguro', 'tekka_maki'], ownBelly: 5, ...akami }),
  declare(3, '赤身', '鉄火巻き・未成立', ['tekka_maki'], ['tekka_maki']),
  declare(4, '赤身', '鉄火巻き・成立後', ['tekka_maki'], ['tekka_maki'], akami),
  declare(5, '赤身', 'づけマグロ・未成立', ['duke_maguro'], ['duke_maguro']),
  declare(6, '赤身', 'づけマグロ・成立後', ['duke_maguro'], ['duke_maguro'], akami),
  declare(7, '赤身', '大トロ・単体', ['otoro'], ['otoro']),
  declare(8, '赤身', '大トロで三種成立', ['otoro'], ['otoro'], { history: ['maguro', 'chutoro'],
    priorConstructionNote: '過去にマグロ・中トロを別個体で召喚済み（過去AP7、購入計500円）。両方退場済み。大トロは今回購入分。' }),
  declare(9, '赤身', 'マグロ→大トロ', ['maguro'], ['maguro', 'otoro'], { deck: ['otoro'] }),
  declare(10, '赤身', 'ツナ→マグロ→大トロ', ['tuna_gunkan', 'maguro'], ['tuna_gunkan', 'maguro', 'otoro'], { deck: ['otoro'] }),
  declare(11, '海鮮', 'えび0枚の再攻撃', ['ika', 'tako'], ['ika', 'tako']),
  declare(12, '海鮮', 'えび1枚の再攻撃', ['ebi', 'ika'], ['ebi', 'ika', 'tako'], { deck: ['tako'] }),
  declare(13, '海鮮', 'えび2枚の再攻撃', ['ebi', 'ebi', 'ika'], ['ebi', 'ebi', 'ika', 'tako'], { deck: ['tako'] }),
  declare(14, '海鮮', 'いかにぎり・たこなし', ['ika_instant'], ['ika_instant']),
  declare(15, '海鮮', 'いかにぎり・事前たこ', ['ika_instant'], ['ika_instant'], { field: ['tako'],
    priorConstructionNote: '前の自分手番にたこを召喚（過去AP2、購入200円）。残存たこは今回の攻撃と連鎖・再攻撃に寄与。' }),
  declare(16, '巻物', '同じ巻物2枚＋うに', ['uni_gunkan'], ['uni_gunkan'], priorRolls(rolls2)),
  declare(17, '巻物', '同じ巻物2枚＋カニ', ['kani_gunkan'], ['kani_gunkan'], priorRolls(rolls2)),
  declare(18, '巻物', '巻物3枚＋うに→カニ', ['uni_gunkan', 'kani_gunkan'], ['uni_gunkan', 'kani_gunkan'], priorRolls(rolls3)),
  declare(19, '巻物', '巻物3枚＋カニ→うに', ['kani_gunkan', 'uni_gunkan'], ['kani_gunkan', 'uni_gunkan'], priorRolls(rolls3)),
  declare(20, '肉', '供給→生贄→肉祭り1回目', ['roast_beef', 'wagyu'], hamCombo),
  declare(21, '肉', '供給→生贄→肉祭り2回目', ['roast_beef', 'wagyu'], hamCombo, { history: ['roast_beef', 'wagyu'], attackBuff: { 生ハム: 1 },
    priorConstructionNote: '過去の別個体ローストビーフ→和牛（生贄2）で肉祭り1回成立済み。過去AP8。供給生ハムは生贄済み、過去肉祭りの手札生ハム2枚も0AP召喚後に退場済み。供給/生贄カード代を計上。' }),
  declare(22, '肉', '焼肉・相手腹0', ['yakiniku'], ['yakiniku']),
  declare(23, '肉', '焼肉・相手腹50', ['yakiniku'], ['yakiniku'], { enemyBelly: 50 }),
  declare(24, '汎用', 'サーモン・対象なし', ['salmon'], ['salmon']),
  declare(25, '汎用', 'サーモン・相手焼肉除去', ['salmon'], [{ id: 'salmon', target: 'enemy-field-1' }], { enemyField: ['yakiniku'],
    priorConstructionNote: '相手が前の手番に焼肉寿司を召喚（相手の過去AP3・購入300円）。自分の購入総額には混ぜない。' }),
  declare(26, '光り物', 'サバ2枚・切れ味温存', ['saba', 'saba'], ['saba', 'saba']),
  declare(27, '光り物', 'サバ→コハダ', ['saba', 'kohada'], ['saba', 'kohada']),
  declare(28, '光り物', 'サバ2枚→コハダ', ['saba', 'saba', 'kohada'], ['saba', 'saba', 'kohada']),
  declare(29, '光り物', 'サバ2枚→シメサバ', ['saba', 'saba', 'shime_saba'], ['saba', 'saba', 'shime_saba'], { deck: ['maguro', 'tekka_maki'] }),
  declare(30, '光り物', 'シメサバ・切れ味なし', ['shime_saba'], ['shime_saba'], { deck: ['maguro', 'tekka_maki'] }),
]
assert.equal(CASES.length, 30, '合計30ケースのみ')
assert.deepEqual(CASES.map(c => c.number), Array.from({ length: 30 }, (_, i) => i + 1))
if (process.argv.includes('--list')) {
  for (const c of CASES) console.log(`${c.number}. ${c.build}: ${c.label}`)
  process.exit(0)
}

execFileSync('git', ['diff', '--quiet', FIXED_COMMIT, '--', 'src'], { cwd: ROOT })
const productionPaths = ['src/data/cards.ts', 'src/data/sideMenus.ts', 'src/game/types.ts',
  'src/game/battleRules.ts', 'src/game/matchEngine.ts', 'src/types/index.ts', 'scripts/load-ts.mjs']
const productionFiles = productionPaths.map(path => {
  const content = readFileSync(resolve(ROOT, path))
  assert.deepEqual(content, execFileSync('git', ['show', `${FIXED_COMMIT}:${path}`], { cwd: ROOT }))
  return { path, sha256: sha256(content), gitBlob: git('rev-parse', `${FIXED_COMMIT}:${path}`) }
})

const entityId = c => c.instanceId ?? c.fid
const allEntities = p => ['hand', 'deck', 'field'].flatMap(zone => p[zone].map(c => ({ ...c, zone, entityId: entityId(c) })))
const summary = state => structuredClone({ revision: state.revision, activePlayerId: state.activePlayerId,
  turn: state.turn, phase: state.phase, nextInstanceId: state.nextInstanceId, players: state.players })
const names = ids => ids.map(id => card(id).name).join('・') || 'なし'
const countNames = values => {
  const groups = new Map()
  for (const value of values) groups.set(value.name, (groups.get(value.name) ?? 0) + 1)
  return [...groups].map(([name, n]) => `${name}×${n}`).join('・') || 'なし'
}
const makeLedger = c => {
  const purchases = []
  for (const [zone, ids] of [['hand', c.hand], ['deck', c.deck], ['field', c.field], ['retired-history', c.history]]) {
    ids.forEach((id, i) => purchases.push({ purchaseId: `c${c.number}:${zone}:${i + 1}`, cardId: id, name: card(id).name,
      price: card(id).price, baseAP: card(id).cost, currentZone: zone, historicalUse: zone === 'field' || zone === 'retired-history',
      currentEntityId: zone === 'retired-history' ? null : `c${c.number}:p1:${zone}:${i + 1}` }))
  }
  assert.equal(new Set(purchases.map(p => p.purchaseId)).size, purchases.length)
  const grouped = [...new Set(purchases.map(p => p.cardId))].map(id => {
    const group = purchases.filter(p => p.cardId === id)
    return { cardId: id, name: card(id).name, quantity: group.length, unitPrice: card(id).price,
      subtotal: group.length * card(id).price, purchaseIds: group.map(p => p.purchaseId) }
  })
  return { purchasedCardCount: purchases.length, purchases, grouped,
    totalPurchaseYen: purchases.reduce((sum, p) => sum + p.price, 0),
    priorConstructionAP: purchases.filter(p => p.historicalUse).reduce((sum, p) => sum + p.baseAP, 0),
    opponentPurchases: c.enemyField.map((id, i) => ({ purchaseId: `c${c.number}:enemy:${i + 1}`,
      cardId: id, name: card(id).name, price: card(id).price, priorAP: card(id).cost })),
    priorGeneratedTokens: c.number === 21 ? { sacrificed: 2, laterPlayedAndExpired: 2, purchaseYen: 0, additionalAP: 0 } : null }
}
const buildState = c => {
  // createMatchは初期値の生成だけに使用。比較外の配布カードは全zoneを置換して除外する。
  const state = createMatch({ mode: 'two_player', matchId: `balance-c${c.number}`, deck: [card('tamago')], p2Deck: [card('tamago')],
    sideMenu: null, p2SideMenu: null }, () => 0.999)
  state.turn = c.turn; state.nextInstanceId = 1; state.log = ['固定比較ケース開始']
  for (const id of [1, 2]) Object.assign(state.players[id], { hand: [], deck: [], field: [], gari: 0 })
  const own = state.players[1]
  Object.assign(own, { ap: c.initialAP, maxAP: c.maxAP, belly: c.ownBelly, kiretaStack: c.kireta,
    summonedIds: [...c.history, ...c.field], combosFired: [...c.combosFired], attackBuff: { ...c.attackBuff }, drawBonus: c.drawBonus })
  for (const zone of ['hand', 'deck']) own[zone] = c[zone].map((id, i) => ({ ...structuredClone(card(id)), instanceId: `c${c.number}:p1:${zone}:${i + 1}` }))
  own.field = c.field.map((id, i) => ({ ...toField(card(id), `c${c.number}:p1:field:${i + 1}`), turnsLeft: card(id).fullness - 1 }))
  state.players[2].belly = c.enemyBelly
  state.players[2].field = c.enemyField.map((id, i) => ({ ...toField(card(id), `enemy-field-${i + 1}`), turnsLeft: card(id).fullness - 1 }))
  for (const id of own.summonedIds) for (const arch of card(id).archetype) own.summonedArch[arch] = (own.summonedArch[arch] ?? 0) + 1
  return state
}
const validate = state => {
  for (const p of Object.values(state.players)) {
    assert.ok(p.hand.length <= 7 && p.field.length <= 8)
    assert.ok(p.ap >= 0 && p.maxAP <= 10 && p.ap <= p.maxAP)
    assert.ok(p.belly >= 0 && p.belly < 100, '致死にしない')
    const ids = allEntities(p).map(c => c.entityId)
    assert.equal(new Set(ids).size, ids.length)
  }
  assert.notEqual(state.phase, 'defending')
  assert.notEqual(state.phase, 'over')
}
const rows = []
let transitionCount = 0
for (const c of CASES) {
  let state = buildState(c)
  validate(state)
  const initial = summary(state)
  const ledger = makeLedger(c)
  let seed = c.seed
  const randomValues = []
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const value = seed / 4294967296; randomValues.push(value); return value }
  const traces = []
  let paid = 0, recovered = 0, immediate = 0, normal = 0
  const requests = [...c.order.map(spec => typeof spec === 'string' ? { id: spec } : spec), { end: true }]
  for (const request of requests) {
    const before = summary(state)
    const chosen = request.end ? null : state.players[1].hand.find(item => item.id === request.id)
    if (!request.end) assert.ok(chosen, `case ${c.number}: ${request.id}が手札に必要`)
    const command = request.end ? { type: 'end_turn', playerId: 1 } : { type: 'play_card', playerId: 1, cardInstanceId: chosen.instanceId,
      ...(request.sacrificeCount === undefined ? {} : { sacrificeCount: request.sacrificeCount }),
      ...(request.target === undefined ? {} : { targetFieldId: request.target }) }
    const cost = chosen?.cost ?? 0
    assert.ok(state.players[1].ap >= cost)
    const candidates = chosen?.effect === 'reduce_random_akami_cost_1'
      ? [...state.players[1].hand.filter(item => item.instanceId !== chosen.instanceId), ...state.players[1].deck]
        .filter(item => item.archetype.includes('akami') && item.cost > 0).map(item => ({ instanceId: item.instanceId, name: item.name, cost: item.cost }))
      : chosen?.effect === 'draw_random_akami_1' ? state.players[1].deck.filter(item => item.archetype.includes('akami'))
        .map(item => ({ instanceId: item.instanceId, name: item.name, cost: item.cost })) : []
    const rngBefore = randomValues.length
    const result = transitionMatch(state, command, random)
    transitionCount++
    assert.equal(result.error, undefined, `case ${c.number}: ${JSON.stringify(command)}`)
    state = result.state
    validate(state)
    const restored = state.players[1].ap - before.players[1].ap + cost
    assert.ok(restored >= 0)
    paid += cost; recovered += restored
    const amount = result.events.filter(event => event.type === 'damage' && event.playerId === 2).reduce((sum, event) => sum + event.amount, 0)
    if (request.end) normal += amount; else immediate += amount
    const oldOwn = allEntities(before.players[1]), newOwn = allEntities(state.players[1])
    const oldById = new Map(oldOwn.map(item => [item.entityId, item]))
    const generated = newOwn.filter(item => !oldById.has(item.entityId))
    assert.ok(generated.every(item => item.id === 'namahamu'), '新規生成は生ハムだけ。通常召喚の個体移動と混同しない')
    const drawn = state.players[1].hand.filter(item => before.players[1].deck.some(prev => prev.instanceId === item.instanceId))
    const reductions = newOwn.filter(item => oldById.has(item.entityId) && item.cost < oldById.get(item.entityId).cost)
      .map(item => ({ instanceId: item.entityId, name: item.name, from: oldById.get(item.entityId).cost, to: item.cost, zone: item.zone }))
    const removedEnemy = before.players[2].field.filter(item => !state.players[2].field.some(next => next.fid === item.fid))
    const sacrificed = request.end ? [] : before.players[1].field.filter(item => !state.players[1].field.some(next => next.fid === item.fid))
    const previousIds = new Set(initial.players[1].field.map(item => item.fid))
    const existingBoardNormalDamage = request.end ? calcFieldDmg(before.players[1].field.filter(item => previousIds.has(item.fid)),
      before.players[1].attackBuff, before.players[1].kiretaStack, before.players[2].belly,
      { gunkanBoost: before.players[1].field.filter(item => item.archetype.includes('makimono')).length >= 5 }) : 0
    traces.push({ command, cardName: chosen?.name ?? 'ターン終了', paidAP: cost, recoveredAP: restored,
      netAP: cost - restored, damage: amount, damageTiming: request.end ? 'end_turn' : 'summon_effect_or_combo',
      randomCandidates: candidates, randomValues: randomValues.slice(rngBefore),
      support: { drawn, generated, costReductions: reductions, removedEnemy, sacrificed,
        selfBellyRecovered: Math.max(0, before.players[1].belly - state.players[1].belly),
        opponentDigestStopBefore: before.players[2].digestStopTurns, opponentDigestStopAfter: state.players[2].digestStopTurns,
        generatedAndDrawnAtEnd: request.end ? generated.filter(item => item.zone === 'hand') : [],
        existingBoardNormalDamage }, events: result.events, before, after: summary(state) })
  }
  assert.equal(state.players[1].ap, c.initialAP - paid + recovered)
  const last = traces.at(-1)
  const supports = {
    summonDrawCount: traces.slice(0, -1).reduce((sum, t) => sum + t.support.drawn.length, 0),
    endDrawCount: last.support.drawn.length + last.support.generatedAndDrawnAtEnd.length,
    generatedDuringSummons: traces.slice(0, -1).flatMap(t => t.support.generated),
    generatedAtEnd: last.support.generated,
    totalSelfBellyRecovered: traces.reduce((sum, t) => sum + t.support.selfBellyRecovered, 0),
    costReductions: traces.flatMap(t => t.support.costReductions), destroyed: traces.flatMap(t => t.support.removedEnemy),
    sacrificedCount: traces.reduce((sum, t) => sum + t.support.sacrificed.length, 0),
    opponentDigestStopGranted: Math.max(...traces.slice(0, -1).map(t => t.support.opponentDigestStopAfter), 0),
    opponentDigestStopRemainingAfterTurn: state.players[2].digestStopTurns,
    opponentSkippedDigestionAtNextStart: state.players[2].skippedDigestionThisTurn,
    attackBuffBefore: initial.players[1].attackBuff, attackBuffAfter: state.players[1].attackBuff,
    drawBonusBefore: initial.players[1].drawBonus, drawBonusAfter: state.players[1].drawBonus,
    fieldAfterOwnTurn: state.players[1].field,
    futureTekkaAPIfBoardRemains: tekkaApBonus(state.players[1].field, state.players[1].combosFired),
    futureYakinikuSupplyOpportunities: state.players[1].field.filter(item => item.id === 'yakiniku').reduce((sum, item) => sum + item.turnsLeft, 0),
    kiretaBefore: initial.players[1].kiretaStack, kiretaBeforeEnd: last.before.players[1].kiretaStack, kiretaAfterEnd: state.players[1].kiretaStack,
  }
  rows.push({ number: c.number, build: c.build, label: c.label, declaration: c, initial, traces, outcome: summary(state), supports,
    metrics: { paidAP: paid, recoveredAP: recovered, netAP: paid - recovered,
      immediateEffectAndComboDamage: immediate, endNormalDamage: normal, currentTurnTotalDamage: immediate + normal,
      includesPreexistingBoard: c.field.length > 0, existingBoardNormalDamage: last.support.existingBoardNormalDamage,
      totalPurchaseYen: ledger.totalPurchaseYen, within3000Yen: ledger.totalPurchaseYen <= 3000 }, purchaseLedger: ledger })
}
assert.equal(rows.length, 30)
const report = {
  schemaVersion: 1, title: '固定30ケースのAP・当ターンダメージ・購入額比較',
  reproduction: { fixedCommit: FIXED_COMMIT, repositoryHeadAtRun: git('rev-parse', 'HEAD'),
    fixedCommitTree: git('rev-parse', `${FIXED_COMMIT}^{tree}`), productionSourceTree: git('rev-parse', `${FIXED_COMMIT}:src`),
    productionFiles, scriptSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    caseManifestSHA256: sha256(JSON.stringify(CASES)), nodeVersion: process.version,
    generatedAt: new Date().toISOString(), command: 'node scripts/compare-balance-30.mjs',
    completedComparisonPasses: 1, caseCount: rows.length, transitionCount, seedCount: 1, seed: SEED,
    preparationAudit: { scriptLaunchCount: 2, preflightFailures: 1, casesExecutedInFailedLaunches: 0, transitionsInFailedLaunches: 0,
      cause: '最初の起動はproduction検証のsrc/types.ts参照で停止。src/types/index.tsへ修正し、比較ケース実行前に再起動。' },
    randomAlgorithm: 'LCG: seed=(imul(seed,1664525)+1013904223)>>>0; random=seed/2^32; 各ケース同じseed1000で開始',
    mode: 'two_player', actor: 1, turn: 17, initialAP: 10, enemyGari: 0 },
  notes: [
    '合計30ケース。30試合、総当たり、seed別反復、先後別反復、勝率評価ではない。',
    '比較用に設定した全購入カードの総額。最小構成であり、完成デッキの強さや勝率を表すものではない。',
    'カード価格は定価。特急・購入割引なし。AP軽減は円価格を変更しない。',
    '手札・山札・事前盤面の全購入個体と退場済み購入履歴を含む。事前盤面の個体を購入履歴として二重計上しない。',
    '赤身成立用の過去3種は退場済みの別個体で、現在の手札・山札の同名カードとは別購入。過去APは今回支払APに混ぜず別記する。',
    '生ハムは生成物で購入0円。過去肉祭りの成立には供給と生贄のカード代・APを別途計上済み。',
    '事前盤面ありのダメージには今回APを払っていない残存カードが寄与する。今回AP当たりの効率として比較しない。',
    '即時は召喚時の追加効果・連鎖・コンボを合算。通常はend_turnのdamageイベント。腹の前後差ではなく実際のdamageイベントを使用。',
    '実支払APは召喚前の個体cost、同ターン回復APはAP差＋支払APから実測、実質消費AP＝支払−回復。',
    '持続の次回以降の攻撃、次ターンAP、将来供給を当ターンダメージやAP回復へ算入しない。焼肉の当終了時供給は実測するが、その新生ハムは当終了攻撃に参加しない。',
    '相手の焼肉等の購入額は相手欄に分離。相手手番は追加シミュレーションしない。自分終了直後の相手開始処理は実エンジン通り。',
    '未採用のサバ・イワシ生姜による防御案は未実装のため含めない。',
  ], rows,
}
const jsonPath = resolve(ROOT, 'docs/balance-comparison-30.json')
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
// 人向けMarkdownは必ず保存済みJSONのみから生成する。
const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
const tableRow = row => `| ${row.number} | ${row.label} | ${row.metrics.paidAP}/${row.metrics.recoveredAP}/${row.metrics.netAP} | ${row.metrics.immediateEffectAndComboDamage}/${row.metrics.endNormalDamage}/${row.metrics.currentTurnTotalDamage} | ${row.metrics.totalPurchaseYen}円 |`
const shortSupport = row => {
  const s = row.supports, parts = [`召喚ドロー${s.summonDrawCount}・終了ドロー${s.endDrawCount}`]
  if (s.totalSelfBellyRecovered) parts.push(`腹−${s.totalSelfBellyRecovered}`)
  if (s.opponentDigestStopGranted) parts.push(`消化停止${s.opponentDigestStopGranted}回（終了後残${s.opponentDigestStopRemainingAfterTurn}）`)
  if (s.costReductions.length) parts.push(...s.costReductions.map(x => `${x.name}AP${x.from}→${x.to}`))
  if (s.generatedDuringSummons.length || s.generatedAtEnd.length) parts.push(`生ハム生成：召喚時${s.generatedDuringSummons.length}・終了時${s.generatedAtEnd.length}`)
  if (s.sacrificedCount) parts.push(`生贄${s.sacrificedCount}`)
  if (s.destroyed.length) parts.push(`破壊：${countNames(s.destroyed)}`)
  if (s.futureTekkaAPIfBoardRemains) parts.push(`盤面維持時の次開始AP+${s.futureTekkaAPIfBoardRemains}（未算入）`)
  if (s.futureYakinikuSupplyOpportunities) parts.push(`残り供給機会${s.futureYakinikuSupplyOpportunities}（未実行）`)
  if (s.fieldAfterOwnTurn.length) parts.push(`残存：${s.fieldAfterOwnTurn.map(x => `${x.name}${x.turnsLeft}T`).join('・')}`)
  if (s.attackBuffAfter.生ハム) parts.push(`生ハム攻撃+${s.attackBuffAfter.生ハム}`)
  return parts.join('、')
}
const md = [
  '# 固定30ケースのAP・ダメージ・購入額比較', '',
  `固定版：\`${data.reproduction.fixedCommit}\`。**比較本体は合計30ケースを1回実行**（transitionMatch ${transitionCount}操作、seed ${SEED} 1種類）。スクリプト起動は2回で、初回は事前ファイル検証で停止しケース実行0件。`, '',
  'AP欄は「実支払／同ターン回復／実質消費」、ダメージ欄は「即時効果・コンボ／終了通常／当ターン計」です。全件P1・17手番目・開始AP10、相手ガリ0。', '',
  ...data.notes.map(note => `- ${note}`), '',
  '## 30ケースの数値', '',
  '| # | ケース | AP 払/回/実質 | ダメージ 即/通常/計 | 自分の全購入額 |',
  '|---:|---|---:|---:|---:|', ...data.rows.map(tableRow), '',
  '## 前提・召喚順・補助効果・購入内訳', '',
  ...data.rows.flatMap(row => {
    const c = row.declaration, p = row.purchaseLedger
    return [`### ${row.number}. ${row.build}：${row.label}`, '',
      `前提：自分腹${c.ownBelly}／相手腹${c.enemyBelly}、切れ味${c.kireta}、赤身成立${c.combosFired.includes('akami_mori') ? '済' : '前'}、seed ${c.seed}。`, '',
      `手札：${names(c.hand)}。山札順：${names(c.deck)}。自分の事前盤面：${names(c.field)}。相手の事前盤面：${names(c.enemyField)}。過去召喚履歴：${names(c.history)}。`, '',
      `事前構築：${c.priorConstructionNote} 自分の過去構築AP合計${p.priorConstructionAP}（今回APに含めない）。${row.metrics.includesPreexistingBoard ? `終了通常攻撃のうち事前盤面寄与は${row.metrics.existingBoardNormalDamage}。連鎖等にも寄与し得るため今回AP効率として扱わない。` : ''}`, '',
      `召喚順：${row.traces.filter(t => t.command.type === 'play_card').map(t => `${t.cardName}${t.command.sacrificeCount ? `（生贄${t.command.sacrificeCount}）` : ''}${t.command.targetFieldId ? `（${t.command.targetFieldId}指定）` : ''}`).join(' → ')} → 終了。`, '',
      `補助効果：${shortSupport(row)}。`, '',
      `全購入内訳：${p.grouped.map(x => `${x.name}×${x.quantity}（${x.unitPrice}円×${x.quantity}＝${x.subtotal}円）`).join('、')}。**計${p.totalPurchaseYen}円／${p.purchasedCardCount}枚／3000円以内：${row.metrics.within3000Yen ? 'はい' : 'いいえ'}**。${p.opponentPurchases.length ? ` 相手別会計：${p.opponentPurchases.map(x => `${x.name}${x.price}円`).join('・')}。` : ''}`, '',
      ...(row.number === 10 ? [`軽減抽選の候補と結果：${JSON.stringify(row.traces[0].randomCandidates)}。乱数${row.traces[0].randomValues.join(', ')}、実結果${JSON.stringify(row.supports.costReductions)}。`, ''] : []),
    ]
  }),
  '## 再現', '',
  `- 固定commit：\`${data.reproduction.fixedCommit}\``,
  `- 固定commit tree：\`${data.reproduction.fixedCommitTree}\``,
  `- src tree：\`${data.reproduction.productionSourceTree}\``,
  `- スクリプトSHA-256：\`${data.reproduction.scriptSHA256}\``,
  `- ケース宣言SHA-256：\`${data.reproduction.caseManifestSHA256}\``,
  '- コマンド：`node scripts/compare-balance-30.mjs`（npm testには登録しない）',
  '- `docs/balance-comparison-30.json`に全初期状態、購入と現存個体の対応、全操作の前後状態・イベント・乱数・生成/除去を保存。', '',
].join('\n')
writeFileSync(resolve(ROOT, 'docs/balance-comparison-30.md'), md)
console.log('| # | ケース | AP 払/回/実質 | ダメージ 即/通常/計 | 自分の全購入額 |')
console.log('|---:|---|---:|---:|---:|')
for (const row of data.rows) console.log(tableRow(row))
console.log(`完了: ${rows.length}ケース、比較本体1回、起動2回（事前検証失敗1回・ケース0件）、${transitionCount}操作。固定commit ${FIXED_COMMIT}`)
