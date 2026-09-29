import type { SideMenuState } from '../../game/types'
import { SideMenuCard } from './SideMenuCard'
import './BattleSideMenuSlot.css'

export function BattleSideMenuSlot({ label, menu, canAct = false, ap = 0, maxAP = 0, onUse }: {
  label: string
  menu: SideMenuState | null
  canAct?: boolean
  ap?: number
  maxAP?: number
  onUse?: () => void
}) {
  const isRamen = menu?.id === 'ramen'
  const isInstant = menu?.id === 'karaage' || menu?.id === 'chawanmushi'
  const status = !menu ? '' : menu.status === 'used' ? '使用済み'
    : menu.status === 'expired' ? '効果終了'
      : menu.status === 'ready' ? '未使用'
        : isRamen ? `残り自分${menu.turnsLeft}ターン` : '効果発動中'
  const finished = menu?.status === 'used' || menu?.status === 'expired'
  const passive = menu?.status === 'active' && !isRamen
  const blockedReason = finished ? 'この試合では使い切りました'
    : passive ? '設置した効果が続いています'
      : !canAct ? '自分のターンに使用できます'
        : isRamen && menu?.usedThisTurn ? 'このターンは使用済みです'
          : isRamen && ap >= maxAP ? 'APを使うと回復できます' : undefined
  const actionLabel = isRamen ? 'お腹＋5でAPを1回復'
    : isInstant ? 'この一皿を使う · 0AP' : 'フィールドに設置 · 0AP'

  return <section className="battle-side-slot" aria-label={`${label}のサイドメニュースロット`}>
    <header><h2>{label}のサイド</h2><span>専用1枠</span></header>
    {menu ? <>
      <SideMenuCard id={menu.id} compact status={status}
        disabled={!!blockedReason} disabledReason={onUse && !finished && !passive ? blockedReason : undefined}
        actionLabel={actionLabel} onAction={onUse && !finished && !passive ? onUse : undefined} />
      {menu.id === 'ramen' && !finished && <p className="battle-side-hint">{menu.status === 'ready' ? '初回の使用から3ターン。使用したターンも含みます。' : '自分のターン終了で残り時間が1減ります。使用は任意です。'}</p>}
      {menu.id === 'karaage' && !finished && <p className="battle-side-hint">自分も満腹になります。同時に100に達した場合は使用した側の敗北です。</p>}
      {finished && <p className="battle-side-hint">追加購入・交換はできません。</p>}
    </> : <p className="battle-side-empty">サイドメニューは未購入です。<span>最初の注文タブレットで1品選べます。</span></p>}
  </section>
}
