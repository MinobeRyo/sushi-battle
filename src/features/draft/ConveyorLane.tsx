import type { Card } from '../../types'
import { SushiPlate } from './SushiPlate'

type Props = {
  label: string
  cards: Card[]
  duration: number   // seconds for one full loop
  paused: boolean
  onSelect: (card: Card) => void
}

export function ConveyorLane({ label, cards, duration, paused, onSelect }: Props) {
  // 2倍にして seamless ループ
  const doubled = [...cards, ...cards]

  return (
    <div className="relative select-none">
      <p className="text-amber-600/70 text-[11px] font-bold px-4 mb-1.5 tracking-widest uppercase">
        {label}
      </p>

      {/* ベルト */}
      <div
        className="relative overflow-hidden"
        style={{
          height: 112,
          borderTop: '7px solid #57534e',
          borderBottom: '7px solid #57534e',
          background: 'linear-gradient(to bottom, #292524 0%, #1c1917 30%, #1c1917 70%, #292524 100%)',
        }}
      >
        {/* ベルトの横線模様 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0, transparent 88px, rgba(87,83,78,0.4) 88px, rgba(87,83,78,0.4) 90px)',
          }}
        />

        {/* 上部光沢 */}
        <div
          className="absolute inset-x-0 top-0 h-5 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)' }}
        />

        {/* 皿の列 */}
        <div
          className="flex items-center gap-4 px-4 absolute inset-y-0 left-0"
          style={{
            animation: `conveyor ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
            width: 'max-content',
          }}
        >
          {doubled.map((card, i) => (
            <SushiPlate
              key={`${card.id}-${i}`}
              card={card}
              onClick={() => onSelect(card)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
