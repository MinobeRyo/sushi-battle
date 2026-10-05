import { shouldChallengeUseGari } from './cpuDefense'
import { CHALLENGE_SMART_RATE, getChallengeAction } from './cpuStrategy'
import type { Card } from '../types'
import { CARDS, NAMAHAM_CARD } from '../data/cards'
import { chooseCpuDeck, getCpuDeck, getCpuReorderDeck, type CpuBattleMode } from '../data/cpuDecks'
import { INBOUND_DON_ATTACK_BONUS, INBOUND_DON_SACRIFICE_BONUS, isSideMenuId, SIDE_MENUS, SIDE_MENU_BY_ID } from '../data/sideMenus'
import type { SideMenuId } from '../data/sideMenus'
import type { CardInstance, MatchAction, MatchEvent, MatchMode, MatchPlayer, MatchResult, MatchState, PendingAttack, PlayerId, RandomSource } from './types'
import { applySummon, calcFieldDmg, calcGariReduction, countNamahamu, cpuChoose, digestBonus, digestionAmount, FIELD_MAX, getDestroyTargets, getDestroyTargetError, getSacrificeError, getSacrificeLimit, hasAkamiMori, HAND_LIMIT, INIT_AP, INIT_GARI, MAX_BELLY, shuffled, tekkaApBonus } from './battleRules'

export const otherPlayer = (id: PlayerId): PlayerId => id === 1 ? 2 : 1

export type MatchOptions = {
  cpuBattleMode?: CpuBattleMode
  deck: Card[]; p2Deck?: Card[]; mode: MatchMode; matchId?: string
  sideMenu?: SideMenuId | null; p2SideMenu?: SideMenuId | null
}

function newPlayer(id: PlayerId, sideMenu?: SideMenuId | null): MatchPlayer {
  return {
    id, hand: [], deck: [], field: [], belly: 0, ap: INIT_AP, maxAP: INIT_AP, gari: INIT_GARI[id],
    summonedIds: [], summonedArch: {}, drawBonus: 0, attackBuff: {}, combosFired: [],
    kiretaStack: 0, thisTurnBases: [], thisTurnArch: {}, digestStopTurns: 0,
    apNextBonus: 0, nikuMatsuri: false, sacrificedThisTurn: 0, kiretaSpent: false,
    sideMenu: isSideMenuId(sideMenu) ? { id: sideMenu, status: 'ready', turnsLeft: null, usedThisTurn: false } : null,
    sushiPlayedThisTurn: 0, tempuraTriggeredThisTurn: false, skippedDigestionThisTurn: 0,
  }
}

function deal(state: MatchState, id: PlayerId, cards: Card[], random: RandomSource) {
  const instances: CardInstance[] = cards.map(card => ({
    ...structuredClone(card), instanceId: `${state.matchId}:p${id}:${state.nextInstanceId++}`,
  }))
  const deck = shuffled(instances, random)
  state.players[id].hand = deck.slice(0, 5)
  state.players[id].deck = deck.slice(5)
}

export function createMatch(options: MatchOptions, random: RandomSource = Math.random): MatchState {
  const cpuDeck = options.mode === 'cpu' ? chooseCpuDeck(options.cpuBattleMode ?? 'random', random) : null
  const state: MatchState = {
    matchId: options.matchId ?? 'local', mode: options.mode, cpuDeckId: cpuDeck?.id ?? null,
    players: { 1: newPlayer(1, options.sideMenu), 2: newPlayer(2, options.p2SideMenu) }, activePlayerId: 1,
    turn: 1, phase: 'playing', winnerId: null, reorderPlayerId: null, pendingAttack: null,
    revision: 0, nextInstanceId: 1,
    log: [cpuDeck ? `バトル開始！ ${cpuDeck.id === 'challenge' ? '挑戦CPU' : 'CPU'}：${cpuDeck.name}` : 'バトル開始！'],
  }
  const fallback = CARDS.filter(card => card.lane === 'general').slice(0, 10)
  deal(state, 1, options.deck.length ? options.deck : fallback, random)
  deal(state, 2, cpuDeck ? getCpuDeck(cpuDeck.id, random)
    : options.p2Deck?.length ? options.p2Deck : fallback, random)
  // CPUも初期購入で一品を持ちます。明示的なnull指定では持たせません。
  if (options.mode === 'cpu' && options.p2SideMenu === undefined) {
    const id = SIDE_MENUS[Math.min(SIDE_MENUS.length - 1, Math.floor(random() * SIDE_MENUS.length))].id
    state.players[2].sideMenu = { id, status: 'ready', turnsLeft: null, usedThisTurn: false }
  }
  return state
}

