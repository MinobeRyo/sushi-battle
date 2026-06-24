import type { Card } from '../../types'
import { motion } from 'framer-motion'

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

type Props = {
  cards: Card[]
  usesLeft: number
  paused: boolean
  onSelect: (card: Card, premiumPrice: number) => void
}

export function ShinkansenLane({ cards, usesLeft, paused, onSelect }: Props) {
  const disabled = usesLeft <= 0
  // 価格の高い順に並べてプレミア感を出す
  const sorted = [...cards].sort((a, b) => b.price - a.price)
  const doubled = [...sorted, ...sorted]

  return (
    <div className="relative select-none">
      {/* ラベル */}
      <div className="flex items-center justify-between px-4 mb-1.5">
        <p className={`text-[11px] font-bold tracking-widest uppercase ${disabled ? 'text-stone-600' : 'text-yellow-500'}`}>
          🚄 新幹線レーン（割増注文）
        </p>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-3.5 h-3.5 rounded-full"
                style={{
                  background: i < usesLeft ? '#facc15' : '#44403c',
                  border: `2px solid ${i < usesLeft ? '#eab308' : '#57534e'}`,
                }}
              />
            ))}
          </div>
          <span className={`text-[10px] ${disabled ? 'text-stone-600' : 'text-yellow-600'}`}>
            残り{usesLeft}回
          </span>
        </div>
      </div>

      {/* レーン本体 */}
      <div
        className="relative overflow-hidden"
        style={{
          height: 96,
          borderTop: `5px solid ${disabled ? '#44403c' : '#ca8a04'}`,
          borderBottom: `5px solid ${disabled ? '#44403c' : '#ca8a04'}`,
          background: disabled
            ? 'linear-gradient(to bottom, #1c1917 0%, #0c0a09 50%, #1c1917 100%)'
            : 'linear-gradient(to bottom, #292524 0%, #1c1917 30%, #1c1917 70%, #292524 100%)',
        }}
      >
        {/* レールの輝き */}
        {!disabled && (
          <div
            className="absolute inset-x-0 top-0 h-4 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(234,179,8,0.08), transparent)' }}
          />
        )}

        {/* 横線（線路） */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 70px, ${disabled ? 'rgba(68,64,60,0.4)' : 'rgba(202,138,4,0.25)'} 70px, ${disabled ? 'rgba(68,64,60,0.4)' : 'rgba(202,138,4,0.25)'} 72px)`,
          }}
        />

        {/* 使い切り表示 */}
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-stone-600 text-sm font-bold">本日の注文上限に達しました</span>
          </div>
        )}

        {/* 皿の列 */}
        {!disabled && (
          <div
            className="flex items-center gap-3 px-4 absolute inset-y-0 left-0"
            style={{
              animation: `conveyor 14s linear infinite`,
              animationPlayState: paused ? 'paused' : 'running',
              width: 'max-content',
            }}
          >
            {doubled.map((card, i) => {
              const premiumPrice = Math.ceil((card.price * 1.5) / 50) * 50
              return (
                <PremiumPlate
                  key={`${card.id}-${i}`}
                  card={card}
                  premiumPrice={premiumPrice}
                  onClick={() => onSelect(card, premiumPrice)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function PremiumPlate({ card, premiumPrice, onClick }: {
  card: Card
  premiumPrice: number
  onClick: () => void
}) {
  const emoji = BASE_EMOJI[card.base] ?? '🍣'

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.12, y: -3 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className="relative flex-shrink-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none"
      style={{
        width: 78,
        height: 78,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        border: '4px solid #f59e0b',
        boxShadow: '0 0 10px rgba(245,158,11,0.4), 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.7)',
      }}
    >
      {/* 光沢 */}
      <div
        className="absolute top-1.5 left-2.5 w-5 h-2.5 rounded-full pointer-events-none opacity-50"
        style={{ background: 'radial-gradient(ellipse, white, transparent)' }}
      />
      {/* 新幹線バッジ */}
      <div
        className="absolute -top-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded"
        style={{ background: '#dc2626', color: 'white', lineHeight: 1 }}
      >
        特急
      </div>
      <span className="text-xl leading-none">{emoji}</span>
      <span className="text-[9px] font-bold text-stone-700 leading-tight text-center w-14" style={{ wordBreak: 'keep-all' }}>
        {card.name.length > 6 ? card.name.slice(0, 6) + '…' : card.name}
      </span>
      <span className="text-[9px] font-bold text-amber-600">¥{premiumPrice}</span>
    </motion.button>
  )
}
