import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { StaffHelpModal } from '../draft/StaffHelpModal'

type Props = {
  onPlay: () => void
}

export function TitleScreen({ onPlay }: Props) {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <h1 className="text-6xl font-bold text-amber-100 tracking-widest">
        🍣 寿司デッキバトル
      </h1>
      <div className="flex flex-col gap-4 w-48">
        <button
          onClick={onPlay}
          className="py-4 bg-red-700 hover:bg-red-600 text-white text-xl font-bold rounded-xl transition-colors"
        >
          プレイ
        </button>
        <button className="py-4 bg-stone-700 hover:bg-stone-600 text-white text-xl font-bold rounded-xl transition-colors">
          設定
        </button>
        <button
          onClick={() => setShowHelp(true)}
          className="py-4 bg-amber-800 hover:bg-amber-700 text-white text-xl font-bold rounded-xl transition-colors"
        >
          遊び方
        </button>
      </div>
      <AnimatePresence>
        {showHelp && <StaffHelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </div>
  )
}