function addLog(state: MatchState, message: string) {
  state.log = [message, ...state.log].slice(0, 40)
}

function label(state: MatchState, id: PlayerId) {
  return state.mode === 'cpu' ? (id === 1 ? 'あなた' : 'CPU') : `P${id}`
}

function draw(player: MatchPlayer, count: number) {
  const take = Math.min(count, Math.max(0, HAND_LIMIT - player.hand.length))
  player.hand.push(...player.deck.splice(0, take))
}

function drawPersistIkaTako(player: MatchPlayer, random: RandomSource): string {
  if (player.hand.length >= HAND_LIMIT) return '手札上限のため、持続型いか・たこのドローなし'
  const candidates = player.deck.flatMap((card, index) =>
    card.type === 'persist' && (card.id === 'ika' || card.id === 'tako') ? [index] : [])
  if (candidates.length === 0) return '山札に持続型の「いか」「たこ」がないため、ドローなし'
  const index = candidates[Math.floor(random() * candidates.length)]
  player.hand.push(...player.deck.splice(index, 1))
  // 共有ログでは引いたカード名を明かさない。山札順序と個体IDも保持する。
  return '山札から持続型の「いか」「たこ」をランダムに1枚引いた'
}

function drawAkami(player: MatchPlayer, random: RandomSource): string {
  if (player.hand.length >= HAND_LIMIT) return '手札上限のため、赤身カードのドローなし'
  const candidates = player.deck.flatMap((card, index) => card.archetype.includes('akami') ? [index] : [])
  if (candidates.length === 0) return '山札に赤身カードがないため、ドローなし'
  const index = candidates[Math.floor(random() * candidates.length)]
  player.hand.push(...player.deck.splice(index, 1))
  return '山札から赤身カードをランダムに1枚引いた'
}

/** 効果による山札供給。既存カードの相対順と個体別の強化状態を保つ。 */
function addCardToDeck(state: MatchState, id: PlayerId, card: Card, count: number, random: RandomSource) {
  const player = state.players[id]
  for (let i = 0; i < count; i++) {
    const instance: CardInstance = {
      ...structuredClone(card), instanceId: `${state.matchId}:p${id}:${state.nextInstanceId++}`,
    }
    player.deck.splice(Math.floor(random() * (player.deck.length + 1)), 0, instance)
  }
}

function damage(state: MatchState, id: PlayerId, amount: number, events: MatchEvent[]) {
  const dealt = Math.max(0, amount)
  state.players[id].belly = Math.min(MAX_BELLY, state.players[id].belly + dealt)
  if (dealt > 0) events.push({ type: 'damage', playerId: id, amount: dealt })
}

function checkWin(state: MatchState, events: MatchEvent[], simultaneousLoser?: PlayerId) {
  const order: PlayerId[] = simultaneousLoser ? [simultaneousLoser, otherPlayer(simultaneousLoser)] : [1, 2]
  const loser = order.find(id => state.players[id].belly >= MAX_BELLY)
  if (loser === undefined) return false
  state.winnerId = otherPlayer(loser)
  state.phase = 'over'
  state.reorderPlayerId = null
  state.pendingAttack = null
  events.push({ type: 'game_over', winnerId: state.winnerId })
  return true
}

