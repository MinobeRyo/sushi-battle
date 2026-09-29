import { SIDE_MENU_BY_ID, type SideMenuId } from '../../data/sideMenus'
import { SideMenuArt } from '../side-menu/SideMenuArt'
import './DraftSideMenuButton.css'

export function DraftSideMenuButton({ sideMenu, enabled = false, disabled = false, onClick, className = '' }: {
  sideMenu?: SideMenuId | null
  enabled?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}) {
  const name = sideMenu ? SIDE_MENU_BY_ID[sideMenu].name : 'サイドメニュー'
  const detail = sideMenu ? '購入済み · 専用1枠' : enabled ? '全6品 · 300円 · 1品だけ' : '追加購入はできません'
  return <button type="button" className={`draft-side-menu-button ${className}`} disabled={disabled} onClick={onClick}
    aria-haspopup="dialog" aria-label={`${name}。${detail}。サイドメニューを開く`}>
    <SideMenuArt id={sideMenu ?? 'ramen'} />
    <span><strong>{name}</strong><small>{detail}</small></span>
    <b aria-hidden="true">›</b>
  </button>
}
