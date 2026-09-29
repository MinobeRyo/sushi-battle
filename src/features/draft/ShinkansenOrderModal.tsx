import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CARDS } from '../../data/cards'
import { SushiArt } from '../../components/SushiArt'
import { playGameSound } from '../../audio/gameSounds'
import type { Card, Archetype } from '../../types'
import { SIDE_MENUS, SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import { SideMenuCard } from '../side-menu/SideMenuCard'
import './OrderTablet.css'

export type OrderCategory = 'all' | Archetype | 'side_menu'

const TABS: { id: OrderCategory; label: string }[] = [
  { id: 'all', label: 'おすすめ' },
  { id: 'akami', label: '赤身' },
  { id: 'makimono', label: '軍艦・巻物' },
  { id: 'hikari', label: '光り物' },
  { id: 'kaisen', label: '海鮮' },
  { id: 'niku', label: '肉寿司' },
  { id: 'general', label: '汎用寿司' },
  { id: 'side_menu', label: 'サイドメニュー' },
]
const PER_PAGE = 9
const adCard = CARDS.find(card => card.name === '大トロ')

type Props = {
  budget: number
  initialCategory?: OrderCategory
  onOrder: (card: Card, premiumPrice: number) => void
  onClose: () => void
  sideMenu?: SideMenuId | null
  sideMenuEnabled?: boolean
  disabled?: boolean
  canOrderSushi?: boolean
  onOrderSideMenu?: (id: SideMenuId) => void
}

export function ShinkansenOrderModal({ budget, initialCategory = 'all', onOrder, onClose, sideMenu, sideMenuEnabled = false, disabled = false, canOrderSushi = true, onOrderSideMenu }: Props) {
  const [category, setCategory] = useState<OrderCategory>(initialCategory)
  const [page, setPage] = useState(0)
  const closeButton = useRef<HTMLButtonElement>(null)
  const categoryNav = useRef<HTMLElement>(null)
  useEffect(() => {
    categoryNav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [category])
  useEffect(() => {
    const previous = document.activeElement
    closeButton.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])

  const isSideMenu = category === 'side_menu'
  const cards = CARDS
    .filter(card => category !== 'side_menu' && (category === 'all' || card.archetype.includes(category) || (category === 'makimono' && card.archetype.includes('gunkan'))))
    .sort((a, b) => b.price - a.price)
  const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE))
  const view = cards.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  const label = TABS.find(tab => tab.id === category)?.label ?? 'おすすめ'

  return <motion.div className="order-menu-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <motion.div className={`order-menu-device${isSideMenu ? ' order-menu-device--side' : ''}`} role="dialog" aria-modal="true" aria-labelledby="order-menu-heading"
      onClickCapture={event => {
        const button = event.target instanceof Element ? event.target.closest('button') : null
        if (button && !button.disabled) playGameSound('tabletTouch')
      }}
      initial={{ scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      onKeyDown={event => {
        if (event.key === 'Escape') onClose()
        if (event.key === 'Tab') {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), summary'))
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
      <header className="order-menu-header"><div><strong>すしバトル</strong><span>ご注文メニュー</span></div><button ref={closeButton} onClick={onClose}>レーンに戻る ×</button></header>
      <div className="order-menu-layout">
        <nav className="order-menu-tabs" aria-label="注文のカテゴリ" ref={categoryNav}>
          {TABS.filter(tab => tab.id !== 'side_menu' || onOrderSideMenu).map(tab => <button key={tab.id} aria-pressed={category === tab.id} onClick={() => { setCategory(tab.id); setPage(0) }}>{tab.label}<span>›</span></button>)}
        </nav>
        <main className="order-menu-main">
          <div className="order-menu-heading"><div><p>{isSideMenu ? '全6品・各300円' : '握りたてを、あなたのお席へ。'}</p><h2 id="order-menu-heading">{label}</h2></div>
            {isSideMenu ? <div className="order-side-budget"><span>残高</span><strong>¥{budget.toLocaleString()}</strong></div> : <span>商品を押すと注文が確定します</span>}
          </div>
          {isSideMenu ? <>
            <div className="order-side-shop-notice" role="status">{sideMenu ? <><strong>購入済み：{SIDE_MENU_BY_ID[sideMenu].name}</strong><span>1試合に1品まで。交換はできません。</span></> : !sideMenuEnabled ? <><strong>初期購入限定</strong><span>追加注文では購入できません。</span></> : <><strong>1試合に1品</strong><span>寿司とは別枠・自分のターンに0APで使用</span></>}</div>
            <div className="order-side-products" aria-label="サイドメニュー6品">
              {SIDE_MENUS.map(dish => {
                const reason = sideMenu ? sideMenu === dish.id ? '購入済み' : '追加不可' : !sideMenuEnabled ? '初期購入限定' : disabled ? '確認中…' : budget < dish.price ? '残高不足' : undefined
                return <SideMenuCard key={dish.id} id={dish.id} price={dish.price} presentation="shop"
                  disabled={!!reason} disabledReason={reason} actionLabel="注文する"
                  onAction={onOrderSideMenu ? () => onOrderSideMenu(dish.id) : undefined} />
              })}
            </div>
          </> : <>
            {!canOrderSushi && <p className="order-side-notice" role="status">現在、特急の注文はできません。配送中のお皿・注文回数・デッキ上限をご確認ください。</p>}
            <div className="order-menu-products" key={`${category}-${page}`}>
              {view.map(card => <MenuItemCard key={card.id} card={card} budget={budget} disabled={disabled || !canOrderSushi} onOrder={onOrder} />)}
            </div>
            <div className="order-menu-pager"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ 前へ</button><span>{page + 1} / {pages}</span><button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>次へ ›</button></div>
          </>}
        </main>
        {!isSideMenu && <aside className="order-menu-sidebar">
          <div className="order-menu-budget"><span>ご利用いただける金額</span><strong>¥{budget.toLocaleString()}</strong><p>特急価格は定価の1.5倍<br />50円単位で切り上げ</p></div>
          <div className="order-menu-poster"><span>本日のおすすめ</span><strong>とろける<br />大トロ</strong>{adCard && <SushiArt card={adCard} size="100%" />}<p>贅沢な一皿を<br />特急レーンで。</p><b>{adCard ? Math.ceil(adCard.price * 1.5 / 50) * 50 : 750}<small>円</small></b></div>
          <p className="order-menu-delivery">ご注文後は、奥の金色の<br />お皿をタップしてお受け取りください。</p>
        </aside>}
      </div>
      <footer className="order-menu-footer"><span>{isSideMenu ? 'サイドは専用スロットへ直接お届けします' : 'ご注文品は特急レーンでお届けします'}</span><strong>残高 ¥{budget.toLocaleString()}</strong></footer>
    </motion.div>
  </motion.div>
}

function MenuItemCard({ card, budget, disabled, onOrder }: { card: Card; budget: number; disabled?: boolean; onOrder: (card: Card, premiumPrice: number) => void }) {
  const price = Math.ceil(card.price * 1.5 / 50) * 50
  const canAfford = budget >= price
  return <button className="order-menu-product" disabled={!canAfford || disabled} onClick={() => onOrder(card, price)} aria-label={`${card.name}を${price}円で注文`}>
    <div className="order-menu-product-art">{card.price >= 400 && <span>特選</span>}<div className="order-menu-art-frame"><SushiArt card={card} size="100%" fit /></div></div>
    <div className="order-menu-product-info"><strong>{card.name}</strong><span><b>{price}</b>円</span></div>
    {!canAfford && <small className="order-menu-unavailable">残高不足</small>}
  </button>
}
