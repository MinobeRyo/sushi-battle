import { getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { Scene } from './scene/DraftScene'
import { AnimatePresence } from 'framer-motion'
import { playGameSound, prepareGameAudio } from '../../audio/gameSounds'
import { PurchaseModal } from './PurchaseModal'
import { SideMenuPurchaseModal } from './SideMenuPurchaseModal'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import type { OrderCategory } from './ShinkansenOrderModal'
import { DraftDeckSheet, DraftRestaurantLayout } from './DraftRestaurantLayout'
import { PortraitDraftLayout } from './PortraitDraftLayout'
import { VerticalDraftScene } from '../demo/VerticalDraftScene'
import { StaffHelpModal } from './StaffHelpModal'
import { SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import {
  completeDraft as finishDraft, createDraftState, draftSecondsLeft, DRAFT_MAX_CARDS,
  orderOmakase, orderShinkansen, pickupShinkansen, purchaseBeltCard, purchaseSideMenu,
} from './draftEngine'
import type { DraftState } from './draftEngine'
import type { DraftCommand, PublicDraft } from '../../network/protocol'
import { onlineLaneElapsed } from '../../game/draftOffers'

// ─── constants ────────────────────────────────────────────────────────────────

const DRAFT_SECONDS = 90

const INITIAL_BUDGET = 3000
const PORTRAIT_QUERY = '(max-width: 700px) and (orientation: portrait)'

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  online?: {
    draft: PublicDraft; now: () => number; disabled: boolean; send: (command: DraftCommand) => Promise<boolean>
  }
  onComplete: (deck: Card[], sideMenu?: SideMenuId | null) => void
  playerNum?: 1 | 2
  initialBudget?: number   // 追加注文タイムでは¥1500
  seconds?: number         // 追加注文タイムでは短め
  mode?: 'initial' | 'reorder'
  sideMenuEnabled?: boolean
}

type SelectedItem = { offerId: string; markSold: () => boolean } & (
  { card: Card; sideMenuId?: never } | { card?: never; sideMenuId: SideMenuId }
)

export function DraftScreenThree({
  online,
  onComplete,
  playerNum,
  initialBudget = INITIAL_BUDGET,
  seconds = DRAFT_SECONDS,
  mode = 'initial',
  sideMenuEnabled = mode === 'initial',
}: Props) {
  const [portrait, setPortrait] = useState(() => window.matchMedia(PORTRAIT_QUERY).matches)
  const [localDraft, setDraft] = useState(() => createDraftState(initialBudget, seconds, Date.now(), sideMenuEnabled))
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

  useEffect(() => {
    const media = window.matchMedia(PORTRAIT_QUERY)
    const update = () => {
      setPortrait(media.matches)
      // 向きを変えると表示中の皿が組み直されるため、以前の選択は閉じる。
      selectedRef.current = null; setSelected(null)
      if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

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
    onCompleteRef.current(result.state.deck.slice(), result.state.sideMenu)
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

  const selectBeltItem = (item: SelectedItem) => {
    if (online ? online.disabled || draft.completed || timeLeft === 0
      : draftRef.current.completed || draftSecondsLeft(draftRef.current, Date.now()) === 0) return
    clearAutoClose()
    setPurchaseNotice('')
    selectedRef.current = item
    setSelected(selectedRef.current)
    if (item.card) autoCloseTimer.current = setTimeout(() => {
      selectedRef.current = null
      setSelected(null)
    }, 10000)
  }

  const handleBeltSelect = (card: Card, markSold: () => boolean, offerId: string) => selectBeltItem({ card, markSold, offerId })
  const handleBeltSideSelect = (sideMenuId: SideMenuId, markSold: () => boolean, offerId: string) => selectBeltItem({ sideMenuId, markSold, offerId })

  const handlePurchase = (card: Card) => {
    const item = selectedRef.current
    if (!item?.card || item.card.id !== card.id) return
    if (online) {
      if (!online.disabled) {
        prepareGameAudio()
        void online.send({ type: 'buy', offerId: item.offerId }).then(accepted => {
          if (accepted) playGameSound('dishPickup')
        }).catch(() => { /* 購入が確定しなかったときは取得音を鳴らさない。 */ })
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
    if (item.markSold()) {
      updateDraft(result.state)
      playGameSound('dishPickup')
    }
    else setPurchaseNotice('このお皿は流れていきました。別のお皿を選んでください。')
    clearAutoClose()
    selectedRef.current = null
    setSelected(null)
  }

  const handleModalClose = () => { clearAutoClose(); selectedRef.current = null; setSelected(null) }

  const handleBeltSidePurchase = () => {
    const item = selectedRef.current
    if (!item?.sideMenuId) return
    if (online) {
      if (!online.disabled) {
        prepareGameAudio()
        void online.send({ type: 'buy', offerId: item.offerId }).then(accepted => {
          if (accepted) playGameSound('dishPickup')
        }).catch(() => { /* 購入が確定しなかったときは取得音を鳴らさない。 */ })
        handleModalClose()
      }
      return
    }
    const result = purchaseSideMenu(draftRef.current, item.sideMenuId, Date.now())
    if (!result.accepted) {
      if (result.reason === 'expired') completeDraft()
      return
    }
    // 皿が周回していた場合は専用枠も残金も変更しません。
    if (item.markSold()) {
      updateDraft(result.state)
      playGameSound('dishPickup')
      setPurchaseNotice(`${SIDE_MENU_BY_ID[item.sideMenuId].name}を購入しました。この購入タイムでは1品までです。`)
    } else setPurchaseNotice('このお皿は流れていきました。別のお皿を選んでください。')
    handleModalClose()
  }

  const handleShinkansenOrder = (card: Card) => {
    if (online) {
      if (!online.disabled) {
        prepareGameAudio()
        void online.send({ type: 'order', cardId: card.id }).then(accepted => {
          if (accepted) playGameSound('expressOrder')
        }).catch(() => { /* 通信失敗時は確定音を鳴らさない。 */ })
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
    playGameSound('expressOrder')
    setShowShinkansenModal(false)
  }

  const handleShinkansenPickup = () => {
    if (online) {
      if (!online.disabled) {
        prepareGameAudio()
        void online.send({ type: 'pickup' }).then(accepted => {
          if (accepted) playGameSound('dishPickup')
        }).catch(() => { /* 受け取りが確定しなかったときは取得音を鳴らさない。 */ })
      }
      return
    }
    const result = pickupShinkansen(draftRef.current)
    if (result.accepted) {
      updateDraft(result.state)
      playGameSound('dishPickup')
    }
  }

  const handleSideMenuOrder = (id: SideMenuId) => {
    if (online) {
      if (!online.disabled) void online.send({ type: 'buy_side_menu', sideMenuId: id })
      return
    }
    const result = purchaseSideMenu(draftRef.current, id, Date.now())
    if (result.accepted) {
      updateDraft(result.state)
      setPurchaseNotice(`${SIDE_MENU_BY_ID[id].name}を購入しました。対戦中の専用スロットで使用できます。`)
    } else if (result.reason === 'expired') completeDraft()
  }

  const handleOmakaseOrder = () => {
    if (online) {
      if (!online.disabled) {
        prepareGameAudio()
        void online.send({ type: 'omakase' }).then(accepted => {
          if (accepted) playGameSound('dishPickup')
        }).catch(() => { /* 未確定時は結果を表示しません。 */ })
      }
      return
    }
    const result = orderOmakase(draftRef.current, Date.now(), Math.random)
    if (result.accepted) {
      updateDraft(result.state)
      playGameSound('dishPickup')
      setPurchaseNotice('大将のおすすめ3皿を購入しました。')
    } else if (result.reason === 'expired') completeDraft()
  }

  const generalCards = getCardsByLane('general')
  // 全ビルドカードが対象（レーン側のシャッフルバッグで満遍なく流れる）
  const buildCards = useMemo(() => getCardsByLane('build'), [])

  const canOrder = !online?.disabled && !draft.completed && timeLeft > 0 && deck.length < DRAFT_MAX_CARDS && shinkansenLeft > 0 && !shinkansenPlate
  const emptyDeckHint = mode === 'reorder'
    ? '0枚で終了すると、補充なしでバトルを再開します。'
    : '0枚で終了すると、汎用カード10枚の代替デッキで開始します。'
  const Layout = portrait ? PortraitDraftLayout : DraftRestaurantLayout
  const onlineSupply = online && {
    offers: online.draft.offers,
    elapsed: (lane: 'general' | 'build') => onlineLaneElapsed(online.draft.startedAt, online.draft.laneClocks[lane], online.now()),
  }

  return (
    <Layout
      shinkansenPlate={shinkansenPlate} onPickup={handleShinkansenPickup}
      timeLeft={timeLeft} budget={budget} deckCount={deck.length} maxCards={DRAFT_MAX_CARDS}
      playerNum={playerNum} canOrder={canOrder} delivering={Boolean(shinkansenPlate)} remaining={shinkansenLeft}
      disabled={online?.disabled}
      sideMenu={draft.sideMenu} sideMenuEnabled={draft.sideMenuEnabled}
      onSideMenu={() => { playGameSound('tabletTouch'); setOrderCategory('side_menu'); setShowShinkansenModal(true) }}
      overlayActive={Boolean(selected || showShinkansenModal || showHelp || handOpen)}
      onOrder={() => { playGameSound('tabletTouch'); setOrderCategory('all'); setShowShinkansenModal(true) }}
      onDeck={() => setHandOpen(true)} onHelp={() => setShowHelp(true)} onFinish={completeDraft}
      finishLabel={online ? '購入を完了' : mode === 'reorder' ? 'バトル再開' : portrait ? 'バトルへ' : 'お会計・バトルへ'}
      hint={shinkansenPlate ? portrait ? '下の特急トレイからお受け取りください。' : '奥の金色のお皿をタップしてお受け取りください。' : online ? portrait ? 'オンラインでは詳細表示中も皿と時間が進みます。' : 'PCではお皿にカーソルを合わせるとハイライトされます。レーンと残り時間は進みます。' : deck.length === 0 ? emptyDeckHint : portrait ? 'お皿か名前をタップして、効果を確認' : '寿司もお皿もタップで選べます。'}
      notice={purchaseNotice}
      overlays={<>
        {handOpen && <DraftDeckSheet deck={deck} sideMenu={draft.sideMenu} budget={budget} maxCards={DRAFT_MAX_CARDS} emptyMessage={emptyDeckHint} onClose={() => setHandOpen(false)} />}
        {selected?.card && <div className="portrait-purchase-dialog" role="dialog" aria-modal="true" aria-label="お皿の詳細" onKeyDown={event => { if (event.key === 'Escape') handleModalClose() }}>
          <PurchaseModal card={selected.card} displayPrice={selected.card.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
        </div>}
        {selected?.sideMenuId && <SideMenuPurchaseModal sideMenuId={selected.sideMenuId} budget={budget}
          purchasedSideMenu={draft.sideMenu} enabled={draft.sideMenuEnabled}
          remainingOrders={shinkansenLeft}
          disabled={online?.disabled || draft.completed || timeLeft === 0}
          onPurchase={handleBeltSidePurchase} onClose={handleModalClose} />}
        {showShinkansenModal && <ShinkansenOrderModal initialCategory={orderCategory} budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)}
          sideMenu={draft.sideMenu} sideMenuEnabled={draft.sideMenuEnabled} disabled={online?.disabled || draft.completed || timeLeft === 0}
          canOrderSushi={canOrder} onOrderSideMenu={handleSideMenuOrder}
          remainingOrders={shinkansenLeft}
          omakaseCards={draft.omakaseCards} deckCount={deck.length} onOrderOmakase={handleOmakaseOrder} />}
        <AnimatePresence>
          {showHelp && <div className="portrait-help-dialog" role="dialog" aria-modal="true" aria-label="店員さんの解説" onKeyDown={event => { if (event.key === 'Escape') setShowHelp(false) }}>
            <StaffHelpModal onClose={() => setShowHelp(false)} />
          </div>}
        </AnimatePresence>
      </>}
    >
      <Canvas className={portrait ? 'pd-main-canvas' : undefined} orthographic resize={{ offsetSize: true }} camera={{ position: [0, 5, 9], zoom: 40 }} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          {portrait ? <VerticalDraftScene onlineSupply={onlineSupply} generalCards={generalCards} buildCards={buildCards}
            onBeltSelect={handleBeltSelect} onSideMenuSelect={handleBeltSideSelect}
            sideMenusEnabled={draft.sideMenuEnabled} sideMenuPurchased={Boolean(draft.sideMenu)}
            paused={Boolean(selected || showShinkansenModal || showHelp || handOpen)} /> : <Scene
            onlineSupply={onlineSupply}
            generalCards={generalCards}
            buildCards={buildCards}
            shinkansenPlate={shinkansenPlate}
            onBeltSelect={handleBeltSelect}
            onSideMenuSelect={handleBeltSideSelect}
            sideMenusEnabled={draft.sideMenuEnabled}
            sideMenuPurchased={Boolean(draft.sideMenu)}
            onShinkansenPickup={handleShinkansenPickup}
            paused={Boolean(selected || showShinkansenModal || showHelp)}
            sevenPlates
          />}
        </Suspense>
      </Canvas>
    </Layout>
  )
}
