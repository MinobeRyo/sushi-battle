import { useEffect, useState } from 'react'
import { RELIC_BY_ID, RELIC_GRADE_LABEL } from '../../data/runRelics'
import { SIDE_MENU_BY_ID } from '../../data/sideMenus'
import { MAX_RUN_BELLY, RUN_ARCHETYPES, actInfo, actOf, type RunState } from '../../game/run'
import { RunDebugPanel } from './RunDebugPanel'

/** 寿司はしごの画面上中央に出す小さな帯。持っている器はいつでも見られ、#debug のときはデバッグメニューも出す。 */
export function RunToolbar({ run, debug, onChange }: { run: RunState; debug: boolean; onChange: (run: RunState) => void }) {
  const [relicsOpen, setRelicsOpen] = useState(false)
  return (
    <>
      <div className="run-toolbar" role="toolbar" aria-label="寿司はしごの持ち物">
        <button type="button" onClick={() => setRelicsOpen(true)} aria-label={`持っている器${run.relics.length}個を見る`}>
          器 <b>{run.relics.length}</b>{run.sideMenu && <> ・一品 <b>1</b></>}
        </button>
        {debug && <RunDebugPanel run={run} onChange={onChange} />}
      </div>
      {relicsOpen && <RelicDialog run={run} onClose={() => setRelicsOpen(false)} />}
    </>
  )
}

function RelicDialog({ run, onClose }: { run: RunState; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const act = actOf(run)
  const archetypeName = (id: string) => RUN_ARCHETYPES.find(item => item.id === id)?.name ?? '汎用'
  const side = run.sideMenu ? SIDE_MENU_BY_ID[run.sideMenu] : null
  return (
    <div className="run-dialog-backdrop" onClick={onClose}>
      <div className="run-dialog" role="dialog" aria-modal="true" aria-labelledby="run-relic-heading" onClick={event => event.stopPropagation()}>
        <header>
          <h2 id="run-relic-heading">持っている器 {run.relics.length}個</h2>
          <button type="button" className="run-text-button" onClick={onClose} autoFocus>閉じる</button>
        </header>
        <p className="run-relic-summary">
          {act}幕「{actInfo(act).name}」・{archetypeName(run.archetype)}・お腹 {run.belly}/{MAX_RUN_BELLY}・持ち金 ¥{run.gold.toLocaleString()}・デッキ {run.deck.length}枚
        </p>
        <ul className="run-relic-list">
          {run.relics.length === 0 && <li className="run-relic-empty">まだ器を持っていません。常連さんや幕のボスに勝つと増えます。</li>}
          {run.relics.map(id => {
            const relic = RELIC_BY_ID[id]
            return (
              <li key={id} data-grade={relic.grade}>
                <span className="run-relic-grade">{RELIC_GRADE_LABEL[relic.grade]}</span>
                <span className="run-relic-body">
                  <strong>{relic.name}</strong><small>{archetypeName(relic.archetype)}</small>
                  <span>{relic.text}</span>
                </span>
              </li>
            )
          })}
          {side && (
            <li data-grade="side">
              <span className="run-relic-grade">一品</span>
              <span className="run-relic-body">
                <strong>{side.name}</strong><small>サイドメニュー・毎試合持ち込む</small>
                <span>{side.effect}</span>
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
