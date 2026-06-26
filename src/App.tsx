import { useState } from 'react'
import { TitleScreen } from './features/title/TitleScreen'
import { ModeSelectScreen } from './features/title/ModeSelectScreen'
import { DraftScreen } from './features/draft/DraftScreen'
import { DraftScreenThree } from './features/draft/DraftScreenThree'
import { BattleScreen } from './features/battle/BattleScreen'
import type { Phase, Card } from './types'

type BeltMode = 'css' | '3d'

export default function App() {
  const [phase, setPhase] = useState<Phase>('title')
  const [beltMode, setBeltMode] = useState<BeltMode>('css')
  const [playerDeck, setPlayerDeck] = useState<Card[]>([])

  const handleDraftComplete = (deck: Card[]) => {
    setPlayerDeck(deck)
    setPhase('battle')
  }


  return (
    <div className="w-full h-full relative">
      {phase === 'title' && (
        <TitleScreen onPlay={() => setPhase('mode_select')} />
      )}
      {phase === 'mode_select' && (
        <ModeSelectScreen
          onSelect={() => setPhase('draft')}
          onBack={() => setPhase('title')}
        />
      )}
      {phase === 'draft' && beltMode === 'css' && (
        <DraftScreen onComplete={handleDraftComplete} />
      )}
      {phase === 'draft' && beltMode === '3d' && (
        <DraftScreenThree onComplete={handleDraftComplete} />
      )}
      {phase === 'battle' && (
        <BattleScreen deck={playerDeck} onBack={() => setPhase('title')} />
      )}

      {/* CSS / Three.js 切り替えトグル */}
      {phase === 'draft' && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex rounded-full overflow-hidden shadow-lg"
          style={{ border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <button
            onClick={() => setBeltMode('css')}
            className="px-3 py-1 text-[11px] font-bold transition-colors"
            style={{
              background: beltMode === 'css' ? '#f59e0b' : 'rgba(0,0,0,0.6)',
              color: beltMode === 'css' ? '#1c0c04' : '#9ca3af',
            }}
          >
            CSS
          </button>
          <button
            onClick={() => setBeltMode('3d')}
            className="px-3 py-1 text-[11px] font-bold transition-colors"
            style={{
              background: beltMode === '3d' ? '#0c4a6e' : 'rgba(0,0,0,0.6)',
              color: beltMode === '3d' ? '#7dd3fc' : '#9ca3af',
            }}
          >
            ◈ 3D
          </button>
        </div>
      )}
    </div>
  )
}
