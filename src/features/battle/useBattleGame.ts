import type { Card } from '../../types'
import type { SideMenuId } from '../../data/sideMenus'
import { useEffect, useReducer, useRef, useState } from 'react'
import { createMatch, getCpuActions, getCpuDefenseAction, transitionMatch } from '../../game/matchEngine'
import type { MatchAction, MatchEvent, MatchMode, MatchState, PlayerId } from '../../game/types'
import { COMBO_META } from './battleEngine'
import type { FloatNum, Inspect, ViewPhase } from './types'
import { toBattleView } from './battleView'
import { useComboAnnouncements } from './useComboAnnouncements'

// ゲーム計算はmatchEngineへ委譲し、このフックは画面の待ち時間・演出だけを管理する。
export function useBattleGame({ deck, p2Deck, mode, sideMenu, p2SideMenu, onSummon }: {
  deck: Card[]; p2Deck?: Card[]; mode: MatchMode
  sideMenu?: SideMenuId | null; p2SideMenu?: SideMenuId | null
  onSummon?: () => void
}) {
  const matchRef = useRef<MatchState | null>(null)
  const matchNumber = useRef(0)
  if (matchRef.current === null) matchRef.current = createMatch({ deck, p2Deck, mode, sideMenu, p2SideMenu, matchId: 'local-0' })
  const view = useRef<{ viewer: PlayerId; phase: ViewPhase; busy: boolean; passToPlayerId: PlayerId | null }>({
    viewer: 1, phase: 'player', busy: false, passToPlayerId: null,
  })
  const [, tick] = useReducer(n => n + 1, 0)
  const [showLog, setShowLog] = useState(false)
  const { comboAnim, announceCombo, clearCombos } = useComboAnnouncements()
  const [floats, setFloats] = useState<FloatNum[]>([])
  const [inspect, setInspect] = useState<Inspect | null>(null)
  const [flash, setFlash] = useState<'player' | 'cpu' | null>(null)
  const floatId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current.clear()
    progressTimer.current = null
  }
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const later = (fn: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); fn() }, delay)
    timers.current.add(timer)
    return timer
  }

  const cancelProgress = () => {
    if (progressTimer.current === null) return
    clearTimeout(progressTimer.current)
    timers.current.delete(progressTimer.current)
    progressTimer.current = null
  }

  // 進行用タイマーは常に1本。再開・リスタート後に古いCPU操作が走るのを防ぐ。
  const scheduleProgress = (fn: () => void, delay: number) => {
    cancelProgress()
    const scheduledMatch = matchRef.current!
    const revision = scheduledMatch.revision
    progressTimer.current = later(() => {
      progressTimer.current = null
      if (matchRef.current?.matchId !== scheduledMatch.matchId || matchRef.current.revision !== revision) return
      fn()
    }, delay)
  }

  const showEvents = (events: MatchEvent[]) => {
    for (const event of events) {
      if (event.type === 'summon') {
        onSummon?.()
      } else if (event.type === 'damage') {
        const target = event.playerId === view.current.viewer ? 'player' : 'cpu'
        const id = ++floatId.current
        setFloats(current => [...current, { id, dmg: event.amount, target }])
        setFlash(target)
        later(() => setFloats(current => current.filter(item => item.id !== id)), 1300)
        later(() => setFlash(null), 500)
      } else if (event.type === 'combo') {
        const combo = COMBO_META[event.comboId]
        announceCombo({
          name: combo.name, desc: combo.desc,
          playerLabel: mode === 'two_player' ? `PLAYER ${event.playerId}` : event.playerId === 1 ? 'YOU' : 'CPU',
        })
      }
    }
  }

  const dispatch = (action: MatchAction) => {
    const result = transitionMatch(matchRef.current!, action)
    if (result.error) return false
    matchRef.current = result.state
    showEvents(result.events)
    tick()
    return true
  }

  const syncPhase = (cpuDelay = 700) => {
    cancelProgress()
    const match = matchRef.current!
    view.current.passToPlayerId = null
    if (match.phase === 'over') {
      view.current.phase = 'over'
      view.current.busy = false
    } else if (mode === 'two_player') {
      const nextViewer = match.pendingAttack?.defenderId ?? match.reorderPlayerId ?? match.activePlayerId
      if (nextViewer !== view.current.viewer) {
        // 召喚中の割り込みでも端末を渡し、回答後は必要なプレイヤーへ戻す。
        view.current.phase = 'pass'
        view.current.passToPlayerId = nextViewer
        view.current.busy = true
        setInspect(null)
        setShowLog(false)
        setFloats([])
        setFlash(null)
        clearCombos()
      } else {
        view.current.phase = match.phase === 'defending' ? 'defending'
          : match.phase === 'reorder' ? 'reorder' : 'player'
        view.current.busy = false
      }
    } else if (match.phase === 'defending') {
      const isHumanDefense = match.pendingAttack?.defenderId === 1
      view.current.phase = isHumanDefense ? 'defending' : 'waiting'
      view.current.busy = !isHumanDefense
      if (!isHumanDefense) {
        scheduleProgress(() => {
          const action = getCpuDefenseAction(matchRef.current!)
          if (action) dispatch(action)
          syncPhase(450)
        }, 550)
      }
    } else if (match.phase === 'reorder') {
      view.current.phase = 'reorder'
      view.current.busy = false
    } else if (match.activePlayerId === 2) {
      view.current.phase = 'cpu'
      view.current.busy = true
      // 1枚ごとに最新状態を確認する。人間の防御回答を待つ間は次を予約しない。
      const action = getCpuActions(match)[0]
      scheduleProgress(() => {
        dispatch(action ?? { type: 'end_turn', playerId: 2 })
        syncPhase(450)
      }, action ? cpuDelay : 900)
    } else {
      view.current.phase = 'player'
      view.current.busy = false
    }
    tick()
  }

  const playCard = (card: Card, sacrificeCount = 0, targetFieldId?: string) => {
    if (view.current.busy || view.current.phase !== 'player') return
    if (!('instanceId' in card) || typeof card.instanceId !== 'string') return
    if (dispatch({ type: 'play_card', playerId: view.current.viewer, cardInstanceId: card.instanceId, sacrificeCount, targetFieldId })) {
      setInspect(null)
      syncPhase()
    }
  }

  const endTurn = () => {
    if (view.current.busy || view.current.phase !== 'player') return
    view.current.busy = true
    view.current.phase = 'animating'
    setInspect(null)
    tick()
    scheduleProgress(() => {
      dispatch({ type: 'end_turn', playerId: view.current.viewer })
      syncPhase()
    }, 200)
  }

  const useSideMenu = () => {
    if (view.current.busy || view.current.phase !== 'player') return
    if (dispatch({ type: 'use_side_menu', playerId: view.current.viewer })) syncPhase()
  }

  const respondDefense = (useGari: boolean) => {
    const pending = matchRef.current!.pendingAttack
    if (view.current.busy || view.current.phase !== 'defending' || pending?.defenderId !== view.current.viewer) return
    view.current.busy = true
    setInspect(null)
    dispatch({ type: 'respond_defense', playerId: view.current.viewer, useGari })
    syncPhase(450)
  }

  const handlePassReady = () => {
    if (view.current.phase !== 'pass' || view.current.passToPlayerId === null) return
    view.current.viewer = view.current.passToPlayerId
    view.current.busy = false
    setFloats([])
    setFlash(null)
    setInspect(null)
    clearCombos()
    syncPhase()
  }

  const handleReorderComplete = (cards: Card[]) => {
    const match = matchRef.current!
    if (view.current.busy || view.current.phase !== 'reorder' || match.reorderPlayerId !== view.current.viewer) return
    dispatch({ type: 'complete_reorder', playerId: match.reorderPlayerId, cards })
    syncPhase()
  }

  const restart = () => {
    clearTimers()
    matchNumber.current += 1
    matchRef.current = createMatch({ deck, p2Deck, mode, sideMenu, p2SideMenu, matchId: `local-${matchNumber.current}` })
    view.current = { viewer: 1, phase: 'player', busy: false, passToPlayerId: null }
    setShowLog(false)
    clearCombos()
    setFloats([])
    setInspect(null)
    setFlash(null)
    tick()
  }

  const match = matchRef.current
  const s = toBattleView(match, view.current.viewer, view.current.phase, flash, view.current.passToPlayerId)
  const reorderStep = match.reorderPlayerId === null || match.reorderPlayerId === view.current.viewer ? 'p' : 'c'
  return { s, showLog, setShowLog, comboAnim, floats, inspect, setInspect, reorderStep,
    playCard, useSideMenu, endTurn, respondDefense, handlePassReady, handleReorderComplete, restart }
}
