import { lazy, Suspense, useState } from 'react'
import { motion } from 'framer-motion'
import { TitleScreen } from './features/title/TitleScreen'
import { ModeSelectScreen } from './features/title/ModeSelectScreen'
import { DraftScreenThree } from './features/draft/DraftScreenThree'
import { BattleScreen } from './features/battle/BattleScreen'
import { OnlineScreen } from './features/online/OnlineScreen'
import type { Phase, Card } from './types'

type GameMode = 'cpu' | 'two_player'
const MobileDraftDemo = lazy(() => import('./features/demo/MobileDraftDemo'))
const VerticalDraftDemo = lazy(() => import('./features/demo/VerticalDraftDemo'))
const CardCatalogScreen = lazy(() => import('./features/catalog/CardCatalogScreen').then(module => ({ default: module.CardCatalogScreen })))

export default function App() {
  const [isMobileDemo] = useState(() => window.location.hash === '#mobile-demo')
  const [isVerticalDemo] = useState(() => window.location.hash === '#vertical-draft-demo')
  const [phase, setPhase] = useState<Phase | 'online' | 'catalog'>(() => window.location.hash === '#online' ? 'online' : 'title')
  const [gameMode, setGameMode] = useState<GameMode>('cpu')
  const [draftPlayer, setDraftPlayer] = useState<1 | 2>(1)
  const [p1Deck, setP1Deck] = useState<Card[]>([])
  const [p2Deck, setP2Deck] = useState<Card[]>([])
  const [showHandoff, setShowHandoff] = useState(false)

  const handleModeSelect = (mode: 'cpu' | '2p' | 'online') => {
    if (mode === 'online') {
      window.history.replaceState(null, '', '#online')
      setPhase('online')
      return
    }
    const gm: GameMode = mode === '2p' ? 'two_player' : 'cpu'
    setGameMode(gm)
    setDraftPlayer(1)
    setP1Deck([])
    setP2Deck([])
    setPhase('draft')
  }

  const handleDraftComplete = (deck: Card[]) => {
    if (gameMode === 'cpu') {
      setP1Deck(deck)
      setPhase('battle')
    } else {
      if (draftPlayer === 1) {
        setP1Deck(deck)
        setShowHandoff(true)
      } else {
        setP2Deck(deck)
        setPhase('battle')
      }
    }
  }

  const handleHandoffReady = () => {
    setShowHandoff(false)
    setDraftPlayer(2)
  }

  const handleBattleBack = () => {
    setPhase('title')
    setDraftPlayer(1)
    setP1Deck([])
    setP2Deck([])
    setShowHandoff(false)
  }

  if (isMobileDemo) return <Suspense fallback={<div style={{ padding: 32 }}>デモを準備しています…</div>}><MobileDraftDemo /></Suspense>
  if (isVerticalDemo) return <Suspense fallback={<div style={{ padding: 32 }} role="status">縦レーンのデモを準備しています…</div>}><VerticalDraftDemo /></Suspense>

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
      {phase === 'draft' && !showHandoff && (
        <DraftScreenThree
          key={gameMode === 'two_player' ? `p${draftPlayer}` : 'p1'}
          onComplete={handleDraftComplete}
          playerNum={gameMode === 'two_player' ? draftPlayer : undefined}
        />
      )}
      {phase === 'draft' && showHandoff && (
        <HandoffScreen playerNum={2} onReady={handleHandoffReady} />
      )}
      {phase === 'battle' && (
        <BattleScreen
          deck={p1Deck}
          p2Deck={gameMode === 'two_player' ? p2Deck : undefined}
          mode={gameMode}
          onBack={handleBattleBack}
        />
      )}

    </div>
  )
}

// ── ドラフトハンドオフ画面 ──────────────────────────────────────────
function HandoffScreen({ playerNum, onReady }: { playerNum: number; onReady: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'linear-gradient(180deg,#1a0800,#3d1a0a)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, color: '#fff',
    }}>
      <span style={{ fontSize: 72 }}>🍣</span>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fde68a' }}>
        プレイヤー{playerNum}の準備
      </h2>
      <p style={{ fontSize: 16, color: '#d6d3d1', textAlign: 'center', lineHeight: 1.8 }}>
        プレイヤー1のデッキ構築が完了しました。<br />
        デバイスをプレイヤー{playerNum}に渡してください。
      </p>
      <motion.button
        onClick={onReady}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        style={{
          marginTop: 16, padding: '16px 48px',
          background: '#ea580c', border: '2px solid #fb923c',
          borderRadius: 999, fontSize: 18, fontWeight: 800,
          color: '#fff', cursor: 'pointer',
          boxShadow: '0 0 24px rgba(234,88,12,0.5)',
        }}
      >
        準備完了 →
      </motion.button>
    </div>
  )
}
