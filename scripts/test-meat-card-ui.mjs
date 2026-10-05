#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const cards = loadTs('src/data/cards.ts')
const rules = loadTs('src/game/battleRules.ts')
const presentation = loadTs('src/features/battle/battlePresentation.ts')
const status = loadTs('src/features/battle/battleStatusModel.ts')
const { renderToStaticMarkup } = require('react-dom/server')
function loadComponent(name, imports) {
  const source = fs.readFileSync(new URL(`../src/features/battle/${name}.tsx`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(imports, name), `未定義の依存: ${name}`)
    return imports[name]
  }, module, module.exports)
  return module.exports
}
const effectText = loadComponent('CardEffectText', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  './battlePresentation': presentation,
  './battleEngine': rules,
  '../../data/cards': cards,
  './CardEffectText.css': {},
})

// 描画された実コンポーネントのボタンを押し、消費数と破壊対象の送信を確認する。
function createHarness(cardId, fieldIds, enemyIds = []) {
  const hooks = []
  let cursor = 0
  const react = {
    useRef: initial => ({ current: initial }),
    useId: () => 'sacrifice-choice',
    useEffect() {},
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], value => { hooks[index] = value }]
    },
  }
  const imports = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'framer-motion': { motion: { div: 'div', button: 'button' }, useIsPresent: () => true },
    '../../components/SushiArt': { SushiArt: () => null },
    './battleStatusModel': status,
    './battleEngine': rules,
    './battlePresentation': presentation,
    '../../data/cards': cards,
    './BattleCards.css': {},
    './CardEffectText': effectText,
  }
  const components = loadComponent('BattleCards', imports)
  const findCard = id => cards.getCardById(id) ?? cards.GENERATED_CARDS.find(card => card.id === id)
  const plays = []
  const targetsSent = []
  const reservationsSent = []
  let closes = 0
  const props = {
    inspect: { card: { ...findCard(cardId), instanceId: `hand:${cardId}` }, canPlay: true },
    attackBuff: {}, kiretaStack: 0,
    fieldCards: fieldIds.map((id, index) => rules.toField(findCard(id), `field:${index}`)),
    enemyFieldCards: enemyIds.map((id, index) => rules.toField(findCard(id), `enemy:${index}`)),
    onPlay: (count, targetFieldId, reserveDefense) => { plays.push(count); targetsSent.push(targetFieldId); reservationsSent.push(reserveDefense) },
    onClose: () => { closes += 1 },
  }
  function BattleHarness() {
    cursor = 0
    return components.CardDetailSheet(props)
  }
  const textContent = value => Array.isArray(value) ? value.map(textContent).join('')
    : value && typeof value === 'object' && value.props ? textContent(value.props.children)
      : typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const descendants = value => Array.isArray(value) ? value.flatMap(descendants)
    : value && typeof value === 'object' && value.props ? [value, ...descendants(value.props.children)] : []
  return {
    props, plays, targetsSent, reservationsSent,
    textContent,
    effectMarkup(component = 'CardDetailSheet', overrides = {}) {
      cursor = 0
      const tree = component === 'CardDetailSheet' ? components.CardDetailSheet(props)
        : components[component]({ card: props.inspect.card, canPlay: props.inspect.canPlay,
          attackBuff: props.attackBuff, kiretaStack: props.kiretaStack, isSelected: false,
          combosFired: props.combosFired, onSelect() {}, ...overrides })
      const effect = descendants(tree).find(node => node.type === effectText.CardEffectText)
      assert.ok(effect, '共有CardEffectTextで説明を描画する')
      return renderToStaticMarkup(effect)
    },
    get nodes() { return descendants(BattleHarness()) },
    get attackText() { return textContent(this.nodes.find(node => node.props.className === 'battle-detail-attack')) },
    get closes() { return closes },
    get buttons() { return descendants(BattleHarness()).filter(node => node.type === 'button') },
    get confirm() { return this.buttons.find(node => node.props.className === 'battle-detail-play') },
    get choices() { return this.buttons.filter(node => 'aria-pressed' in node.props) },
  }
}

test('カルビは生ハムを残す／1体消費を明示選択してから送信する', () => {
  const h = createHarness('karubi', ['namahamu'])
  assert.equal(h.confirm.props.disabled, true)
  assert.equal(h.confirm.props.onClick, undefined)
  assert.equal(h.choices.length, 2)
  h.choices[0].props.onClick()
  assert.equal(h.confirm.props.disabled, false)
  assert.deepEqual(h.plays, [], '選択だけでは召喚しない')
  h.confirm.props.onClick()
  assert.deepEqual(h.plays, [0])
  h.choices[1].props.onClick()
  h.confirm.props.onClick()
  assert.deepEqual(h.plays, [0, 1])
})

