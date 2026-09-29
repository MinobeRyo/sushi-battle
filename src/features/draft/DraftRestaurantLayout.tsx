import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'
import { SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import { SideMenuArt } from '../side-menu/SideMenuArt'
import { DraftSideMenuButton } from './DraftSideMenuButton'
import './DraftRestaurantLayout.css'

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

export type DraftRestaurantLayoutProps = {
  timeLeft: number
  budget: number
  deckCount: number
  maxCards: number
  playerNum?: 1 | 2
  canOrder: boolean
  delivering: boolean
  remaining: number
  finishLabel: string
  disabled?: boolean
  overlayActive: boolean
  onOrder: () => void
  sideMenu?: SideMenuId | null
  sideMenuEnabled?: boolean
  onSideMenu?: () => void
  onDeck: () => void
  onFinish: () => void
  onHelp?: () => void
  hint?: string
  notice?: string
  children: ReactNode
  overlays?: ReactNode
}

export function DraftRestaurantLayout({
  timeLeft, budget, deckCount, maxCards, playerNum = 1,
  canOrder, delivering, remaining, finishLabel, disabled = false,
  overlayActive, onOrder, sideMenu, sideMenuEnabled = false, onSideMenu, onDeck, onFinish, onHelp, hint, notice,
  children, overlays,
}: DraftRestaurantLayoutProps) {
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

  const seconds = Math.max(0, Math.ceil(timeLeft))
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const orderTitle = onSideMenu ? '寿司・サイドのご注文' : delivering ? '特急をお届け中'
    : deckCount >= maxCards ? 'お皿がいっぱいです'
      : remaining === 0 ? '特急の受付終了' : '特急のご注文'

  return <section className="draft-restaurant-ui" aria-label="寿司を選ぶドラフト画面"
    onClickCapture={event => {
      if (disabled && !overlayRef.current?.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation() }
    }}>
    <div className="restaurant-content" inert={overlayActive || disabled}>
      <header className="restaurant-header">
        <div className="restaurant-shop-name">すしバトル<span>お席 {String(playerNum).padStart(2, '0')}</span></div>
        <div className={`restaurant-time${seconds <= 20 ? ' is-urgent' : ''}`}><span>残り時間</span><strong>{clock}</strong></div>
        <div className="restaurant-budget"><span>お財布</span><strong>¥{budget.toLocaleString()}</strong></div>
        <div className="restaurant-count"><strong>{deckCount}</strong><span>/ {maxCards}皿</span></div>
        {onHelp && <button className="restaurant-help" onClick={onHelp}>遊び方</button>}
      </header>

      <div className={`restaurant-back-wall${onSideMenu ? ' restaurant-back-wall--with-side' : ''}`}>
        <div className="restaurant-tablet-stand">
          <button className="restaurant-tablet" onClick={canOrder ? onOrder : onSideMenu ?? onOrder} disabled={disabled || (!canOrder && !onSideMenu)} aria-label="注文タブレットを開く">
            <span className="restaurant-tablet-camera" aria-hidden="true" />
            <span className="restaurant-tablet-speaker" aria-hidden="true" />
            <span className="restaurant-tablet-power" aria-hidden="true" />
            <span className="restaurant-tablet-screen">
              <span className="restaurant-tablet-statusbar" aria-hidden="true"><span>お席 {String(playerNum).padStart(2, '0')}</span><span className="restaurant-tablet-battery" /></span>
              <span className="restaurant-tablet-menu"><span><small>{onSideMenu ? '特急と、勝負を支える一皿。' : '握りたてを、お席まで。'}</small><strong>{orderTitle}</strong></span><span className="restaurant-tablet-arrow">›</span></span>
              <span className="restaurant-tablet-footnote">{delivering ? '特急は奥の金色のお皿をタップ' : !canOrder && onSideMenu ? 'サイドメニューを確認できます' : `特急はあと${remaining}回 ご注文いただけます`}</span>
            </span>
            <span className="restaurant-tablet-brand" aria-hidden="true">SUSHI BATTLE</span>
          </button>
          <span className="restaurant-tablet-neck" aria-hidden="true" /><span className="restaurant-tablet-base" aria-hidden="true" />
        </div>
        {onSideMenu && <DraftSideMenuButton className="restaurant-side-order" sideMenu={sideMenu} enabled={sideMenuEnabled} disabled={disabled} onClick={onSideMenu} />}
        <div className="restaurant-wall-seal"><span>本日も</span><strong>営業中</strong></div>
      </div>

      <div className="restaurant-lane-space">
        <div className="restaurant-scene" data-world-width="16.1" aria-label="奥から特急、汎用、ビルド系の3Dレーン">
          {children}
          <div className="restaurant-lane-label restaurant-lane-label-express">特急<span>ご注文のお皿</span></div>
          <div className="restaurant-lane-label restaurant-lane-label-general">{sideMenuEnabled ? '汎用寿司・サイド' : '汎用寿司'}</div>
          <div className="restaurant-lane-label restaurant-lane-label-build">ビルド系</div>
        </div>
        {notice && <p className="restaurant-notice" role="status">{notice}</p>}
      </div>

      <footer className="restaurant-counter">
        <button className="restaurant-deck-button" onClick={onDeck} aria-label={`購入した${deckCount}皿を見る`} aria-haspopup="dialog">
          <span className="restaurant-plate-stack" aria-hidden="true"><i /><i /><i /><i /></span>
          <span><strong>取ったお皿 <b>{deckCount}</b></strong><small>デッキを見る <span>⌃</span></small></span>
        </button>
        <p className="restaurant-hint">{hint ?? '寿司もお皿もタップで選べます'}</p>
        <button className="restaurant-finish" onClick={onFinish} disabled={disabled}>{finishLabel}<span aria-hidden="true">›</span></button>
      </footer>
    </div>
    {overlayActive && overlays && <div className="restaurant-overlays" ref={overlayRef} tabIndex={-1}>{overlays}</div>}
  </section>
}

export type DraftDeckSheetProps = {
  deck: Card[]
  sideMenu?: SideMenuId | null
  budget: number
  maxCards: number
  emptyMessage: string
  onClose: () => void
}

export function DraftDeckSheet({ deck, sideMenu, budget, maxCards, emptyMessage, onClose }: DraftDeckSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => (focusableElements(sheetRef.current)[0] ?? sheetRef.current)?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const sheet = sheetRef.current
      const elements = focusableElements(sheet)
      const first = elements[0], last = elements[elements.length - 1]
      if (!first || !last) { event.preventDefault(); sheet?.focus(); return }
      if (!sheet?.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return <div className="restaurant-sheet-backdrop" onClick={onClose}>
    <section className="restaurant-deck-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      onClick={event => event.stopPropagation()}>
      <div className="restaurant-sheet-handle" aria-hidden="true" />
      <header><h2 id={titleId}>取ったお皿 <span>{deck.length}皿</span></h2><button onClick={onClose}>レーンに戻る ×</button></header>
      {sideMenu !== undefined && <div className="restaurant-deck-side-menu">
        {sideMenu && <SideMenuArt id={sideMenu} />}
        <span><small>サイドメニュー · 寿司とは別の専用1枠</small><strong>{sideMenu ? SIDE_MENU_BY_ID[sideMenu].name : '未購入です'}</strong></span>
        {sideMenu && <b>購入済み</b>}
      </div>}
      {deck.length === 0 ? <p className="restaurant-empty-deck">{emptyMessage}</p>
        : <div className="restaurant-deck-grid" tabIndex={0} role="region" aria-label="購入したお皿の一覧">{deck.map((card, index) => <article key={`${card.id}-${index}`}>
          <SushiArt card={card} size="100%" fit /><strong>{card.name}</strong><span>{card.cost} AP <b>攻撃 {card.attack}</b></span>
        </article>)}</div>}
      <footer>残金 <strong>¥{budget.toLocaleString()}</strong><span>あと{Math.max(0, maxCards - deck.length)}皿お選びいただけます</span></footer>
    </section>
  </div>
}
