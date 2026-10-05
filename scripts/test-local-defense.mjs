#!/usr/bin/env node
// 実際のローカルコントローラを、手動時計と最小限のReactフックで動かす。
import assert from 'node:assert/strict'
import { loadTs } from './load-ts.mjs'

const { CARDS } = loadTs('src/data/cards.ts')
const { SIDE_MENUS } = loadTs('src/data/sideMenus.ts')
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
  // この試験はコンボ後の防御進行を検証するため、赤身サーチが追加召喚を増やさない山札にする。
  player.deck = player.deck.filter(card => !card.archetype.includes('akami'))
  player.summonedIds = ['chutoro', 'otoro']
  player.ap = 10
  player.apNextBonus = 5
}

console.log('\n[ローカル防御] CPU停止・再開・同端末の手渡し')
test('最弱CPUは初回・再戦とも従来の汎用デッキを使う', h => {
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(h.state.cpuDeckId, 'weak')
    assert.equal(h.game.s.cDeckLabel, '最弱')
    assert.equal(h.state.players[2].hand.length + h.state.players[2].deck.length, 14)
    if (attempt === 0) h.game.restart()
  }
}, 'cpu', { cpuBattleMode: 'weak' })

test('通常CPUの再戦ではビルドを再抽選し、画面の相手名も更新する', h => {
  const originalRandom = Math.random
  try {
    Math.random = () => 0
    h.game.restart()
    assert.equal(h.state.cpuDeckId, 'akami')
    assert.equal(h.game.s.cDeckLabel, '赤身')
    Math.random = () => 0.999999
    h.game.restart()
    assert.equal(h.state.cpuDeckId, 'niku')
    assert.equal(h.game.s.cDeckLabel, '肉寿司')
  } finally {
    Math.random = originalRandom
  }
})
test('挑戦モードは初回・再戦とも4500円の混合デッキを保持する', h => {
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(h.state.cpuDeckId, 'challenge')
    assert.ok(h.game.s.cDeckLabel.includes('挑戦'))
    const cpu = h.state.players[2]
    const cards = [...cpu.hand, ...cpu.deck]
    assert.equal(cards.length, 20)
    assert.equal(cards.reduce((sum, card) => sum + card.price, 0), 4500)
    if (attempt === 0) h.game.restart()
  }
}, 'cpu', { cpuBattleMode: 'challenge' })

test('CPUの召喚コンボは停止せず、終了攻撃だけ回答を待って半減する', h => {
  prepareCombo(h.state, 2)
  h.game.endTurn()
  h.advance(200 + 700)
  assert.equal(h.game.s.phase, 'cpu')
  assert.equal(h.state.pendingAttack, null)
  assert.equal(h.state.players[2].hand.length, 1)
  assert.equal(h.state.players[1].belly, 10)
  assert.equal(h.state.players[1].gari, 1)
  h.advance(449)
  assert.equal(h.state.players[2].hand.length, 1)
  h.advance(1)
  assert.equal(h.state.players[2].hand.length, 0)
  h.advance(900)
  assert.equal(h.game.s.phase, 'defending')
  assert.equal(h.state.pendingAttack.source, 'end_turn')
  assert.equal(h.state.pendingAttack.amount, 18)
  const waitingRevision = h.state.revision
  h.advance(5000)
  assert.equal(h.state.revision, waitingRevision)
  const respond = h.game.respondDefense
  respond(true)
  respond(true)
  assert.equal(h.state.players[1].gari, 0, '先攻のガリは1回分だけで、連打で重複消費しない')
  assert.equal(h.state.players[1].belly, 17, 'コンボ10＋通常攻撃の半分9−消化2')
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.activePlayerId, 1)
  assert.equal(h.state.turn, 2)
})

