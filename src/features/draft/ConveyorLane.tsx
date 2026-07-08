import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { Card } from '../../types'
import { SushiPlate } from './SushiPlate'

const CARD_W = 90
const CARD_SLOT = CARD_W + 32  // plate width + gap

let uidCounter = 0

function shuffleCopy<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type LiveCard = {
  id: string
  card: Card
  startX: number
  endX: number
  dur: number
  born: number
  sold: boolean
}

type Props = {
  label: string
  cards: Card[]
  duration: number
  paused: boolean
  // markSold: この皿だけを売り切れ表示にするコールバック
  onSelect: (card: Card, timeToExit: number, markSold: () => void) => void
}

export function ConveyorLane({ label, cards, duration, paused, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [liveCards, setLiveCards] = useState<LiveCard[]>([])
  // シャッフルバッグ：全カードを使い切るまで重複なしで出す → 出現の偏りを防ぐ
  const bagRef = useRef<Card[]>([])

  // Refs so the spawn loop always reads current values without stale closures
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const durationRef = useRef(duration)
  durationRef.current = duration
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    // Derive speed from original duration prop, scaled 1.2×
    // プール全体が大きくてもベルト速度が上がりすぎないよう12枚相当で頭打ち
    const getSpeed = () => {
      const n = Math.min(cardsRef.current.length, 12) || 1
      return (n * CARD_SLOT / durationRef.current) * 1.2  // px/s
    }

    const pickCard = (): Card | null => {
      const pool = cardsRef.current
      if (pool.length === 0) return null
      if (bagRef.current.length === 0) bagRef.current = shuffleCopy(pool)
      return bagRef.current.pop()!
    }

    // 右端からランダムなカードが流れてくる（購入済みでも補充される）
    const makeCard = (): LiveCard | null => {
      const card = pickCard()
      if (!card) return null
      const w = containerRef.current?.getBoundingClientRect().width ?? 500
      const speed = getSpeed()
      return {
        id: String(++uidCounter),
        card,
        startX: w + CARD_W,
        endX: -(CARD_W + 20),
        dur: (w + CARD_W * 2) / speed,
        born: Date.now(),
        sold: false,
      }
    }

    // 1.5× card slot spacing between spawns
    const getSpawnInterval = () => (1.5 * CARD_SLOT / getSpeed()) * 1000  // ms

    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        if (!pausedRef.current) {
          const lc = makeCard()
          if (lc) setLiveCards(prev => [...prev, lc])
        }
        scheduleNext()
      }, getSpawnInterval())
    }

    // Pre-fill belt with cards already in motion
    const w = containerRef.current?.getBoundingClientRect().width ?? 500
    const speed = getSpeed()
    const spacing = 1.5 * CARD_SLOT
    const fullDist = w + CARD_W * 2
    const initial: LiveCard[] = []
    let x = w - CARD_W  // rightmost visible position
    while (x > -(CARD_W + 20)) {
      const card = pickCard()
      if (!card) break
      const remainDist = x + CARD_W + 20
      const remainDur = remainDist / speed
      const elapsed = fullDist / speed - remainDur
      initial.push({
        id: String(++uidCounter),
        card,
        startX: x,
        endX: -(CARD_W + 20),
        dur: remainDur,
        born: Date.now() - elapsed * 1000,
        sold: false,
      })
      x -= spacing
    }
    if (initial.length > 0) setLiveCards(initial)

    // Schedule next spawn after the rightmost card would have fully exited
    scheduleNext()

    return () => clearTimeout(timeoutId)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative select-none">
      <p className="text-amber-600/70 text-[11px] font-bold px-4 mb-1.5 tracking-widest uppercase">
        {label}
      </p>

      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          height: 112,
          borderTop: '7px solid #57534e',
          borderBottom: '7px solid #57534e',
          background: 'linear-gradient(to bottom, #292524 0%, #1c1917 30%, #1c1917 70%, #292524 100%)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0, transparent 110px, rgba(87,83,78,0.35) 110px, rgba(87,83,78,0.35) 112px)',
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-5 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)' }}
        />

        {liveCards.map(lc => (
          <motion.div
            key={lc.id}
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: 0 }}
            initial={{ x: lc.startX }}
            animate={{ x: lc.endX }}
            transition={{ duration: lc.dur, ease: 'linear' }}
            onAnimationComplete={() =>
              setLiveCards(prev => prev.filter(c => c.id !== lc.id))
            }
          >
            {lc.sold ? (
              // 購入済みの皿（この皿だけが空になる）
              <div
                style={{
                  width: CARD_W,
                  height: CARD_W,
                  borderRadius: '50%',
                  border: '3px dashed rgba(87,83,78,0.5)',
                  background: 'rgba(0,0,0,0.2)',
                }}
              />
            ) : (
              <SushiPlate
                card={lc.card}
                onClick={() => {
                  const elapsed = (Date.now() - lc.born) / 1000
                  onSelect(
                    lc.card,
                    Math.max(0, lc.dur - elapsed),
                    () => setLiveCards(prev => prev.map(c => c.id === lc.id ? { ...c, sold: true } : c)),
                  )
                }}
              />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
