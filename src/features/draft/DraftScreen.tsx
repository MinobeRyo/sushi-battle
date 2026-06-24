import { useState, useEffect, useRef } from 'react'
import { ConveyorLane } from './ConveyorLane'
import { PurchaseModal } from './PurchaseModal'
import { getCardsByLane } from '../../data/cards'
import type { Card } from '../../types'

const DRAFT_SECONDS = 90
const INITIAL_BUDGET = 3000
const SHINKANSEN_TOTAL = 3

type Props = {
  onComplete: (deck: Card[]) => void
}

export function DraftScreen({ onComplete }: Props) {
  const [budget, setBudget] = useState(INITIAL_BUDGET)
  const [timeLeft, setTimeLeft] = useState(DRAFT_SECONDS)
  const [deck, setDeck] = useState<Card[]>([])
  const [selected, setSelected] = useState<Card | null>(null)
  const [shinkansenLeft] = useState(SHINKANSEN_TOTAL)

  const deckRef = useRef<Card[]>([])
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { deckRef.current = deck }, [deck])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // タイマー（1回だけ起動）
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(id)
          onCompleteRef.current(deckRef.current)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const handlePurchase = (card: Card) => {
    if (budget < card.price || deck.length >= 20) return
    setBudget(b => b - card.price)
    setDeck(d => [...d, card])
    setSelected(null)
  }

  const generalCards = getCardsByLane('general')
  const buildCards = getCardsByLane('build')

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`
  const urgent = timeLeft <= 20

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ヘッダー */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0 z-10"
        style={{ background: '#2c1006', borderBottom: '1px solid #78350f' }}
      >
        <div className={`font-mono text-lg font-bold tabular-nums tracking-wider ${urgent ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
          ⏱ {timeStr}
        </div>
        <div className="text-center text-sm">
          <span className="text-amber-600">デッキ </span>
          <span className="text-amber-200 font-bold">{deck.length}</span>
          <span className="text-amber-600">/20</span>
        </div>
        <div className="text-yellow-400 font-bold text-lg tabular-nums">
          ¥{budget.toLocaleString()}
        </div>
      </div>

      {/* カウンター（木目風） */}
      <div
        className="flex-1 flex flex-col justify-center gap-6"
        style={{
          background: 'linear-gradient(180deg, #6b2d0b 0%, #4a1e08 40%, #4a1e08 60%, #6b2d0b 100%)',
        }}
      >
        {/* 木目の縦線 */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage: 'repeating-linear-gradient(180deg, transparent 0, transparent 8px, rgba(0,0,0,0.8) 8px, rgba(0,0,0,0.8) 9px)',
          }}
        />

        <ConveyorLane
          label="汎用・サイドメニュー"
          cards={generalCards}
          duration={30}
          paused={selected !== null}
          onSelect={setSelected}
        />
        <ConveyorLane
          label="ビルド系雑多"
          cards={buildCards}
          duration={22}
          paused={selected !== null}
          onSelect={setSelected}
        />
      </div>

      {/* 新幹線ゾーン */}
      <div
        className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
        style={{ background: '#2c1006', borderTop: '1px solid #78350f' }}
      >
        <span className="text-stone-300 text-sm font-bold">🚄 新幹線注文</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[...Array(SHINKANSEN_TOTAL)].map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full"
                style={{
                  background: i < shinkansenLeft ? '#facc15' : '#44403c',
                  border: `2px solid ${i < shinkansenLeft ? '#eab308' : '#57534e'}`,
                }}
              />
            ))}
          </div>
          <span className="text-stone-400 text-xs">残り {shinkansenLeft} 回</span>
        </div>
      </div>

      {/* 購入モーダル */}
      {selected && (
        <PurchaseModal
          card={selected}
          budget={budget}
          deckCount={deck.length}
          onPurchase={handlePurchase}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
