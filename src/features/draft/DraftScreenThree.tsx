import { getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { Scene } from './scene/DraftScene'
import { AnimatePresence } from 'framer-motion'
import { PurchaseModal } from './PurchaseModal'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import type { OrderCategory } from './ShinkansenOrderModal'
import { DraftDeckSheet, DraftRestaurantLayout } from './DraftRestaurantLayout'
import { StaffHelpModal } from './StaffHelpModal'
import {
  completeDraft as finishDraft, createDraftState, draftSecondsLeft, DRAFT_MAX_CARDS,
  orderShinkansen, pickupShinkansen, purchaseBeltCard,
} from './draftEngine'
import type { DraftState } from './draftEngine'
import type { DraftCommand, PublicDraft } from '../../network/protocol'
import { onlineLaneElapsed } from '../../game/draftOffers'

// ─── constants ────────────────────────────────────────────────────────────────

const DRAFT_SECONDS = 90

const INITIAL_BUDGET = 3000

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  online?: {
    draft: PublicDraft; now: () => number; disabled: boolean; send: (command: DraftCommand) => Promise<boolean>
  }
  onComplete: (deck: Card[]) => void
  playerNum?: 1 | 2
  initialBudget?: number   // 追加注文タイムでは¥1500
  seconds?: number         // 追加注文タイムでは短め
  mode?: 'initial' | 'reorder'
}

type SelectedItem = { card: Card; offerId: string; markSold: () => boolean }

export function DraftScreenThree({
  online,
  onComplete,
  playerNum,
  initialBudget = INITIAL_BUDGET,
  seconds = DRAFT_SECONDS,
  mode = 'initial',
}: Props) {
  const [localDraft, setDraft] = useState(() => createDraftState(initialBudget, seconds, Date.now()))
  const draft = online ? { ...online.draft.you, purchasedIds: [] } : localDraft
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
  const onlineRef = useRef(online)
  onlineRef.current = online
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const completeDraft = useCallback(() => {
    if (onlineRef.current) {
      if (!onlineRef.current.disabled) void onlineRef.current.send({ type: 'complete' })
      return
    }
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
      const remote = onlineRef.current
      const remaining = remote
        ? Math.max(0, Math.ceil((remote.draft.you.deadlineAt - remote.now()) / 1000))
        : draftSecondsLeft(draftRef.current, Date.now())
      setTimeLeft(remaining)
      // 親画面の更新はstate更新関数の外で行う。
      if (remaining === 0 && !remote) completeDraft()
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
    if (online ? online.disabled || draft.completed || timeLeft === 0
      : draftRef.current.completed || draftSecondsLeft(draftRef.current, Date.now()) === 0) return
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
    if (online) {
      if (!online.disabled) {
        void online.send({ type: 'buy', offerId: item.offerId })
        handleModalClose()
      }
      return
    }
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
    if (online) {
      if (!online.disabled) {
        void online.send({ type: 'order', cardId: card.id })
        setShowShinkansenModal(false)
      }
      return
    }
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
    if (online) {
      if (!online.disabled) void online.send({ type: 'pickup' })
      return
    }
    const result = pickupShinkansen(draftRef.current)
    if (result.accepted) updateDraft(result.state)
  }

  const generalCards = getCardsByLane('general')
  // 全ビルドカードが対象（レーン側のシャッフルバッグで満遍なく流れる）
  const buildCards = useMemo(() => getCardsByLane('build'), [])

  const canOrder = !online?.disabled && !draft.completed && timeLeft > 0 && deck.length < DRAFT_MAX_CARDS && shinkansenLeft > 0 && !shinkansenPlate
  const emptyDeckHint = mode === 'reorder'
    ? '0枚で終了すると、補充なしでバトルを再開します。'
    : '0枚で終了すると、汎用カード10枚の代替デッキで開始します。'

  return (
    <DraftRestaurantLayout
      timeLeft={timeLeft} budget={budget} deckCount={deck.length} maxCards={DRAFT_MAX_CARDS}
      playerNum={playerNum} canOrder={canOrder} delivering={Boolean(shinkansenPlate)} remaining={shinkansenLeft}
      disabled={online?.disabled}
      overlayActive={Boolean(selected || showShinkansenModal || showHelp || handOpen)}
      onOrder={() => { setOrderCategory('all'); setShowShinkansenModal(true) }}
      onDeck={() => setHandOpen(true)} onHelp={() => setShowHelp(true)} onFinish={completeDraft}
      finishLabel={online ? '購入を完了' : mode === 'reorder' ? 'バトル再開' : 'お会計・バトルへ'}
      hint={shinkansenPlate ? '奥の金色のお皿をタップしてお受け取りください。' : online ? 'PCではお皿にカーソルを合わせるとハイライトされます。レーンと残り時間は進みます。' : deck.length === 0 ? emptyDeckHint : '寿司もお皿もタップで選べます。'}
      notice={purchaseNotice}
      overlays={<>
        {handOpen && <DraftDeckSheet deck={deck} budget={budget} maxCards={DRAFT_MAX_CARDS} emptyMessage={emptyDeckHint} onClose={() => setHandOpen(false)} />}
        {selected && <div role="dialog" aria-modal="true" aria-label="お皿の詳細" onKeyDown={event => { if (event.key === 'Escape') handleModalClose() }}>
          <PurchaseModal card={selected.card} displayPrice={selected.card.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
        </div>}
        {showShinkansenModal && <ShinkansenOrderModal initialCategory={orderCategory} budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)} />}
        <AnimatePresence>
          {showHelp && <div role="dialog" aria-modal="true" aria-label="店員さんの解説" onKeyDown={event => { if (event.key === 'Escape') setShowHelp(false) }}>
            <StaffHelpModal onClose={() => setShowHelp(false)} />
          </div>}
        </AnimatePresence>
      </>}
    >
      <Canvas orthographic resize={{ offsetSize: true }} camera={{ position: [0, 5, 9], zoom: 40 }} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <Scene
            onlineSupply={online && {
              offers: online.draft.offers,
              elapsed: lane => onlineLaneElapsed(online.draft.startedAt, online.draft.laneClocks[lane], online.now()),
            }}
            generalCards={generalCards}
            buildCards={buildCards}
            shinkansenPlate={shinkansenPlate}
            onBeltSelect={handleBeltSelect}
            onShinkansenPickup={handleShinkansenPickup}
            paused={Boolean(selected || showShinkansenModal || showHelp)}
            sevenPlates
          />
        </Suspense>
      </Canvas>
    </DraftRestaurantLayout>
  )
}
