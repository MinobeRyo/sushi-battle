import { useEffect, useRef, useState } from 'react'
import { CARDS } from '../../data/cards'
import { SIDE_MENUS, SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import { SushiArt } from '../../components/SushiArt'
import { ScreenPager } from '../../components/ScreenPager'
import { SideMenuArt } from '../side-menu/SideMenuArt'
import { playGameSound } from '../../audio/gameSounds'
import { OMAKASE_PRICE, OMAKASE_COUNT, DRAFT_MAX_CARDS, SHINKANSEN_TOTAL } from './draftEngine'
import type { OrderCategory, ShinkansenOrderModalProps } from './ShinkansenOrderModal'
import './CompactOrderMenu.css'

const CATEGORIES: { id: OrderCategory; label: string }[] = [
  { id: 'all', label: '特急' }, { id: 'omakase', label: '大将' },
  { id: 'akami', label: '赤身' }, { id: 'makimono', label: '軍艦・巻物' },
  { id: 'hikari', label: '光り物' }, { id: 'kaisen', label: '海鮮' },
  { id: 'niku', label: '肉寿司' }, { id: 'general', label: '汎用' }, { id: 'side_menu', label: 'サイド' },
]

/** 横向きスマホでは、カテゴリ・詳細・ページ切替で全操作を一画面内に置く。 */
export function CompactOrderMenu({ budget, initialCategory = 'all', onOrder, onClose, sideMenu, sideMenuEnabled = false,
  disabled = false, canOrderSushi = true, onOrderSideMenu, onOrderOmakase, omakaseCards = null,
  deckCount = 0, remainingOrders = SHINKANSEN_TOTAL }: ShinkansenOrderModalProps) {
  const [category, setCategory] = useState(initialCategory)
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<SideMenuId | null>(null)
  const [omakaseDetail, setOmakaseDetail] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  const categoryLabel = CATEGORIES.find(item => item.id === category)?.label
  const cards = CARDS.filter(card => category !== 'side_menu' && category !== 'omakase'
    && (category === 'all' || card.archetype.includes(category)
      || (category === 'makimono' && card.archetype.includes('gunkan')))).sort((a, b) => b.price - a.price)
  const pages = Math.max(1, Math.ceil((category === 'side_menu' ? SIDE_MENUS.length : cards.length) / (category === 'side_menu' ? 2 : 4)))
  const activePage = Math.min(page, pages - 1)
  const sideReason = (id: SideMenuId) => sideMenu ? sideMenu === id ? '購入済み' : '追加不可'
    : !sideMenuEnabled ? '追加不可' : disabled ? '確認中…' : remainingOrders <= 0 ? '注文枠なし'
      : budget < SIDE_MENU_BY_ID[id].price ? '残高不足' : undefined
  const omakaseReason = omakaseCards ? '購入済み' : disabled ? '確認中…' : remainingOrders <= 0 ? '注文枠なし'
    : budget < OMAKASE_PRICE ? '残高不足' : deckCount + OMAKASE_COUNT > DRAFT_MAX_CARDS ? '空きが3皿必要' : undefined
  const chosen = detail ? SIDE_MENU_BY_ID[detail] : null
  return <div className="compact-order-backdrop">
    <section className="compact-order" role="dialog" aria-modal="true" aria-label="注文メニュー"
      onClickCapture={event => { const button = event.target instanceof Element ? event.target.closest('button') : null; if (button && !button.disabled) playGameSound('tabletTouch') }}
      onKeyDown={event => {
        if (event.key === 'Escape') onClose()
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
      <header><h2>注文メニュー</h2><span>あと<strong>{remainingOrders}</strong>回</span><b>¥{budget.toLocaleString()}</b><button ref={closeRef} onClick={onClose}>閉じる ×</button></header>
      <div className="compact-order-layout">
        <nav className="compact-order-categories" aria-label="注文のカテゴリ">
          {CATEGORIES.filter(item => (item.id !== 'side_menu' || onOrderSideMenu) && (item.id !== 'omakase' || onOrderOmakase)).map(item =>
            <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setPage(0); setDetail(null); setOmakaseDetail(false) }}>{item.label}</button>)}
        </nav>
        <main className="compact-order-main">
          <div className="compact-order-heading"><strong>{categoryLabel}</strong><span>{category === 'side_menu' ? '各購入タイムに1品' : category === 'omakase' ? '3皿セット・各購入タイムに1回' : '特急価格 1.5倍'}</span></div>
          {category === 'side_menu' ? chosen ? <div className="compact-side-detail">
            <div className="compact-side-detail-art"><SideMenuArt id={chosen.id} /></div>
            <div><h3>{chosen.name}</h3><p>{chosen.effect}</p><small>{chosen.timing}</small></div>
            <footer><button onClick={() => setDetail(null)}>一覧へ戻る</button><button disabled={!!sideReason(chosen.id)} onClick={() => onOrderSideMenu?.(chosen.id)}>{sideReason(chosen.id) ?? `注文 ¥${chosen.price}`}</button></footer>
          </div> : <>
            <div className="compact-side-list">{SIDE_MENUS.slice(activePage * 2, activePage * 2 + 2).map(dish => <article key={dish.id}>
              <div className="compact-side-top"><SideMenuArt id={dish.id} /><h3>{dish.name}</h3></div><p>{dish.summary}</p>
              <div className="compact-side-actions"><button onClick={() => setDetail(dish.id)} aria-label={`${dish.name}の効果`}>効果</button><button disabled={!!sideReason(dish.id)} onClick={() => onOrderSideMenu?.(dish.id)}>{sideReason(dish.id) ?? `注文 ¥${dish.price}`}</button></div>
            </article>)}</div>
            <ScreenPager page={activePage} pages={pages} onPageChange={setPage} label="サイドメニューのページ切替" />
          </> : category === 'omakase' ? <section className="compact-omakase" aria-label="大将のおすすめ">
            {omakaseDetail ? <div className="compact-omakase-description"><h3>セットの内容</h3><p>定価合計750円の3皿を500円で購入。注文枠を1回使用します。</p><p>20%で1皿が攻撃半分の「訳あり」、3%で攻撃12の「レアマヨコーン」に変わります。価格は変更前で計算します。</p></div>
              : omakaseCards ? <div className="compact-omakase-cards">{omakaseCards.map((card, index) => <article key={index}><SushiArt card={card} size="100%" fit /><strong>{card.name}</strong><span>{card.cost} AP・攻{card.attack}{card.variant ? card.variant === 'rare_corn' ? '・大当たり' : '・訳あり' : ''}</span></article>)}</div>
                : <div className="compact-omakase-offer"><strong>3皿で ¥500</strong><p>750円分のおまかせ寿司</p><div aria-hidden="true"><i>?</i><i>?</i><i>?</i></div></div>}
            <footer><button onClick={() => setOmakaseDetail(value => !value)}>{omakaseDetail ? '戻る' : 'セットの内容'}</button><button disabled={!!omakaseReason || !onOrderOmakase} onClick={onOrderOmakase}>{omakaseReason ?? `注文 ¥${OMAKASE_PRICE}`}</button></footer>
          </section> : <>
            <div className="compact-order-products">{cards.slice(activePage * 4, activePage * 4 + 4).map(card => {
              const price = Math.ceil(card.price * 1.5 / 50) * 50
              const reason = disabled ? '確認中' : remainingOrders <= 0 ? '注文枠なし' : !canOrderSushi ? '現在注文不可' : budget < price ? '残高不足' : null
              return <button key={card.id} disabled={!!reason} onClick={() => onOrder(card, price)} aria-label={`${card.name}を${price}円で注文`}>
                <SushiArt card={card} size="100%" fit /><div><strong>{card.name}</strong><span>{card.cost} AP・攻{card.attack}{card.type === 'persist' ? `×${card.fullness}T` : ''}</span><b>{reason ?? `¥${price}`}</b></div>
              </button>
            })}</div>
            <ScreenPager page={activePage} pages={pages} onPageChange={setPage} label="特急寿司のページ切替" />
          </>}
        </main>
      </div>
    </section>
  </div>
}