test('和牛は0〜2体を選べ、選択した数をそのまま送る', () => {
  const h = createHarness('wagyu', ['namahamu', 'namahamu'])
  assert.equal(h.choices.length, 3)
  h.choices[2].props.onClick()
  assert.equal(h.choices[2].props['aria-pressed'], true)
  h.confirm.props.onClick()
  assert.deepEqual(h.plays, [2])
})

test('机が満杯でも生贄で空きを作れるが、生ハムを残す選択はできない', () => {
  const h = createHarness('karubi', ['namahamu', ...Array(7).fill('tamago')])
  assert.equal(h.choices[0].props.disabled, true)
  assert.equal(h.choices[1].props.disabled, false)
  h.choices[1].props.onClick()
  assert.equal(h.confirm.props.disabled, false)
  h.confirm.props.onClick()
  assert.deepEqual(h.plays, [1])
})

test('生ハムがない場合は追加選択なしで従来の召喚ができる', () => {
  const h = createHarness('wagyu', [])
  assert.equal(h.choices.length, 0)
  assert.equal(h.confirm.props.disabled, false)
  h.confirm.props.onClick()
  assert.deepEqual(h.plays, [0])
})

test('AP不足・別カード・生ハム減少では以前の選択で召喚しない', () => {
  const h = createHarness('wagyu', ['namahamu', 'namahamu'])
  h.choices[2].props.onClick()
  h.props.inspect.canPlay = false
  assert.equal(h.confirm.props.disabled, true)
  assert.equal(h.confirm.props.onClick, undefined)
  h.props.inspect.canPlay = true
  h.props.fieldCards.pop()
  assert.equal(h.confirm.props.disabled, true, '消費対象が減ったら再選択する')
  h.choices[1].props.onClick()
  h.props.inspect.card = { ...cards.getCardById('karubi'), instanceId: 'hand:karubi' }
  assert.equal(h.confirm.props.disabled, true, '別の手札へ選択を引き継がない')
  h.buttons.find(node => node.props.className === 'battle-detail-cancel').props.onClick()
  assert.equal(h.closes, 1)
  assert.deepEqual(h.plays, [])
})

for (const [id, count, bonus] of [['karubi', 1, 6], ['wagyu', 2, 12]]) {
  test(`インバウン丼設置時の${id}は選択肢と攻撃予測へ生贄強化を含める`, () => {
    const h = createHarness(id, Array(count).fill('namahamu'))
    h.props.sacrificeAttackBonus = 2
    assert.ok(h.textContent(h.choices[count]).includes(`攻撃 +${bonus}`))
    h.choices[count].props.onClick()
    assert.equal(h.attackText, `${cards.getCardById(id).attack} +${bonus}（生贄）`)
    h.confirm.props.onClick()
    assert.deepEqual(h.plays, [count])
  })
}

test('生ハムの詳細表示はインバウン丼の通常攻撃+2を表示し、肉寿司には付けない', () => {
  const ham = createHarness('namahamu', [])
  ham.props.attackBuff = { '生ハム': 2 }
  assert.equal(ham.attackText, '1 +2')
  const meat = createHarness('gyutan', [])
  meat.props.attackBuff = { '生ハム': 2 }
  assert.equal(meat.attackText, '5')
})


test('サーモンは相手の持続型を明示選択し、同名個体の選んだIDだけを送る', () => {
  const h = createHarness('salmon', ['namahamu'], ['tamago', 'namahamu', 'namahamu'])
  h.props.enemyFieldCards[2].turnsLeft = 1
  h.props.enemyCardAttack = () => 4
  assert.equal(h.choices.length, 2, '相手の即時型と自分の生ハムは対象外')
  assert.equal(h.confirm.props.disabled, true)
  assert.equal(h.confirm.props.onClick, undefined)
  assert.ok(h.textContent(h.choices[0]).includes('左から2枚目'))
  assert.ok(h.textContent(h.choices[1]).includes('攻撃 4・残り1ターン'))
  h.choices[1].props.onClick()
  assert.equal(h.choices[1].props['aria-pressed'], true)
  assert.deepEqual(h.plays, [], '対象選択だけでは手札もAPも消費しない')
  h.confirm.props.onClick()
  assert.deepEqual(h.plays, [0])
  assert.deepEqual(h.targetsSent, ['enemy:2'])
})

