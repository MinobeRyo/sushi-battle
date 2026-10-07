import { useEffect, useId, useRef, useState } from 'react'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import { ScreenPager } from '../../components/ScreenPager'
import { battleStatusDetails, type BattleSideStatus } from './battleStatusModel'

export function BattleStatusDialog({ label, status, ap, maxAP, handCount, deckCount, onClose }: {
  label: string
  status: BattleSideStatus
  ap: number
  maxAP: number
  handCount: number
  deckCount: number
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { effects, combos } = battleStatusDetails(status)
  const compact = useCompactLandscape()
  const [page, setPage] = useState(0)
  const entries = [...effects.map(item => ({ ...item, category: '有効な効果' })), ...combos.map(item => ({ ...item, category: 'コンボ' }))]
  const pages = Math.max(1, entries.length)
  const currentPage = Math.min(page, pages - 1)

  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  return <dialog ref={dialog} className="battle-status-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="battle-status-dialog-content">
      <header>
        <div><p>対戦状況</p><h2 id={titleId}>{label}の状態</h2></div>
        <button autoFocus type="button" onClick={onClose} aria-label="状態を閉じる">閉じる ×</button>
      </header>
      <div className="battle-status-totals">
        <span>AP <strong>{ap} / {maxAP}</strong></span>
        <span>手札 <strong>{handCount}枚</strong></span>
        <span>山札 <strong>{deckCount}枚</strong></span>
      </div>
      {compact ? <>
        <dl className="battle-status-pages">
          {entries.slice(currentPage, currentPage + 1).map(entry => <div key={`${entry.category}:${entry.id}`}>
            <dt><small>{entry.category}</small><strong>{entry.name}</strong><span>{entry.value}</span></dt>
            <dd style={{ whiteSpace: 'pre-line' }}>{entry.description}</dd>
          </div>)}
        </dl>
        <ScreenPager page={currentPage} pages={pages} onPageChange={setPage} />
      </> : <><section aria-label="ストックと有効な効果">
        <h3>ストックと有効な効果</h3>
        <dl className="battle-effects-list">
          {effects.map(effect => <div key={effect.id}>
            <dt>{effect.name}</dt><dd><strong>{effect.value}</strong><p style={{ whiteSpace: 'pre-line' }}>{effect.description}</p></dd>
          </div>)}
        </dl>
      </section>
      <section aria-label="コンボの進捗">
        <h3>コンボの進捗</h3>
        <dl className="battle-combos-list">
          {combos.map(combo => <div key={combo.id}>
            <dt>{combo.name}<span>{combo.value}</span></dt><dd style={{ whiteSpace: 'pre-line' }}>{combo.description}</dd>
          </div>)}
        </dl>
      </section>
      </>}
    </div>
  </dialog>
}
