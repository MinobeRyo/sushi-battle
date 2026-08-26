import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CARDS } from '../../data/cards'
import { SushiArt } from '../../components/SushiArt'
import type { Card, Archetype } from '../../types'

type Category = 'all' | Archetype

const TABS: { id: Category; label: string }[] = [
  { id: 'all', label: 'おすすめ' },
  { id: 'akami', label: '赤身' },
  { id: 'makimono', label: '軍艦・巻き物' },
  { id: 'hikari', label: '光り物' },
  { id: 'kaisen', label: '海鮮' },
  { id: 'niku', label: '肉寿司' },
  { id: 'general', label: 'サイドメニュー' },
]

const PER_PAGE = 9

// 広告ポスター用の一枚
const adCard = CARDS.find((c) => c.name === '大トロ')

type Props = {
  budget: number
  onOrder: (card: Card, premiumPrice: number) => void
  onClose: () => void
}

export function ShinkansenOrderModal({ budget, onOrder, onClose }: Props) {
  const [category, setCategory] = useState<Category>('all')
  const [page, setPage] = useState(0)

  const cards = CARDS
    .filter((c) => category === 'all' || c.archetype.includes(category as Archetype))
    .sort((a, b) => b.price - a.price)
  const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE))
  const view = cards.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)

  const selectCategory = (c: Category) => {
    setCategory(c)
    setPage(0)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <motion.div
          className="absolute inset-2 rounded-xl overflow-hidden flex flex-col"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          style={{ background: '#ccd0d5', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
        >
          <div className="flex-1 flex overflow-hidden">
            {/* ── メイン：メニューグリッド＋ページャ ── */}
            <div className="flex-1 flex flex-col gap-2 p-2 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${category}-${page}`}
                  className="flex-1 grid grid-cols-3 grid-rows-3 gap-2"
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -24, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {view.map((card) => (
                    <MenuItemCard key={card.id} card={card} budget={budget} onOrder={onOrder} />
                  ))}
                  {Array.from({ length: PER_PAGE - view.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="rounded-lg" style={{ background: 'rgba(255,255,255,0.25)' }} />
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* ページャ（前へ／次へ） */}
              <div className="flex gap-2 flex-shrink-0" style={{ height: 34 }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex-1 rounded font-bold text-sm"
                  style={{
                    background: page === 0 ? '#b9bdc3' : 'white',
                    color: page === 0 ? '#8d9299' : '#44403c',
                    border: '1px solid #a9adb4',
                  }}
                >
                  前へ
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                  disabled={page >= pages - 1}
                  className="flex-1 rounded font-bold text-sm"
                  style={{
                    background: page >= pages - 1 ? '#b9bdc3' : 'linear-gradient(180deg, #e8381a, #c62b12)',
                    color: page >= pages - 1 ? '#8d9299' : 'white',
                    border: page >= pages - 1 ? '1px solid #a9adb4' : '1px solid #a82410',
                  }}
                >
                  次へ（{page + 1}/{pages}）
                </button>
              </div>
            </div>

            {/* ── 右サイドバー ── */}
            <div className="flex-shrink-0 flex flex-col gap-2 p-2 pl-0" style={{ width: 148 }}>
              {/* 状況ボックス */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg text-center py-1.5" style={{ background: 'white', border: '1px solid #a9adb4' }}>
                  <p style={{ fontSize: 8, color: '#c62b12', fontWeight: 800 }}>軍資金</p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1c1917' }} className="tabular-nums">
                    ¥{budget.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="rounded-lg text-center py-1.5" style={{ background: 'white', border: '1px solid #a9adb4' }}>
                <p style={{ fontSize: 8, color: '#c62b12', fontWeight: 800 }}>特急は定価×1.5</p>
                <p style={{ fontSize: 8.5, color: '#57534e', marginTop: 2, lineHeight: 1.5 }}>
                  ご注文品は特急レーンで<br />直送いたします 🚄
                </p>
              </div>

              {/* 広告ポスター風 */}
              <div
                className="flex-1 rounded-lg overflow-hidden flex flex-col items-center justify-center gap-1 px-2 text-center"
                style={{
                  background: 'linear-gradient(180deg, #10131c, #1e2436)',
                  border: '2px solid #b98a1e',
                }}
              >
                <p style={{ fontSize: 8, color: '#d8b45a', fontWeight: 700, letterSpacing: 1 }}>― 季節の逸品 ―</p>
                <p style={{ fontSize: 14, color: '#f5d98a', fontWeight: 800, lineHeight: 1.3 }}>特急<br />グランプリ</p>
                {adCard && (
                  <div style={{ width: 64, maxWidth: '80%', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.6))' }}>
                    <SushiArt card={adCard} size="100%" />
                  </div>
                )}
                <p style={{ fontSize: 9, color: '#e7e5e4', fontWeight: 700 }}>大トロ・うに 入荷中</p>
                <p style={{ fontSize: 6.5, color: '#78716c' }}>※写真はイメージです</p>
              </div>
            </div>
          </div>

          {/* ── 下部タブバー ── */}
          <div className="flex items-stretch gap-1 px-2 pb-2 flex-shrink-0" style={{ height: 46 }}>
            <button
              onClick={onClose}
              className="rounded font-bold px-3"
              style={{ background: 'linear-gradient(180deg, #8a6a44, #6e5232)', color: 'white', fontSize: 11, border: '1px solid #55401f' }}
            >
              キャンセル
            </button>
            {TABS.map((t) => {
              const active = category === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => selectCategory(t.id)}
                  className="flex-1 rounded-t font-bold"
                  style={{
                    background: active ? 'white' : '#e6e6e2',
                    color: active ? '#c62b12' : '#57534e',
                    fontSize: 10.5,
                    border: '1px solid #b5b9bf',
                    borderBottom: active ? '3px solid #e8381a' : '1px solid #b5b9bf',
                    boxShadow: active ? '0 -2px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── メニューカード（実店舗の写真カード風） ──────────────────────────
function MenuItemCard({ card, budget, onOrder }: {
  card: Card
  budget: number
  onOrder: (card: Card, premiumPrice: number) => void
}) {
  const premiumPrice = Math.ceil((card.price * 1.5) / 50) * 50
  const canAfford = budget >= premiumPrice
  const premium = card.price >= 500

  return (
    <motion.button
      onClick={() => canAfford && onOrder(card, premiumPrice)}
      disabled={!canAfford}
      whileHover={canAfford ? { scale: 1.03, y: -2 } : {}}
      whileTap={canAfford ? { scale: 0.95 } : {}}
      className="relative flex flex-col overflow-hidden rounded-lg"
      style={{
        background: 'linear-gradient(180deg, #232833, #13151c)',
        border: '1px solid #3a3f4a',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        opacity: canAfford ? 1 : 0.4,
        minHeight: 0,
      }}
    >
      {/* 写真エリア（カードと同じ絵柄・高さ基準で収める） */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: '3px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ height: '100%', maxWidth: '78%', aspectRatio: '100 / 74', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }}>
            <SushiArt card={card} size="100%" />
          </div>
        </div>
        {/* 価格（写真に重ねる） */}
        <span style={{ position: 'absolute', left: 7, bottom: 4, color: 'white', fontWeight: 800, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {premiumPrice}円
        </span>
        <span style={{ position: 'absolute', right: 7, bottom: 6, color: '#8d939e', fontSize: 8, textDecoration: 'line-through' }}>
          定価{card.price}円
        </span>
        {/* 高級ネタのリボン */}
        {premium && (
          <div
            style={{
              position: 'absolute', top: 0, right: 0,
              background: 'linear-gradient(135deg, #c99a2e, #8a6210)',
              color: '#fff8e0', fontSize: 8, fontWeight: 800,
              padding: '2px 7px', borderBottomLeftRadius: 7,
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            旬の極み
          </div>
        )}
      </div>
      {/* 名前バー */}
      <div style={{ background: 'rgba(0,0,0,0.55)', borderTop: '1px solid #3a3f4a', padding: '3px 6px' }}>
        <p className="truncate" style={{ color: 'white', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
          {card.name}
        </p>
      </div>
    </motion.button>
  )
}
