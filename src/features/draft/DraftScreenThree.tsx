import { CARDS, getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'
import { useState, useRef, useEffect, useMemo, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/DraftScene'
import { motion, AnimatePresence } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import { PurchaseModal } from './PurchaseModal'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import { StaffHelpModal } from './StaffHelpModal'

// ─── constants ────────────────────────────────────────────────────────────────

const DRAFT_SECONDS = 90

const INITIAL_BUDGET = 3000

const SHINKANSEN_TOTAL = 3

const ARCHETYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  akami:    { bg: '#7f1d1d', text: '#fca5a5', label: '赤身' },
  makimono: { bg: '#14532d', text: '#86efac', label: '巻物' },
  hikari:   { bg: '#1e3a5f', text: '#93c5fd', label: '光り物' },
  kaisen:   { bg: '#164e63', text: '#67e8f9', label: '海鮮' },
  niku:     { bg: '#7c2d12', text: '#fdba74', label: '肉寿司' },
  gunkan:   { bg: '#78350f', text: '#fcd34d', label: '軍艦' },
  general:  { bg: '#292524', text: '#d6d3d1', label: '汎用' },
}

// タブレットのホーム画面タイル（カード絵柄の代表ネタ付き）
const TABLET_TILES = [
  { label: 'おすすめ', color: '#e8381a', card: CARDS.find((c) => c.name === '大トロ') },
  { label: '握り', color: '#0d9488', card: CARDS.find((c) => c.name === 'サーモン') },
  { label: '軍艦 巻物', color: '#16a34a', card: CARDS.find((c) => c.name === 'いくら軍艦') },
  { label: '光り物', color: '#2563eb', card: CARDS.find((c) => c.name === 'アジ') },
  { label: '肉寿司', color: '#b45309', card: CARDS.find((c) => c.name === '和牛にぎり') },
  { label: '汎用 サイド', color: '#78716c', card: CARDS.find((c) => c.name === 'たまご') },
]

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  onComplete: (deck: Card[]) => void
  playerNum?: 1 | 2
  initialBudget?: number   // 追加注文タイムでは¥1500
  seconds?: number         // 追加注文タイムでは短め
}

type SelectedItem = { card: Card; price: number; markSold?: () => void }