function resolveAttack(state: MatchState, attack: PendingAttack, amount: number, events: MatchEvent[], random: RandomSource) {
  state.pendingAttack = null
  state.phase = 'playing'
  damage(state, attack.defenderId, amount, events)
  if (checkWin(state, events)) return
  if (attack.source === 'end_turn') completeTurn(state, events, random)
}

function startAttack(state: MatchState, attack: PendingAttack, events: MatchEvent[], random: RandomSource) {
  // ガリは通常攻撃だけが対象。カード効果・コンボの追加ダメージは即座に確定する。
  if (attack.source === 'end_turn' && attack.amount > 0 && state.players[attack.defenderId].gari > 0) {
    state.pendingAttack = attack
    state.phase = 'defending'
    events.push({ type: 'defense_requested', attack: { ...attack } })
    return
  }
  resolveAttack(state, attack, attack.amount, events, random)
}

function activeSideMenu(player: MatchPlayer, id: SideMenuId) {
  return player.sideMenu?.id === id && player.sideMenu.status === 'active'
}

/** UI・CPU・サーバーで共通の使用可否。参照した状態は変更しません。 */
export function getSideMenuUseError(state: MatchState, playerId: PlayerId): string | undefined {
  if (playerId !== 1 && playerId !== 2) return 'unknown_player'
  if (state.phase === 'over') return 'game_over'
  if (state.phase !== 'playing' || state.activePlayerId !== playerId) return 'not_your_turn'
  const player = state.players[playerId]
  const menu = player.sideMenu
  if (!menu) return 'side_menu_missing'
  if (menu.status === 'used' || menu.status === 'expired') return 'side_menu_spent'
  if (menu.status === 'active' && menu.id !== 'ramen') return 'side_menu_already_active'
  if (menu.usedThisTurn) return 'side_menu_used_this_turn'
  if (menu.id === 'ramen' && player.ap >= player.maxAP) return 'side_menu_ap_full'
  return undefined
}

function applySideMenu(state: MatchState, id: PlayerId, events: MatchEvent[]) {
  const player = state.players[id]
  const menu = player.sideMenu!
  menu.usedThisTurn = true
  addLog(state, `${label(state, id)}: ${SIDE_MENU_BY_ID[menu.id].name}を使用`)
  switch (menu.id) {
    case 'inbound_don':
      menu.status = 'active'
      // 試合中続くネタ別強化として保持し、既存の場・今後の生成・表示に同じ値を使う。
      player.attackBuff[NAMAHAM_CARD.base] = (player.attackBuff[NAMAHAM_CARD.base] ?? 0) + INBOUND_DON_ATTACK_BONUS
      addLog(state, `${label(state, id)}: 生ハムの攻撃 +${INBOUND_DON_ATTACK_BONUS}・生贄1体につき攻撃 +${INBOUND_DON_SACRIFICE_BONUS}`)
      break
    case 'karaage':
      menu.status = 'used'
      damage(state, id, 15, events)
      damage(state, otherPlayer(id), 15, events)
      checkWin(state, events, id)
      break
    case 'chawanmushi': {
      const restored = player.skippedDigestionThisTurn
      player.belly = Math.max(0, player.belly - 15 - restored)
      player.digestStopTurns = 0
      player.skippedDigestionThisTurn = 0
      menu.status = 'used'
      addLog(state, `${label(state, id)}: お腹 -15${restored > 0 ? `・止められた消化${restored}を回復` : ''}・消化停止を解除`)
      break
    }
    case 'ramen':
      if (menu.status === 'ready') menu.turnsLeft = 3
      menu.status = 'active'
      player.ap = Math.min(player.maxAP, player.ap + 1)
      damage(state, id, 5, events)
      addLog(state, `${label(state, id)}: AP +1・お腹 +5`)
      checkWin(state, events)
      break
    default:
      menu.status = 'active'
      break
  }
}

