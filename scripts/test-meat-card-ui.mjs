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
const source = fs.readFileSync(new URL('../src/features/battle/BattleCards.tsx', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
})

// 描画された実コンポーネントのボタンを押し、送信される消費数を確認する。
function createHarness(cardId, fieldIds) {
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
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(imports, name), `未定義の依存: ${name}`)
    return imports[name]
  }, module, module.exports)
  const findCard = id => cards.getCardById(id) ?? cards.GENERATED_CARDS.find(card => card.id === id)
  const plays = []
  let closes = 0
  const props = {
    inspect: { card: { ...findCard(cardId), instanceId: `hand:${cardId}` }, canPlay: true },
    attackBuff: {}, kiretaStack: 0,
    fieldCards: fieldIds.map((id, index) => rules.toField(findCard(id), `field:${index}`)),
    onPlay: count => plays.push(count),
    onClose: () => { closes += 1 },
  }
  function BattleHarness() {
    cursor = 0
    return module.exports.CardDetailSheet(props)
  }
  const descendants = value => Array.isArray(value) ? value.flatMap(descendants)
    : value && typeof value === 'object' && value.props ? [value, ...descendants(value.props.children)] : []
  return {
    props, plays,
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
