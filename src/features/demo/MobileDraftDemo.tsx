import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { CARDS, getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { DraftDeckSheet, DraftRestaurantLayout } from '../draft/DraftRestaurantLayout'
import { Scene } from '../draft/scene/DraftScene'
import { PurchaseModal } from '../draft/PurchaseModal'
import { ShinkansenOrderModal } from '../draft/ShinkansenOrderModal'
import { createDraftState, orderShinkansen, pickupShinkansen, purchaseBeltCard } from '../draft/draftEngine'
import './MobileDraftDemo.css'

const GENERAL_CARDS = getCardsByLane('general')
const BUILD_CARDS = getCardsByLane('build')
const DEVICES = [
  { id: 'wide', name: 'スマホ・横長', size: '844 × 390', width: 844, height: 390 },
  { id: 'compact', name: 'スマホ・16:9', size: '667 × 375', width: 667, height: 375 },
  { id: 'desktop', name: 'PC', size: '1280 × 800', width: 1280, height: 800 },
] as const

type SelectedPlate = { card: Card; markSold: () => boolean; offerId: string }
type Overlay = 'order' | 'deck' | 'checkout' | 'purchase' | null

// UIを時間制限なしで試せるよう、このデモだけゲーム内の時計を固定する。
function initialDraft() {
  let draft = createDraftState(3000, 90, 0)
  for (const id of ['tamago', 'salmon', 'ebi']) {
    const card = CARDS.find(item => item.id === id)!
    draft = purchaseBeltCard(draft, `sample-${id}`, card, 0).state
  }
  return draft
}

export default function MobileDraftDemo() {
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0])
  const [generation, setGeneration] = useState(0)
  const [actualSize, setActualSize] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setPreviewSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // ゲームの描画寸法と、PC上の表示倍率を分ける。狭いパネルでも横画面の配置を保つ。
  const frameWidth = device.width + 16
  const frameHeight = device.height + 16
  const scale = actualSize ? 1 : Math.max(0, Math.min(1, (previewSize.width - 24) / frameWidth, (previewSize.height - 24) / frameHeight))

  return <main className="mobile-demo">
    <header className="demo-heading">
      <div><p className="demo-eyebrow">SUSHI BATTLE / UI STUDY 01</p><h1>いつもの席を、横画面に。</h1></div>
      <a href={window.location.pathname + window.location.search}>ゲームに戻る <span>↗</span></a>
    </header>
    <nav className="demo-toolbar" aria-label="画面サイズの比較">
      <div className="demo-device-tabs">{DEVICES.map(item => <button key={item.id} aria-pressed={device.id === item.id} onClick={() => setDevice(item)}>{item.name}<small>{item.size}</small></button>)}</div>
      <div className="demo-preview-controls"><button className="demo-size-toggle" aria-pressed={actualSize} onClick={() => setActualSize(value => !value)}>{actualSize ? '全体表示に戻す' : '原寸で見る'}</button><span>{Math.round(scale * 100)}%</span><button className="demo-reset" onClick={() => setGeneration(value => value + 1)}>最初から試す ↻</button></div>
    </nav>
    <div className="demo-preview" ref={previewRef}>
      <div className="demo-device-holder" style={{ width: frameWidth * scale, height: frameHeight * scale, borderRadius: (device.id === 'desktop' ? 12 : 25) * scale }}>
        <div className="demo-device" data-device={device.id} style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}><RestaurantDemo key={generation} onReset={() => setGeneration(value => value + 1)} /></div>
      </div>
    </div>
    <footer className="demo-notes">
      <p>{actualSize ? <>原寸表示では、画面を縦横にスクロールして確認できます。</> : <><b>7皿分の眺めは共通。</b> 注文端末と、手前のお皿を押してみてください。</>}</p>
      <span>体験用：時間は固定 / 購入済みの3皿からスタート</span>
    </footer>
  </main>
}