function summon(state: MatchState, id: PlayerId, index: number, events: MatchEvent[], random: RandomSource, sacrificeCount = 0, targetFieldId?: string) {
  const player = state.players[id]
  const enemyId = otherPlayer(id)
  const enemy = state.players[enemyId]
  const [card] = player.hand.splice(index, 1)
  const tempuraTarget = card.archetype.includes('niku') || [card.base, ...(card.subBases ?? [])].includes('えび')
  const tempuraBonus = tempuraTarget && !player.tempuraTriggeredThisTurn
    && (activeSideMenu(player, 'tempura') || activeSideMenu(enemy, 'tempura')) ? 3 : 0
  // 設置前に出した対象も「このターン最初の一枚」として数えます。
  if (tempuraTarget) player.tempuraTriggeredThisTurn = true
  player.sushiPlayedThisTurn += 1
  const result = applySummon({
    card, fieldId: card.instanceId, belly: player.belly, kireta: player.kiretaStack,
    field: player.field, summonedIds: player.summonedIds, summonedArch: player.summonedArch,
    thisTurnBases: player.thisTurnBases, thisTurnArch: player.thisTurnArch,
    combosFired: player.combosFired, attackBuff: player.attackBuff,
    drawBonus: player.drawBonus, nikuMatsuri: player.nikuMatsuri,
    sacrificeCount, sacrificedThisTurn: player.sacrificedThisTurn,
    sacrificeAttackBonus: activeSideMenu(player, 'inbound_don') ? INBOUND_DON_SACRIFICE_BONUS : 0,
    kiretaSpent: player.kiretaSpent, enemyBelly: enemy.belly,
    turnAttackBonus: tempuraBonus,
  })
  Object.assign(player, {
    belly: result.belly, kiretaStack: result.kireta, field: result.field,
    summonedIds: result.summonedIds, summonedArch: result.summonedArch,
    thisTurnBases: result.thisTurnBases, thisTurnArch: result.thisTurnArch,
    combosFired: result.combosFired, attackBuff: result.attackBuff,
    drawBonus: result.drawBonus, nikuMatsuri: result.nikuMatsuri,
    sacrificedThisTurn: result.sacrificedThisTurn,
    kiretaSpent: result.kiretaSpent,
    ap: player.ap - card.cost, apNextBonus: player.apNextBonus + result.apNext,
  })
  if (result.apRefund > 0) {
    const restored = Math.max(0, Math.min(result.apRefund, player.maxAP - player.ap))
    player.ap += restored
    if (restored > 0) result.logs.push(`いかにぎり：机にたこがいるため、支払い後のAPを${restored}回復`)
  }
  if (targetFieldId !== undefined) {
    // 対象の存在・所属・種類は、APや手札を消費する前に検証済み。
    const targetIndex = enemy.field.findIndex(target => target.fid === targetFieldId)
    const [destroyed] = enemy.field.splice(targetIndex, 1)
    result.logs.push(`${card.name}で相手の${destroyed.name}を破壊`)
  } else if (card.effect === 'destroy_enemy_persist_1') {
    result.logs.push('相手の机に持続型カードがないため、破壊対象なし')
  }
  if (card.effect === 'reduce_random_akami_cost_1') {
    const candidates = [...player.hand, ...player.deck].filter(target => target.archetype.includes('akami') && target.cost > 0)
    if (candidates.length > 0) {
      candidates[Math.floor(random() * candidates.length)].cost -= 1
      // 公開ログには非公開の手札・山札のカード名、個体IDや場所を出さない。
      result.logs.push('手札・山札の赤身カード1枚のAPコストを1軽減（下限0）')
    } else result.logs.push('APコストを軽減できる赤身カードなし')
  }
  draw(player, result.drawNow)
  if (result.drawPersistIkaTako) result.logs.unshift(drawPersistIkaTako(player, random))
  if (card.effect === 'draw_random_akami_1') result.logs.unshift(drawAkami(player, random))
  if (result.generateNamahamuDeck > 0) {
    addCardToDeck(state, id, NAMAHAM_CARD, result.generateNamahamuDeck, random)
    result.logs.push(`生ハム${result.generateNamahamuDeck}枚を山札のランダムな位置に追加 / 生ハムの攻撃は対戦中＋${player.attackBuff[NAMAHAM_CARD.base]}`)
  }
  if (result.generateBintoroDeck > 0) {
    addCardToDeck(state, id, CARDS.find(card => card.id === 'bintoro')!, result.generateBintoroDeck, random)
    result.logs.push('赤身三種盛り：ビントロ1枚を山札のランダムな位置に追加')
  }
  if (card.effect === 'generate_tobiko_hand_50') {
    // 確定した召喚で一度だけ抽選し、手札個体や場の一時効果は複製しない。
    if (random() < 0.5) {
      if (player.hand.length < HAND_LIMIT) {
        player.hand.push({
          ...structuredClone(CARDS.find(item => item.id === 'tobiko_gunkan')!),
          instanceId: `${state.matchId}:p${id}:${state.nextInstanceId++}`,
        })
        result.logs.push('とびこ軍艦：手札にとびこ軍艦1枚を追加')
      } else result.logs.push('とびこ軍艦：手札上限のため追加なし')
    } else result.logs.push('とびこ軍艦：追加なし')
  }
  if (activeSideMenu(player, 'fries') && player.sushiPlayedThisTurn === 2) {
    draw(player, 1)
    addLog(state, `${label(state, id)}: ポテトで1枚ドロー`)
  }
  if (tempuraBonus) addLog(state, `${label(state, id)}: 天ぷら盛り合わせで${card.name}の今ターン攻撃 +3`)
  if (result.stopOppDigestTurns) enemy.digestStopTurns = Math.max(enemy.digestStopTurns, result.stopOppDigestTurns)
  addLog(state, `${label(state, id)} ▶ ${card.name} 召喚`)
  for (const message of result.logs) addLog(state, `${label(state, id)}: ${message}`)
  events.push({ type: 'summon', playerId: id, cardInstanceId: card.instanceId, cardId: card.id })
  for (const combo of result.fired) events.push({ type: 'combo', playerId: id, comboId: combo.id })
  startAttack(state, { attackerId: id, defenderId: enemyId, amount: result.extraDmg, source: 'summon' }, events, random)
}

