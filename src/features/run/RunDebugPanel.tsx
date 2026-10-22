import { useState } from 'react'
import { CARDS } from '../../data/cards'
import { RELICS, type RelicId } from '../../data/runRelics'
import { RUN_EVENTS } from '../../data/runEvents'
import { RUN_ACT_COUNT, aburiDeckId, actInfo, actOf, canAburiDeckId, type RunState } from '../../game/run'
import {
  debugAburiAll, debugAddCard, debugAddRelic, debugBelly, debugFinishBattle, debugGold, debugJump, debugNextAct,
  type DebugJumpKind,
} from '../../game/runDebug'

const JUMPS: ReadonlyArray<readonly [DebugJumpKind, string]> = [
  ['battle', '大食い客'], ['regular', '常連さん'], ['rest', 'お茶'], ['shop', '買い物'], ['boss', '幕のボス'],
]

/** アドレスに #debug を付けたときだけ出る、寿司はしごのデバッグメニュー。 */
export function RunDebugPanel({ run, onChange }: { run: RunState; onChange: (run: RunState) => void }) {
  const [open, setOpen] = useState(false)
  const [eventId, setEventId] = useState(RUN_EVENTS[0].id)
  const [relicId, setRelicId] = useState<RelicId>(RELICS[0].id)
  const [cardId, setCardId] = useState(CARDS[0].id)
  const [aburi, setAburi] = useState(false)
  const act = actOf(run)
  if (!open) {
    return <button type="button" className="run-debug-toggle" onClick={() => setOpen(true)}>🛠 デバッグ</button>
  }
  const openRelics = RELICS.filter(relic => !run.relics.includes(relic.id))
  return (
    <aside className="run-debug" aria-label="デバッグメニュー">
      <header>
        <strong>🛠 デバッグ</strong>
        <span>{act}幕「{actInfo(act).name}」・{run.status}</span>
        <button type="button" onClick={() => setOpen(false)}>閉じる</button>
      </header>

      <section>
        <h3>マスへ飛ぶ</h3>
        <div className="run-debug-row">
          {JUMPS.map(([kind, label]) => <button type="button" key={kind} onClick={() => onChange(debugJump(run, kind))}>{label}</button>)}
        </div>
        <div className="run-debug-row">
          <select value={eventId} onChange={event => setEventId(event.target.value)} aria-label="ハプニング">
            {RUN_EVENTS.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
          <button type="button" onClick={() => onChange(debugJump(run, 'event', Math.random, eventId))}>このハプニングへ</button>
        </div>
        <div className="run-debug-row">
          <button type="button" disabled={run.status !== 'battle'} onClick={() => onChange(debugFinishBattle(run, true))}>この試合を勝ちに</button>
          <button type="button" disabled={run.status !== 'battle'} onClick={() => onChange(debugFinishBattle(run, false))}>負けに</button>
          <button type="button" disabled={act >= RUN_ACT_COUNT} onClick={() => onChange(debugNextAct(run))}>次の幕へ</button>
        </div>
      </section>

      <section>
        <h3>持ち物</h3>
        <div className="run-debug-row">
          <button type="button" onClick={() => onChange(debugGold(run, 500))}>持ち金 +500</button>
          <button type="button" onClick={() => onChange(debugGold(run, 3000))}>+3000</button>
          <span>お腹</span>
          {[0, 50, 90].map(value => <button type="button" key={value} onClick={() => onChange(debugBelly(run, value))}>{value}</button>)}
        </div>
        <div className="run-debug-row">
          <select value={relicId} onChange={event => setRelicId(event.target.value as RelicId)} aria-label="器">
            {openRelics.map(relic => <option key={relic.id} value={relic.id}>{relic.name}（{relic.text}）</option>)}
          </select>
          <button type="button" disabled={openRelics.length === 0} onClick={() => onChange(debugAddRelic(run, openRelics.some(relic => relic.id === relicId) ? relicId : openRelics[0].id))}>器を足す</button>
        </div>
        <div className="run-debug-row">
          <select value={cardId} onChange={event => setCardId(event.target.value)} aria-label="寿司">
            {CARDS.map(card => <option key={card.id} value={card.id}>{card.name}（AP{card.cost}・攻{card.attack}）</option>)}
          </select>
          <label><input type="checkbox" checked={aburi} onChange={event => setAburi(event.target.checked)} />炙り</label>
          <button type="button" onClick={() => onChange(debugAddCard(run, aburi && canAburiDeckId(cardId) ? aburiDeckId(cardId) : cardId))}>寿司を足す</button>
          <button type="button" onClick={() => onChange(debugAburiAll(run))}>全部炙る</button>
        </div>
      </section>
    </aside>
  )
}
