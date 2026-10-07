import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { StaffHelpModal } from '../draft/StaffHelpModal'
import './TitleScreen.css'

type Props = {
  onPlay: () => void
  onOpenCatalog: () => void
}

export function TitleScreen({ onPlay, onOpenCatalog }: Props) {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div className="title-screen h-full overflow-y-auto">
      <div className="title-screen-content flex min-h-full flex-col items-center justify-center gap-6 px-5 py-8 sm:gap-8">
        <h1 className="text-center text-3xl font-bold text-amber-100 tracking-widest sm:text-5xl lg:text-6xl">
          🍣 寿司デッキバトル
        </h1>
        <div className="title-screen-actions flex flex-col gap-4 w-48">
          <button
            onClick={onPlay}
            className="py-4 bg-red-700 hover:bg-red-600 text-white text-xl font-bold rounded-xl transition-colors"
          >
            プレイ
          </button>
          <button
            onClick={onOpenCatalog}
            className="py-4 bg-emerald-800 hover:bg-emerald-700 text-white text-xl font-bold rounded-xl transition-colors"
          >
            カード図鑑
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
      </div>
      <AnimatePresence>
        {showHelp && <StaffHelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </div>
  )
}
