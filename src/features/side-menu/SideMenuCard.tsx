import { useId } from 'react'
import type { CSSProperties } from 'react'
import { SideMenuArt } from './SideMenuArt'
import { SIDE_MENU_CATALOG } from './sideMenuCatalog'
import type { SideMenuId } from './sideMenuCatalog'
import './SideMenuCard.css'

export type SideMenuCardProps = {
  id: SideMenuId
  price?: number
  status?: string
  disabled?: boolean
  /** 操作できない理由。disabled 時に画面へ表示し、ボタンの説明にも関連付けます。 */
  disabledReason?: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
  presentation?: 'default' | 'shop'
  className?: string
}

const LIFETIME: Record<SideMenuId, string> = {
  karaage: '1回使い切り', fries: '常時', tempura: '常時', ramen: '3ターン', miso: '常時', chawanmushi: '1回使い切り',
}

/** 購入・発動の判定は呼び出し元で行い、このコンポーネントは表示だけを担当します。 */
export function SideMenuCard({ id, price, status, disabled = false, disabledReason, actionLabel = '選ぶ', onAction, compact = false, presentation = 'default', className = '' }: SideMenuCardProps) {
  const instanceId = useId()
  const menu = SIDE_MENU_CATALOG.find(item => item.id === id)!
  const reason = disabled ? disabledReason || (onAction ? status || '現在は選択できません。' : null) : null
  const showStatus = status && status !== reason
  const timing = menu.timing === LIFETIME[id] ? null : menu.timing
  const style = { '--side-card-accent': menu.accent } as CSSProperties

  if (presentation === 'shop') return (
    <article className={`side-menu-card side-menu-card--shop${disabled ? ' side-menu-card--disabled' : ''}${className ? ` ${className}` : ''}`} style={style} aria-labelledby={`${instanceId}-name`} data-side-menu={id}>
      <div className="side-menu-card__shop-main">
        <div className="side-menu-card__shop-art"><SideMenuArt id={id} /></div>
        <div className="side-menu-card__shop-copy">
          <h3 className="side-menu-card__name" id={`${instanceId}-name`}>{menu.name}</h3>
          <p className="side-menu-card__shop-effect" id={`${instanceId}-effect`}>
            {menu.summary.split(/([＋−+-]?\d+)/).map((part, index) => /\d/.test(part) ? <strong key={index}>{part}</strong> : part)}
          </p>
          <span className="side-menu-card__shop-duration">{LIFETIME[id]}</span>
        </div>
      </div>
      <details className="side-menu-card__shop-details">
        <summary>詳しい効果・条件</summary>
        <div><p>{menu.effect}</p>{timing && <p>{timing}</p>}</div>
      </details>
      <div className="side-menu-card__shop-footer">
        {price !== undefined && <span className="side-menu-card__shop-price" aria-label={`価格 ${price.toLocaleString('ja-JP')}円`}>¥{price.toLocaleString('ja-JP')}</span>}
        {onAction && <button type="button" className="side-menu-card__action" disabled={disabled} onClick={onAction}
          aria-label={`${menu.name}：${reason || actionLabel}`} aria-describedby={`${instanceId}-effect`}>
          {reason || actionLabel}
        </button>}
      </div>
    </article>
  )

  return (
    <article className={`side-menu-card${compact ? ' side-menu-card--compact' : ''}${disabled ? ' side-menu-card--disabled' : ''}${className ? ` ${className}` : ''}`} style={style} aria-labelledby={`${instanceId}-name`} data-side-menu={id}>
      <div className="side-menu-card__artwork">
        <span className="side-menu-card__lifetime">{LIFETIME[id]}</span>
        <SideMenuArt id={id} className="side-menu-card__art" />
        {price !== undefined && <span className="side-menu-card__price" aria-label={`価格 ${price.toLocaleString('ja-JP')}円`}><small>¥</small>{price.toLocaleString('ja-JP')}</span>}
      </div>
      <div className="side-menu-card__body">
        <p className="side-menu-card__category">{menu.category}</p>
        <h3 className="side-menu-card__name" id={`${instanceId}-name`}>{menu.name}</h3>
        {compact ? <>
          <p className="side-menu-card__effect">{menu.summary}</p>
          <details className="side-menu-card__details"><summary>効果の詳細</summary>
            <p className="side-menu-card__effect" id={`${instanceId}-effect`}>{menu.effect}</p>
            {timing && <p className="side-menu-card__timing">{timing}</p>}
          </details>
        </> : <>
          <p className="side-menu-card__effect" id={`${instanceId}-effect`}>{menu.effect}</p>
          {timing && <p className="side-menu-card__timing">{timing}</p>}
        </>}
        {showStatus && <p className="side-menu-card__status">{status}</p>}
        {reason && <p className="side-menu-card__reason" id={`${instanceId}-reason`}>{reason}</p>}
      </div>
      {onAction && (
        <div className="side-menu-card__footer">
          <button type="button" className="side-menu-card__action" disabled={disabled} onClick={onAction} aria-label={`${menu.name}：${actionLabel}`} aria-describedby={`${instanceId}-effect${reason ? ` ${instanceId}-reason` : ''}`}>
            <span>{actionLabel}</span><span aria-hidden="true">{disabled ? '—' : '→'}</span>
          </button>
        </div>
      )}
    </article>
  )
}
