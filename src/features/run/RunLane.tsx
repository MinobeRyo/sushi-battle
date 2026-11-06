import { useEffect, useState } from 'react'
import {
  BOSS_NODE_ID, LANE_ROTATE_BELLY, actInfo, actOf, findNode, lanePicksLeft, laneWindow, reachableNodeIds,
  type RunNode, type RunState,
} from '../../game/run'
import { REGULAR_SKILL_BY_ID } from '../../data/runRelics'
import { PLATE_KIND } from './plateKinds'


// レーンの形：上から見た楕円のベルト（390×502 の座標で描き、幅に合わせて縮める）。
const W = 390, H = 502, CX = 195, R = 126, S = 150, Y_TOP = 177, Y_BOTTOM = 327
const HALF = Math.PI * R / 2, LENGTH = 2 * Math.PI * R + 2 * S

/** ベルト上の位置（0 = 手前の真ん中。窓は -1・0・+1 の席）。 */
function beltPoint(distance: number) {
  let s = ((distance % LENGTH) + LENGTH) % LENGTH
  if (s < HALF) { const f = s / R; return { x: CX + R * Math.sin(f), y: Y_BOTTOM + R * Math.cos(f) } }
  s -= HALF
  if (s < S) return { x: CX + R, y: Y_BOTTOM - s }
  s -= S
  if (s < Math.PI * R) { const p = s / R; return { x: CX + R * Math.cos(p), y: Y_TOP - R * Math.sin(p) } }
  s -= Math.PI * R
  if (s < S) return { x: CX - R, y: Y_TOP + s }
  s -= S
  const f = s / R
  return { x: CX - R * Math.cos(f), y: Y_BOTTOM + R * Math.sin(f) }
}

function enemyNote(node: RunNode | undefined) {
  if (!node) return ''
  if (node.kind === 'regular') return '得意技を持つ強敵。勝つと器ももらえる'
  if (node.kind === 'battle') return '通常のCPUと対戦'
  if (node.kind === 'rest') return 'お腹 −30、または寿司1枚を炙る'
  if (node.kind === 'event') return '寿司屋あるある'
  if (node.kind === 'shop') return '寿司を買う・下げてもらう'
  const skill = node.enemy?.skill ? REGULAR_SKILL_BY_ID[node.enemy.skill] : null
  return skill ? skill.text : `幕のボス「${node.enemy?.label ?? ''}」`
}

