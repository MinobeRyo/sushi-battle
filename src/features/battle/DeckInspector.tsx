import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SushiArt } from '../../components/SushiArt'
import type { DeckSummaryEntry } from '../../game/deckSummary'
import { ARCH_LABEL, getCardEffectDescription } from './battlePresentation'
import './BattleCards.css'
import './DeckInspector.css'

// 手番・表示するプレイヤーが変わると、呼び出し側のkeyで閉じた状態に戻す。
export function DeckInspector({ entries, count }: { entries: DeckSummaryEntry[]; count: number }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="battle-deck-trigger"
      aria-label={`自分の山札を確認、残り${count}枚`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>
      <strong>{count}</strong><span>枚</span><span className="battle-deck-trigger__label">確認</span>
    </button>
    {open && createPortal(<DeckDialog entries={entries} count={count} onClose={() => setOpen(false)} />, document.body)}
  </>
}

function DeckDialog({ entries, count, onClose }: {
  entries: DeckSummaryEntry[]
  count: number
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const noteId = useId()

  useEffect(() => {
    const dialog = dialogRef.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={dialogRef} className="battle-deck-dialog" aria-labelledby={titleId} aria-describedby={noteId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <header className="battle-deck-dialog__heading">
      <div>
        <h2 id={titleId}>自分の山札 <span>残り<strong>{count}</strong>枚</span></h2>
        <p id={noteId}>AP順 · 引く順番は非公開</p>
      </div>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="山札確認を閉じる">閉じる</button>
    </header>
    <div className="battle-deck-dialog__body" role="region" aria-label="山札に残っているカード" tabIndex={0}>
      {entries.length === 0 ? <p className="battle-deck-dialog__empty">山札は空です</p> : <>
        <p className="battle-deck-dialog__guide">{entries.length}種類 · APは現在値、攻撃は基本値</p>
        <ul className="battle-deck-list">
          {entries.map(({ card, count: copies }) => {
            const effect = card.effect || card.id === 'namahamu' ? getCardEffectDescription(card) : null
            return <li key={JSON.stringify(card)} className="battle-deck-card" data-card-type={card.type} data-card-variant={card.variant}>
              <div className="battle-deck-card__heading">
                <div className="battle-deck-card__art" aria-hidden="true"><SushiArt card={card} size="100%" fit /></div>
                <div className="battle-deck-card__title">
                  <h3>{card.name}</h3>
                  <p>{card.type === 'persist' ? `持続 ${card.fullness}ターン` : '即時型'}</p>
                </div>
                <strong className="battle-deck-card__count">×{copies}<span className="sr-only">枚</span></strong>
              </div>
              <div className="battle-deck-card__stats"><span>AP <strong>{card.cost}</strong></span><span>攻撃 <strong>{card.attack}</strong></span></div>
              <div className="battle-deck-card__tags">{card.archetype.map(arch => <span key={arch}>{ARCH_LABEL[arch]}</span>)}</div>
              {effect ? <details className="battle-deck-card__effect">
                <summary>効果を見る</summary>
                {effect && <p>{effect}</p>}
              </details> : <p className="battle-deck-card__no-effect">特殊効果なし</p>}
            </li>
          })}
        </ul>
      </>}
    </div>
  </dialog>
}
