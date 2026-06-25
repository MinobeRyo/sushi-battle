import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CARDS } from '../../data/cards'
import type { Card, Archetype } from '../../types'

const BASE_EMOJI: Record<string, string> = {
  'マグロ': '🍣', 'サーモン': '🐠', 'えび': '🦐', 'いか': '🦑', 'たこ': '🐙',
  'たまご': '🥚', 'きゅうり': '🥒', 'かんぴょう': '🌿', 'サバ': '🐡',
  'アジ': '🐟', 'イワシ': '🐟', 'サンマ': '🐟', 'コハダ': '🐡',
  '和牛': '🥩', 'カルビ': '🥩', '焼肉': '🥩', '牛タン': '🥩',
  'ローストビーフ': '🥩', 'うに': '🌟', 'いくら': '🔴', 'とびこ': '🟠',
  'コーン': '🌽', 'シーフード': '🦞', 'なす': '🍆', '明太子': '🔴',
  'チーズ': '🧀', '納豆': '🫘', 'うめ': '🍑', 'アボカド': '🥑',
  '太巻き': '🍱', 'かに': '🦀', 'あなご': '🐠',
}

type Category = 'all' | Archetype

type CategoryDef = {
  id: Category
  label: string
  sub: string
  emojis: string[]
}

const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'all',      label: 'お薦め',  sub: '全メニュー',         emojis: ['🍣','🦐','🥩','🐡'] },
  { id: 'akami',    label: '赤身',    sub: 'マグロ・トロ系',     emojis: ['🍣','🍣','🍣'] },
  { id: 'makimono', label: '巻物・軍艦', sub: '巻き・軍艦寿司',  emojis: ['🌿','🌟','🔴'] },
  { id: 'hikari',   label: '光り物',  sub: 'サバ・アジ・コハダ', emojis: ['🐡','🐡','🐟'] },
  { id: 'kaisen',   label: '海鮮',    sub: 'タコ・イカ系',       emojis: ['🐙','🦑','🦐'] },
  { id: 'niku',     label: '肉寿司',  sub: '和牛・カルビ系',     emojis: ['🥩','🥩','🥩'] },
  { id: 'general',  label: '汎用',    sub: 'たまご・サーモン',   emojis: ['🥚','🐠','🌽'] },
]

const ARCHETYPE_COLOR: Record<string, string> = {
  akami: '#dc2626', makimono: '#16a34a', hikari: '#2563eb',
  kaisen: '#0891b2', niku: '#ea580c', general: '#78716c', all: '#92400e',
}

type Props = {
  budget: number
  onOrder: (card: Card, premiumPrice: number) => void
  onClose: () => void
}

