import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import type { DraftRestaurantLayoutProps } from './DraftRestaurantLayout'
import type { DraftState } from './draftEngine'
import { VerticalExpressScene } from '../demo/VerticalDraftScene'
import { DraftSideMenuButton } from './DraftSideMenuButton'
import './PortraitDraftLayout.css'

type Props = DraftRestaurantLayoutProps & {
  shinkansenPlate: DraftState['shinkansenPlate']
  onPickup: () => void
}

function focusableElements(element: HTMLElement | null) {
  return Array.from(element?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]') ?? [])
    .filter(item => !item.matches(':disabled') && item.tabIndex >= 0 && !item.closest('[inert], [hidden], [aria-hidden="true"]')
      && getComputedStyle(item).visibility !== 'hidden' && item.getClientRects().length > 0)
}

export function PortraitDraftLayout({ timeLeft, budget, deckCount, maxCards, playerNum = 1,
  canOrder, delivering, remaining, finishLabel, disabled = false, overlayActive,
  onOrder, sideMenu, sideMenuEnabled = false, onSideMenu, onDeck, onFinish, onHelp, hint, notice, children, overlays, shinkansenPlate, onPickup }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overlayActive) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      if (!overlayRef.current?.contains(document.activeElement)) (focusableElements(overlayRef.current)[0] ?? overlayRef.current)?.focus()
    })
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return
      const root = overlayRef.current
      const elements = focusableElements(root)
      const first = elements[0], last = elements[elements.length - 1]
      if (!first || !last) { event.preventDefault(); root?.focus(); return }
      if (!root?.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', trapFocus)
      if (previous?.isConnected) previous.focus()
    }
  }, [overlayActive])

  const seconds = Math.max(0, Math.ceil(timeLeft))
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const orderLabel = delivering ? '下のトレイで受取' : deckCount >= maxCards ? 'お皿がいっぱい' : remaining ? `あと${remaining}回　›` : '受付終了'

  return <section className="draft-portrait" aria-label="寿司を選ぶ縦画面のドラフト" onClickCapture={event => {
    if (disabled) { event.preventDefault(); event.stopPropagation() }
  }}>
    <div className="pd-content" inert={overlayActive || disabled}>
      <header className="pd-header"><h1>すしを選ぶ<span>P{playerNum}</span></h1>{onHelp && <button onClick={onHelp}>遊び方</button>}</header>
      <div className="pd-status" aria-label="購入状況">
        <div><span>残金</span><strong>¥{budget.toLocaleString()}</strong></div>
        <div><span>購入した皿</span><strong>{deckCount}<small> / {maxCards}</small></strong></div>
        <div data-urgent={seconds <= 20}><span>残り時間</span><strong role="timer" aria-label={`残り${seconds}秒`}>{time}</strong></div>
      </div>
      <div className={`pd-toolbar${onSideMenu ? ' pd-toolbar--with-side' : ''}`}>
        <button className="pd-order-button" disabled={!canOrder || disabled} onClick={onOrder}><strong>特急で注文</strong><span>{orderLabel}</span></button>
        {onSideMenu ? <DraftSideMenuButton className="pd-side-button" sideMenu={sideMenu} enabled={sideMenuEnabled} disabled={disabled} onClick={onSideMenu} /> : <span className="pd-tap-hint">お皿をタップ<br />して選ぶ</span>}
      </div>
      <div className="pd-lane-headings"><h2>汎用寿司<span aria-hidden="true">↓</span></h2><h2>ビルド系<span aria-hidden="true">↓</span></h2></div>
      <div className="pd-stage" role="region" aria-label="寿司のお皿が上から下へ流れる2本のレーン">
        {children}
        {shinkansenPlate && <section className="pd-delivery" aria-label="特急のお届け">
          <div className="pd-delivery-art"><Canvas orthographic camera={{ position: [0, 6, 9], zoom: 40 }} dpr={[1, 1.5]} gl={{ antialias: true }}><Suspense fallback={null}><VerticalExpressScene plate={shinkansenPlate} onPickup={onPickup} paused={overlayActive} /></Suspense></Canvas></div>
          <div className="pd-delivery-description"><span>特急のお届け</span><strong>{shinkansenPlate.card.name}</strong></div>
          <button disabled={disabled} onClick={onPickup} aria-label={`${shinkansenPlate.card.name}を受け取る`}>受け取る</button>
        </section>}
      </div>
      <footer className="pd-footer"><p className="pd-notice" role="status">{notice || hint || 'お皿か名前をタップして、効果を確認'}</p><div className="pd-footer-actions"><button onClick={onDeck} aria-haspopup="dialog" aria-label={`購入した${deckCount}皿を見る`}>購入一覧 <strong>{deckCount}皿</strong></button><button className="pd-finish" disabled={disabled} onClick={onFinish}>{finishLabel}</button></div></footer>
    </div>
    {overlayActive && overlays && <div className="pd-overlays" ref={overlayRef} tabIndex={-1}>{overlays}</div>}
  </section>
}