test('サーモンは対象なしで通常召喚でき、派生サーモンは選択を求めない', () => {
  const empty = createHarness('salmon', [], ['tamago'])
  assert.equal(empty.choices.length, 0)
  assert.equal(empty.confirm.props.disabled, false)
  empty.confirm.props.onClick()
  assert.deepEqual(empty.targetsSent, [undefined])
  const other = cards.CARDS.find(card => card.base === 'サーモン' && card.id !== 'salmon')
  assert.ok(other)
  const derived = createHarness(other.id, [], ['namahamu'])
  assert.equal(derived.choices.length, 0)
  assert.equal(derived.confirm.props.disabled, false)
})

test('サーモンの選択キャンセル・召喚不可・対象消滅は操作を送信しない', () => {
  const h = createHarness('salmon', [], ['namahamu', 'namahamu'])
  h.choices[0].props.onClick()
  h.props.inspect.canPlay = false
  assert.ok(h.choices.every(choice => choice.props.disabled))
  assert.equal(h.confirm.props.disabled, true)
  assert.equal(h.confirm.props.onClick, undefined)
  h.props.inspect.canPlay = true
  h.props.enemyFieldCards.shift()
  assert.equal(h.confirm.props.disabled, true, '消えた対象をそのまま送れない')
  assert.equal(h.confirm.props.onClick, undefined)
  h.choices[0].props.onClick()
  assert.equal(h.confirm.props.disabled, false)
  h.buttons.find(node => node.props.className === 'battle-detail-cancel').props.onClick()
  assert.equal(h.closes, 1)
  assert.deepEqual(h.plays, [])
})

test('別個体のサーモンや机のカード詳細には破壊対象の選択を引き継がない', () => {
  const h = createHarness('salmon', [], ['namahamu'])
  h.choices[0].props.onClick()
  h.props.inspect.card = { ...h.props.inspect.card, instanceId: 'hand:second-salmon' }
  assert.equal(h.confirm.props.disabled, true)
  h.props.inspect.remainingTurns = 1
  h.props.inspect.canPlay = false
  assert.equal(h.choices.length, 0)
  assert.equal(h.confirm, undefined)
  assert.deepEqual(h.plays, [])
})


for (const id of ['chutoro', 'otoro', 'bintoro', 'tekka_maki', 'duke_maguro']) test(`${id}の詳細・手札・机はコンボ成立状態を即座に反映する`, () => {
  const h = createHarness(id, [])
  for (const component of ['CardDetailSheet', 'HandSushi', 'FieldSushi']) {
    const overrides = component === 'FieldSushi' ? { card: rules.toField(cards.getCardById(id), `field:${id}`) } : {}
    h.props.combosFired = []
    assert.match(h.effectMarkup(component, overrides), /data-active="false"/)
    h.props.combosFired = ['akami_mori']
    assert.match(h.effectMarkup(component, overrides), /data-active="true"/)
    h.props.combosFired = ['maki_comp_3']
    assert.match(h.effectMarkup(component, overrides), /data-active="false"/, '他のコンボでは有効にしない')
  }
})

test('中トロ・大トロは初回成立召喚から有効と説明し成立前の手札は灰色に保つ', () => {
  for (const id of ['chutoro', 'otoro']) {
    const h = createHarness(id, [])
    assert.match(h.effectMarkup(), /初めて三種が揃う召喚から有効/)
    assert.doesNotMatch(h.effectMarkup(), /発動しない|追加効果なし/)
    assert.match(h.effectMarkup(), /data-active="false"/)
  }
  assert.match(createHarness('chutoro', []).effectMarkup(), /自分の満腹度を10回復/)
  const otoro = createHarness('otoro', [])
  const inactive = otoro.effectMarkup()
  assert.match(inactive, /ビントロ1枚を山札のランダムな位置へ/)
  assert.match(inactive, /自分の満腹度を5回復/)
  assert.match(inactive, /次の自分の開始時、回復後AP・上限＋1/)
  assert.match(inactive, /次APは1回だけ有効／重複可能/)
  assert.equal((inactive.match(/data-active="false"/g) ?? []).length, 3, '大トロの3効果だけを条件付き表示にする')
  otoro.props.combosFired = ['akami_mori']
  assert.equal((otoro.effectMarkup().match(/data-active="true"/g) ?? []).length, 3)
})

