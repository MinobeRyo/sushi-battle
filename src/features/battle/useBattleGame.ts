import type { Card } from '../../types'
import type { SideMenuId } from '../../data/sideMenus'
import { useEffect, useReducer, useRef, useState } from 'react'
import { createMatch, getCpuActions, transitionMatch } from '../../game/matchEngine'
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
  const view = useRef<{ viewer: PlayerId; phase: ViewPhase; busy: boolean }>({ viewer: 1, phase: 'player', busy: false })
  const [, tick] = useReducer(n => n + 1, 0)
  const [showLog, setShowLog] = useState(false)
  const { comboAnim, announceCombo, clearCombos } = useComboAnnouncements()
  const [floats, setFloats] = useState<FloatNum[]>([])
  const [inspect, setInspect] = useState<Inspect | null>(null)
  const [flash, setFlash] = useState<'player' | 'cpu' | null>(null)
  const floatId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const clearTimers = () => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current.clear()
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
  }

  const syncPhase = () => {
    const match = matchRef.current!
    view.current.phase = match.phase === 'over' ? 'over' : match.phase === 'reorder' ? 'reorder'
      : mode === 'cpu' && match.activePlayerId === 2 ? 'cpu' : 'player'
    tick()
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

  const playCard = (card: Card) => {
    if (view.current.busy || view.current.phase !== 'player') return
    if (!('instanceId' in card) || typeof card.instanceId !== 'string') return
    if (dispatch({ type: 'play_card', playerId: view.current.viewer, cardInstanceId: card.instanceId })) {
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
    later(() => {
      dispatch({ type: 'end_turn', playerId: view.current.viewer })
      if (matchRef.current!.phase === 'over') {
        view.current.busy = false
        syncPhase()
        return
      }
      if (mode === 'two_player') {
        // 手渡し待ちは端末の表示だけ。ルール上の交代は既に確定している。
        view.current.phase = 'pass'
        tick()
        return
      }
      syncPhase()
      later(() => {
        const actions = getCpuActions(matchRef.current!)
        for (const action of actions) {
          dispatch(action)
          if (matchRef.current!.phase === 'over') break
        }
        if (matchRef.current!.phase === 'over') {
          view.current.busy = false
          syncPhase()
          return
        }
        // 即時型のCPUカードも机に表示してから攻撃を見せる。
        later(() => {
          dispatch({ type: 'end_turn', playerId: 2 })
          view.current.busy = false
          syncPhase()
        }, 900)
      }, 700)
    }, 200)
  }

  const useSideMenu = () => {
    if (view.current.busy || view.current.phase !== 'player') return
    if (dispatch({ type: 'use_side_menu', playerId: view.current.viewer })) syncPhase()
  }

  const handlePassReady = () => {
    if (view.current.phase !== 'pass') return
    view.current.viewer = matchRef.current!.activePlayerId
    view.current.busy = false
    setFloats([])
    setFlash(null)
    setInspect(null)
    clearCombos()
    syncPhase()
  }

  const handleReorderComplete = (cards: Card[]) => {
    const match = matchRef.current!
    if (view.current.phase !== 'reorder' || match.reorderPlayerId === null) return
    dispatch({ type: 'complete_reorder', playerId: match.reorderPlayerId, cards })
    syncPhase()
  }

  const restart = () => {
    clearTimers()
    matchNumber.current += 1
    matchRef.current = createMatch({ deck, p2Deck, mode, sideMenu, p2SideMenu, matchId: `local-${matchNumber.current}` })
    view.current = { viewer: 1, phase: 'player', busy: false }
    setShowLog(false)
    clearCombos()
    setFloats([])
    setInspect(null)
    setFlash(null)
    tick()
  }

  const match = matchRef.current
  const s = toBattleView(match, view.current.viewer, view.current.phase, flash)
  const reorderStep = match.reorderPlayerId === null || match.reorderPlayerId === view.current.viewer ? 'p' : 'c'
  return { s, showLog, setShowLog, comboAnim, floats, inspect, setInspect, reorderStep,
    playCard, useSideMenu, endTurn, handlePassReady, handleReorderComplete, restart }
}
