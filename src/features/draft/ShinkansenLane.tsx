import { motion, AnimatePresence } from 'framer-motion'
import type { Card } from '../../types'

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
  plate: { card: Card } | null
  onPickup: () => void
}

// ベルトだけ。タブレットはDraftScreenのカウンター上に別置き。
export function ShinkansenLane({ plate, onPickup }: Props) {
  return (
    <div className="relative select-none">
      <p className="text-yellow-500 text-[11px] font-bold px-4 mb-1.5 tracking-widest uppercase">
        🚄 新幹線レーン
      </p>

      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{
          height: 96,
          borderTop: `5px solid ${plate ? '#ca8a04' : '#3d3530'}`,
          borderBottom: `5px solid ${plate ? '#ca8a04' : '#3d3530'}`,
          background: 'linear-gradient(to bottom, #292524 0%, #1c1917 40%, #1c1917 60%, #292524 100%)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 60px, rgba(202,138,4,0.1) 60px, rgba(202,138,4,0.1) 62px)` }}
        />

        <AnimatePresence mode="wait">
          {plate ? (
            <motion.div
              key="plate"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ x: '110%' }}
              animate={{ x: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 700, damping: 40 }}
            >
              <motion.button
                onClick={onPickup}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="relative flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                style={{
                  width: 82, height: 82, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                  border: '5px solid #f59e0b',
                  boxShadow: '0 0 20px rgba(245,158,11,0.7), 0 4px 14px rgba(0,0,0,0.6)',
                }}
              >
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap animate-bounce" style={{ color: '#facc15' }}>
                  タップで受け取る
                </div>
                <span className="text-2xl leading-none">{BASE_EMOJI[plate.card.base] ?? '🍣'}</span>
                <span className="text-[10px] font-bold text-stone-700 text-center w-14 leading-tight" style={{ wordBreak: 'keep-all' }}>
                  {plate.card.name.length > 6 ? plate.card.name.slice(0, 6) + '…' : plate.card.name}
                </span>
              </motion.button>
            </motion.div>
          ) : (
            <motion.p key="empty" className="text-stone-700 text-xs tracking-widest pointer-events-none"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              ── ご注文をどうぞ ──
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