test('手札の短い説明はAP不足でも成立済みコンボ効果を有効表示する', () => {
  const h = createHarness('bintoro', [])
  h.props.inspect.canPlay = false
  assert.match(h.effectMarkup('HandSushi'), /data-active="false"/)
  h.props.combosFired = ['akami_mori']
  assert.match(h.effectMarkup('HandSushi'), /data-active="true"/)
  assert.equal(h.confirm.props.disabled, true, '効果表示の成立と召喚可否は独立する')
})

test('机の短い説明はそのカード所有者のコンボ状態を反映する', () => {
  const h = createHarness('tekka_maki', [])
  const card = rules.toField(cards.getCardById('tekka_maki'), 'enemy-tekka')
  h.props.combosFired = []
  assert.match(h.effectMarkup('FieldSushi', { card, isEnemy: true }), /data-active="false"/)
  h.props.combosFired = ['akami_mori']
  assert.match(h.effectMarkup('FieldSushi', { card, isEnemy: true }), /data-active="true"/)
})

test('生ハムは生成専用の説明と0AP・攻撃1・持続3ターンを表示する', () => {
  const h = createHarness('namahamu', [])
  const stats = h.textContent(h.nodes.find(node => node.props.className === 'battle-detail-stats'))
  assert.match(stats, /消費AP0攻撃力1持続ターン3ターン/)
  assert.match(h.effectMarkup(), /生成専用：購入・デッキ編成不可/)
  assert.match(h.effectMarkup('HandSushi'), /生成専用・生贄にできる/)
  assert.doesNotMatch(h.effectMarkup(), /data-combo-condition=/)
})

test('づけマグロは通常の消化停止1回を暗くせず、成立後の2回だけを切り替える', () => {
  const h = createHarness('duke_maguro', [])
  for (const combosFired of [[], ['akami_mori']]) {
    h.props.combosFired = combosFired
    const html = h.effectMarkup()
    assert.match(html, /<span>召喚時：相手の開始時の消化を1回停止<\/span>/)
    assert.match(html, /data-combo-condition="akami_mori"[^>]*>赤身三種盛り成立後：2回停止に強化<\/span>/)
  }
})

test('三種成立が不要な赤身支援とイベント型のえびは暗くしない', () => {
  for (const id of ['maguro', 'tuna_gunkan', 'ebi']) {
    const h = createHarness(id, [])
    assert.doesNotMatch(h.effectMarkup(), /data-combo-condition=/)
    h.props.combosFired = ['akami_mori', 'umi_zanmai']
    assert.doesNotMatch(h.effectMarkup(), /data-combo-condition=/)
  }
})


