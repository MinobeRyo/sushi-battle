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
const preview = loadTs('src/features/battle/defensePreview.ts')
const source = fs.readFileSync(new URL('../src/features/battle/DefensePrompt.tsx', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
})
const descendants = value => Array.isArray(value) ? value.flatMap(descendants)
  : value && typeof value === 'object' && value.props ? [value, ...descendants(value.props.children)] : []
const textContent = value => Array.isArray(value) ? value.map(textContent).join('')
  : value && typeof value === 'object' && value.props ? textContent(value.props.children)
    : typeof value === 'string' || typeof value === 'number' ? String(value) : ''

function harness(defenseId) {
  const hooks = []
  let cursor = 0
  const react = {
    useRef: initial => ({ current: initial }), useId: () => 'defense', useEffect() {},
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value }]
    },
  }
  const imports = { react, 'react/jsx-runtime': require('react/jsx-runtime'), './battleEngine': rules,
    './defensePreview': preview, '../../components/SushiArt': { SushiArt: () => null }, './DefensePrompt.css': {} }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(imports, name), `未定義の依存: ${name}`)
    return imports[name]
  }, module, module.exports)
  const responses = []
  const field = (id, fid) => rules.toField(cards.getCardById(id), fid)
  const props = {
    attack: { source: 'end_turn', amount: 16, attackerId: 2, defenderId: 1,
      ...(defenseId ? { defenseCardId: 'guard' } : {}) },
    belly: 10, gari: 2, ready: true,
    enemyField: [field('maguro', 'enemy-1'), field('tamago', 'enemy-2')],
    ...(defenseId ? { defenseCard: { ...field(defenseId, 'guard'), defenseState: 'ready' } } : {}),
    onRespond: (...args) => responses.push(args),
  }
  return {
    props, responses,
    get nodes() { cursor = 0; return descendants(module.exports.DefensePrompt(props)) },
    byClass(name) { return this.nodes.find(node => node.props.className === name) },
    get use() { return this.byClass('battle-defense__use') },
    get keep() { return this.byClass('battle-defense__keep') },
    get confirm() { return this.byClass('battle-defense__confirm') },
    get options() { return this.byClass('battle-defense__options').props.children.filter(Boolean) },
    get targets() { return this.byClass('battle-defense__targets')?.props.children ?? [] },
  }
}

test('ガリだけなら2択で確定し、被ダメージと満腹を表示する', () => {
  const h = harness()
  h.props.belly = 90
  assert.match(textContent(h.use), /\+8ダメージお腹 90 → 98/)
  assert.match(textContent(h.keep), /\+16ダメージお腹 90 → 100満腹で負け/)
  assert.equal(h.confirm, undefined)
  h.use.props.onClick()
  h.keep.props.onClick()
  assert.deepEqual(h.responses, [[true, false], [false, false]])
})

test('在庫0ではガリを送信できず、通信待ちでは両方を送信できない', () => {
  const h = harness()
  h.props.gari = 0
  assert.equal(h.use.props.disabled, true)
  assert.equal(h.use.props.onClick, undefined)
  assert.equal(h.keep.props.disabled, false)
  h.props.ready = false
  assert.equal(h.keep.props.disabled, true)
  assert.equal(h.keep.props.onClick, undefined)
  assert.deepEqual(h.responses, [])
})

test('ガリと指定防御を併用し、対象が選ばれてから確定する', () => {
  const h = harness('iwashi_shoga')
  assert.equal(h.use, undefined)
  h.options[0].props.onClick()
  h.options[1].props.onClick()
  assert.equal(h.confirm.props.disabled, true)
  h.confirm.props.onClick()
  assert.deepEqual(h.responses, [])
  h.targets[0].props.onClick()
  assert.equal(h.confirm.props.disabled, false)
  assert.match(textContent(h.byClass('battle-defense__preview')), /\+16 → \+5/)
  h.confirm.props.onClick()
  assert.deepEqual(h.responses, [[true, true, 'enemy-1']])
  h.props.ready = false
  assert.equal(h.confirm.props.disabled, true)
  assert.ok(h.targets.every(node => node.props.disabled))
})

test('ランダム防御と召喚時のガリ使用不可を維持する', () => {
  const h = harness('saba')
  h.props.attack.source = 'summon'
  h.props.attack.kaisenReattack = true
  h.props.attack.fixedDamage = 7
  h.props.enemyField = [rules.toField(cards.getCardById('ebi'), 'enemy-ebi')]
  assert.equal(h.options.length, 1)
  h.options[0].props.onClick()
  assert.equal(h.targets.length, 0)
  h.confirm.props.onClick()
  assert.deepEqual(h.responses, [[false, true, undefined]])
})

test('防御対象8枚を同時に比較でき、後半の個体を選んで正しいfidを送る', () => {
  const h = harness('iwashi_shoga')
  h.props.enemyField = Array.from({ length: 8 }, (_, index) => rules.toField(cards.getCardById('tamago'), `enemy-${index}`))
  h.props.attack.amount = rules.calcFieldDmg(h.props.enemyField, {})
  h.options[1].props.onClick()
  assert.equal(h.targets.length, 8, '後半の対象もページ操作なしで選べる')
  assert.equal(h.confirm.props.disabled, true)
  assert.ok(h.targets.every(node => /受 \+30 （攻4→2）腹40 · 耐える/.test(textContent(node))), '全候補の攻撃と軽減結果を選択前から比較できる')
  h.targets[7].props.onClick()
  assert.equal(h.confirm.props.disabled, false)
  assert.equal(h.targets[7].props['aria-pressed'], true)
  assert.match(textContent(h.byClass('battle-defense__preview')), /\+32 → \+30/)
  h.confirm.props.onClick()
  assert.deepEqual(h.responses, [[false, true, 'enemy-7']])
})

test('選択前から耐える防御と敗北する防御を区別する', () => {
  const h = harness('iwashi_shoga')
  h.props.belly = 89
  h.options[1].props.onClick()
  assert.equal(h.targets[0].props['data-lethal'], false)
  assert.equal(h.targets[0].props['data-danger'], true)
  assert.match(textContent(h.targets[0]), /腹99 · 耐える/)
  assert.equal(h.targets[1].props['data-lethal'], true)
  assert.match(textContent(h.targets[1]), /腹100 · 敗北/)
})