function finishTurn(state: MatchState, events: MatchEvent[], random: RandomSource) {
  const id = state.activePlayerId
  const player = state.players[id]
  const nextId = otherPlayer(id)
  const total = calcFieldDmg(player.field, player.attackBuff, player.kiretaStack,
    state.players[nextId].belly, { nikuMatsuri: player.nikuMatsuri })
  if (total > 0) addLog(state, `${label(state, id)}の攻撃: ${total} ダメージ！`)
  startAttack(state, { attackerId: id, defenderId: nextId, amount: total, source: 'end_turn' }, events, random)
}

function completeTurn(state: MatchState, events: MatchEvent[], random: RandomSource) {
  const id = state.activePlayerId
  const player = state.players[id]
  const nextId = otherPlayer(id)
  // 通常攻撃・防御と勝敗判定の後、寿命と終了時ドローより先に補充する。
  const hamCount = player.field.filter(card =>
    card.effect === 'belly_boost_persist_50_namahamu_deck_1' && card.turnsLeft > 0).length
  addCardToDeck(state, id, NAMAHAM_CARD, hamCount, random)
  if (hamCount > 0) addLog(state, `${label(state, id)}の焼肉寿司: 生ハム${hamCount}枚を山札に混ぜた（終了時ドロー前）`)
  player.field = player.field.map(card => {
    const { turnAttackBonus: _, ...persistentCard } = card
    return { ...persistentCard, turnsLeft: card.turnsLeft - 1 }
  })
    .filter(card => card.turnsLeft > 0)
  draw(player, 1 + player.drawBonus)
  if (player.kiretaSpent) {
    player.kiretaStack = 0
    addLog(state, '✂ 切れ味スタックを使い切った（0にリセット）')
  }
  player.kiretaSpent = false
  player.nikuMatsuri = false
  player.sacrificedThisTurn = 0
  player.thisTurnBases = []
  player.thisTurnArch = {}
  player.sushiPlayedThisTurn = 0
  player.tempuraTriggeredThisTurn = false
  player.skippedDigestionThisTurn = 0
  const ownMenu = player.sideMenu
  if (ownMenu?.id === 'ramen' && ownMenu.status === 'active' && ownMenu.turnsLeft !== null) {
    ownMenu.turnsLeft -= 1
    if (ownMenu.turnsLeft === 0) {
      ownMenu.status = 'expired'
      addLog(state, `${label(state, id)}: ラーメンの効果が終了`)
    }
  }

  const oldTurn = state.turn
  if (state.mode === 'two_player' || id === 2) state.turn += 1
  state.activePlayerId = nextId
  const next = state.players[nextId]
  if (next.sideMenu) next.sideMenu.usedThisTurn = false
  next.skippedDigestionThisTurn = 0
  const round = state.mode === 'cpu' ? oldTurn : Math.ceil(oldTurn / 2)
  const digestion = digestionAmount(round) + digestBonus(next.field) + (activeSideMenu(next, 'miso') ? 2 : 0)
  if (next.digestStopTurns > 0) {
    next.skippedDigestionThisTurn = Math.min(next.belly, digestion)
    next.digestStopTurns -= 1
    addLog(state, `🚫 ${label(state, nextId)}の消化がスキップされた！`)
  } else {
    next.belly = Math.max(0, next.belly - digestion)
  }
  const baseAP = state.mode === 'two_player'
    ? INIT_AP + Math.floor((state.turn - 1) / 2)
    : INIT_AP + state.turn - (nextId === 1 ? 1 : 0)
  next.maxAP = Math.min(baseAP, 10) + next.apNextBonus
  next.ap = next.maxAP
  const tekkaBonus = tekkaApBonus(next.field, next.combosFired)
  if (tekkaBonus > 0) {
    // 通常回復後に加算し、ラーメン等の回復上限と表示もこのターンだけ揃える。
    next.ap += tekkaBonus
    next.maxAP += tekkaBonus
    addLog(state, `${label(state, nextId)}の鉄火巻き: AP回復後に＋${tekkaBonus}`)
  }
  if (next.apNextBonus > 0) addLog(state, `⚡ ${label(state, nextId)}の一時APボーナス +${next.apNextBonus}！`)
  next.apNextBonus = 0
  events.push({ type: 'turn_started', playerId: nextId })
  addLog(state, `── ターン ${state.turn}（${label(state, nextId)}）──`)

  const allOut = Object.values(state.players).every(p => p.hand.length === 0 && p.deck.length === 0)
  // CPU戦では両者の手番が済んだ境界で補充する（既存の進行を維持）。
  if (allOut && (state.mode === 'two_player' || nextId === 1)) {
    state.phase = 'reorder'
    state.reorderPlayerId = nextId
    addLog(state, '🍽 追加注文タイム！ 軍資金 ¥1500 で補充しよう')
    events.push({ type: 'reorder_started', playerId: nextId })
  }
}

