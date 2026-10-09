import { useEffect, useId, useRef } from 'react'
import type { SideMenuState } from '../../game/types'
import { SIDE_MENU_BY_ID } from '../../data/sideMenus'
import { SideMenuArt } from './SideMenuArt'
import './BattleSideMenuSlot.css'

export function BattleSideMenuSlot({ label, menu, canAct = false, ap = 0, maxAP = 0, onUse, detailsResetKey }: {
  label: string
  menu: SideMenuState | null
  canAct?: boolean
  ap?: number
  maxAP?: number
  onUse?: () => void
  detailsResetKey?: string
}) {
  const instanceId = useId()
  const detailsRef = useRef<HTMLDivElement>(null)
  const detailsId = `${instanceId}-details`
  // 防御やプレイヤー交代の画面より前に説明が残らないようにする。
  useEffect(() => {
    if (detailsRef.current?.matches(':popover-open')) detailsRef.current.hidePopover()
  }, [detailsResetKey, menu?.id])
  const dish = menu ? SIDE_MENU_BY_ID[menu.id] : null
  const isRamen = menu?.id === 'ramen'
  const isInstant = menu?.id === 'karaage' || menu?.id === 'chawanmushi'
  const status = !menu ? '' : menu.status === 'used' ? '使用済み'
    : menu.status === 'expired' ? '効果終了'
      : menu.status === 'ready' ? '未使用'
        : isRamen ? '発動中' : '設置中'
  const finished = menu?.status === 'used' || menu?.status === 'expired'
  const passive = menu?.status === 'active' && !isRamen
  const blockedReason = finished ? 'この一皿は使用終了です'
    : passive ? '購入時から設置され、効果が続いています'
      : !canAct ? '自分のターンに使用できます'
        : isRamen && menu?.usedThisTurn ? 'このターンは使用済みです'
          : isRamen && ap >= maxAP ? 'APが満タンです' : undefined
  const actionLabel = isRamen ? 'AP＋1' : isInstant ? '使う 0AP' : '設置 0AP'
  const showAction = !!onUse && !!menu && !finished && !passive

  return <section className="battle-side-slot" aria-label={`${label}のサイドメニュースロット`}
    data-state={menu?.status ?? 'empty'} data-owner={!!onUse}>
    <header className="battle-side-heading">
      <h2>サイドメニュー</h2>
      <span className="battle-side-state">{menu ? status : '未購入'}</span>
    </header>
    {menu && dish ? <>
      <button type="button" className="battle-side-inspect" popoverTarget={detailsId}
        aria-label={`${dish.name}の効果を確認`}>
        <span className="battle-side-art"><SideMenuArt id={menu.id} decorative /></span>
        <strong className="battle-side-name">{dish.name}</strong>
        {isRamen && menu.status === 'active' && <span className="battle-side-remaining">残り {menu.turnsLeft} ターン</span>}
        {isRamen && menu.status === 'active' && menu.usedThisTurn && !onUse
          && <span className="battle-side-used">今ターン使用済み</span>}
        <span className="battle-side-hint">効果を確認</span>
      </button>
      {showAction && <div className="battle-side-action-area">
        <button type="button" className="battle-side-use" disabled={!!blockedReason}
          aria-label={`${dish.name}：${actionLabel}`}
          aria-describedby={`${instanceId}-effect${blockedReason ? ` ${instanceId}-reason` : ''}`}
          onClick={() => { if (!blockedReason) onUse?.() }}>{actionLabel}</button>
        {blockedReason && <p className="battle-side-action-reason" id={`${instanceId}-reason`}>{blockedReason}</p>}
      </div>}
      <div id={detailsId} ref={detailsRef} popover="auto" role="dialog" className="battle-side-details"
        aria-labelledby={`${instanceId}-name`}>
        <header>
          <h3 id={`${instanceId}-name`}>{dish.name}</h3>
          <button type="button" popoverTarget={detailsId} popoverTargetAction="hide"
            aria-label="効果の説明を閉じる">閉じる</button>
        </header>
        <div className="battle-side-detail-art"><SideMenuArt id={menu.id} decorative /></div>
        <div className="battle-side-detail-copy">
        <p id={`${instanceId}-effect`}>{dish.effect}</p>
        <p className="battle-side-timing">{dish.timing}</p>
        {isRamen && <p>初回の使用で効果が始まります。自分のターン終了ごとに残りが1減り、使用しなかったターンも数えます。</p>}
        {finished && <p>この一皿は使用終了です。{isInstant && '使い切りの再購入は、後半の購入タイムに選べます（計2品まで）。'}</p>}
        </div>
      </div>
    </> : <div className="battle-side-empty"><p>専用1枠<br />購入タイムごとに1品</p></div>}
  </section>
}
