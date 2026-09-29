#!/usr/bin/env node
// 実際のローカルコントローラを、手動時計と最小限のReactフックで動かす。
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const byId = id => structuredClone(CARDS.find(card => card.id === id))
const cardInstance = (id, playerId, suffix = id) => ({ ...byId(id), instanceId: `test:p${playerId}:${suffix}` })
let passed = 0

function test(label, run, mode = 'cpu', options = {}) {
  const slots = []
  const cleanups = []
  let cursor = 0
  let now = 0
  let sequence = 0
  let summons = 0
  const timers = new Map()
  const nativeSetTimeout = globalThis.setTimeout
  const nativeClearTimeout = globalThis.clearTimeout
  globalThis.setTimeout = (callback, delay) => {
    const id = ++sequence
    timers.set(id, { callback, at: now + delay })
    return id
  }
  globalThis.clearTimeout = id => timers.delete(id)
  const react = {
    useRef: initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useState: initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useReducer: (reducer, initial) => {
      const [value, setValue] = react.useState(initial)
      return [value, action => setValue(previous => reducer(previous, action))]
    },
    useEffect: effect => {
      const index = cursor++
      if (!(index in slots)) {
        slots[index] = true
        cleanups.push(effect())
      }
    },
  }
  const { useBattleGame } = loadTs('src/features/battle/useBattleGame.ts', {
    react,
    './useComboAnnouncements': {
      useComboAnnouncements: () => ({ comboAnim: null, announceCombo() {}, clearCombos() {} }),
    },
  })
  const deck = Array.from({ length: 10 }, () => byId('tamago'))
  function BattleHarness() {
    cursor = 0
    return useBattleGame({ p2SideMenu: null, ...options, deck, p2Deck: deck, mode, onSummon: () => { summons += 1 } })
  }
  BattleHarness()
  const harness = {
    get game() { return BattleHarness() },
    get state() { return slots[0].current },
    get summonCount() { return summons },
    advance(ms) {
      const until = now + ms
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > until) break
        now = next[1].at
        timers.delete(next[0])
        next[1].callback()
      }
      now = until
    },
  }
  try {
    run(harness)
    passed += 1
    console.log(`  ✓ ${label}`)
  } finally {
    cleanups.forEach(cleanup => cleanup?.())
    globalThis.setTimeout = nativeSetTimeout
    globalThis.clearTimeout = nativeClearTimeout
  }
}

const prepareCombo = (state, playerId) => {
  const player = state.players[playerId]
  player.hand = [cardInstance('maguro', playerId), cardInstance('tamago', playerId)]
  player.summonedIds = ['chutoro', 'otoro']
  player.ap = 10
  player.apNextBonus = 5
}

console.log('\n[ローカル防御] CPU停止・再開・同端末の手渡し')
test('CPUの召喚コンボは回答まで停止し、回答後に次の召喚と終了攻撃へ進む', h => {
  prepareCombo(h.state, 2)
  h.game.endTurn()
  h.advance(200 + 700)
  assert.equal(h.game.s.phase, 'defending')
  assert.equal(h.state.pendingAttack.source, 'summon')
  assert.equal(h.state.players[2].hand.length, 1)
  assert.equal(h.state.players[1].belly, 0)
  const waitingRevision = h.state.revision
  h.advance(5000)
  assert.equal(h.state.revision, waitingRevision)
  const respond = h.game.respondDefense
  respond(true)
  respond(true)
  assert.equal(h.state.players[1].gari, 1, '連打でガリを重複消費しない')
  assert.equal(h.state.players[1].belly, 2)
  assert.equal(h.game.s.phase, 'cpu')
  h.advance(449)
  assert.equal(h.state.players[2].hand.length, 1)
  h.advance(1)
  assert.equal(h.state.players[2].hand.length, 0)
  h.advance(900)
  assert.equal(h.game.s.phase, 'defending')
  assert.equal(h.state.pendingAttack.source, 'end_turn')
  h.game.respondDefense(false)
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.activePlayerId, 1)
  assert.equal(h.state.turn, 2)
})

test('CPUもガリで回答し、召喚時は人間の手番を維持する', h => {
  prepareCombo(h.state, 1)
  h.game.playCard(h.state.players[1].hand[0])
  assert.equal(h.game.s.phase, 'waiting')
  const waitingRevision = h.state.revision
  h.game.respondDefense(true)
  h.game.endTurn()
  h.game.playCard(h.state.players[1].hand[0])
  assert.equal(h.state.revision, waitingRevision, 'CPUの回答中に人間が割り込めない')
  h.advance(550)
  assert.equal(h.state.players[2].gari, 1)
  assert.equal(h.state.players[2].belly, 2)
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.activePlayerId, 1)
  h.game.endTurn()
  h.advance(200 + 550)
  assert.equal(h.state.players[2].gari, 0)
  assert.equal(h.game.s.phase, 'cpu')
  h.game.restart()
  const freshState = structuredClone(h.state)
  h.advance(10000)
  assert.deepEqual(h.state, freshState, 'リスタート後に古いCPU操作が走らない')
})

