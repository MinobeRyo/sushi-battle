import { useRef } from 'react'
import type { Card } from '../../types'
import { SushiPlate } from './SushiPlate'

const CARD_SLOT = 90 + 32  // plate width + gap-8
const PADDING_LEFT = 24    // px-6

type Props = {
  label: string
  cards: Card[]
  excludeIds: Set<string>
  duration: number
  paused: boolean
  onSelect: (card: Card, timeToExit: number) => void
}

export function ConveyorLane({ label, cards, excludeIds, duration, paused, onSelect }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const doubled = [...cards, ...cards]

  const calcTimeToExit = (index: number): number => {
    const el = trackRef.current
    if (!el) return 8

    const matrix = new DOMMatrix(window.getComputedStyle(el).transform)
    const currentX = matrix.m41  // 現在のX offset（負の値）

    // 皿の中心が画面左端を超えるまでの残りpx
    const cardCenterX = PADDING_LEFT + index * CARD_SLOT + 45 + currentX
    if (cardCenterX <= 0) return 0  // すでに画面外

    const speed = (cards.length * CARD_SLOT) / duration  // px/s
    return cardCenterX / speed
  }

  return (
    <div className="relative select-none">
      <p className="text-amber-600/70 text-[11px] font-bold px-4 mb-1.5 tracking-widest uppercase">
        {label}
      </p>

      <div
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

        <div
          ref={trackRef}
          className="flex items-center gap-8 px-6 absolute inset-y-0 left-0"
          style={{
            animation: `conveyor ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
            width: 'max-content',
          }}
        >
          {doubled.map((card, i) =>
            excludeIds.has(card.id) ? (
              <div
                key={`${card.id}-${i}`}
                style={{
                  width: 90, height: 90, borderRadius: '50%', flexShrink: 0,
                  border: '3px dashed rgba(87,83,78,0.5)',
                  background: 'rgba(0,0,0,0.2)',
                }}
              />
            ) : (
              <SushiPlate
                key={`${card.id}-${i}`}
                card={card}
                onClick={() => onSelect(card, calcTimeToExit(i))}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