test('現行の全カードは対戦の手札・机・詳細で全文と短文の説明が欠けない', () => {
  const plainText = html => html.replace(/<span class="card-effect-line">/g, '\n')
    .replace(/<[^>]*>/g, '').replace(/^\n/, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
  for (const card of [...cards.CARDS, ...cards.GENERATED_CARDS]) {
    if (card.effect) {
      assert.ok(presentation.EFFECT_FULL[card.effect], `${card.name}: 全文の登録が必要`)
      assert.ok(presentation.EFFECT_SHORT[card.effect], `${card.name}: 短文の登録が必要`)
    }
    const h = createHarness(card.id, [])
    // オンラインでも渡るシリアライズ済みの手札個体を使う。
    h.props.inspect.card = JSON.parse(JSON.stringify(h.props.inspect.card))
    const full = presentation.getCardEffectDescription(card)
    const short = presentation.getCardEffectDescription(card, 'short')
    for (const description of [full, short]) {
      assert.ok(description.trim(), `${card.name}: 空の説明`)
      assert.doesNotMatch(description, /準備中|詳細を確認|\[object Object\]/, card.name)
    }
    const fullMarkup = h.effectMarkup()
    assert.equal((fullMarkup.match(/class="card-effect-line"/g) ?? []).length, full.split('\n').length, `${card.name}: 1効果1行`)
    assert.ok(full.split('\n').every(line => line.trim() === line && line.length > 0), `${card.name}: 字下げ・空行なし`)
    assert.equal(plainText(fullMarkup), full, `${card.name}: 手札の詳細（改行含め一致）`)
    assert.equal(plainText(h.effectMarkup('HandSushi')), short, `${card.name}: 手札`)
    const fieldCard = JSON.parse(JSON.stringify(rules.toField(card, `field:${card.id}`)))
    assert.equal(plainText(h.effectMarkup('FieldSushi', { card: fieldCard })), short, `${card.name}: 机`)
    h.props.inspect = { card: fieldCard, remainingTurns: fieldCard.turnsLeft, canPlay: false }
    assert.equal(plainText(h.effectMarkup()), full, `${card.name}: 机の詳細`)
  }
})

test('既知の旧焼肉カードは旧効果だけを説明し、新しい生ハム供給を誤表示しない', () => {
  const h = createHarness('yakiniku', [])
  h.props.inspect.card.effect = 'belly_boost_persist_50'
  assert.match(h.effectMarkup(), /相手のお腹50以上：攻撃＋2/)
  assert.match(h.effectMarkup('HandSushi'), /相手腹50以上で攻撃\+2/)
  assert.doesNotMatch(h.effectMarkup(), /準備中|生ハム|山札/)
  assert.match(presentation.getCardEffectDescription(cards.getCardById('yakiniku')), /山札/)
})

test('生ハムの説明は机・山札の供給元と肉祭りの累積強化を含む', () => {
  const description = presentation.getCardEffectDescription(cards.NAMAHAM_CARD)
  assert.deepEqual(description.split('\n'), [
    '牛タン・ローストビーフ：机に生成',
    '焼肉・肉祭り：山札のランダムな位置へ1枚追加',
    'カルビ・和牛の生贄に使用可能',
    '肉祭り：自分の生ハムの攻撃＋1（対戦中・累積）',
    '生成専用：購入・デッキ編成不可',
  ])
  assert.doesNotMatch(description, /手札に(?:0AP生ハム)?2枚|手札7枚を超える/)
})


for (const [id, cost] of [['saba', 1], ['iwashi_shoga', 2]]) {
  test(`${id}は通常召喚を初期選択とし、防御予約を明示選択して送る`, () => {
    const h = createHarness(id, [])
    h.props.kiretaStack = cost + 1
    assert.equal(h.choices.length, 2)
    assert.equal(h.choices[0].props['aria-pressed'], true)
    h.confirm.props.onClick()
    assert.deepEqual(h.reservationsSent, [false])
    h.choices[1].props.onClick()
    assert.equal(h.choices[1].props['aria-pressed'], true)
    assert.match(h.textContent(h.confirm), new RegExp(`切れ味 −${cost}`))
    assert.equal(h.attackText, `${cards.getCardById(id).attack} +1（切れ味）`)
    h.confirm.props.onClick()
    assert.deepEqual(h.reservationsSent, [false, true])
  })
}

test('切れ味不足・消費済み・防御枠使用中でも通常召喚できる', () => {
  for (const reason of ['insufficient', 'spent', 'reserved', 'ready']) {
    const h = createHarness('iwashi_shoga', [])
    h.props.kiretaStack = reason === 'insufficient' ? 1 : 3
    h.props.kiretaSpent = reason === 'spent'
    if (reason === 'reserved' || reason === 'ready') {
      h.props.fieldCards = [{ ...rules.toField(cards.getCardById('saba'), 'guard'), defenseState: reason }]
    }
    assert.equal(h.choices[0].props.disabled, false, reason)
    assert.equal(h.choices[1].props.disabled, true, reason)
    assert.equal(h.confirm.props.disabled, false, reason)
    h.confirm.props.onClick()
    assert.deepEqual(h.reservationsSent, [false])
  }
})

test('防御予約の選択後に切れ味不足やAP不足になれば送信しない', () => {
  const h = createHarness('saba', [])
  h.props.kiretaStack = 1
  h.choices[1].props.onClick()
  h.props.kiretaStack = 0
  assert.equal(h.confirm.props.disabled, true)
  assert.equal(h.confirm.props.onClick, undefined)
  h.choices[0].props.onClick()
  assert.equal(h.confirm.props.disabled, false)
  h.props.inspect.canPlay = false
  assert.equal(h.confirm.props.disabled, true)
  assert.ok(h.choices.every(choice => choice.props.disabled))
  assert.deepEqual(h.reservationsSent, [])
})

test('別の手札個体には防御予約を引き継がず、場のカードには選択を出さない', () => {
  const h = createHarness('saba', [])
  h.props.kiretaStack = 3
  h.choices[1].props.onClick()
  h.props.inspect.card = { ...cards.getCardById('iwashi_shoga'), instanceId: 'another-hand' }
  assert.equal(h.choices[0].props['aria-pressed'], true)
  h.confirm.props.onClick()
  assert.deepEqual(h.reservationsSent, [false])
  h.props.inspect.remainingTurns = 1
  h.props.inspect.canPlay = false
  assert.equal(h.choices.length, 0)
})

function createReactionHarness(defenseId = 'iwashi_shoga') {
  const hooks = []
  let cursor = 0
  const react = {
    useRef: initial => ({ current: initial }), useId: () => 'reaction', useEffect() {},
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], value => { hooks[index] = value }]
    },
  }
  const { HikariDefensePrompt } = loadComponent('HikariDefensePrompt', {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), './battleEngine': rules,
    './DefensePrompt.css': {}, './HikariDefensePrompt.css': {},
  })
  const responses = []
  const props = {
    reaction: { attackerId: 2, defenderId: 1, defenseCardId: 'guard', fixedDamage: 5, kaisenReattack: false },
    defenseCard: { ...rules.toField(cards.getCardById(defenseId), 'guard'), defenseState: 'ready' },
    enemyField: ['tamago', 'tamago', 'ika'].map((id, index) => rules.toField(cards.getCardById(id), `enemy:${index}`)),
    attackBuff: {}, kiretaStack: 0, enemyBelly: 0, ready: true,
    onRespond: (useDefense, targetFieldId) => responses.push({ useDefense, targetFieldId }),
  }
  const textContent = value => Array.isArray(value) ? value.map(textContent).join('')
    : value && typeof value === 'object' && value.props ? textContent(value.props.children)
      : typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const descendants = value => Array.isArray(value) ? value.flatMap(descendants)
    : value && typeof value === 'object' && value.props ? [value, ...descendants(value.props.children)] : []
  return {
    props, responses, textContent,
    get buttons() { cursor = 0; return descendants(HikariDefensePrompt(props)).filter(node => node.type === 'button') },
    get targets() { return this.buttons.filter(node => 'aria-pressed' in node.props) },
    get use() { return this.buttons.find(node => node.props.className === 'battle-defense__use') },
    get skip() { return this.buttons.find(node => node.props.className === 'battle-defense__keep') },
  }
}

