import { getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { Scene } from './scene/DraftScene'
import { AnimatePresence } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import { PurchaseModal } from './PurchaseModal'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import type { OrderCategory } from './ShinkansenOrderModal'
import { OrderTablet } from './OrderTablet'
import { StaffHelpModal } from './StaffHelpModal'
import {
  completeDraft as finishDraft, createDraftState, draftSecondsLeft, DRAFT_MAX_CARDS,
  orderShinkansen, pickupShinkansen, purchaseBeltCard,
} from './draftEngine'
import type { DraftState } from './draftEngine'
import './DraftScreen.css'

// ─── constants ────────────────────────────────────────────────────────────────

const DRAFT_SECONDS = 90

const INITIAL_BUDGET = 3000

const ARCHETYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  akami:    { bg: '#7f1d1d', text: '#fca5a5', label: '赤身' },
  makimono: { bg: '#14532d', text: '#86efac', label: '巻物' },
  hikari:   { bg: '#1e3a5f', text: '#93c5fd', label: '光り物' },
  kaisen:   { bg: '#164e63', text: '#67e8f9', label: '海鮮' },
  niku:     { bg: '#7c2d12', text: '#fdba74', label: '肉寿司' },
  gunkan:   { bg: '#78350f', text: '#fcd34d', label: '軍艦' },
  general:  { bg: '#292524', text: '#d6d3d1', label: '汎用' },
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  onComplete: (deck: Card[]) => void
  playerNum?: 1 | 2
  initialBudget?: number   // 追加注文タイムでは¥1500
  seconds?: number         // 追加注文タイムでは短め
  mode?: 'initial' | 'reorder'
}

type SelectedItem = { card: Card; offerId: string; markSold: () => boolean }

