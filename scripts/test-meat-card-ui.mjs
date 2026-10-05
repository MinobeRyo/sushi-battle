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
  let closes = 0
  const props = {
    inspect: { card: { ...findCard(cardId), instanceId: `hand:${cardId}` }, canPlay: true },
    attackBuff: {}, kiretaStack: 0,
    fieldCards: fieldIds.map((id, index) => rules.toField(findCard(id), `field:${index}`)),
    enemyFieldCards: enemyIds.map((id, index) => rules.toField(findCard(id), `enemy:${index}`)),
    onPlay: (count, targetFieldId) => { plays.push(count); targetsSent.push(targetFieldId) },
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
    props, plays, targetsSent,
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

for (const [id, count, bonus] of [['karubi', 1, 9], ['wagyu', 2, 20]]) {
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


for (const id of ['bintoro', 'tekka_maki', 'duke_maguro']) test(`${id}の詳細はコンボ成立状態を即座に反映する`, () => {
  const h = createHarness(id, [])
  assert.match(h.effectMarkup(), /data-active="false"/)
  h.props.combosFired = ['akami_mori']
  assert.match(h.effectMarkup(), /data-active="true"/)
  h.props.combosFired = ['maki_comp_3']
  assert.match(h.effectMarkup(), /data-active="false"/, '他のコンボでは有効にしない')
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

test('生ハムの生成専用説明は共通描画へ移した後も維持する', () => {
  const h = createHarness('namahamu', [])
  assert.match(h.effectMarkup(), /0AP・基本攻撃1・自分の3ターン持続/)
  assert.match(h.effectMarkup('HandSushi'), /生成専用・生贄にできる/)
  assert.doesNotMatch(h.effectMarkup(), /data-combo-condition=/)
})

test('づけマグロは通常の消化停止1回を暗くせず、成立後の2回だけを切り替える', () => {
  const h = createHarness('duke_maguro', [])
  for (const combosFired of [[], ['akami_mori']]) {
    h.props.combosFired = combosFired
    const html = h.effectMarkup()
    assert.match(html, /<span>召喚時、相手のターン開始時の消化を1回止めます。<\/span>/)
    assert.match(html, /data-combo-condition="akami_mori"[^>]*>自分が赤身三種盛りを成立させた後は2回停止。<\/span>/)
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
