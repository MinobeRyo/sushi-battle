import { useEffect, useId, useRef } from 'react'
import { motion } from 'framer-motion'
import { SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import { SideMenuCard } from '../side-menu/SideMenuCard'
import { SHINKANSEN_TOTAL } from './draftEngine'
import './SideMenuPurchaseModal.css'

export type SideMenuPurchaseModalProps = {
  sideMenuId: SideMenuId
  budget: number
  purchasedSideMenu: SideMenuId | null
  enabled: boolean
  disabled?: boolean
  remainingOrders?: number
  onPurchase: () => void
  onClose: () => void
}

function focusableElements(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]') ?? [])
    .filter(element => !element.matches(':disabled') && element.tabIndex >= 0
      && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && !['hidden', 'collapse'].includes(getComputedStyle(element).visibility)
      && element.getClientRects().length > 0)
}

/** レーンの購入確認。決済と購入済み状態の更新は親画面が行います。 */
export function SideMenuPurchaseModal({
  sideMenuId, budget, purchasedSideMenu, enabled, disabled = false, remainingOrders = SHINKANSEN_TOTAL, onPurchase, onClose,
}: SideMenuPurchaseModalProps) {
  const titleId = useId()
  const noticeId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const menu = SIDE_MENU_BY_ID[sideMenuId]
  const blockedReason = purchasedSideMenu
    ? `${SIDE_MENU_BY_ID[purchasedSideMenu].name}を購入済み。今回の注文では1品までです。`
    : !enabled ? '未購入、または使用済みの使い切りのみ再注文できます（計2品まで）。'
      : disabled ? '通信または注文を確認中です。操作できるようになるまでお待ちください。'
        : remainingOrders <= 0 ? '共通の注文枠3回を使い切りました。'
        : budget < menu.price ? `残金が不足しています。購入にはあと${(menu.price - budget).toLocaleString('ja-JP')}円必要です。`
          : undefined
  const canPurchase = blockedReason === undefined
  const buttonLabel = purchasedSideMenu ? '購入済み' : !enabled ? '追加購入不可'
    : disabled ? '確認中…' : remainingOrders <= 0 ? '注文枠なし' : budget < menu.price ? '残金不足' : `購入 ¥${menu.price.toLocaleString('ja-JP')}`

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => (focusableElements(dialogRef.current)[0] ?? dialogRef.current)?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      const elements = focusableElements(root)
      const first = elements[0], last = elements[elements.length - 1]
      if (!first || !last) { event.preventDefault(); root?.focus(); return }
      if (!root?.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return <motion.div className="side-menu-purchase-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    exit={{ opacity: 0 }} onClick={onClose}>
    <section className="side-menu-purchase-dialog" ref={dialogRef} role="dialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={noticeId} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <header className="side-menu-purchase-header">
        <div><p>レーンのサイドメニュー</p><h2 id={titleId}>{menu.name}を購入</h2></div>
        <button type="button" onClick={onClose} aria-label="購入確認を閉じる">閉じる ×</button>
      </header>
      <div className="side-menu-purchase-body">
        <SideMenuCard id={sideMenuId} price={menu.price} disabled={!canPurchase} />
        <p className="side-menu-purchase-notice" id={noticeId} role="status" data-blocked={!canPurchase}>
          {blockedReason ?? `注文枠を1回使用（あと${remainingOrders}回）。寿司の20枚枠は使いません。`}
        </p>
      </div>
      <footer className="side-menu-purchase-footer">
        <div className="side-menu-purchase-budget"><span>残金</span><strong>¥{budget.toLocaleString('ja-JP')}</strong></div>
        <div className="side-menu-purchase-actions">
          <button type="button" className="side-menu-purchase-cancel" onClick={onClose}>レーンに戻る</button>
          <button type="button" className="side-menu-purchase-confirm" disabled={!canPurchase}
            aria-label={`${menu.name}：${buttonLabel}`} aria-describedby={noticeId}
            onClick={() => { if (canPurchase) onPurchase() }}>{buttonLabel}</button>
        </div>
      </footer>
    </section>
  </motion.div>
}
