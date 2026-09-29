import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { SushiArt } from '../../components/SushiArt'
import { CARDS, getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { EFFECT_FULL } from '../battle/battlePresentation'
import {
  createDraftState, orderShinkansen, pickupShinkansen, purchaseBeltCard, shinkansenPrice,
} from '../draft/draftEngine'
import './VerticalDraftDemo.css'
import { VerticalDraftScene, VerticalExpressScene } from './VerticalDraftScene'

type DemoLane = 'express' | 'general' | 'build'
type Offer = { lane: DemoLane; id: string; card: Card; markSold?: () => boolean }
type Panel = { kind: 'card'; offer: Offer } | { kind: 'deck' } | { kind: 'order' } | null

const LANES: { id: DemoLane; name: string; note: string }[] = [
  { id: 'general', name: '汎用・サイド', note: '使いやすい一皿' },
  { id: 'build', name: 'ビルド', note: '組み合わせ重視' },
]
const GENERAL_CARDS = getCardsByLane('general')
const BUILD_CARDS = getCardsByLane('build')
const ARCHETYPES: Record<string, string> = {
  general: '汎用', akami: '赤身', makimono: '巻物', hikari: '光り物', kaisen: '海鮮', niku: '肉寿司', gunkan: '軍艦',
}
const money = (value: number) => `¥${value.toLocaleString()}`
const offerPrice = (offer: Offer) => offer.lane === 'express' ? shinkansenPrice(offer.card) : offer.card.price

export default function VerticalDraftDemo() {
  // 比較用デモでは制限時間を固定し、価格・所持金・注文回数には既存のルールを使う。
  const [draft, setDraft] = useState(() => createDraftState(3000, 90, 0))
  const draftRef = useRef(draft)
  const orderId = useRef(0)
  const [panel, setPanel] = useState<Panel>(null)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [notice, setNotice] = useState('')
  const [generation, setGeneration] = useState(0)
  const dialogRef = useRef<HTMLElement>(null)
  const stopped = paused || panel !== null

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (event: MediaQueryListEvent) => { if (event.matches) setPaused(true) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!panel) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null)
      if (event.key !== 'Tab') return
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [panel])

  const reset = () => {
    const next = createDraftState(3000, 90, 0)
    draftRef.current = next
    setDraft(next); setPanel(null); setNotice('最初の状態に戻しました')
    setGeneration(value => value + 1)
  }

  const purchase = (offer: Offer) => {
    const id = `vertical-${generation}-${offer.id}`
    const result = offer.lane === 'express'
      ? orderShinkansen(draftRef.current, id, offer.card, 0)
      : purchaseBeltCard(draftRef.current, id, offer.card, 0)
    if (!result.accepted) return
    if (offer.markSold && !offer.markSold()) {
      setNotice('このお皿は流れていきました。もう一度お選びください。')
      setPanel(null)
      return
    }
    const next = result.state
    draftRef.current = next; setDraft(next)
    setNotice(offer.lane === 'express' ? `${offer.card.name}を特急でお届けします` : `${offer.card.name}を購入しました。残金 ${money(next.budget)}`)
    setPanel(null)
  }

  const pickup = () => {
    const result = pickupShinkansen(draftRef.current)
    if (!result.accepted) return
    draftRef.current = result.state
    setDraft(result.state)
    setNotice('ご注文のお寿司を受け取りました')
  }

  const selected = panel?.kind === 'card' ? panel.offer : null
  const disabledReason = selected && (draft.deck.length >= 20 ? '20皿まで購入できます'
    : selected.lane === 'express' && draft.shinkansenPlate ? '先にご注文のお皿をお受け取りください'
      : selected.lane === 'express' && draft.shinkansenLeft <= 0 ? '特急注文は受付終了です'
      : draft.budget < offerPrice(selected) ? '残金が足りません' : null)

  return <main className="vertical-draft-demo">
    <section className="vd-phone" aria-label="縦画面の寿司レーン体験">
      <div className="vd-content" inert={panel !== null}>
        <header className="vd-header">
          <div><h1>すしを選ぶ</h1><span>体験デモ</span></div>
          <a href={window.location.pathname + window.location.search}>戻る</a>
        </header>

        <div className="vd-status" aria-label="購入状況">
          <div><span>残金</span><strong>{money(draft.budget)}</strong></div>
          <div><span>購入した皿</span><strong>{draft.deck.length}<small> / 20</small></strong></div>
          <div><span>時間（固定）</span><strong>01:30</strong></div>
        </div>

        <div className="vd-toolbar">
          <button className="vd-order-button" onClick={() => setPanel({ kind: 'order' })}
            disabled={!!draft.shinkansenPlate || draft.shinkansenLeft === 0 || draft.deck.length >= 20}>
            <strong>{draft.shinkansenPlate ? '特急でお届け中' : '特急注文'}</strong><span>あと{draft.shinkansenLeft}回</span>
          </button>
          <button onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? 'レーンの流れを再開する' : 'レーンの流れを止める'}>
            <span aria-hidden="true" className={paused ? 'vd-play-icon' : 'vd-pause-icon'} />{paused ? '再開' : '止める'}
          </button>
        </div>

        <div className="vd-lane-headings">
          {LANES.map(lane => <div key={lane.id} className={`vd-lane-heading vd-${lane.id}`}><h2>{lane.name}<span aria-hidden="true">↓</span></h2></div>)}
        </div>

        <div className="vd-lanes" role="region" aria-label="寿司のお皿が上から下へ流れる2本のレーン">
          <Canvas key={generation} className="vd-main-canvas" orthographic camera={{ position: [0, 6, 9], zoom: 40 }} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} gl={{ antialias: true }}>
            <Suspense fallback={null}><VerticalDraftScene generalCards={GENERAL_CARDS} buildCards={BUILD_CARDS}
              paused={stopped}
              onBeltSelect={(card, markSold, id) => setPanel({ kind: 'card', offer: { card, markSold, id, lane: 'general' } })} /></Suspense>
          </Canvas>
          {draft.shinkansenPlate && <section className="vd-delivery" aria-label="特急のお届け">
            <div className="vd-delivery-art">
              <Canvas orthographic camera={{ position: [0, 5, 9], zoom: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
                <Suspense fallback={null}><VerticalExpressScene plate={draft.shinkansenPlate} onPickup={pickup} paused={panel !== null} /></Suspense>
              </Canvas>
            </div>
            <div className="vd-delivery-description"><span>特急のお届け</span><strong>{draft.shinkansenPlate.card.name}</strong></div>
            <button onClick={pickup} aria-label={`${draft.shinkansenPlate.card.name}を受け取る`}>受け取る</button>
          </section>}
        </div>

        <footer className="vd-footer">
          <p className="vd-notice" role="status">{notice || (paused ? 'レーン停止中。ゆっくり選べます。' : 'お皿か名前をタップして、効果を確認')}</p>
          <div className="vd-footer-actions"><button className="vd-deck-button" onClick={() => setPanel({ kind: 'deck' })}>購入一覧 <strong>{draft.deck.length}皿</strong></button><button className="vd-reset-button" onClick={reset}>最初から</button></div>
        </footer>
      </div>

      {panel && <div className="vd-modal-backdrop" onClick={() => setPanel(null)}>
        <section className="vd-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="vd-sheet-title" onClick={event => event.stopPropagation()}>
          <header className="vd-sheet-header"><div><p>{panel.kind === 'order' ? '特急の注文端末' : panel.kind === 'deck' ? '選んだカードを確認' : selected?.lane === 'express' ? '特急の指名注文' : 'お皿の詳細'}</p><h2 id="vd-sheet-title">{selected ? selected.card.name : panel.kind === 'order' ? '好きなネタを選ぶ' : `購入したお皿 ${draft.deck.length}皿`}</h2></div><button onClick={() => setPanel(null)} aria-label="詳細を閉じる">閉じる</button></header>
          <div className="vd-sheet-scroll">
            {selected ? <>
              <div className="vd-detail-overview"><div className="vd-detail-art"><SushiArt card={selected.card} size="100%" fit /></div><div className="vd-detail-price"><span>{selected.lane === 'express' ? '特急料金込み' : '購入価格'}</span><strong>{money(offerPrice(selected))}</strong><small>{selected.card.type === 'instant' ? '即時型' : '持続型'}</small></div></div>
              <div className="vd-tags">{selected.card.archetype.map(archetype => <span key={archetype}>{ARCHETYPES[archetype]}</span>)}</div>
              <dl className="vd-detail-stats"><div><dt>使用コスト</dt><dd>{selected.card.cost} <small>AP</small></dd></div><div><dt>攻撃</dt><dd>{selected.card.attack}</dd></div><div><dt>{selected.card.type === 'persist' ? '持続' : 'タイプ'}</dt><dd>{selected.card.type === 'persist' ? <>{selected.card.fullness}<small>ターン</small></> : <small>即時</small>}</dd></div></dl>
              <p className="vd-card-effect">{selected.card.effect ? EFFECT_FULL[selected.card.effect] ?? selected.card.effect : selected.card.type === 'persist' ? '机に残り、毎ターン相手のお腹を増やします。' : '使用すると、攻撃の値だけ相手のお腹を増やします。'}</p>
              {selected.lane === 'express' && <p className="vd-express-note">特急は1.5倍の料金を50円単位に切り上げます。あと{draft.shinkansenLeft}回注文できます。ご注文後、画面下の特急トレイでお受け取りください。</p>}
            </> : panel.kind === 'order' ? <div className="vd-order-menu">{CARDS.map(card => <button key={card.id} onClick={() => setPanel({ kind: 'card', offer: { card, lane: 'express', id: `order-${orderId.current++}` } })} aria-label={`${card.name}を特急注文、${money(shinkansenPrice(card))}`}><span><SushiArt card={card} size="100%" fit /></span><strong>{card.name}</strong><b>{money(shinkansenPrice(card))}</b></button>)}</div>
              : draft.deck.length ? <div className="vd-deck-list">{draft.deck.map((card, index) => <article key={`${card.id}-${index}`}><div><SushiArt card={card} size="100%" fit /></div><section><h3>{card.name}</h3><p>{card.cost} AP<span>攻撃 {card.attack}</span>{card.type === 'persist' && <span>{card.fullness}ターン</span>}</p></section></article>)}</div> : <div className="vd-empty"><strong>まだお皿を選んでいません。</strong><p>気になるお皿をタップして、<br />効果を見ながら選んでみてください。</p></div>}
          </div>
          <footer className="vd-sheet-footer">
            <p>残金 <strong>{money(draft.budget)}</strong><span>{selected && !disabledReason ? `購入後 ${money(draft.budget - offerPrice(selected))}` : `${draft.deck.length} / 20皿`}</span></p>
            {selected ? <button className="vd-buy-button" disabled={!!disabledReason} onClick={() => purchase(selected)}>{disabledReason || `${money(offerPrice(selected))}で${selected.lane === 'express' ? '注文する' : '購入する'}`}</button> : <button className="vd-buy-button" onClick={() => setPanel(null)}>レーンに戻る</button>}
          </footer>
        </section>
      </div>}
    </section>
  </main>
}
