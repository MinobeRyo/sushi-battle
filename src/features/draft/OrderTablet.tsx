import { motion } from 'framer-motion'
import { CARDS } from '../../data/cards'
import { SushiArt } from '../../components/SushiArt'
import type { OrderCategory } from './ShinkansenOrderModal'
import './OrderTablet.css'

const CATEGORIES: { id: OrderCategory; label: string; cardName: string }[] = [
  { id: 'akami', label: '赤身', cardName: '大トロ' },
  { id: 'makimono', label: '軍艦・巻物', cardName: 'いくら軍艦' },
  { id: 'kaisen', label: '海鮮', cardName: 'サーモン' },
  { id: 'hikari', label: '光り物', cardName: 'アジ' },
  { id: 'niku', label: '肉寿司', cardName: '和牛にぎり' },
  { id: 'general', label: 'サイド', cardName: 'たまご' },
]

type Props = {
  canOrder: boolean
  delivering: boolean
  budget: number
  spent: number
  deckCount: number
  remaining: number
  playerNum?: number
  onOpenCategory: (category: OrderCategory) => void
  onHelp: () => void
  onFinish: () => void
}

export function OrderTablet({ canOrder, delivering, budget, spent, deckCount, remaining, playerNum, onOpenCategory, onHelp, onFinish }: Props) {
  return <div className="draft-tablet-station">
    <div className="draft-tablet-mount">
      <motion.div className="order-tablet" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
        <div className="order-tablet-camera" />
        <div className="draft-tablet-display order-home">
          <header className="order-home-header"><strong>すしバトル</strong><span>特急ご注文メニュー</span><b>お席 {String(playerNum ?? 1).padStart(2, '0')}</b></header>
          <div className="order-home-body">
            <div className="order-home-menu">
              <button className="order-home-feature" disabled={!canOrder} onClick={() => onOpenCategory('all')} aria-label="おすすめの特急メニューを開く"><strong>本日のおすすめ</strong><span>旬の一皿を特急でお届け ›</span></button>
              <div className="order-home-categories">
                {CATEGORIES.map(category => {
                  const card = CARDS.find(item => item.name === category.cardName)
                  return <button key={category.id} disabled={!canOrder} onClick={() => onOpenCategory(category.id)} aria-label={`${category.label}の特急メニューを開く`}>
                    {card && <div className="order-home-art"><SushiArt card={card} size="100%" fit /></div>}<span>{category.label}<i>›</i></span>
                  </button>
                })}
              </div>
            </div>
            <aside className="order-home-status">
              <h3>ご注文状況</h3>
              <div><span>特急のこり</span><b>{remaining}<small>回</small></b></div>
              <div><span>ご注文</span><b>{deckCount}<small>皿</small></b></div>
              <div className="order-home-total"><span>ご利用額</span><strong>¥{spent.toLocaleString()}</strong></div>
              <p>残高 ¥{budget.toLocaleString()}</p>
              <button onClick={onFinish}>お会計 <span>›</span></button>
            </aside>
          </div>
          <footer className="order-home-footer"><button onClick={onHelp}>店員呼出</button><button onClick={onHelp}>遊び方</button><span>{delivering ? '特急をお届け中・購入済み' : !canOrder ? deckCount >= 20 ? 'ご注文上限に達しました' : '特急の受付は終了しました' : 'ご注文品は奥の特急レーンに届きます'}</span></footer>
        </div>
        <span className="order-tablet-logo">SUSHI BATTLE</span>
      </motion.div>
      <div className="order-tablet-neck" /><div className="order-tablet-base" />
    </div>
  </div>
}