export function DraftScreenThree({
  onComplete,
  playerNum,
  initialBudget = INITIAL_BUDGET,
  seconds = DRAFT_SECONDS,
}: Props) {
  const [budget, setBudget] = useState(initialBudget)
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [deck, setDeck] = useState<Card[]>([])
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [shinkansenLeft, setShinkansenLeft] = useState(SHINKANSEN_TOTAL)
  const [showShinkansenModal, setShowShinkansenModal] = useState(false)
  const [shinkansenPlate, setShinkansenPlate] = useState<{ card: Card } | null>(null)
  const [handOpen, setHandOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const deckRef = useRef<Card[]>([])
  const onCompleteRef = useRef(onComplete)
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { deckRef.current = deck }, [deck])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); onCompleteRef.current(deckRef.current); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const clearAutoClose = () => {
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }
  }

  const handleBeltSelect = (card: Card, markSold: () => void) => {
    clearAutoClose()
    setSelected({ card, price: card.price, markSold })
    autoCloseTimer.current = setTimeout(() => setSelected(null), 10000)
  }

  const handlePurchase = (card: Card) => {
    clearAutoClose()
    if (!selected || budget < selected.price || deck.length >= 20) return
    setBudget(b => b - selected.price)
    setDeck(d => [...d, card])
    selected.markSold?.()  // 買った皿だけをベルトから消す
    setSelected(null)
  }

  const handleModalClose = () => { clearAutoClose(); setSelected(null) }

  const handleShinkansenOrder = (card: Card, premiumPrice: number) => {
    if (budget < premiumPrice || deck.length >= 20) return
    setBudget(b => b - premiumPrice)
    setShinkansenLeft(n => n - 1)
    setShowShinkansenModal(false)
    setShinkansenPlate({ card })
  }

  const handleShinkansenPickup = () => {
    if (!shinkansenPlate) return
    setDeck(d => [...d, shinkansenPlate.card])
    setShinkansenPlate(null)
  }

  const generalCards = getCardsByLane('general')
  // 全ビルドカードが対象（レーン側のシャッフルバッグで満遍なく流れる）
  const buildCards = useMemo(() => getCardsByLane('build'), [])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const urgent = timeLeft <= 20
  const canOrder = shinkansenLeft > 0 && !shinkansenPlate

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0 z-10"
        style={{ background: '#2c1006', borderBottom: '1px solid #78350f' }}>
        <div className="flex items-center gap-2">
          <div className={`font-mono text-lg font-bold tabular-nums tracking-wider ${urgent ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
            ⏱ {mins}:{String(secs).padStart(2, '0')}
          </div>
          {playerNum && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#78350f', color: '#fde68a' }}>
              P{playerNum}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-600">デッキ </span>
          <span className="text-amber-200 font-bold">{deck.length}</span>
          <span className="text-amber-600">/20</span>
        </div>
        <div className="text-yellow-400 font-bold text-lg tabular-nums">¥{budget.toLocaleString()}</div>
      </div>

      {/* 3D Canvas + HTML オーバーレイ */}
      <div className="flex-1 relative overflow-hidden">
        {/* Three.js scene */}
        <Canvas
          className="absolute inset-0"
          camera={{ position: [0, 5, 7.5], fov: 52 }}
          shadows
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Scene
              generalCards={generalCards}
              buildCards={buildCards}
              shinkansenPlate={shinkansenPlate}
              onBeltSelect={handleBeltSelect}
              onShinkansenPickup={handleShinkansenPickup}
            />
          </Suspense>
        </Canvas>

        {/* タブレット端末 HTML オーバーレイ（実店舗の注文パネル風） */}
        <div className="absolute top-3 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-center">
            <motion.div
              initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              style={{
                width: 340, borderRadius: 18,
                background: 'linear-gradient(170deg, #f8f6f2, #e5e0d6)',
                border: '1px solid #c8c2b6',
                boxShadow: '0 14px 36px rgba(0,0,0,0.85), inset 0 1px 2px rgba(255,255,255,0.8)',
                padding: '6px 9px 7px',
                display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
              }}
            >
              {/* カメラ */}
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3a4a3a', boxShadow: canOrder ? '0 0 3px #4ade80' : 'none' }} />
              {/* 画面 */}
              <div style={{
                width: '100%', height: 178, borderRadius: 9, overflow: 'hidden',
                background: '#eef1f5', border: '2px solid #b0aa9e',
                display: 'flex', position: 'relative' as const,
              }}>
                {/* 左：カテゴリタイル＋下部バー */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const }}>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr', gap: 4, padding: 5 }}>
                    {TABLET_TILES.map((c) => (
                      <div
                        key={c.label}
                        onClick={canOrder ? () => setShowShinkansenModal(true) : undefined}
                        style={{
                          borderRadius: 6, overflow: 'hidden', background: 'white',
                          border: '1px solid #d5d0c6', boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                          display: 'flex', flexDirection: 'column' as const,
                          cursor: canOrder ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ background: c.color, padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                          <span style={{ color: 'white', fontSize: 7.5, fontWeight: 800, whiteSpace: 'nowrap' as const }}>{c.label}</span>
                        </div>
                        <div style={{
                          flex: 1, position: 'relative' as const, minHeight: 0,
                          background: 'linear-gradient(180deg, #fdfcfa, #f0ede6)',
                        }}>
                          {c.card && (
                            <div style={{ position: 'absolute' as const, inset: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ height: '100%', maxWidth: '90%', aspectRatio: '100 / 74' }}>
                                <SushiArt card={c.card} size="100%" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 下部バー */}
                  <div style={{ display: 'flex', gap: 4, padding: '0 5px 5px', alignItems: 'stretch' }}>
                    <div onClick={() => setShowHelp(true)} style={{ background: '#1e3a5f', borderRadius: 5, padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <span style={{ fontSize: 8 }}>🧑‍🍳</span>
                      <span style={{ color: 'white', fontSize: 8, fontWeight: 800 }}>店員に聞く</span>
                    </div>
                    <div style={{ background: 'white', border: '1px solid #d5d0c6', borderRadius: 5, padding: '3px 6px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: '#57534e', fontSize: 8, fontWeight: 700 }}>💬 日本語</span>
                    </div>
                    <div onClick={() => setShowHelp(true)} style={{ marginLeft: 'auto', background: 'white', border: '1px solid #d5d0c6', borderRadius: 5, padding: '3px 6px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <span style={{ color: '#57534e', fontSize: 8, fontWeight: 700 }}>❓ 操作説明</span>
                    </div>
                  </div>
                </div>
                {/* 右：注文の状況サイドバー */}
                <div style={{ width: 96, background: '#1c2844', display: 'flex', flexDirection: 'column' as const, padding: 5, gap: 4 }}>
                  <span style={{ color: '#cbd5f0', fontSize: 8, fontWeight: 800, textAlign: 'center' as const }}>注文の状況</span>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#93a5d0', fontSize: 7 }}>特急のこり</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < shinkansenLeft ? '#facc15' : 'rgba(255,255,255,0.15)' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#93a5d0', fontSize: 7 }}>手札</span>
                    <span style={{ color: 'white', fontSize: 8, fontWeight: 800 }}>{deck.length}<span style={{ color: '#93a5d0', fontSize: 6 }}>/20枚</span></span>
                  </div>
                  <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#93a5d0', fontSize: 7 }}>利用額</span>
                      <span style={{ color: 'white', fontSize: 8, fontWeight: 700 }}>¥{(initialBudget - budget).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#93a5d0', fontSize: 7 }}>残高</span>
                      <span style={{ color: '#facc15', fontSize: 9, fontWeight: 800 }}>¥{budget.toLocaleString()}</span>
                    </div>
                  </div>
                  <div onClick={() => onComplete(deck)} style={{ background: 'linear-gradient(180deg, #f97316, #ea580c)', borderRadius: 5, padding: '4px 0', textAlign: 'center' as const, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                    <span style={{ color: 'white', fontSize: 8.5, fontWeight: 800 }}>お会計する ▶</span>
                  </div>
                </div>
                {/* 特急終了時：カテゴリ側のみ暗くする */}
                {!canOrder && (
                  <div style={{ position: 'absolute' as const, left: 0, top: 0, bottom: 0, right: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,20,20,0.55)' }}>
                    <span style={{ color: 'white', fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '4px 10px' }}>特急注文は本日終了</span>
                  </div>
                )}
                {/* 画面のテカリ */}
                <div style={{
                  position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const,
                  background: 'linear-gradient(115deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 26%, transparent 42%)',
                }} />
              </div>
              {/* ロゴ */}
              <span style={{ fontSize: 7, color: '#8a8478', fontWeight: 800, letterSpacing: 3 }}>すしバトル</span>
            </motion.div>
            <div style={{ width: 12, height: 12, background: '#8a8478', borderRadius: '0 0 3px 3px' }} />
            <div style={{ width: 44, height: 5, background: '#6e6a60', borderRadius: 3 }} />
          </div>
        </div>

        {/* Modals */}
        {selected && (
          <PurchaseModal card={selected.card} displayPrice={selected.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
        )}
        {showShinkansenModal && (
          <ShinkansenOrderModal budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)} />
        )}
        <AnimatePresence>
          {showHelp && <StaffHelpModal onClose={() => setShowHelp(false)} />}
        </AnimatePresence>
      </div>

      {/* 手札パネル */}
      <div className="flex-shrink-0 z-10" style={{ borderTop: '1px solid #78350f' }}>
        <button onClick={() => setHandOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-2" style={{ background: '#2c1006' }}>
          <span className="text-amber-400 text-sm font-bold">🀄 手札 ({deck.length}枚)</span>
          <span className="text-amber-600 text-xs">{handOpen ? '▼ 閉じる' : '▲ 確認する'}</span>
        </button>
        <AnimatePresence>
          {handOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 120, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="overflow-hidden" style={{ background: '#1c0c04' }}
            >
              <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto">
                {deck.length === 0 ? (
                  <p className="text-stone-600 text-sm w-full text-center">まだ購入していません</p>
                ) : deck.map((card, i) => {
                  const s = ARCHETYPE_STYLE[card.archetype[0]] ?? ARCHETYPE_STYLE.general
                  return (
                    <div key={`hand-${i}`} className="flex-shrink-0 flex flex-col overflow-hidden"
                      style={{ width: 56, height: 80, borderRadius: 7, background: s.bg, border: `2px solid ${s.text}44`, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      <div style={{ background: s.text + '33', padding: '2px 4px', borderBottom: `1px solid ${s.text}44` }}>
                        <p style={{ color: s.text, fontSize: 7, fontWeight: 'bold', lineHeight: 1 }}>{s.label}</p>
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 3px' }}>
                        <p style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.3, wordBreak: 'keep-all' }}>{card.name}</p>
                      </div>
                      <div style={{ padding: '2px 4px', background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: s.text, fontSize: 7, fontWeight: 'bold' }}>{card.cost}AP</span>
                        <span style={{ color: '#fbbf24', fontSize: 7, fontWeight: 'bold' }}>⚔{card.attack}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* バトルへ進むボタン */}
      <button
        onClick={() => onComplete(deck)}
        style={{
          position: 'absolute', bottom: 52, right: 12, zIndex: 50,
          padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 800,
          background: '#ea580c', color: '#fff', border: '1px solid #fb923c',
          cursor: 'pointer', boxShadow: '0 0 16px rgba(234,88,12,0.5)',
        }}
      >
        ⚔ バトルへ ({deck.length}枚)
      </button>
    </div>
  )
}
