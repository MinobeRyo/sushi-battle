import type { RunNodeKind } from '../../game/run'
import { PLATE_KIND } from './plateKinds'

/** 窓から取った皿：蓋を開けたところ。お茶・ハプニング・買い物・対戦前の上に出す。 */
export function TakenPlate({ kind }: { kind: RunNodeKind }) {
  const plate = PLATE_KIND[kind]
  return (
    <section className="run-taken" data-boss={kind === 'boss' ? 'true' : undefined} aria-label={`窓から取った皿：${plate.name}`}>
      <div className="run-taken-belt" aria-hidden="true" />
      <span className="run-taken-lid run-taken-lid--side" aria-hidden="true" style={{ left: '9%' }} />
      <span className="run-taken-lid run-taken-lid--side" aria-hidden="true" style={{ right: '9%' }} />
      <span className="run-taken-plate" aria-hidden="true"
        style={{ borderColor: plate.rim, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 45%), ${plate.face}`, boxShadow: `0 5px 10px rgba(0,0,0,.6), inset 0 -5px ${plate.shade}`, color: plate.mark }}>
        {plate.ch}
      </span>
      <span className="run-taken-lid run-taken-lid--open" aria-hidden="true" />
      <span className="run-taken-label">{kind === 'boss' ? '最後に回ってきた大皿' : '窓から取った皿'}</span>
    </section>
  )
}

/** 勝った皿の山（報酬画面）。 */
export function PlateStack({ count }: { count: number }) {
  const colors = ['#e9b3ab', '#dfebe2', '#f2df9c', '#cfe0ee', '#d7c9ee']
  const shown = Math.min(count, 6)
  return (
    <div className="run-stack" aria-hidden="true">
      <span className="run-stack-pile">
        {Array.from({ length: shown }, (_, i) => (
          <i key={i} style={{ bottom: `${i * 12}px`, background: colors[i % colors.length] }} />
        ))}
      </span>
      <span className="run-stack-label">勝った皿 {count}枚</span>
    </div>
  )
}

const RESULT_COLORS = [
  { face: '#e9b3ab', side: '#a7746d', rim: '#795350' },
  { face: '#dfebe2', side: '#a6b5aa', rim: '#7f9185' },
  { face: '#f2df9c', side: '#bfad6c', rim: '#ab954f' },
  { face: '#cfe0ee', side: '#9db3c6', rim: '#4f6a8a' },
]

/** 結果画面：食べた皿の山と判子（お会計は皿の数）。 */
export function ResultStack({ won, count }: { won: boolean; count: number }) {
  const shown = Math.min(Math.max(count, 1), 10)
  const ink = won ? '#fff7e0' : '#fff'
  return (
    <div className="run-result-stack" aria-hidden="true">
      <svg viewBox="0 0 160 200" width="160" height="200">
        <ellipse cx="80" cy="186" rx="64" ry="9" fill="rgba(0,0,0,.45)" />
        {Array.from({ length: shown }, (_, i) => {
          const c = RESULT_COLORS[i % 4], yt = 170 - i * 15, yb = yt + 8
          return (
            <g key={i}>
              <ellipse cx="80" cy={yb} rx="56" ry="12" fill={c.side} stroke={c.rim} strokeWidth="1.5" />
              <rect x="24" y={yt} width="112" height="8" fill={c.side} />
              <ellipse cx="80" cy={yt} rx="56" ry="12" fill={c.face} stroke={c.rim} strokeWidth="1.5" />
              <ellipse cx="80" cy={yt} rx="38" ry="6.5" fill="none" stroke={c.rim} strokeWidth="1.5" opacity=".45" />
            </g>
          )
        })}
      </svg>
      <span className="run-result-hanko" style={{ background: won ? '#b8842a' : '#a73b2c', color: ink, outlineColor: ink }}>{won ? '祝' : '満'}</span>
      <span className="run-stack-label">食べた皿 {count}枚</span>
    </div>
  )
}
