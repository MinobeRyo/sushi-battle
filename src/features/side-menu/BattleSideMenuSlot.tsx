import { useId } from 'react'
import type { SideMenuState } from '../../game/types'
import { SIDE_MENU_BY_ID } from '../../data/sideMenus'
import { SideMenuArt } from './SideMenuArt'
import './BattleSideMenuSlot.css'

export function BattleSideMenuSlot({ label, menu, canAct = false, ap = 0, maxAP = 0, onUse }: {
  label: string
  menu: SideMenuState | null
  canAct?: boolean
  ap?: number
  maxAP?: number
  onUse?: () => void
}) {
  const instanceId = useId()
  const dish = menu ? SIDE_MENU_BY_ID[menu.id] : null
  const isRamen = menu?.id === 'ramen'
  const isInstant = menu?.id === 'karaage' || menu?.id === 'chawanmushi'
  const status = !menu ? '' : menu.status === 'used' ? '使用済み'
    : menu.status === 'expired' ? '効果終了'
      : menu.status === 'ready' ? '未使用'
        : '発動中'
  const finished = menu?.status === 'used' || menu?.status === 'expired'
  const passive = menu?.status === 'active' && !isRamen
  const blockedReason = finished ? 'この試合では使い切りました'
    : passive ? '設置した効果が続いています'
      : !canAct ? '自分のターンに使用できます'
        : isRamen && menu?.usedThisTurn ? 'このターンは使用済みです'
          : isRamen && ap >= maxAP ? 'APが満タンです' : undefined
  const actionLabel = isRamen ? 'AP＋1' : isInstant ? '使う 0AP' : '設置 0AP'
  const showAction = !!onUse && !!menu && !finished && !passive

  return <section className="battle-side-slot" aria-label={`${label}のサイドメニュースロット`}
    data-state={menu?.status ?? 'empty'} data-owner={!!onUse}>
    <header className="battle-side-heading">
      <h2>{label}のサイド</h2>
      {menu && <span className="battle-side-state">
        {isRamen && menu.status === 'active'
          ? <>{onUse ? '自分' : '相手'}の残り <strong>{menu.turnsLeft}</strong> ターン</> : status}
      </span>}
    </header>
    {menu && dish ? <>
      <div className="battle-side-main">
        <div className="battle-side-art"><SideMenuArt id={menu.id} decorative /></div>
        <div className="battle-side-content">
          <h3 id={`${instanceId}-name`}>{dish.name}</h3>
          <p id={`${instanceId}-effect`}>{dish.summary}</p>
        </div>
        {showAction && <div className="battle-side-action-area">
          {blockedReason && <p className="battle-side-action-reason" id={`${instanceId}-reason`}>{blockedReason}</p>}
          <button type="button" className="battle-side-use" disabled={!!blockedReason}
            aria-label={`${dish.name}：${actionLabel}`}
            aria-describedby={`${instanceId}-effect${blockedReason ? ` ${instanceId}-reason` : ''}`}
            onClick={() => { if (!blockedReason) onUse?.() }}>{actionLabel}</button>
        </div>}
      </div>
      <details className="battle-side-details" key={menu.id}>
        <summary>効果の詳細</summary>
        <div>
          <p>{dish.effect}</p>
          <p className="battle-side-timing">{dish.timing}</p>
          {isRamen && <p>初回の使用で効果が始まります。自分のターン終了ごとに残りが1減り、使用しなかったターンも数えます。</p>}
          {finished && <p>この試合では使い切りました。追加購入・交換はできません。</p>}
        </div>
      </details>
    </> : <p className="battle-side-empty">未購入</p>}
  </section>
}