test('ガリが0なら防御待ちを挟まずCPU攻撃が完了する', h => {
  h.state.players[1].gari = 0
  h.state.players[2].hand = [cardInstance('tamago', 2)]
  h.game.endTurn()
  h.advance(200 + 700 + 900)
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.pendingAttack, null)
  assert.equal(h.state.activePlayerId, 1)
})

test('同端末の召喚防御は相手へ渡してから回答し、攻撃者へ戻る', h => {
  prepareCombo(h.state, 1)
  h.game.setInspect({ card: h.state.players[1].hand[0], canPlay: true })
  h.game.playCard(h.state.players[1].hand[0])
  assert.equal(h.game.s.phase, 'pass')
  assert.equal(h.game.s.passToPlayerId, 2)
  assert.deepEqual(h.game.s.pHand, [], '受け渡し中は手札を描画しない')
  assert.equal(h.game.inspect, null)
  h.game.respondDefense(true)
  assert.equal(h.state.players[2].gari, 2, '受け渡す前に回答できない')
  h.game.handlePassReady()
  assert.equal(h.game.s.phase, 'defending')
  assert.equal(h.game.s.activePlayer, 2)
  assert.ok(h.game.s.pHand.every(card => card.instanceId.includes(':p2:')))
  h.game.respondDefense(true)
  assert.equal(h.game.s.phase, 'pass')
  assert.equal(h.game.s.passToPlayerId, 1)
  assert.deepEqual(h.game.s.pHand, [])
  h.game.handlePassReady()
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.game.s.activePlayer, 1)
  assert.equal(h.game.s.cGari, 1)
}, 'two_player')

test('同端末の終了攻撃を防御した後は、そのまま防御側の手番になる', h => {
  h.game.playCard(h.game.s.pHand[0])
  h.game.endTurn()
  h.advance(200)
  assert.equal(h.game.s.phase, 'pass')
  assert.equal(h.game.s.passToPlayerId, 2)
  h.game.handlePassReady()
  assert.equal(h.game.s.phase, 'defending')
  h.game.respondDefense(false)
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.game.s.passToPlayerId, null)
  assert.equal(h.game.s.activePlayer, 2)
  assert.equal(h.state.activePlayerId, 2)
}, 'two_player')

test('同端末の追加注文も各本人へ渡し、最後に手番プレイヤーへ戻す', h => {
  for (const player of Object.values(h.state.players)) {
    player.hand = []
    player.deck = []
  }
  h.game.endTurn()
  h.advance(200)
  assert.equal(h.game.s.passToPlayerId, 2)
  h.game.handlePassReady()
  assert.equal(h.game.s.phase, 'reorder')
  h.game.handleReorderComplete([byId('tamago')])
  assert.equal(h.game.s.phase, 'pass')
  assert.equal(h.game.s.passToPlayerId, 1)
  h.game.handlePassReady()
  assert.equal(h.game.s.phase, 'reorder')
  h.game.handleReorderComplete([byId('maguro')])
  assert.equal(h.game.s.passToPlayerId, 2)
  assert.deepEqual(h.game.s.pHand, [])
  h.game.handlePassReady()
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.game.s.activePlayer, 2)
}, 'two_player')

test('防御中のサイドメニュー使用を止め、回答後の使用・召喚SE・再戦時の復元を保つ', h => {
  prepareCombo(h.state, 2)
  h.game.endTurn()
  h.advance(200 + 700)
  assert.equal(h.game.s.phase, 'defending')
  assert.equal(h.game.s.pSideMenu.id, 'miso')
  const waitingState = structuredClone(h.state)
  h.game.useSideMenu()
  assert.deepEqual(h.state, waitingState, '防御の選択中はサイドメニューを使えない')
  h.game.respondDefense(true)
  h.advance(450 + 900)
  assert.equal(h.game.s.phase, 'defending')
  h.game.respondDefense(false)
  assert.equal(h.game.s.phase, 'player')
  h.game.useSideMenu()
  assert.equal(h.game.s.pSideMenu.status, 'active')
  const previousSummons = h.summonCount
  h.game.playCard(h.game.s.pHand[0])
  assert.equal(h.summonCount, previousSummons + 1, '召喚成功時のSE通知を維持する')
  h.game.restart()
  assert.equal(h.game.s.pGari, 2)
  assert.equal(h.game.s.pSideMenu.id, 'miso')
  assert.equal(h.game.s.pSideMenu.status, 'ready')
}, 'cpu', { sideMenu: 'miso' })

console.log(`\nローカル防御: ${passed}件成功`)