export function ShinkansenOrderModal({ budget, onOrder, onClose }: Props) {
  const [screen, setScreen] = useState<'categories' | 'items'>('categories')
  const [activeCategory, setActiveCategory] = useState<CategoryDef>(CATEGORY_DEFS[0])

  const handleCategoryTap = (cat: CategoryDef) => {
    setActiveCategory(cat)
    setScreen('items')
  }

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: 'rgba(0,0,0,0.5)' }}
      >
        <motion.div
          className="absolute inset-2 rounded-2xl overflow-hidden flex"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          style={{ background: '#f5f0e8', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
        >
          {/* ── 左サイドバー ── */}
          <div
            className="flex flex-col items-center py-4 gap-4 flex-shrink-0"
            style={{
              width: 76,
              background: 'linear-gradient(to bottom, #1a0a00, #3d1a0a)',
              borderRight: '2px solid #c9a227',
            }}
          >
            {/* ロゴ */}
            <div className="text-center">
              <div className="text-2xl">🚄</div>
              <p className="text-[9px] text-yellow-400 font-bold leading-tight text-center mt-1">
                特急<br/>注文
              </p>
            </div>

            <div style={{ width: 40, height: 1, background: '#c9a227' }} />

            {/* 軍資金 */}
            <div className="text-center">
              <p className="text-[8px] text-amber-600">軍資金</p>
              <p className="text-yellow-300 font-bold text-xs tabular-nums">
                ¥{budget >= 1000 ? (budget / 1000).toFixed(1) + 'k' : budget}
              </p>
            </div>

            <div style={{ width: 40, height: 1, background: '#5c2d0e' }} />

            <div className="flex-1" />

            {/* キャンセル */}
            <button
              onClick={onClose}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #78350f' }}
              >
                ✕
              </div>
              <p className="text-[8px] text-stone-400">もどる</p>
            </button>
          </div>

          {/* ── メインエリア ── */}
          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {screen === 'categories' ? (
                <motion.div
                  key="categories"
                  className="absolute inset-0 p-3"
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -30, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p
                    className="text-xs font-bold mb-2.5 px-1"
                    style={{ color: '#78350f' }}
                  >
                    カテゴリをお選びください
                  </p>
                  <div className="grid grid-cols-3 gap-2 h-[calc(100%-28px)]">
                    {CATEGORY_DEFS.map(cat => (
                      <CategoryTile key={cat.id} cat={cat} onTap={handleCategoryTap} />
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="items"
                  className="absolute inset-0 flex flex-col"
                  initial={{ x: 30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 30, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* 品目ヘッダー */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                    style={{ borderBottom: '1px solid #e5d7b0' }}
                  >
                    <button
                      onClick={() => setScreen('categories')}
                      className="text-xs font-bold px-2 py-1 rounded"
                      style={{ background: '#f0e4c8', color: '#78350f' }}
                    >
                      ◀ もどる
                    </button>
                    <span className="text-sm font-bold" style={{ color: '#3d1a0a' }}>
                      {activeCategory.label}
                    </span>
                    <span className="text-xs" style={{ color: '#a8a29e' }}>
                      {activeCategory.sub}
                    </span>
                    <span className="ml-auto text-xs" style={{ color: '#a8a29e' }}>
                      定価 ×1.5
                    </span>
                  </div>

                  {/* 品目グリッド */}
                  <div className="flex-1 overflow-y-auto p-2">
                    <ItemGrid
                      category={activeCategory.id}
                      budget={budget}
                      onOrder={onOrder}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── カテゴリタイル ──────────────────────────────────────────
function CategoryTile({ cat, onTap }: { cat: CategoryDef; onTap: (c: CategoryDef) => void }) {
  const color = ARCHETYPE_COLOR[cat.id] ?? '#92400e'

  return (
    <motion.button
      onClick={() => onTap(cat)}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      className="flex flex-col overflow-hidden rounded-xl relative"
      style={{
        background: 'white',
        border: `3px solid ${color}`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.15)`,
      }}
    >
      {/* 絵文字エリア */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${color}18, ${color}08)`, minHeight: 0 }}
      >
        <div className="flex flex-wrap justify-center gap-0.5 p-1">
          {cat.emojis.map((e, i) => (
            <span key={i} className="text-2xl leading-none">{e}</span>
          ))}
        </div>
      </div>

      {/* テキスト */}
      <div
        className="px-2 py-1.5 text-center flex-shrink-0"
        style={{ background: color, minHeight: 44 }}
      >
        <p className="text-white font-bold text-sm leading-tight">{cat.label}</p>
        <p className="text-white/70 text-[9px] leading-tight mt-0.5">{cat.sub}</p>
      </div>
    </motion.button>
  )
}

// ── 品目グリッド ──────────────────────────────────────────
function ItemGrid({ category, budget, onOrder }: {
  category: Category
  budget: number
  onOrder: (card: Card, premiumPrice: number) => void
}) {
  const cards = CARDS
    .filter(c => category === 'all' || c.archetype.includes(category as Archetype))
    .sort((a, b) => b.price - a.price)

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(card => {
        const premiumPrice = Math.ceil((card.price * 1.5) / 50) * 50
        const canAfford = budget >= premiumPrice
        const emoji = BASE_EMOJI[card.base] ?? '🍣'
        const color = ARCHETYPE_COLOR[card.archetype[0]] ?? '#78716c'

        return (
          <motion.button
            key={card.id}
            onClick={() => canAfford && onOrder(card, premiumPrice)}
            disabled={!canAfford}
            whileHover={canAfford ? { scale: 1.04, y: -2 } : {}}
            whileTap={canAfford ? { scale: 0.93 } : {}}
            className="flex flex-col overflow-hidden rounded-xl"
            style={{
              background: 'white',
              border: `2px solid ${canAfford ? color : '#e0d8cc'}`,
              boxShadow: canAfford ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
              opacity: canAfford ? 1 : 0.45,
            }}
          >
            {/* 絵文字 */}
            <div
              className="flex items-center justify-center py-3"
              style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)` }}
            >
              <span className="text-3xl">{emoji}</span>
            </div>

            {/* 情報 */}
            <div className="px-1.5 pb-1.5 pt-1">
              <p className="text-xs font-bold leading-tight truncate" style={{ color: '#1c1917' }}>
                {card.name}
              </p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[9px] line-through" style={{ color: '#a8a29e' }}>
                  ¥{card.price}
                </span>
                <span
                  className="text-xs font-bold"
                  style={{ color: canAfford ? '#dc2626' : '#a8a29e' }}
                >
                  ¥{premiumPrice}
                </span>
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
