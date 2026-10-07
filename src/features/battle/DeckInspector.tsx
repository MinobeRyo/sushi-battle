import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SushiArt } from '../../components/SushiArt'
import { ScreenPager } from '../../components/ScreenPager'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import type { DeckSummaryEntry } from '../../game/deckSummary'
import { ARCH_LABEL, getCardEffectDescription } from './battlePresentation'
import './BattleCards.css'
import './DeckInspector.css'

// 手番・表示するプレイヤーが変わると、呼び出し側のkeyで閉じた状態に戻す。
export function DeckInspector({ entries, count, showName = false }: { entries: DeckSummaryEntry[]; count: number; showName?: boolean }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="battle-deck-trigger"
      aria-label={`自分の山札を確認、残り${count}枚`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>
      {showName && <span>山札</span>}<strong>{count}</strong><span>枚</span>{!showName && <span className="battle-deck-trigger__label">確認</span>}
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
  const bodyRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef(0)
  const titleId = useId()
  const noteId = useId()
  const compact = useCompactLandscape()
  const [page, setPage] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [effectPage, setEffectPage] = useState(0)
  const detailButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const lastSelectedKeyRef = useRef<string | null>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const pageSize = 8
  const pages = Math.max(1, Math.ceil(entries.length / pageSize))
  const currentPage = Math.min(page, pages - 1)
  const visibleEntries = compact ? entries.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : entries
  const selected = entries.find(entry => JSON.stringify(entry.card) === selectedKey)
  const effectLines = selected ? getCardEffectDescription(selected.card).split('\n') : []
  const effectPages = Math.max(1, Math.ceil(effectLines.length / 4))
  const currentEffectPage = Math.min(effectPage, effectPages - 1)
  const returnToList = () => { setSelectedKey(null); setEffectPage(0) }

  useEffect(() => {
    if (selectedKey) backRef.current?.focus({ preventScroll: true })
    else if (lastSelectedKeyRef.current) {
      if (bodyRef.current) bodyRef.current.scrollTop = listScrollRef.current
      detailButtonsRef.current.get(lastSelectedKeyRef.current)?.focus({ preventScroll: true })
    }
  }, [selectedKey])

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
    onCancel={event => { event.preventDefault(); if (selected) returnToList(); else onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <header className="battle-deck-dialog__heading">
      <div className="battle-deck-dialog__title">
        {selected && <button ref={backRef} type="button" onClick={returnToList}>‹ 一覧へ</button>}
        <div>
          <h2 id={titleId}>{selected ? selected.card.name : <>自分の山札 <span>残り<strong>{count}</strong>枚</span></>}</h2>
          <p id={noteId}>{selected ? `山札に${selected.count}枚 · APは現在値、攻撃は基本値` : `${entries.length}種類 · AP順 · 引く順番は非公開`}</p>
        </div>
      </div>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="山札確認を閉じる">閉じる</button>
    </header>
    <div ref={bodyRef} className={`battle-deck-dialog__body${selected ? ' battle-deck-dialog__body--detail' : ''}`} role="region" aria-label={selected ? 'カードの内容' : '山札に残っているカード'}>
      {selected ? <>
        <div className="battle-deck-detail__visual">
          <div className="battle-deck-detail__art" aria-hidden="true"><SushiArt card={selected.card} size="100%" fit /></div>
          <div className="battle-deck-detail__tags">{selected.card.archetype.map(arch => <span key={arch}>{ARCH_LABEL[arch]}</span>)}</div>
        </div>
        <div className="battle-deck-detail__content">
          <dl className="battle-deck-detail__stats">
            <div><dt>AP</dt><dd>{selected.card.cost}</dd></div>
            <div><dt>基本攻撃</dt><dd>{selected.card.attack}</dd></div>
            <div><dt>{selected.card.type === 'persist' ? '持続' : '種類'}</dt><dd>{selected.card.type === 'persist' ? `${selected.card.fullness}T` : '即時'}</dd></div>
          </dl>
          <p className="battle-deck-detail__effect">{(compact ? effectLines.slice(currentEffectPage * 4, currentEffectPage * 4 + 4) : effectLines).join('\n')}</p>
        </div>
      </> : entries.length === 0 ? <p className="battle-deck-dialog__empty">山札は空です</p> : <ul className="battle-deck-list">
        {visibleEntries.map(({ card, count: copies }) => <li key={JSON.stringify(card)} className="battle-deck-card" data-card-type={card.type} data-card-variant={card.variant}>
          <button type="button" className="battle-deck-card__open" data-last-selected={lastSelectedKeyRef.current === JSON.stringify(card)} aria-label={`${card.name}、AP${card.cost}、残り${copies}枚の詳細`}
            ref={button => { const key = JSON.stringify(card); if (button) detailButtonsRef.current.set(key, button); else detailButtonsRef.current.delete(key) }}
            onClick={() => { listScrollRef.current = bodyRef.current?.scrollTop ?? 0; if (bodyRef.current) bodyRef.current.scrollTop = 0; lastSelectedKeyRef.current = JSON.stringify(card); setEffectPage(0); setSelectedKey(JSON.stringify(card)) }}>
            <span className="battle-deck-card__art" aria-hidden="true"><SushiArt card={card} size="100%" fit tight /></span>
            <span className="battle-deck-card__name">{card.name}</span>
            <span className="battle-deck-card__count">×{copies}<span className="sr-only">枚</span></span>
            <span className="battle-deck-card__more">詳細 ›</span>
          </button>
        </li>)}
      </ul>}
    </div>
    {compact && (selected
      ? <ScreenPager page={currentEffectPage} pages={effectPages} onPageChange={setEffectPage} label="効果の続き" counterLabel="効果" />
      : <ScreenPager page={currentPage} pages={pages} onPageChange={setPage} label="山札一覧のページ切替" />)}
  </dialog>
}
