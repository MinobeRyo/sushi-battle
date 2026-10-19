import { lazy, Suspense, useState } from 'react'
import { TitleScreen } from './features/title/TitleScreen'
import { ModeSelectScreen, type BattleMode } from './features/title/ModeSelectScreen'
import { DraftScreenThree } from './features/draft/DraftScreenThree'
import { BattleScreen } from './features/battle/BattleScreen'
import { OnlineScreen } from './features/online/OnlineScreen'
import { RunScreen } from './features/run/RunScreen'
import type { Phase, Card } from './types'
import type { SideMenuId } from './data/sideMenus'
import type { CpuBattleMode } from './data/cpuDecks'

const MobileDraftDemo = lazy(() => import('./features/demo/MobileDraftDemo'))
const VerticalDraftDemo = lazy(() => import('./features/demo/VerticalDraftDemo'))
const ImprovementsDemo = lazy(() => import('./features/demo/ImprovementsDemo'))
const CardCatalogScreen = lazy(() => import('./features/catalog/CardCatalogScreen').then(module => ({ default: module.CardCatalogScreen })))

export default function App() {
  const [isMobileDemo] = useState(() => window.location.hash === '#mobile-demo')
  const [isVerticalDemo] = useState(() => window.location.hash === '#vertical-draft-demo')
  const [isImprovementsDemo] = useState(() => window.location.hash === '#improvements-demo')
  const [phase, setPhase] = useState<Phase | 'online' | 'catalog' | 'run'>(() => window.location.hash === '#online' ? 'online' : 'title')
  const [cpuBattleMode, setCpuBattleMode] = useState<CpuBattleMode>('random')
  const [p1Deck, setP1Deck] = useState<Card[]>([])
  const [p1SideMenu, setP1SideMenu] = useState<SideMenuId | null>(null)

  const handleModeSelect = (mode: BattleMode) => {
    if (mode === 'online') {
      window.history.replaceState(null, '', '#online')
      setPhase('online')
      return
    }
    if (mode === 'run') {
      setPhase('run')
      return
    }
    setCpuBattleMode(mode === 'weak' ? 'weak' : mode === 'challenge' ? 'challenge' : 'random')
    setP1Deck([])
    setP1SideMenu(null)
    setPhase('draft')
  }

  const handleDraftComplete = (deck: Card[], sideMenu: SideMenuId | null = null) => {
    setP1Deck(deck)
    setP1SideMenu(sideMenu)
    setPhase('battle')
  }

  const handleBattleBack = () => {
    setPhase('title')
    setP1Deck([])
    setP1SideMenu(null)
  }

  if (isMobileDemo) return <Suspense fallback={<div style={{ padding: 32 }}>デモを準備しています…</div>}><MobileDraftDemo /></Suspense>
  if (isVerticalDemo) return <Suspense fallback={<div style={{ padding: 32 }} role="status">縦レーンのデモを準備しています…</div>}><VerticalDraftDemo /></Suspense>
  if (isImprovementsDemo) return <Suspense fallback={<div style={{ padding: 32 }} role="status">改善デモを準備しています…</div>}><ImprovementsDemo /></Suspense>

  return (
    <div className="w-full h-full relative">
      {phase === 'title' && (
        <TitleScreen onPlay={() => setPhase('mode_select')} onOpenCatalog={() => setPhase('catalog')} />
      )}
      {phase === 'catalog' && (
        <Suspense fallback={<div className="p-8" role="status">カード図鑑を開いています…</div>}>
          <CardCatalogScreen onBack={() => setPhase('title')} />
        </Suspense>
      )}
      {phase === 'mode_select' && (
        <ModeSelectScreen
          onSelect={handleModeSelect}
          onBack={() => setPhase('title')}
        />
      )}
      {phase === 'online' && <OnlineScreen onBack={() => {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        setPhase('mode_select')
      }} />}
      {phase === 'run' && <RunScreen onExit={() => setPhase('mode_select')} />}
      {phase === 'draft' && (
        <DraftScreenThree key="p1" onComplete={handleDraftComplete} />
      )}
      {phase === 'battle' && (
        <BattleScreen
          deck={p1Deck}
          sideMenu={p1SideMenu}
          cpuBattleMode={cpuBattleMode}
          onBack={handleBattleBack}
        />
      )}
    </div>
  )
}
