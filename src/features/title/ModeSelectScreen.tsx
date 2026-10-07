import { Suspense, lazy } from 'react'
import './ModeSelectScreen.css'

const TitleCounterScene = lazy(() => import('./TitleCounterScene').then(module => ({ default: module.TitleCounterScene })))

type BattleMode = 'weak' | 'cpu' | 'challenge' | '2p' | 'online'

type Props = {
  onSelect: (mode: BattleMode) => void
  onBack: () => void
}

const MODES: Array<{ id: BattleMode; number: string; label: string; kind: string; detail: string }> = [
  { id: 'weak', number: '01', label: 'CPU対戦 · 最弱', kind: 'ひとりで遊ぶ', detail: 'これまでの汎用デッキCPU' },
  { id: 'cpu', number: '02', label: 'CPU対戦 · 普通', kind: 'ひとりで遊ぶ', detail: '5つのビルドからランダムに対戦' },
  { id: 'challenge', number: '03', label: 'CPU対戦 · 挑戦', kind: 'ひとりで遊ぶ', detail: '総額4,500円の肉寿司＋巻物CPU' },
  { id: '2p', number: '04', label: '二人対戦', kind: '同じ端末で遊ぶ', detail: '画面を交代してデッキを構築' },
  { id: 'online', number: '05', label: 'オンライン対戦', kind: '通信で遊ぶ', detail: '部屋を作成、またはコードで参加' },
]

export function ModeSelectScreen({ onSelect, onBack }: Props) {
  return (
    <main className="mode-shop-screen">
      <div className="mode-shop-room">
        <div className="mode-shop-ceiling" aria-hidden="true" />
        <div className="mode-shop-post mode-shop-post--left" aria-hidden="true" />
        <div className="mode-shop-post mode-shop-post--right" aria-hidden="true" />

        <header className="mode-shop-noren">
          <div className="mode-shop-noren-panels" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <div className="mode-shop-noren-print">
            <p>お品書き</p>
            <h1>対戦を選ぶ</h1>
            <span>ご注文をどうぞ</span>
          </div>
        </header>

        <section className="mode-shop-selection" aria-label="対戦モード">
          <p className="mode-shop-intro">遊び方に合わせて、お選びください。</p>
          <div className="mode-shop-boards">
            {MODES.map(mode => (
              <button
                type="button"
                className={`mode-shop-board${mode.id === 'challenge' ? ' mode-shop-board--challenge' : ''}${mode.id === 'online' ? ' mode-shop-board--online' : ''}`}
                key={mode.id}
                onClick={() => onSelect(mode.id)}
              >
                <span className="mode-shop-board-head"><span>{mode.kind}</span><span>{mode.number}</span></span>
                <strong>{mode.label}</strong>
                <span className="mode-shop-board-detail">{mode.detail}</span>
                <span className="mode-shop-board-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <button type="button" className="mode-shop-back" onClick={onBack}>← 店先へ戻る</button>
        </section>

        <div className="mode-shop-counter" aria-hidden="true">
          <div className="mode-shop-counter-surface" />
          <Suspense fallback={null}><TitleCounterScene /></Suspense>
          <div className="mode-shop-counter-front" />
        </div>
      </div>
    </main>
  )
}
