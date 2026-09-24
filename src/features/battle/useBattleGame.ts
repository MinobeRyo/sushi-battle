import type { Card } from '../../types'
import { useRef, useReducer, useState } from 'react'
import type { BattleState, ComboAnim, FloatNum, Inspect } from './types'
import { initState, HAND_LIMIT, MAX_BELLY, FIELD_MAX, applySummon, calcFieldDmg, INIT_AP, digestionAmount, digestBonus, cpuChoose, shuffled, getCpuReorderDeck } from './battleEngine'
import type { ComboMeta } from './battleEngine'
import { cardEmoji } from './battlePresentation'

// ── Main ──────────────────────────────────────────────────────────────────────
export function useBattleGame({ deck, p2Deck, mode }: { deck: Card[]; p2Deck?: Card[]; mode: 'cpu' | 'two_player' }) {
  // 遅延初期化：initState はマウント時に1回だけ実行する
  const lazyRef = useRef<BattleState | null>(null)
  if (lazyRef.current === null) lazyRef.current = initState(deck, mode, p2Deck)
  const ref = lazyRef as { current: BattleState }
  const [, tick] = useReducer(n => n + 1, 0)
  const [showLog, setShowLog] = useState(false)
  const [comboAnim, setComboAnim] = useState<ComboAnim | null>(null)
  const [floats, setFloats] = useState<FloatNum[]>([])
  const [inspect, setInspect] = useState<Inspect | null>(null)
  // 追加注文タイム（二人対戦では p→c の順にドラフト）
  const [reorderStep, setReorderStep] = useState<'p' | 'c'>('p')
  const pendingReorder = useRef<Card[]>([])
  const floatId = useRef(0)
  const s = ref.current

  const set = (patch: Partial<BattleState>) => { Object.assign(ref.current, patch); tick() }
  const addLog = (msg: string) => { ref.current.log = [msg, ...ref.current.log].slice(0, 40) }

  const addFloat = (dmg: number, target: 'cpu' | 'player') => {
    if (dmg <= 0) return
    const id = ++floatId.current
    setFloats(f => [...f, { id, dmg, target }])
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
  }

  const drawCards = (hand: Card[], dk: Card[], n: number): [Card[], Card[]] => {
    // 手札上限を超える分は引かずに山札に残す（引いたカードが消滅しないように）
    const take = Math.min(n, Math.max(0, HAND_LIMIT - hand.length))
    return [[...hand, ...dk.slice(0, take)], dk.slice(take)]
  }

  const checkWin = (pBelly: number, cBelly: number): boolean => {
    if (pBelly >= MAX_BELLY) { set({ winner: 'cpu', phase: 'over' }); return true }
    if (cBelly >= MAX_BELLY) { set({ winner: 'player', phase: 'over' }); return true }
    return false
  }

  const fireComboAnim = (combo: ComboMeta) => {
    setComboAnim({ name: combo.name, emoji: combo.emoji, desc: combo.desc })
    setTimeout(() => setComboAnim(null), 2800)
  }

  const playCard = (card: Card) => {
    const st = ref.current
    const handIdx = st.pHand.indexOf(card)
    // 詳細シートの退場中などに同じ操作が届いても、消費済みの手札は召喚しない。
    if (handIdx < 0 || st.phase !== 'player' || st.pAP < card.cost || st.pField.length >= FIELD_MAX) return

    setInspect(null)
    addLog(`あなた ▶ ${cardEmoji(card)} ${card.name} 召喚`)

    const r = applySummon({
      card,
      belly: st.pBelly,
      kireta: st.pKiretaStack,
      field: st.pField,
      summonedIds: st.pSummonedIds,
      summonedArch: st.pSummonedArch,
      thisTurnBases: st.pThisTurnBases,
      thisTurnArch: st.pThisTurnArch,
      combosFired: st.pCombosFired,
      attackBuff: st.pAttackBuff,
      drawBonus: st.pDrawBonus,
      nikuMatsuri: st.pNikuMatsuri,
      kiretaSpent: st.pKiretaSpent,
      enemyBelly: st.cBelly,
    })
    for (const m of r.logs) addLog(m)
    for (const combo of r.fired) fireComboAnim(combo)

    const newCBelly = Math.min(MAX_BELLY, st.cBelly + r.extraDmg)
    if (r.extraDmg > 0) addFloat(r.extraDmg, 'cpu')

    // 同一カードを複数枚持っている場合でも1枚だけ取り除く
    const handAfterPlay = st.pHand.filter((_, i) => i !== handIdx)
    // draw_1 効果：即時ドロー
    const [handDrawn, deckAfter] = drawCards(handAfterPlay, st.pDeck, r.drawNow)
    set({
      pField: r.field,
      pHand: handDrawn,
      pDeck: deckAfter,
      pAP: st.pAP - card.cost,
      pApNextBonus: st.pApNextBonus + r.apNext,
      pBelly: r.belly,
      pSummonedIds: r.summonedIds, pSummonedArch: r.summonedArch,
      pThisTurnBases: r.thisTurnBases, pThisTurnArch: r.thisTurnArch,
      pCombosFired: r.combosFired,
      pAttackBuff: r.attackBuff, pDrawBonus: r.drawBonus,
      pNikuMatsuri: r.nikuMatsuri,
      pKiretaSpent: r.kiretaSpent,
      pKiretaStack: r.kireta,
      cBelly: newCBelly,
      cDigestStopTurns: r.stopOppDigest ? 1 : st.cDigestStopTurns,
    })
    if (r.extraDmg > 0) checkWin(ref.current.pBelly, newCBelly)
  }

  // ── ターン終了（CPU モード） ───────────────────────────────────────────────
  const endTurnCpu = () => {
    if (ref.current.phase !== 'player') return
    setInspect(null)
    set({ phase: 'animating' })

    setTimeout(() => {
      const { pField, cBelly, pDeck, pHand, pDrawBonus, turn, pAttackBuff, pKiretaStack, pNikuMatsuri, pKiretaSpent } = ref.current

      // プレイヤー場が攻撃
      const totalDmg = calcFieldDmg(pField, pAttackBuff, pKiretaStack, cBelly, { nikuMatsuri: pNikuMatsuri })
      if (totalDmg > 0) { addLog(`あなたの攻撃: ${totalDmg} ダメージ！`); addFloat(totalDmg, 'cpu') }
      const newCBelly = Math.min(MAX_BELLY, cBelly + totalDmg)
      set({ flash: 'cpu', cBelly: newCBelly })
      setTimeout(() => set({ flash: null }), 500)
      if (checkWin(ref.current.pBelly, newCBelly)) return

      // プレイヤー場を更新・ドロー・このターンリセット
      const newPField = pField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
      const [h1, d1] = drawCards(pHand, pDeck, 1 + pDrawBonus)
      // コハダで使い切った切れ味は、攻撃が解決したここで初めて0になる
      if (pKiretaSpent) addLog('✂ 切れ味スタックを使い切った（0にリセット）')
      set({
        pField: newPField, pHand: h1, pDeck: d1,
        pThisTurnBases: [], pThisTurnArch: {}, pNikuMatsuri: false,
        pKiretaStack: pKiretaSpent ? 0 : pKiretaStack, pKiretaSpent: false,
        phase: 'cpu',
      })

      setTimeout(() => {
        const st = ref.current
        const newTurn = turn + 1
        // CPUの一時APボーナス（前のCPUターンに貯めた分）を消費
        const cpuMaxAP = Math.min(INIT_AP + newTurn - 1, 10) + st.cApNextBonus

        // CPU 消化
        const cpuAfterDigest = st.cDigestStopTurns > 0
          ? st.cBelly
          : Math.max(0, st.cBelly - (digestionAmount(turn) + digestBonus(st.cField)))
        if (st.cDigestStopTurns > 0) addLog('🚫 CPUの消化がスキップされた！')

        // CPU 行動（プレイヤーと同じ召喚ロジックで効果・コンボ・バフを適用）
        const slots = Math.max(0, FIELD_MAX - st.cField.length)
        const toPlay = cpuChoose(st.cHand, cpuMaxAP).slice(0, slots)

        let cs = {
          belly: cpuAfterDigest,
          kireta: st.cKiretaStack,
          field: st.cField,
          summonedIds: st.cSummonedIds,
          summonedArch: st.cSummonedArch,
          thisTurnBases: [] as string[],
          thisTurnArch: {} as Record<string, number>,
          combosFired: st.cCombosFired,
          attackBuff: st.cAttackBuff,
          drawBonus: st.cDrawBonus,
          nikuMatsuri: false,
          kiretaSpent: false,
        }
        let cpuExtraDmg = 0
        let stopPlayerDigest = false
        let cpuExtraDraw = 0
        let cpuApNext = 0

        for (const c of toPlay) {
          addLog(`CPU ▶ ${cardEmoji(c)} ${c.name} 召喚`)
          const r = applySummon({ card: c, ...cs, enemyBelly: ref.current.pBelly })
          for (const m of r.logs) addLog(`CPU: ${m}`)
          for (const combo of r.fired) fireComboAnim(combo)
          cpuExtraDmg += r.extraDmg
          cpuExtraDraw += r.drawNow
          cpuApNext += r.apNext
          if (r.stopOppDigest) stopPlayerDigest = true
          cs = {
            belly: r.belly, kireta: r.kireta, field: r.field,
            summonedIds: r.summonedIds, summonedArch: r.summonedArch,
            thisTurnBases: r.thisTurnBases, thisTurnArch: r.thisTurnArch,
            combosFired: r.combosFired, attackBuff: r.attackBuff, drawBonus: r.drawBonus,
            nikuMatsuri: r.nikuMatsuri, kiretaSpent: r.kiretaSpent,
          }
        }

        // 召喚したカードをまず机に表示（即時型も見えるように）
        const bellyAfterEffects = Math.min(MAX_BELLY, ref.current.pBelly + cpuExtraDmg)
        if (cpuExtraDmg > 0) addFloat(cpuExtraDmg, 'player')
        set({
          cField: cs.field,
          cHand: st.cHand.filter(c => !toPlay.includes(c)),
          cBelly: cs.belly,
          cKiretaStack: cs.kireta,
          cSummonedIds: cs.summonedIds, cSummonedArch: cs.summonedArch,
          cCombosFired: cs.combosFired, cAttackBuff: cs.attackBuff, cDrawBonus: cs.drawBonus,
          cNikuMatsuri: cs.nikuMatsuri, cKiretaSpent: cs.kiretaSpent,
          cApNextBonus: cpuApNext,  // 今ターンに貯めた分は次のCPUターンで消費
          pBelly: bellyAfterEffects,
          pDigestStopTurns: stopPlayerDigest ? 1 : st.pDigestStopTurns,
        })
        if (checkWin(bellyAfterEffects, cs.belly)) return

        // 少し見せてから CPU 場の攻撃
        setTimeout(() => {
          const st2 = ref.current

          // CPU 場が攻撃（バフ・切れ味スタックも反映）
          const cpuDmg = calcFieldDmg(st2.cField, st2.cAttackBuff, st2.cKiretaStack, st2.pBelly, { nikuMatsuri: st2.cNikuMatsuri })
          if (cpuDmg > 0) { addLog(`CPU攻撃: ${cpuDmg} ダメージ！`); addFloat(cpuDmg, 'player') }
          const newPBelly = Math.min(MAX_BELLY, st2.pBelly + cpuDmg)
          set({ flash: 'player', pBelly: newPBelly })
          setTimeout(() => set({ flash: null }), 500)
          if (checkWin(newPBelly, st2.cBelly)) return

          // CPU 場を更新・CPU ドロー
          const nextCField = st2.cField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
          const [nextCHand, nextCDeck] = drawCards(st2.cHand, st2.cDeck, 1 + st2.cDrawBonus + cpuExtraDraw)

          // プレイヤー消化
          const pAfterDigest = st2.pDigestStopTurns > 0
            ? newPBelly
            : Math.max(0, newPBelly - (digestionAmount(turn) + digestBonus(st2.pField)))
          if (st2.pDigestStopTurns > 0) addLog('🚫 あなたの消化がスキップされた！')

          // プレイヤーの一時APボーナスを消費（1ターン限り）
          const pApBonus = st2.pApNextBonus
          if (pApBonus > 0) addLog(`⚡ 一時APボーナス +${pApBonus}！`)
          const nextMaxAP = Math.min(INIT_AP + newTurn - 1, 10) + pApBonus

          // 両者の手札・山札が尽きたら追加注文タイム
          const allOut =
            st2.pHand.length === 0 && st2.pDeck.length === 0 &&
            nextCHand.length === 0 && nextCDeck.length === 0
          if (allOut) addLog('🍽 追加注文タイム！ 軍資金 ¥1500 で補充しよう')

          addLog(`── ターン ${newTurn} ──`)
          set({
            cField: nextCField, cHand: nextCHand, cDeck: nextCDeck,
            cNikuMatsuri: false,
            cKiretaStack: st2.cKiretaSpent ? 0 : st2.cKiretaStack, cKiretaSpent: false,
            cDigestStopTurns: Math.max(0, st.cDigestStopTurns - 1),
            pBelly: pAfterDigest,
            pDigestStopTurns: Math.max(0, st2.pDigestStopTurns - 1),
            pApNextBonus: 0,
            turn: newTurn, pAP: nextMaxAP, pMaxAP: nextMaxAP,
            phase: allOut ? 'reorder' : 'player',
          })
        }, 900)
      }, 700)
    }, 200)
  }

  // ── ターン終了（二人対戦モード） ──────────────────────────────────────────
  const endTurnTwoPlayer = () => {
    if (ref.current.phase !== 'player') return
    setInspect(null)
    set({ phase: 'animating' })

    setTimeout(() => {
      const { pField, cBelly, pDeck, pHand, pDrawBonus, pAttackBuff, pKiretaStack, pNikuMatsuri, pKiretaSpent } = ref.current

      // アクティブプレイヤー場が攻撃
      const totalDmg = calcFieldDmg(pField, pAttackBuff, pKiretaStack, cBelly, { nikuMatsuri: pNikuMatsuri })
      if (totalDmg > 0) { addLog(`P${s.activePlayer}の攻撃: ${totalDmg} ダメージ！`); addFloat(totalDmg, 'cpu') }
      const newCBelly = Math.min(MAX_BELLY, cBelly + totalDmg)
      set({ flash: 'cpu', cBelly: newCBelly })
      setTimeout(() => set({ flash: null }), 500)
      if (checkWin(ref.current.pBelly, newCBelly)) return

      // 場を更新・ドロー・このターンリセット
      const newPField = pField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
      const [newPHand, newPDeck] = drawCards(pHand, pDeck, 1 + pDrawBonus)

      set({
        cBelly: newCBelly,
        pField: newPField, pHand: newPHand, pDeck: newPDeck,
        pThisTurnBases: [], pThisTurnArch: {}, pNikuMatsuri: false,
        pKiretaStack: pKiretaSpent ? 0 : pKiretaStack, pKiretaSpent: false,
        phase: 'pass',
      })
    }, 200)
  }

  const endTurn = mode === 'two_player' ? endTurnTwoPlayer : endTurnCpu

  // ── パス画面で「準備完了」タップ ─────────────────────────────────────────
  const handlePassReady = () => {
    const st = ref.current
    const newTurn = st.turn + 1
    // 2P モードはラウンド単位でAPが増える（2ターンで+1）
    // + 次にアクティブになる側（現c*）の一時APボーナスを消費
    if (st.cApNextBonus > 0) addLog(`⚡ 一時APボーナス +${st.cApNextBonus}！`)
    const nextMaxAP = Math.min(INIT_AP + Math.floor((newTurn - 1) / 2), 10) + st.cApNextBonus

    // ここでは待機側の攻撃・場の消耗・ドローを行わない。
    // それらは各プレイヤー自身のターン終了時（endTurnTwoPlayer）に1回だけ処理される。
    // パス画面は「手番の受け渡し」＋次のアクティブ側の消化・AP回復だけを担当する。

    // 次のアクティブ側（c*）の消化（2Pモードは2ターンで1ラウンド換算）
    const nextBelly = st.cDigestStopTurns > 0
      ? st.cBelly
      : Math.max(0, st.cBelly - (digestionAmount(Math.ceil(st.turn / 2)) + digestBonus(st.cField)))
    if (st.cDigestStopTurns > 0) addLog(`🚫 P${st.activePlayer === 1 ? 2 : 1}の消化がスキップされた！`)

    const nextPlayer: 1 | 2 = st.activePlayer === 1 ? 2 : 1

    // 両者の手札・山札が尽きたら追加注文タイム
    const allOut =
      st.cHand.length === 0 && st.cDeck.length === 0 &&
      st.pHand.length === 0 && st.pDeck.length === 0
    if (allOut) addLog('🍽 追加注文タイム！ 両者 ¥1500 で補充しよう')

    addLog(`── ターン ${newTurn}（P${nextPlayer}）──`)

    set({
      // 新アクティブ（旧 c*）
      pHand: st.cHand, pField: st.cField, pDeck: st.cDeck,
      pBelly: nextBelly,
      pAP: nextMaxAP, pMaxAP: nextMaxAP,
      pSummonedIds: st.cSummonedIds,
      pSummonedArch: st.cSummonedArch,
      pDrawBonus: st.cDrawBonus,
      pAttackBuff: st.cAttackBuff,
      pCombosFired: st.cCombosFired,
      pKiretaStack: st.cKiretaStack,
      pThisTurnBases: [], pThisTurnArch: {}, pNikuMatsuri: false, pKiretaSpent: false,
      pDigestStopTurns: Math.max(0, st.cDigestStopTurns - 1),
      pApNextBonus: 0,  // ボーナスは今消費した
      // 待機側（旧 p*）
      cHand: st.pHand, cField: st.pField, cDeck: st.pDeck,
      cBelly: st.pBelly,
      cSummonedIds: st.pSummonedIds,
      cSummonedArch: st.pSummonedArch,
      cDrawBonus: st.pDrawBonus,
      cAttackBuff: st.pAttackBuff,
      cCombosFired: st.pCombosFired,
      cKiretaStack: st.pKiretaStack,
      cDigestStopTurns: Math.max(0, st.pDigestStopTurns - 1),
      cNikuMatsuri: false, cKiretaSpent: false,
      cApNextBonus: st.pApNextBonus,  // 今ターン貯めた分は次の自分のターンで消費
      // ゲーム
      activePlayer: nextPlayer,
      turn: newTurn,
      phase: allOut ? 'reorder' : 'player',
    })
  }

  // ── 追加注文タイム完了 ────────────────────────────────────────────────────
  const handleReorderComplete = (cards: Card[]) => {
    if (mode === 'cpu') {
      const pd = shuffled(cards)
      const cd = shuffled(getCpuReorderDeck())
      addLog('🍽 追加注文完了！ バトル再開')
      set({
        pHand: pd.slice(0, 5), pDeck: pd.slice(5),
        cHand: cd.slice(0, 5), cDeck: cd.slice(5),
        phase: 'player',
      })
      return
    }
    // 二人対戦：アクティブ側（p）→ 相手側（c）の順にドラフト
    if (reorderStep === 'p') {
      pendingReorder.current = cards
      setReorderStep('c')
    } else {
      const pd = shuffled(pendingReorder.current)
      const cd = shuffled(cards)
      addLog('🍽 追加注文完了！ バトル再開')
      setReorderStep('p')
      set({
        pHand: pd.slice(0, 5), pDeck: pd.slice(5),
        cHand: cd.slice(0, 5), cDeck: cd.slice(5),
        phase: 'player',
      })
    }
  }

  const restart = () => { ref.current = initState(deck, mode, p2Deck); tick() }
  return { s, showLog, setShowLog, comboAnim, floats, inspect, setInspect, reorderStep, playCard, endTurn, handlePassReady, handleReorderComplete, restart }
}