function RestaurantDemo({ onReset }: { onReset: () => void }) {
  const [draft, setDraft] = useState(initialDraft)
  const draftRef = useRef(draft)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [selected, setSelected] = useState<SelectedPlate | null>(null)
  const [notice, setNotice] = useState('')
  const orderId = useRef(0)
  const close = () => { setOverlay(null); setSelected(null) }
  const update = (state: typeof draft) => { draftRef.current = state; setDraft(state) }
  const canOrder = draft.shinkansenLeft > 0 && draft.deck.length < 20 && !draft.shinkansenPlate

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const selectPlate = (card: Card, markSold: () => boolean, offerId: string) => {
    setSelected({ card, markSold, offerId }); setOverlay('purchase')
  }
  const purchase = (card: Card) => {
    if (!selected || selected.card.id !== card.id) return
    const result = purchaseBeltCard(draftRef.current, selected.offerId, card, 0)
    if (!result.accepted) return
    if (selected.markSold()) { update(result.state); setNotice(`${card.name}をお取りしました`) }
    else setNotice('このお皿は流れていきました。もう一度お選びください。')
    close()
  }
  const order = (card: Card) => {
    const result = orderShinkansen(draftRef.current, `demo-${orderId.current++}`, card, 0)
    if (!result.accepted) return
    update(result.state); close(); setNotice(`${card.name}を特急でお届けします`)
  }
  const pickup = () => {
    const result = pickupShinkansen(draftRef.current)
    if (result.accepted) { update(result.state); setNotice('ご注文ありがとうございます') }
  }

  return <DraftRestaurantLayout
    timeLeft={90} budget={draft.budget} deckCount={draft.deck.length} maxCards={20}
    canOrder={canOrder} delivering={Boolean(draft.shinkansenPlate)} remaining={draft.shinkansenLeft}
    overlayActive={overlay !== null} onOrder={() => setOverlay('order')} onDeck={() => setOverlay('deck')}
    onFinish={() => setOverlay('checkout')} finishLabel="お会計" notice={notice}
    overlays={<>
      {overlay === 'order' && <ShinkansenOrderModal budget={draft.budget} initialCategory="all" onOrder={order} onClose={close} />}
      {overlay === 'purchase' && selected && <div role="dialog" aria-modal="true" aria-label="お皿の詳細" onKeyDown={event => { if (event.key === 'Escape') close() }}>
        <PurchaseModal card={selected.card} displayPrice={selected.card.price} budget={draft.budget} deckCount={draft.deck.length} onPurchase={purchase} onClose={close} />
      </div>}
      {overlay === 'deck' && <DraftDeckSheet deck={draft.deck} budget={draft.budget} maxCards={20} emptyMessage="まだ購入していません" onClose={close} />}
      {overlay === 'checkout' && <div className="demo-receipt-backdrop" onClick={close} onKeyDown={event => { if (event.key === 'Escape') close() }}>
        <section className="demo-receipt-sheet" role="dialog" aria-modal="true" aria-label="本日のお会計" onClick={event => event.stopPropagation()}>
          <header><div><p>ありがとうございました</p><h2>本日のお会計 <span>{draft.deck.length}皿</span></h2></div><button onClick={close}>戻る ×</button></header>
          <div className="demo-receipt"><p><span>ご利用額</span><strong>¥{(3000 - draft.budget).toLocaleString()}</strong></p><p><span>残金</span><strong>¥{draft.budget.toLocaleString()}</strong></p><p className="demo-receipt-note">こちらは画面を試すデモです。<br />バトルには進まず、何度でもお試しいただけます。</p><button onClick={onReset}>もう一度、席につく</button></div>
        </section>
      </div>}
    </>}
  >
    <Canvas orthographic resize={{ offsetSize: true }} camera={{ position: [0, 5, 9], zoom: 40 }} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <Suspense fallback={null}><Scene generalCards={GENERAL_CARDS} buildCards={BUILD_CARDS} shinkansenPlate={draft.shinkansenPlate} onBeltSelect={selectPlate} onShinkansenPickup={pickup} paused={overlay === 'purchase' || overlay === 'order'} sevenPlates /></Suspense>
    </Canvas>
  </DraftRestaurantLayout>
}
