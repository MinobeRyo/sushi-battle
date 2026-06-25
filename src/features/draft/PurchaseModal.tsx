import { motion, AnimatePresence } from 'framer-motion'
import type { Card } from '../../types'

const EFFECT_LABELS: Record<string, string> = {
  digest_stop_1t: '相手の消化を1ターン止める',
  self_digest_3: '自分のお腹 -3',
  multi_base: '複数baseのコンボ条件を満たす',
  kireta_stack: '切れ味スタック +1',
  kireta_consume_x2: '切れ味スタック全消費 ×2ダメージ',
  chain_on_kaisen_summon: '海鮮召喚時に連鎖攻撃',
  belly_boost_70: '相手お腹 >70 で攻撃 +8',
  belly_boost_65: '相手お腹 >65 で攻撃 +8',
  belly_boost_60: '相手お腹 >60 で攻撃 +5',
  belly_boost_persist_50: '机にいる間 相手お腹 >50 で攻撃 +2',
}

const ARCHETYPE_LABELS: Record<string, string> = {
  akami: '赤身', makimono: '巻物', hikari: '光り物',
  kaisen: '海鮮', niku: '肉寿司', general: '汎用',
}

const ARCHETYPE_COLORS: Record<string, string> = {
  akami: 'bg-red-900 text-red-300',
  makimono: 'bg-green-900 text-green-300',
  hikari: 'bg-blue-900 text-blue-300',
  kaisen: 'bg-cyan-900 text-cyan-300',
  niku: 'bg-orange-900 text-orange-300',
  general: 'bg-stone-700 text-stone-300',
}

type Props = {
  card: Card
  displayPrice: number
  isPremium?: boolean
  budget: number
  deckCount: number
  onPurchase: (card: Card) => void
  onClose: () => void
}

export function PurchaseModal({ card, displayPrice, isPremium, budget, deckCount, onPurchase, onClose }: Props) {
  const canAfford = budget >= displayPrice
  const deckFull = deckCount >= 20
  const canBuy = canAfford && !deckFull

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 flex items-center justify-center z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: 'rgba(0,0,0,0.65)' }}
        onClick={onClose}
      >
        <motion.div
          className="rounded-2xl p-5 w-72 shadow-2xl"
          initial={{ scale: 0.85, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.85, y: 20 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          style={{ background: '#3d1a0a', border: '1px solid #78350f' }}
          onClick={e => e.stopPropagation()}
        >
          {/* 上部 */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-xl font-bold text-amber-100 flex items-center gap-2">
                {card.name}
                {isPremium && <span className="text-xs bg-red-700 text-white px-1.5 py-0.5 rounded font-bold">🚄 特急</span>}
              </h3>
              <div className="flex flex-wrap gap-1 mt-1">
                {card.archetype.map(a => (
                  <span key={a} className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${ARCHETYPE_COLORS[a]}`}>
                    {ARCHETYPE_LABELS[a]}
                  </span>
                ))}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  card.type === 'instant' ? 'bg-sky-900 text-sky-300' : 'bg-emerald-900 text-emerald-300'
                }`}>
                  {card.type === 'instant' ? '即時' : '持続'}
                </span>
              </div>
            </div>
            <div className="text-right">
              {isPremium && (
                <p className="text-xs text-stone-500 line-through tabular-nums">¥{card.price}</p>
              )}
              <p className={`text-2xl font-bold tabular-nums ${isPremium ? 'text-red-400' : 'text-yellow-400'}`}>
                ¥{displayPrice}
              </p>
            </div>
          </div>

          {/* ステータス */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <Stat label="コスト" value={`${card.cost} AP`} />
            <Stat label="攻撃" value={String(card.attack)} />
            {card.type === 'persist' && (
              <Stat label="持続" value={`${card.fullness}ターン`} />
            )}
          </div>

          {/* 効果 */}
          {card.effect && (
            <div
              className="rounded-lg p-2 mb-3 text-xs text-amber-300 leading-relaxed"
              style={{ background: 'rgba(120,53,15,0.4)' }}
            >
              ✨ {EFFECT_LABELS[card.effect] ?? card.effect}
            </div>
          )}

          {/* 残高・デッキ枚数 */}
          <div className="flex justify-between text-xs text-stone-400 mb-3">
            <span>残り軍資金 ¥{budget.toLocaleString()}</span>
            <span>デッキ {deckCount}/20</span>
          </div>

          {/* ボタン */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-700 hover:bg-stone-600 text-white rounded-xl transition-colors text-sm"
            >
              もどる
            </button>
            <motion.button
              onClick={() => canBuy && onPurchase(card)}
              disabled={!canBuy}
              whileHover={canBuy ? { scale: 1.04 } : {}}
              whileTap={canBuy ? { scale: 0.95 } : {}}
              className={`flex-1 py-2.5 font-bold rounded-xl text-sm transition-colors ${
                canBuy
                  ? isPremium ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-red-700 hover:bg-red-600 text-white'
                  : 'bg-stone-600 text-stone-400 cursor-not-allowed'
              }`}
            >
              {deckFull ? 'デッキ満杯' : !canAfford ? '残高不足' : `購入 ¥${displayPrice}`}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center rounded px-2 py-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <span className="text-stone-400 text-sm">{label}</span>
      <span className="text-amber-200 text-sm font-bold tabular-nums">{value}</span>
    </div>
  )
}
