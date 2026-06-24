import { motion } from 'framer-motion'
import type { Card } from '../../types'

const PRICE_PLATE: Record<number, { bg: string; rim: string }> = {
  100: { bg: '#f5f5f0', rim: '#9ca3af' },
  150: { bg: '#f0fdf4', rim: '#4ade80' },
  200: { bg: '#fefce8', rim: '#facc15' },
  250: { bg: '#fff7ed', rim: '#fb923c' },
  300: { bg: '#fef2f2', rim: '#f87171' },
  400: { bg: '#faf5ff', rim: '#a855f7' },
  500: { bg: '#fffbeb', rim: '#f59e0b' },
}

const BASE_EMOJI: Record<string, string> = {
  'マグロ': '🍣',
  'サーモン': '🐠',
  'えび': '🦐',
  'いか': '🦑',
  'たこ': '🐙',
  'たまご': '🥚',
  'きゅうり': '🥒',
  'かんぴょう': '🌿',
  'サバ': '🐡',
  'アジ': '🐟',
  'イワシ': '🐟',
  'サンマ': '🐟',
  'コハダ': '🐡',
  '和牛': '🥩',
  'カルビ': '🥩',
  '焼肉': '🥩',
  '牛タン': '🥩',
  'ローストビーフ': '🥩',
  'うに': '🌟',
  'いくら': '🔴',
  'とびこ': '🟠',
  'コーン': '🌽',
  'シーフード': '🦞',
  'なす': '🍆',
  '明太子': '🔴',
  'チーズ': '🧀',
  '納豆': '🫘',
  'うめ': '🍑',
  'アボカド': '🥑',
  '太巻き': '🍱',
  'かに': '🦀',
  'あなご': '🐠',
}

type Props = {
  card: Card
  onClick: () => void
}

export function SushiPlate({ card, onClick }: Props) {
  const plate = PRICE_PLATE[card.price] ?? PRICE_PLATE[300]
  const emoji = BASE_EMOJI[card.base] ?? '🍣'

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.12, y: -4 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className="relative flex-shrink-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none"
      style={{
        width: 90,
        height: 90,
        borderRadius: '50%',
        background: plate.bg,
        border: `5px solid ${plate.rim}`,
        boxShadow: `0 4px 12px rgba(0,0,0,0.4), inset 0 1px 3px rgba(255,255,255,0.6)`,
      }}
    >
      {/* 皿の光沢 */}
      <div
        className="absolute top-2 left-3 w-6 h-3 rounded-full pointer-events-none opacity-40"
        style={{ background: 'radial-gradient(ellipse, white, transparent)' }}
      />
      <span className="text-2xl leading-none">{emoji}</span>
      <span
        className="text-[10px] font-bold text-stone-700 leading-tight text-center w-16"
        style={{ wordBreak: 'keep-all' }}
      >
        {card.name.length > 6 ? card.name.slice(0, 6) + '…' : card.name}
      </span>
      <span className="text-[10px] font-semibold text-stone-500">¥{card.price}</span>
    </motion.button>
  )
}
