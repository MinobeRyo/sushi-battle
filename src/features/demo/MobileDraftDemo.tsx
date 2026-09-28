import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { CARDS, getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { SushiArt } from '../../components/SushiArt'
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
  const dialogRef = useRef<HTMLDivElement>(null)
  const orderId = useRef(0)
  const close = () => { setOverlay(null); setSelected(null) }
  const update = (state: typeof draft) => { draftRef.current = state; setDraft(state) }
  const canOrder = draft.shinkansenLeft > 0 && draft.deck.length < 20 && !draft.shinkansenPlate

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!overlay) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOverlay(null); setSelected(null) }
      if (event.key !== 'Tab') return
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [overlay])

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

  return <section className="demo-game" aria-label="横画面のドラフト体験">
    <div className="demo-game-content" inert={overlay !== null}>
      <header className="demo-game-header">
        <div className="demo-shop-name">すしバトル<span>一番席</span></div>
        <div className="demo-time"><span>残り時間</span><strong>01:30</strong></div>
        <div className="demo-budget"><span>お財布</span><strong>¥{draft.budget.toLocaleString()}</strong></div>
        <div className="demo-count"><strong>{draft.deck.length}</strong><span>/ 20皿</span></div>
      </header>

      <div className="demo-back-wall">
        <div className="demo-tablet-stand">
          <button className={`demo-small-tablet${draft.shinkansenPlate ? ' is-delivering' : ''}`} onClick={() => setOverlay('order')} disabled={!canOrder} aria-label="注文タブレットを開く">
            <span className="demo-tablet-camera" aria-hidden="true" />
            <span className="demo-tablet-speaker" aria-hidden="true" />
            <span className="demo-tablet-power" aria-hidden="true" />
            <span className="demo-small-tablet-screen">
              <span className="demo-tablet-statusbar" aria-hidden="true"><span>お席 01</span><span className="demo-tablet-battery" /></span>
              <span className="demo-tablet-menu"><span><small>握りたてを、お席まで。</small><strong>{draft.shinkansenPlate ? '特急をお届け中' : draft.shinkansenLeft === 0 ? '特急の受付終了' : draft.deck.length >= 20 ? 'お皿がいっぱいです' : '特急のご注文'}</strong></span><span className="demo-tablet-arrow">›</span></span>
              <span className="demo-tablet-footnote">{draft.shinkansenPlate ? '奥の金色のお皿をタップ' : `あと${draft.shinkansenLeft}回 ご注文いただけます`}</span>
            </span>
            <span className="demo-tablet-brand" aria-hidden="true">SUSHI BATTLE</span>
          </button>
          <span className="demo-tablet-neck" /><span className="demo-tablet-base" />
        </div>
        <div className="demo-wall-seal"><span>本日も</span><strong>営業中</strong></div>
      </div>

      <div className="demo-lane-space">
        <div className="demo-scene" data-world-width="16.1">
          <Canvas orthographic resize={{ offsetSize: true }} camera={{ position: [0, 5, 9], zoom: 40 }} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} gl={{ antialias: true }}>
            <Suspense fallback={null}><Scene generalCards={GENERAL_CARDS} buildCards={BUILD_CARDS} shinkansenPlate={draft.shinkansenPlate} onBeltSelect={selectPlate} onShinkansenPickup={pickup} paused={overlay === 'purchase' || overlay === 'order'} sevenPlates /></Suspense>
          </Canvas>
          <div className="demo-lane-label demo-lane-label-express">特急<span>ご注文のお皿</span></div>
          <div className="demo-lane-label demo-lane-label-general">汎用・サイド</div>
          <div className="demo-lane-label demo-lane-label-build">ビルド系</div>
        </div>
        {notice && <p className="demo-toast" role="status">{notice}</p>}
      </div>

      <footer className="demo-counter">
        <button className="demo-deck-button" onClick={() => setOverlay('deck')} aria-label={`購入した${draft.deck.length}皿を見る`}>
          <span className="demo-plate-stack" aria-hidden="true"><i /><i /><i /><i /></span>
          <span><strong>取ったお皿 <b>{draft.deck.length}</b></strong><small>デッキを見る <span>⌃</span></small></span>
        </button>
        <p className="demo-counter-hint">寿司もお皿もタップで選べます</p>
        <button className="demo-checkout" onClick={() => setOverlay('checkout')}>お会計 <span>›</span></button>
      </footer>
    </div>

    {overlay && <div className="demo-overlay" ref={dialogRef} role={overlay === 'order' ? undefined : 'dialog'} aria-modal={overlay === 'order' ? undefined : true} aria-label={overlay === 'purchase' ? 'お皿の詳細' : overlay === 'deck' ? '購入したお皿' : 'お会計'}>
      {overlay === 'order' && <ShinkansenOrderModal budget={draft.budget} initialCategory="all" onOrder={order} onClose={close} />}
      {overlay === 'purchase' && selected && <PurchaseModal card={selected.card} displayPrice={selected.card.price} budget={draft.budget} deckCount={draft.deck.length} onPurchase={purchase} onClose={close} />}
      {(overlay === 'deck' || overlay === 'checkout') && <div className="demo-sheet-backdrop" onClick={close}>
        <section className={`demo-deck-sheet${overlay === 'checkout' ? ' is-receipt' : ''}`} onClick={event => event.stopPropagation()}>
          <div className="demo-sheet-handle" />
          <header><div><p>{overlay === 'checkout' ? 'ありがとうございました' : 'あなたが選んだ、とっておき。'}</p><h2>{overlay === 'checkout' ? '本日のお会計' : '取ったお皿'} <span>{draft.deck.length}皿</span></h2></div><button onClick={close}>レーンに戻る ×</button></header>
          {overlay === 'deck' ? <div className="demo-deck-grid">{draft.deck.map((card, i) => <article key={`${card.id}-${i}`}><SushiArt card={card} size="100%" fit /><strong>{card.name}</strong><span>{card.cost} AP <b>攻撃 {card.attack}</b></span></article>)}</div> : <div className="demo-receipt"><p><span>ご利用額</span><strong>¥{(3000 - draft.budget).toLocaleString()}</strong></p><p><span>残金</span><strong>¥{draft.budget.toLocaleString()}</strong></p><p className="demo-receipt-note">こちらは画面を試すデモです。<br />バトルには進まず、何度でもお試しいただけます。</p><button onClick={onReset}>もう一度、席につく</button></div>}
          {overlay === 'deck' && <footer>残金 <strong>¥{draft.budget.toLocaleString()}</strong><span>あと{20 - draft.deck.length}皿お選びいただけます</span></footer>}
        </section>
      </div>}
    </div>}
  </section>
}