/** 1操作を原子的に確定する。入力は変更せず、演出やタイマーも実行しない。 */
export function transitionMatch(state: MatchState, action: MatchAction, random: RandomSource = Math.random): MatchResult {
  const reject = (error: string): MatchResult => ({ state, events: [], error })
  if (action.playerId !== 1 && action.playerId !== 2) return reject('unknown_player')
  if (state.phase === 'over') return reject('game_over')
  if (action.type === 'respond_defense') {
    if (state.phase !== 'defending' || !state.pendingAttack) return reject('not_defending')
    if (action.playerId !== state.pendingAttack.defenderId) return reject('not_defender')
    if (typeof action.useGari !== 'boolean') return reject('invalid_defense')
    if (action.useGari && state.players[action.playerId].gari < 1) return reject('no_gari')
    const next = structuredClone(state)
    const attack = next.pendingAttack!
    const reduction = action.useGari ? calcGariReduction(attack.amount) : 0
    if (action.useGari) {
      next.players[action.playerId].gari -= 1
      addLog(next, `${label(next, action.playerId)}がガリを使用: ダメージ -${reduction}（残り${next.players[action.playerId].gari}個）`)
    } else addLog(next, `${label(next, action.playerId)}はガリを温存`)
    const events: MatchEvent[] = [{ type: 'defense_resolved', playerId: action.playerId, usedGari: action.useGari, reduction }]
    resolveAttack(next, attack, Math.max(0, attack.amount - reduction), events, random)
    next.revision += 1
    return { state: next, events }
  }
  if (action.type === 'complete_reorder') {
    if (state.phase !== 'reorder' || action.playerId !== state.reorderPlayerId) return reject('not_reordering')
    const next = structuredClone(state)
    deal(next, action.playerId, action.cards, random)
    if (next.mode === 'two_player' && action.playerId === next.activePlayerId) {
      next.reorderPlayerId = otherPlayer(action.playerId)
    } else {
      if (next.mode === 'cpu' && next.cpuDeckId) deal(next, 2, getCpuReorderDeck(next.cpuDeckId, random), random)
      next.phase = 'playing'
      next.reorderPlayerId = null
      addLog(next, '🍽 追加注文完了！ バトル再開')
    }
    next.revision += 1
    return { state: next, events: [] }
  }
  if (state.phase !== 'playing' || action.playerId !== state.activePlayerId) return reject('not_your_turn')
  const player = state.players[action.playerId]
  let index = -1
  if (action.type === 'play_card') {
    index = player.hand.findIndex(card => card.instanceId === action.cardInstanceId)
    if (index < 0) return reject('card_not_in_hand')
    if (player.ap < player.hand[index].cost) return reject('insufficient_ap')
    const sacrificeError = getSacrificeError(player.hand[index], player.field, action.sacrificeCount)
    if (sacrificeError) return reject(sacrificeError)
    const targetError = getDestroyTargetError(player.hand[index], state.players[otherPlayer(action.playerId)].field, action.targetFieldId)
    if (targetError) return reject(targetError)
    if (player.field.length - (action.sacrificeCount ?? 0) >= FIELD_MAX) return reject('field_full')
  } else if (action.type === 'use_side_menu') {
    const error = getSideMenuUseError(state, action.playerId)
    if (error) return reject(error)
  } else if (action.type !== 'end_turn') return reject('unknown_action')
  const next = structuredClone(state)
  const events: MatchEvent[] = []
  if (action.type === 'play_card') summon(next, action.playerId, index, events, random, action.sacrificeCount, action.targetFieldId)
  else if (action.type === 'use_side_menu') applySideMenu(next, action.playerId, events)
  else finishTurn(next, events, random)
  next.revision += 1
  return { state: next, events }
}