test('イワシの防御は即時型と同名個体を選択でき、指定fidを送る', () => {
  const h = createReactionHarness()
  h.props.attackBuff['たまご'] = 3
  assert.equal(h.use.props.disabled, true)
  assert.equal(h.use.props.onClick, undefined)
  assert.equal(h.targets.length, 3)
  assert.match(h.textContent(h.targets[1]), /左から2枚目.*たまご.*即時型/)
  h.targets[1].props.onClick()
  assert.deepEqual(h.responses, [])
  assert.equal(h.use.props.disabled, false)
  h.use.props.onClick()
  assert.deepEqual(h.responses, [{ useDefense: true, targetFieldId: 'enemy:1' }])
})

test('防御対象の攻撃予測は場全体の軍艦倍率を含め、半減済みは重ねて割らない', () => {
  const h = createReactionHarness()
  h.props.enemyField = ['uni_gunkan', 'tekka_maki', 'kappa_maki', 'kanpyo_maki', 'natto_maki'].map((id, i) => {
    const card = cards.getCardById(id)
    assert.ok(card, id)
    return rules.toField(card, `enemy:${i}`)
  })
  assert.match(h.textContent(h.targets[0]), /攻撃 30 → 15/)
  h.props.enemyField[0].attackHalved = true
  assert.match(h.textContent(h.targets[0]), /攻撃 15 → 15/)
})

test('退場した対象・別の防御個体・通信中の古い選択は送信しない', () => {
  const h = createReactionHarness()
  h.targets[0].props.onClick()
  h.props.enemyField.shift()
  assert.equal(h.use.props.disabled, true)
  h.targets[0].props.onClick()
  h.props.reaction = { ...h.props.reaction, defenseCardId: 'other-guard' }
  assert.equal(h.use.props.disabled, true)
  h.props.ready = false
  assert.ok(h.buttons.every(button => button.props.disabled))
  assert.equal(h.skip.props.onClick, undefined)
  assert.deepEqual(h.responses, [])
})

test('サバは対象を選ばずランダム防御を送信し、見送りには対象を送らない', () => {
  const h = createReactionHarness('saba')
  assert.equal(h.targets.length, 0)
  h.use.props.onClick()
  h.skip.props.onClick()
  assert.deepEqual(h.responses, [
    { useDefense: true, targetFieldId: undefined }, { useDefense: false, targetFieldId: undefined },
  ])
  h.props.enemyField = [{ ...h.props.enemyField[0], defenseState: 'ready' }]
  assert.equal(h.use.props.disabled, true)
  assert.equal(h.skip.props.disabled, false)
})
