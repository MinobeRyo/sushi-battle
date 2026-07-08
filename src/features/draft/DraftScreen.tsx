import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConveyorLane } from './ConveyorLane'
import { ShinkansenLane } from './ShinkansenLane'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import { PurchaseModal } from './PurchaseModal'
import { getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'

const DRAFT_SECONDS = 90
const INITIAL_BUDGET = 3000
const SHINKANSEN_TOTAL = 3

const ARCHETYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  akami:    { bg: '#7f1d1d', text: '#fca5a5', label: '赤身' },
  makimono: { bg: '#14532d', text: '#86efac', label: '巻物' },
  hikari:   { bg: '#1e3a5f', text: '#93c5fd', label: '光り物' },
  kaisen:   { bg: '#164e63', text: '#67e8f9', label: '海鮮' },
  niku:     { bg: '#7c2d12', text: '#fdba74', label: '肉寿司' },
  general:  { bg: '#292524', text: '#d6d3d1', label: '汎用' },
}

type Props = {
  onComplete: (deck: Card[]) => void
  playerNum?: 1 | 2
  initialBudget?: number   // 追加注文タイムでは¥1500
  seconds?: number         // 追加注文タイムでは短め
}
type SelectedItem = { card: Card; price: number; markSold?: () => void }

export function DraftScreen({ onComplete, playerNum, initialBudget = INITIAL_BUDGET, seconds = DRAFT_SECONDS }: Props) {
  const [budget, setBudget] = useState(initialBudget)
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [deck, setDeck] = useState<Card[]>([])
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [shinkansenLeft, setShinkansenLeft] = useState(SHINKANSEN_TOTAL)
  const [showShinkansenModal, setShowShinkansenModal] = useState(false)
  const [shinkansenPlate, setShinkansenPlate] = useState<{ card: Card } | null>(null)
  const [handOpen, setHandOpen] = useState(false)

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

  const handleBeltSelect = (card: Card, timeToExit: number, markSold: () => void) => {
    clearAutoClose()
    setSelected({ card, price: card.price, markSold })
    if (timeToExit > 0) {
      autoCloseTimer.current = setTimeout(() => setSelected(null), timeToExit * 1000)
    }
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
        <div className="text-sm">
          <span className="text-amber-600">デッキ </span>
          <span className="text-amber-200 font-bold">{deck.length}</span>
          <span className="text-amber-600">/20</span>
        </div>
        <div className="text-yellow-400 font-bold text-lg tabular-nums">¥{budget.toLocaleString()}</div>
      </div>

      {/* カウンター */}
      <div className="flex-1 flex flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #6b2d0b 0%, #4a1e08 40%, #4a1e08 60%, #6b2d0b 100%)' }}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent 0, transparent 8px, rgba(0,0,0,0.8) 8px, rgba(0,0,0,0.8) 9px)' }}
        />

        {/* ── タブレット端末（カウンター上にスタンドで設置） ── */}
        <div className="flex justify-center pt-3 pb-0 flex-shrink-0 relative z-10">
          <div className="flex flex-col items-center">
            {/* 端末本体 */}
            <motion.button
              onClick={canOrder ? () => setShowShinkansenModal(true) : undefined}
              whileHover={canOrder ? { scale: 1.03, y: -3 } : {}}
              whileTap={canOrder ? { scale: 0.97 } : {}}
              transition={{ type: 'spring', stiffness: 380, damping: 24 }}
              style={{
                width: 240, height: 156,
                borderRadius: 14,
                background: canOrder
                  ? 'linear-gradient(160deg, #e0e0e0 0%, #c4c4c4 50%, #d4d4d4 100%)'
                  : 'linear-gradient(160deg, #555 0%, #383838 100%)',
                border: `5px solid ${canOrder ? '#b0b0b0' : '#282828'}`,
                boxShadow: canOrder
                  ? '0 10px 30px rgba(0,0,0,0.8), inset 0 1px 3px rgba(255,255,255,0.5)'
                  : '0 6px 16px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                padding: '6px 8px 8px',
                gap: 5,
                cursor: canOrder ? 'pointer' : 'default',
              }}
            >
              {/* カメラ */}
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: canOrder ? '#999' : '#444', border: `1.5px solid ${canOrder ? '#777' : '#2a2a2a'}` }} />

              {/* スクリーン */}
              <div style={{
                flex: 1, width: '100%', borderRadius: 8, overflow: 'hidden',
                background: canOrder ? '#faf7f2' : '#060606',
                border: `2px solid ${canOrder ? '#c0b8a8' : '#000'}`,
                display: 'flex', flexDirection: 'column' as const,
              }}>
                {canOrder ? (
                  <>
                    <div style={{ background: '#e8381a', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>🚄 特急注文</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {[...Array(3)].map((_, i) => (
                            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < shinkansenLeft ? '#facc15' : 'rgba(255,255,255,0.25)', border: `1.5px solid ${i < shinkansenLeft ? '#eab308' : 'rgba(255,255,255,0.3)'}` }} />
                          ))}
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: 'bold' }}>残り{shinkansenLeft}回</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: '6px 8px' }}>
                      {[
                        { label: '赤身', color: '#dc2626' }, { label: '巻物', color: '#16a34a' },
                        { label: '光り物', color: '#2563eb' }, { label: '海鮮', color: '#0891b2' },
                        { label: '肉寿司', color: '#ea580c' }, { label: '汎用', color: '#78716c' },
                      ].map(c => (
                        <div key={c.label} style={{
                          borderRadius: 5, background: c.color + '1a', border: `1.5px solid ${c.color}55`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: c.color, fontSize: 11, fontWeight: 'bold' }}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: '#e8381a', padding: '5px', textAlign: 'center' as const }}>
                      <span style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>タップして注文する</span>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: '#333', fontSize: 14, fontWeight: 'bold' }}>本日終了</span>
                    <span style={{ color: '#222', fontSize: 9 }}>特急便の受付を終了しました</span>
                  </div>
                )}
              </div>

              {/* ホームバー */}
              <div style={{ width: 44, height: 4, borderRadius: 2, background: canOrder ? '#b0b0b0' : '#333' }} />
            </motion.button>

            {/* スタンド */}
            <div style={{ width: 10, height: 12, background: '#888', borderRadius: '0 0 3px 3px' }} />
            <div style={{ width: 32, height: 5, background: '#777', borderRadius: 3 }} />
          </div>
        </div>

        {/* 3本のベルト */}
        <div className="flex flex-col gap-3 mt-2">
          <ShinkansenLane
            plate={shinkansenPlate}
            onPickup={handleShinkansenPickup}
          />
          <ConveyorLane label="汎用・サイドメニュー" cards={generalCards} duration={32} paused={false} onSelect={handleBeltSelect} />
          <ConveyorLane label="ビルド系雑多" cards={buildCards} duration={16} paused={false} onSelect={handleBeltSelect} />
        </div>
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

      {selected && (
        <PurchaseModal card={selected.card} displayPrice={selected.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
      )}
      {showShinkansenModal && (
        <ShinkansenOrderModal budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)} />
      )}

      {/* DEVボタン: 今の手札でバトルへスキップ */}
      <button
        onClick={() => onComplete(deck)}
        style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 50,
          padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b',
        }}
      >
        ⚡ DEV: バトルへ ({deck.length}枚)
      </button>
    </div>
  )
}
