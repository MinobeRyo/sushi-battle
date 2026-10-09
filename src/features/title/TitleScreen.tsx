import { Suspense, lazy, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { StaffHelpModal } from '../draft/StaffHelpModal'
import './TitleScreen.css'

const TitleCounterScene = lazy(() => import('./TitleCounterScene').then(module => ({ default: module.TitleCounterScene })))

type Props = {
  onPlay: () => void
  onOpenCatalog: () => void
}

export function TitleScreen({ onPlay, onOpenCatalog }: Props) {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <main className="title-screen">
      <div className="title-restaurant">
        <div className="title-ceiling" aria-hidden="true" />
        <div className="title-post title-post--left" aria-hidden="true" />
        <div className="title-post title-post--right" aria-hidden="true" />

        <header className="title-noren">
          <div className="title-noren-panels" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <div className="title-noren-print">
            <p className="title-category">回転寿司 × カードバトル</p>
            <h1 className="title-logo" aria-label="寿司デッキバトル">
              <span className="title-logo-sushi" aria-hidden="true">寿司</span>
              <span className="title-logo-battle" aria-hidden="true">デッキバトル</span>
            </h1>
            <div className="title-noren-rule" aria-hidden="true"><span />一皿入魂<span /></div>
          </div>
        </header>

        <div className="title-welcome">
          <p className="title-invitation">お好きなネタで、いざ勝負。</p>
          <nav className="title-menu" aria-label="メインメニュー">
            <button type="button" className="title-menu-board title-menu-board--play" onClick={onPlay}>
              <span className="title-board-caption">対戦をはじめる</span>
              <strong>プレイ</strong>
              <span className="title-board-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="title-menu-board" onClick={onOpenCatalog}>
              <span className="title-board-caption">寿司を知る</span>
              <strong>カード図鑑</strong>
              <span className="title-board-dot" aria-hidden="true" />
            </button>
            <button type="button" className="title-menu-board" onClick={() => setShowHelp(true)}>
              <span className="title-board-caption">はじめての方へ</span>
              <strong>遊び方</strong>
              <span className="title-board-dot" aria-hidden="true" />
            </button>
          </nav>
          <p className="title-mode-note">ひとり・ふたり・オンライン対戦</p>
        </div>

        <div className="title-counter" aria-hidden="true">
          <div className="title-counter-surface" />
          <Suspense fallback={null}><TitleCounterScene /></Suspense>
          <div className="title-counter-front" />
        </div>
        <p className="title-credit">効果音：<a href="https://otologic.jp" target="_blank" rel="noopener noreferrer">OtoLogic</a>（CC BY 4.0）</p>
      </div>
      <AnimatePresence>
        {showHelp && <StaffHelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </main>
  )
}