/** 回転レーンが地図。窓の3枚から1枚を取るか、レーンを回す。 */
export function RunLane({ run, onTake, onRotate }: { run: RunState; onTake: (id: string) => void; onRotate: () => void }) {
  const lane = run.lane!
  const reachable = reachableNodeIds(run)
  const [selected, setSelected] = useState<string | null>(reachable[Math.min(1, reachable.length - 1)] ?? null)
  // 窓が変わったら、真ん中（なければ最初）の皿を選び直す。
  useEffect(() => {
    setSelected(current => current && reachable.includes(current) ? current : reachable[Math.min(1, reachable.length - 1)] ?? null)
  }, [reachable.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const seats = lane.order.length
  const windowIds = laneWindow(lane)
  const seen = new Set(lane.seen ?? [])
  const bossReady = lanePicksLeft(lane) === 0
  const act = actOf(run)
  const selectedNode = findNode(run, selected)

  return (
    <section className="run-lane-screen" aria-label="回転レーン">
      <div className="run-lane-belt" style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="run-lane-ring" aria-hidden="true" />
        <div className="run-lane-board" aria-hidden="true" />
        <div className="run-lane-window" aria-hidden="true" />
        <span className="run-lane-window-label" aria-hidden="true">いま取れる</span>
        <ul className="run-lane-plates">
          {lane.order.map((id, seat) => {
            const offset = ((seat - lane.front - 1) % seats + seats) % seats
            const slot = offset > seats / 2 ? offset - seats : offset
            const point = beltPoint(slot * (LENGTH / seats))
            const node = id ? findNode(run, id) : undefined
            const inWindow = id !== null && windowIds.includes(id)
            const isBoss = id === BOSS_NODE_ID
            const size = isBoss ? 70 : 54
            const state = !id ? 'empty' : isBoss ? 'boss' : inWindow ? 'open' : seen.has(id) ? 'missed' : 'lid'
            const kind = node ? PLATE_KIND[node.kind] : null
            const label = !id ? '空いた席' : isBoss ? `大皿（${actInfo(act).boss.name}）${bossReady ? '・いま挑める' : '・最後に回ってくる'}`
              : state === 'lid' ? '蓋をした皿' : `${state === 'missed' ? '見送った皿' : '窓の皿'} ${kind!.name}`
            return (
              <li key={`${seat}:${id ?? 'empty'}`} aria-label={label} className="run-lane-plate" data-state={state}
                data-picked={id !== null && id === selected ? 'true' : undefined}
                style={{ left: `${(point.x - size / 2) / W * 100}%`, top: `${(point.y - size / 2) / H * 100}%`, width: `${size / W * 100}%` }}>
                {(state === 'open' || state === 'missed') && kind && (() => {
                  const face = (
                    <span className="run-lane-plate-face" style={{ borderColor: kind.rim, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 45%), ${kind.face}`, boxShadow: `0 3px 6px rgba(0,0,0,.6), inset 0 -3px ${kind.shade}`, color: kind.mark }}>
                      <span aria-hidden="true">{kind.ch}</span>
                    </span>
                  )
                  return state === 'open'
                    ? <button type="button" className="run-lane-plate-button" aria-label={`${kind.name}を選ぶ`} aria-pressed={id === selected} onClick={() => setSelected(id)}>{face}</button>
                    : face
                })()}
                {state === 'boss' && <span className="run-lane-plate-face run-lane-plate-boss" data-ready={bossReady}><span aria-hidden="true">将</span></span>}
                {state === 'lid' && <span className="run-lane-plate-lid" aria-hidden="true" />}
              </li>
            )
          })}
        </ul>
        <div className="run-lane-sign">
          <p>第{act}幕</p>
          <strong>{actInfo(act).name}</strong>
          <span>{bossReady ? <>大皿が<br /><b>回ってきた</b></> : <>大皿まで<br /><b>あと{lanePicksLeft(lane)}皿</b></>}</span>
        </div>
      </div>

      <div className="run-lane-hand">
        <ul className="run-lane-chips" aria-label="窓の皿">
          {reachable.map(id => {
            const node = findNode(run, id)!
            const kind = PLATE_KIND[node.kind]
            return (
              <li key={id}>
                <button type="button" aria-pressed={selected === id} onClick={() => setSelected(id)}>
                  <span aria-hidden="true" style={{ borderColor: kind.rim, background: kind.face, color: kind.mark }}>{kind.ch}</span>
                  <strong>{node.kind === 'boss' ? node.enemy?.label ?? kind.name : kind.name}</strong>
                </button>
              </li>
            )
          })}
          {reachable.length === 0 && <li className="run-lane-chips-empty">窓に取れる皿がありません。レーンを回してください。</li>}
        </ul>
        <p className="run-lane-note" aria-live="polite">{selectedNode ? enemyNote(selectedNode) : '　'}</p>
        <div className="run-lane-actions">
          <button type="button" className="run-lane-rotate" onClick={onRotate} disabled={bossReady}>
            レーンを回す<small>お腹 +{LANE_ROTATE_BELLY}</small>
          </button>
          <button type="button" className="run-primary run-lane-take" disabled={!selected} onClick={() => selected && onTake(selected)}>
            {bossReady ? '大皿に挑む' : 'この皿を取る'}
          </button>
        </div>
        <p className="run-lane-help">窓の3枚から1枚だけ取れます。見送った皿は一周して戻ってきます。</p>
      </div>
    </section>
  )
}