export function DraftScreenThree({
  onComplete,
  playerNum,
  initialBudget = INITIAL_BUDGET,
  seconds = DRAFT_SECONDS,
  mode = 'initial',
}: Props) {
  const [draft, setDraft] = useState(() => createDraftState(initialBudget, seconds, Date.now()))
  const { budget, deck, shinkansenLeft, shinkansenPlate } = draft
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [showShinkansenModal, setShowShinkansenModal] = useState(false)
  const [orderCategory, setOrderCategory] = useState<OrderCategory>('all')
  const [handOpen, setHandOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [purchaseNotice, setPurchaseNotice] = useState('')

  const draftRef = useRef(draft)
  const selectedRef = useRef<SelectedItem | null>(null)
  const orderIdRef = useRef(0)
  const onCompleteRef = useRef(onComplete)
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const completeDraft = useCallback(() => {
    // 時間切れと手動終了が重なっても、次のプレイヤーへ二重に進めない。
    const result = finishDraft(draftRef.current)
    if (!result.accepted) return
    draftRef.current = result.state
    setDraft(result.state)
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current)
    onCompleteRef.current(result.state.deck.slice())
  }, [])

  useEffect(() => {
    const tick = () => {
      const remaining = draftSecondsLeft(draftRef.current, Date.now())
      setTimeLeft(remaining)
      // 親画面の更新はstate更新関数の外で行う。
      if (remaining === 0) completeDraft()
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [completeDraft])

  useEffect(() => () => {
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current)
  }, [])

  const updateDraft = (next: DraftState) => {
    // 連続イベントでも、残高・枚数・注文状況をまとめて最新状態で検証する。
    draftRef.current = next
    setDraft(next)
  }

  const clearAutoClose = () => {
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }
  }

  const handleBeltSelect = (card: Card, markSold: () => boolean, offerId: string) => {
    if (draftRef.current.completed || draftSecondsLeft(draftRef.current, Date.now()) === 0) return
    clearAutoClose()
    setPurchaseNotice('')
    selectedRef.current = { card, offerId, markSold }
    setSelected(selectedRef.current)
    autoCloseTimer.current = setTimeout(() => {
      selectedRef.current = null
      setSelected(null)
    }, 10000)
  }

  const handlePurchase = (card: Card) => {
    const item = selectedRef.current
    if (!item || item.card.id !== card.id) return
    const result = purchaseBeltCard(draftRef.current, item.offerId, item.card, Date.now())
    if (!result.accepted) {
      if (result.reason === 'expired') completeDraft()
      return
    }
    // レーンが一周して別の皿に替わっていたら、古い選択からは購入しない。
    if (item.markSold()) updateDraft(result.state)
    else setPurchaseNotice('このお皿は流れていきました。別のお皿を選んでください。')
    clearAutoClose()
    selectedRef.current = null
    setSelected(null)
  }

  const handleModalClose = () => { clearAutoClose(); selectedRef.current = null; setSelected(null) }

  const handleShinkansenOrder = (card: Card) => {
    const result = orderShinkansen(draftRef.current, String(orderIdRef.current), card, Date.now())
    if (!result.accepted) {
      if (result.reason === 'expired') completeDraft()
      return
    }
    orderIdRef.current += 1
    updateDraft(result.state)
    setShowShinkansenModal(false)
  }

  const handleShinkansenPickup = () => {
    const result = pickupShinkansen(draftRef.current)
    if (result.accepted) updateDraft(result.state)
  }

  const generalCards = getCardsByLane('general')
  // 全ビルドカードが対象（レーン側のシャッフルバッグで満遍なく流れる）
  const buildCards = useMemo(() => getCardsByLane('build'), [])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const urgent = timeLeft <= 20
  const canOrder = !draft.completed && timeLeft > 0 && deck.length < DRAFT_MAX_CARDS && shinkansenLeft > 0 && !shinkansenPlate
  const emptyDeckHint = mode === 'reorder'
    ? '0枚で終了すると、補充なしでバトルを再開します。'
    : '0枚で終了すると、汎用カード10枚の代替デッキで開始します。'

  return (
    <div className="draft-restaurant">
      {/* ヘッダー */}
      <div className="draft-restaurant-header flex items-center justify-between px-5 py-2.5 flex-shrink-0 z-10"
        style={{ background: '#2c1006', borderBottom: '1px solid #78350f' }}>
        <div className="flex items-center gap-2">
          <div className={`font-mono text-lg font-bold tabular-nums tracking-wider ${urgent ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
            ⏱ {mins}:{String(secs).padStart(2, '0')}
          </div>
          {playerNum && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#78350f', color: '#fde68a' }}>
              P{playerNum}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-600">デッキ </span>
          <span className="text-amber-200 font-bold">{deck.length}</span>
          <span className="text-amber-600">/{DRAFT_MAX_CARDS}</span>
        </div>
        <div className="text-yellow-400 font-bold text-lg tabular-nums">¥{budget.toLocaleString()}</div>
      </div>
      {deck.length === 0 && (
        <p className="draft-empty-hint flex-shrink-0 px-4 py-1.5 text-center text-xs text-amber-200" style={{ background: '#3d1a0a' }}>
          {emptyDeckHint}
        </p>
      )}
      {purchaseNotice && (
        <p role="status" className="flex-shrink-0 px-4 py-1.5 text-center text-xs text-amber-200" style={{ background: '#3d1a0a' }}>
          {purchaseNotice}
        </p>
      )}

      <div className="draft-restaurant-main">
        {/* 注文タブレットは常にレーンの奥・中央。下にレーンの表示領域を確保する。 */}
        <OrderTablet
          canOrder={canOrder} delivering={Boolean(shinkansenPlate)} budget={budget}
          spent={initialBudget - budget} deckCount={deck.length} remaining={shinkansenLeft}
          playerNum={playerNum}
          onOpenCategory={category => { setOrderCategory(category); setShowShinkansenModal(true) }}
          onHelp={() => setShowHelp(true)} onFinish={completeDraft}
        />

        <div className="draft-conveyor-area">
          <div className="draft-restaurant-lanes" aria-label="奥から特急、汎用、ビルド系の順">
            <span>特急レーン</span><span>汎用・サイド</span><span>ビルド系</span>
          </div>
          <div className="draft-stage" aria-label="寿司を選ぶ3Dレーン">
            <Canvas orthographic camera={{ position: [0, 8, 9], zoom: 60 }} shadows={{ type: PCFShadowMap }} dpr={[1, 2]} gl={{ antialias: true }}>
              <Suspense fallback={null}>
                <Scene
                  generalCards={generalCards}
                  buildCards={buildCards}
                  shinkansenPlate={shinkansenPlate}
                  onBeltSelect={handleBeltSelect}
                  onShinkansenPickup={handleShinkansenPickup}
                  paused={Boolean(selected || showShinkansenModal || showHelp)}
                />
              </Suspense>
            </Canvas>
          </div>
          <p className="draft-restaurant-hint" role="status">{shinkansenPlate ? '特急が到着。奥の金色のお皿か寿司をタップして受け取ってください。' : '寿司もお皿もタップで選べます。'}<span className="draft-hover-hint"> カーソルを合わせるとレーンが止まります。</span></p>
        </div>
      </div>

      <footer className="draft-restaurant-footer">
        <div className="draft-restaurant-actions">
          <button onClick={() => setHandOpen(o => !o)} className="draft-restaurant-deck-toggle" aria-expanded={handOpen} aria-controls="draft-deck">
            <span>手札 <strong>{deck.length}</strong> / {DRAFT_MAX_CARDS}枚</span>
            <span>{handOpen ? '閉じる ▾' : '確認する ▴'}</span>
          </button>
          <button onClick={completeDraft} className="draft-restaurant-battle">{mode === 'reorder' ? 'バトル再開' : 'バトルへ'} →</button>
        </div>
        {handOpen && (
          <div id="draft-deck" className={`draft-restaurant-deck${deck.length === 0 ? ' is-empty' : ''}`} aria-label="購入した寿司">
            {deck.length === 0 ? <p>まだ購入していません</p> : deck.map((card, i) => {
              const style = ARCHETYPE_STYLE[card.archetype[0]] ?? ARCHETYPE_STYLE.general
              return (
                <div key={`hand-${i}`} className="draft-restaurant-card" style={{ borderColor: style.text + '66', background: style.bg }}>
                  <SushiArt card={card} size="100%" />
                  <strong>{card.name}</strong>
                  <span style={{ color: style.text }}>{card.cost} AP <span>攻撃 {card.attack}</span></span>
                </div>
              )
            })}
          </div>
        )}
      </footer>

      {/* モーダルは画面全体に配置する。 */}
      {selected && (
        <PurchaseModal card={selected.card} displayPrice={selected.card.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
      )}
      {showShinkansenModal && (
        <ShinkansenOrderModal initialCategory={orderCategory} budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)} />
      )}
      <AnimatePresence>
        {showHelp && <StaffHelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </div>
  )
}