test('人間の召喚コンボにはCPU防御を挟まず、終了攻撃にはCPUがガリで回答する', h => {
  prepareCombo(h.state, 1)
  h.game.playCard(h.state.players[1].hand[0])
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.pendingAttack, null)
  assert.equal(h.state.players[2].belly, 10)
  assert.equal(h.state.players[2].gari, 2)
  assert.equal(h.state.activePlayerId, 1)
  h.game.playCard(h.game.s.pHand[0]) // たまごを加え、通常攻撃を18にする。
  h.game.endTurn()
  h.advance(200)
  assert.equal(h.game.s.phase, 'waiting')
  assert.equal(h.state.pendingAttack.source, 'end_turn')
  assert.equal(h.state.pendingAttack.amount, 18)
  const waitingRevision = h.state.revision
  h.game.respondDefense(true)
  h.game.endTurn()
  h.game.playCard(cardInstance('tamago', 1, 'blocked'))
  assert.equal(h.state.revision, waitingRevision, 'CPUの回答中に人間が割り込めない')
  h.advance(550)
  assert.equal(h.state.players[2].gari, 1)
  assert.equal(h.state.players[2].belly, 17, 'コンボ10＋通常攻撃の半分9−消化2')
  assert.equal(h.game.s.phase, 'cpu')
  h.game.restart()
  assert.deepEqual([h.state.players[1].gari, h.state.players[2].gari], [1, 2], '再戦では先攻1個・後攻2個へ戻す')
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

test('同端末の召喚コンボでは端末を渡さず、そのまま残りAPで召喚できる', h => {
  prepareCombo(h.state, 1)
  h.game.setInspect({ card: h.state.players[1].hand[0], canPlay: true })
  h.game.playCard(h.state.players[1].hand[0])
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.game.s.passToPlayerId, null)
  assert.equal(h.state.pendingAttack, null)
  assert.ok(h.game.s.pHand.every(card => card.instanceId.includes(':p1:')))
  assert.equal(h.game.inspect, null)
  assert.equal(h.state.players[2].belly, 10)
  const afterCombo = structuredClone(h.state)
  h.game.respondDefense(true)
  h.game.handlePassReady()
  assert.deepEqual(h.state, afterCombo, '防御も手渡しも要求していないため操作を無視する')
  h.game.playCard(h.game.s.pHand[0])
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.game.s.activePlayer, 1)
  assert.equal(h.state.players[1].field.length, 2)
  assert.equal(h.state.players[1].ap, afterCombo.players[1].ap - 1)
  assert.equal(h.game.s.cGari, 2)
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

test('同端末で双方がガリを使った後、再戦では先攻1個・後攻2個へ戻る', h => {
  for (const playerId of [1, 2]) {
    h.game.playCard(h.game.s.pHand[0])
    h.game.endTurn()
    h.advance(200)
    h.game.handlePassReady()
    assert.equal(h.game.s.phase, 'defending')
    assert.equal(h.state.pendingAttack.defenderId, playerId === 1 ? 2 : 1)
    h.game.respondDefense(true)
  }
  assert.deepEqual([h.state.players[1].gari, h.state.players[2].gari], [0, 1])
  h.game.restart()
  assert.deepEqual([h.state.players[1].gari, h.state.players[2].gari], [1, 2])
  assert.deepEqual([h.state.activePlayerId, h.state.turn, h.game.s.phase], [1, 1, 'player'])
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
  h.advance(200 + 700 + 450 + 900)
  assert.equal(h.game.s.phase, 'defending')
  assert.equal(h.state.pendingAttack.source, 'end_turn')
  assert.equal(h.game.s.pSideMenu.id, 'miso')
  const waitingState = structuredClone(h.state)
  h.game.useSideMenu()
  assert.deepEqual(h.state, waitingState, '防御の選択中はサイドメニューを使えない')
  h.game.respondDefense(true)
  assert.equal(h.game.s.phase, 'player')
  h.game.useSideMenu()
  assert.equal(h.game.s.pSideMenu.status, 'active')
  const previousSummons = h.summonCount
  h.game.playCard(h.game.s.pHand[0])
  assert.equal(h.summonCount, previousSummons + 1, '召喚成功時のSE通知を維持する')
  h.game.restart()
  assert.equal(h.game.s.pGari, 1)
  assert.equal(h.game.s.cGari, 2)
  assert.equal(h.game.s.pSideMenu.id, 'miso')
  assert.equal(h.game.s.pSideMenu.status, 'ready')
}, 'cpu', { sideMenu: 'miso' })

for (const { id: sideMenu } of SIDE_MENUS) {
  test(`CPU戦の追加注文後も未使用の${sideMenu}を使用できる`, h => {
    for (const player of Object.values(h.state.players)) {
      player.hand = []
      player.deck = []
    }
    h.game.endTurn()
    h.advance(200 + 900)
    assert.equal(h.game.s.phase, 'reorder')
    h.game.handleReorderComplete([byId('tamago'), byId('tamago')])
    assert.equal(h.game.s.phase, 'player')
    assert.equal(h.game.s.pSideMenu.status, 'ready')
    h.game.playCard(h.game.s.pHand[0])
    h.game.useSideMenu()
    assert.equal(h.game.s.pSideMenu.status,
      ['karaage', 'chawanmushi'].includes(sideMenu) ? 'used' : 'active')
  }, 'cpu', { sideMenu })

  test(`同端末の追加注文と手渡し後も両者の${sideMenu}を使用できる`, h => {
    for (const player of Object.values(h.state.players)) {
      player.hand = []
      player.deck = []
      player.gari = 0
    }
    h.game.endTurn(); h.advance(200)
    h.game.handlePassReady()
    assert.equal(h.game.s.phase, 'reorder')
    h.game.handleReorderComplete([byId('tamago'), byId('tamago')])
    h.game.handlePassReady()
    h.game.handleReorderComplete([byId('tamago'), byId('tamago')])
    h.game.handlePassReady()
    for (const playerId of [2, 1]) {
      assert.equal(h.game.s.phase, 'player')
      assert.equal(h.game.s.activePlayer, playerId)
      h.game.playCard(h.game.s.pHand[0])
      h.game.useSideMenu()
      assert.equal(h.game.s.pSideMenu.status,
        ['karaage', 'chawanmushi'].includes(sideMenu) ? 'used' : 'active')
      if (playerId === 2) {
        h.game.endTurn(); h.advance(200); h.game.handlePassReady()
      }
    }
  }, 'two_player', { sideMenu, p2SideMenu: sideMenu })
}

test('ローカル召喚は選択した生贄数を適用し、肉祭りはガリを消費せず即時に与える', h => {
  const player = h.state.players[1]
  player.hand = ['roast_beef', 'wagyu'].map(id => cardInstance(id, 1))
  player.ap = 8
  h.game.playCard(player.hand[0])
  assert.equal(h.game.s.pField.filter(c => c.id === 'namahamu').length, 2)
  h.game.playCard(h.game.s.pHand[0], 2)
  assert.equal(h.game.s.pSacrificedThisTurn, 2)
  assert.equal(h.game.s.pField.filter(c => c.id === 'namahamu').length, 0)
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.pendingAttack, null)
  assert.equal(h.state.players[2].belly, 5)
  assert.equal(h.state.players[2].gari, 2)
  assert.equal(h.game.s.pNikuMatsuri, true)
  assert.equal(h.summonCount, 2, '生成だけでは召喚SEを重複させない')
})

test('ローカルのインバウン丼は設置後の生成と生贄に反映し、召喚後も手番を維持する', h => {
  const player = h.state.players[1]
  player.hand = ['roast_beef', 'wagyu'].map(id => cardInstance(id, 1))
  player.ap = 8
  h.game.useSideMenu()
  assert.equal(h.state.players[1].ap, 8)
  assert.equal(h.state.players[1].attackBuff['生ハム'], 2)
  h.game.playCard(h.game.s.pHand[0])
  assert.equal(h.game.s.pField.filter(c => c.id === 'namahamu').length, 2)
  h.game.playCard(h.game.s.pHand[0], 2)
  assert.equal(h.game.s.pField.find(c => c.id === 'wagyu').turnAttackBonus, 12)
  assert.equal(h.state.players[2].belly, 5)
  assert.equal(h.state.players[2].gari, 2)
  assert.equal(h.game.s.phase, 'player')
  assert.equal(h.state.pendingAttack, null)
}, 'cpu', { sideMenu: 'inbound_don' })

console.log(`\nローカル防御・追加注文・肉寿司: ${passed}件成功`)