export function getCpuDefenseAction(state: MatchState, random: RandomSource = Math.random): MatchAction | null {
  const attack = state.pendingAttack
  if (state.mode !== 'cpu' || state.phase !== 'defending' || attack?.defenderId !== 2) return null
  const cpu = state.players[2]
  const reduction = calcGariReduction(attack.amount)
  const avoidsDefeat = cpu.belly + attack.amount >= MAX_BELLY
    && cpu.belly + attack.amount - reduction < MAX_BELLY
  return {
    type: 'respond_defense', playerId: 2,
    // 最弱・普通は従来の16点/致死回避。挑戦は80%で消化と残数も評価する。
    useGari: state.cpuDeckId === 'challenge' && random() < CHALLENGE_SMART_RATE
      ? shouldChallengeUseGari(state) : cpu.gari > 0 && (reduction >= 8 || avoidsDefeat),
  }
}

/** 従来の一手判断。非公開の相手手札・山札には触れない。 */
function getBasicCpuAction(state: MatchState): MatchAction | null {
  const cpu = state.players[2]
  const available = countNamahamu(cpu.field)
  const hasSummonSpace = (card: Card) => cpu.field.length - Math.min(available, getSacrificeLimit(card)) < FIELD_MAX
  const menu = cpu.sideMenu
  const canUse = !getSideMenuUseError(state, 2)
  const useMenu = canUse && menu && (
    menu.id === 'fries' || menu.id === 'tempura' || menu.id === 'miso' || menu.id === 'inbound_don'
    || (menu.id === 'chawanmushi' && (cpu.belly >= 15 || cpu.skippedDigestionThisTurn > 0 || cpu.digestStopTurns > 0))
    || (menu.id === 'karaage' && cpu.belly < 85
      && (state.players[1].belly >= 50 || cpu.hand.some(card => card.archetype.includes('niku'))))
    || (menu.id === 'ramen' && cpu.belly < 95
      && cpu.hand.some(card => card.cost <= cpu.ap + 1 && hasSummonSpace(card)))
  )
  let action: MatchAction
  if (useMenu) action = { type: 'use_side_menu', playerId: 2 }
  else {
    const card = cpuChoose(cpu.hand.filter(hasSummonSpace), cpu.ap)[0]
    if (!card) return null
    const sacrificeCount = Math.min(available, getSacrificeLimit(card))
    const target = getDestroyTargets(card, state.players[1].field).sort((a, b) => b.attack - a.attack)[0]
    action = { type: 'play_card', playerId: 2, cardInstanceId: card.instanceId,
      ...(getSacrificeLimit(card) ? { sacrificeCount } : {}), ...(target ? { targetFieldId: target.fid } : {}) }
  }
  return action
}

