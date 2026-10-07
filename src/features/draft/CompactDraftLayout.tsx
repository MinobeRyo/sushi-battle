import { useEffect, useRef } from 'react'
import { SushiArt } from '../../components/SushiArt'
import { SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import type { Card } from '../../types'
import type { DraftRestaurantLayoutProps } from './DraftRestaurantLayout'
import { CompactDraftLane } from './CompactDraftLane'
import type { OnlineBeltSupply } from './scene/BeltLane3D'
import './CompactDraftLayout.css'

const FOCUSABLE_SELECTOR = [
  'a[href]', 'area[href]', 'button', 'input:not([type="hidden"])',
  'select', 'textarea', 'iframe', 'summary', '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

function focusableElements(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(element => {
    if (element.matches(':disabled') || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
    if (element.tabIndex < 0 && !(element.isContentEditable && !element.hasAttribute('tabindex'))) return false
    const visibility = getComputedStyle(element).visibility
    return visibility !== 'hidden' && visibility !== 'collapse' && element.getClientRects().length > 0
  })
}

type Props = DraftRestaurantLayoutProps & {
  deck: Card[]
  shinkansenPlate: { card: Card } | null
  generalCards: Card[]
  buildCards: Card[]
  supply?: OnlineBeltSupply
  emptyDeckHint: string
  onPickup: () => void
  onBeltSelect: (card: Card, markSold: () => boolean, offerId: string) => void
  onBeltSideSelect: (id: SideMenuId, markSold: () => boolean, offerId: string) => void
}

export function CompactDraftLayout({ budget, deck, timeLeft, playerNum, remaining, shinkansenPlate,
  sideMenu, sideMenuEnabled = false, generalCards, buildCards, supply, canOrder, disabled = false,
  overlayActive, maxCards, notice, emptyDeckHint, finishLabel, onBeltSelect, onBeltSideSelect,
  onOrder, onPickup, onFinish, onHelp, onSideMenu, onDeck, overlays }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!overlayActive) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const overlay = overlayRef.current
      if (!overlay?.contains(document.activeElement)) {
        const target = focusableElements(overlay)[0] ?? overlay
        target?.focus()
      }
    })
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return
      const overlay = overlayRef.current
      const elements = focusableElements(overlay)
      const first = elements[0], last = elements[elements.length - 1]
      if (!first || !last) { event.preventDefault(); overlay?.focus(); return }
      if (!overlay?.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', trapFocus)
      if (previous?.isConnected) previous.focus()
    }
  }, [overlayActive])

  const clock = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`
  return <section className="draft-restaurant-ui draft-compact" aria-label="寿司を選ぶドラフト画面">
    <div className="cd-layout" inert={overlayActive || disabled}>
      <aside className="cd-summary" aria-label="購入状況">
        <div className={`cd-stat cd-time${timeLeft <= 20 ? ' is-urgent' : ''}`}><span>残り時間{playerNum && <small>P{playerNum}</small>}</span><strong role="timer" aria-label={`残り${timeLeft}秒`}>{clock}</strong></div>
        <div className="cd-stat cd-budget"><span>軍資金</span><strong>¥{budget.toLocaleString()}</strong></div>
        <button className="cd-purchased" onClick={onDeck} aria-haspopup="dialog">
          <span className="cd-purchased-heading">取ったお皿 <strong>{deck.length}<small> / {maxCards}</small></strong></span>
          <span className="cd-mini-deck">{deck.slice(-9).map((card, index) => <span key={`${index}-${card.id}`}><SushiArt card={card} size="100%" fit /></span>)}</span>
          {deck.length === 0 && <span className="cd-empty-deck">お寿司をタップして<br />購入できます<small>{emptyDeckHint}</small></span>}
          <span className="cd-purchased-more">一覧を見る</span>
        </button>
      </aside>
      <main className="cd-lanes">
        <section className="cd-express" aria-label="特急レーン">
          <header><h2>特急レーン</h2><span>注文したお皿が届く</span></header>
          {shinkansenPlate ? <button disabled={disabled} onClick={onPickup} className="cd-delivery">
            <span aria-hidden="true"><SushiArt card={shinkansenPlate.card} size="100%" fit /></span><strong>{shinkansenPlate.card.name}</strong><b>受け取る</b>
          </button> : <p>いまは注文がありません</p>}
        </section>
        <CompactDraftLane lane="general" cards={generalCards} supply={supply} paused={overlayActive} disabled={disabled} budget={budget} onSelect={onBeltSelect}
          sideMenusEnabled={sideMenuEnabled} sideMenuPurchased={Boolean(sideMenu)} onSideMenuSelect={onBeltSideSelect} />
        <CompactDraftLane lane="build" cards={buildCards} supply={supply} paused={overlayActive} disabled={disabled} budget={budget} onSelect={onBeltSelect}
          sideMenusEnabled={sideMenuEnabled} sideMenuPurchased={Boolean(sideMenu)} onSideMenuSelect={onBeltSideSelect} />
        {notice && <p className="cd-notice" role="status">{notice}</p>}
      </main>
      <aside className="cd-actions" aria-label="注文と操作">
        <button className="cd-order" disabled={disabled || (!canOrder && !onSideMenu)} onClick={onOrder}><strong>特急で注文</strong><span>{shinkansenPlate ? 'お皿を受け取れます' : `あと${remaining}回・1.5倍`}</span></button>
        {onSideMenu && <button className="cd-side" disabled={disabled} onClick={onSideMenu}><strong>サイドメニュー</strong><span>{sideMenu ? SIDE_MENU_BY_ID[sideMenu].name : sideMenuEnabled ? '未購入・¥300〜500' : '追加購入なし'}</span></button>}
        {onHelp && <button className="cd-help" onClick={onHelp}>遊び方</button>}
        <button className="cd-finish" disabled={disabled} onClick={onFinish}>{finishLabel}</button>
      </aside>
    </div>
    {overlayActive && overlays && <div className="restaurant-overlays" ref={overlayRef} tabIndex={-1}>{overlays}</div>}
  </section>
}
