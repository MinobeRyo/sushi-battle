import { useState } from 'react'
import { TitleScreen } from './features/title/TitleScreen'
import { ModeSelectScreen } from './features/title/ModeSelectScreen'
import { DraftScreen } from './features/draft/DraftScreen'
import { BattleScreen } from './features/battle/BattleScreen'
import type { Phase } from './types'

export default function App() {
  const [phase, setPhase] = useState<Phase>('title')

  return (
    <div className="w-full h-full">
      {phase === 'title' && (
        <TitleScreen onPlay={() => setPhase('mode_select')} />
      )}
      {phase === 'mode_select' && (
        <ModeSelectScreen
          onSelect={() => setPhase('draft')}
          onBack={() => setPhase('title')}
        />
      )}
      {phase === 'draft' && (
        <DraftScreen onComplete={() => setPhase('battle')} />
      )}
      {phase === 'battle' && (
        <BattleScreen />
      )}
    </div>
  )
}
