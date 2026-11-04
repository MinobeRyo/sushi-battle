import type { RunNodeKind } from '../../game/run'
import { PLATE_KIND } from './plateKinds'

/** 窓から取った皿：蓋を開けたところ。お茶・ハプニング・買い物・対戦前の上に出す。 */
export function TakenPlate({ kind }: { kind: RunNodeKind }) {
  const plate = PLATE_KIND[kind]
  return (
    <section className="run-taken" aria-label={`窓から取った皿：${plate.name}`}>
      <div className="run-taken-belt" aria-hidden="true" />
      <span className="run-taken-lid run-taken-lid--side" aria-hidden="true" style={{ left: '9%' }} />
      <span className="run-taken-lid run-taken-lid--side" aria-hidden="true" style={{ right: '9%' }} />
      <span className="run-taken-plate" aria-hidden="true"
        style={{ borderColor: plate.rim, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 45%), ${plate.face}`, boxShadow: `0 5px 10px rgba(0,0,0,.6), inset 0 -5px ${plate.shade}`, color: plate.mark }}>
        {plate.ch}
      </span>
      <span className="run-taken-lid run-taken-lid--open" aria-hidden="true" />
      <span className="run-taken-label">窓から取った皿</span>
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