/** 挑戦だけ80%で盤面評価。実際に引いた後で一手ずつ再計画する。 */
export function getCpuActions(state: MatchState, random: RandomSource = Math.random): MatchAction[] {
  if (state.mode !== 'cpu' || state.phase !== 'playing' || state.activePlayerId !== 2) return []
  if (state.cpuDeckId === 'challenge') {
    const action = random() < CHALLENGE_SMART_RATE
      ? getChallengeAction(state, !getSideMenuUseError(state, 2)) : getBasicCpuAction(state)
    return action ? [action] : []
  }
  const actions: MatchAction[] = []
  let planned = state
  // 仮の状態へ同じ操作を適用し、AP回復・追加ドロー後も手札を選び直します。
  for (let count = 0; count < FIELD_MAX + 2 && planned.phase === 'playing'; count++) {
    const cpu = planned.players[2]
    const action = getBasicCpuAction(planned)
    if (!action) break
    const playedEffect = action.type === 'play_card'
      ? cpu.hand.find(card => card.instanceId === action.cardInstanceId)?.effect : null
    // ランダムなドロー・軽減・カード生成は実際の召喚後に再計画する。
    if (action.type === 'play_card'
      && (['draw_persist_ika_tako_1', 'draw_random_akami_1', 'reduce_random_akami_cost_1', 'generate_tobiko_hand_50'].includes(
        playedEffect ?? '')
        || (playedEffect === 'akami_generate_bintoro_deck_1' && hasAkamiMori(cpu.combosFired))
        || (!cpu.nikuMatsuri && (action.sacrificeCount ?? 0) > 0
          && (cpu.sacrificedThisTurn ?? 0) + (action.sacrificeCount ?? 0) >= 2))) {
      actions.push(action)
      break
    }
    const result = transitionMatch(planned, action)
    if (result.error) break
    actions.push(action)
    planned = result.state
  }
  return actions
}
