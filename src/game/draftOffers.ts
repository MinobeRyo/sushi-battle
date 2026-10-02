import type { Card } from '../types'
import { SIDE_MENUS } from '../data/sideMenus'
import type { SideMenuId } from '../data/sideMenus'

// オンラインではサーバーの経過時間から皿の位置と周回を決める。
export const ONLINE_LANES = {
  general: { slots: 10, durationMs: 32_000 / 1.2 },
  build: { slots: 12, durationMs: 16_000 / 1.2 },
} as const
export type DraftLane = keyof typeof ONLINE_LANES
export type DraftOffer = {
  id: string; lane: DraftLane; slot: number; generation: number; sold: boolean
} & ({ card: Card; sideMenuId?: never } | { card?: never; sideMenuId: SideMenuId })
export type DraftLaneClock = { pausedMs: number; pausedAt: number | null; pauseUntil: number | null }

// 汎用レーンの10皿中2皿をサイドに使う。全品を順繰りに流し、ローカル・通信で同じ並びになる。
export function sideMenuForBeltSlot(lane: DraftLane, slot: number, generation: number, enabled: boolean): SideMenuId | null {
  if (!enabled || lane !== 'general' || (slot !== 3 && slot !== 7)) return null
  const offset = slot === 3 ? 0 : 1
  return SIDE_MENUS[(generation * 2 + offset) % SIDE_MENUS.length].id
}
// hoverは更新が途絶えると自然に解除する。締切の時計はこの補正を使用しない。
export const DRAFT_HOVER_LEASE_MS = 3000

export function onlineLaneElapsed(startedAt: number, clock: DraftLaneClock, now: number) {
  const currentPause = clock.pausedAt === null || clock.pauseUntil === null
    ? 0 : Math.max(0, Math.min(now, clock.pauseUntil) - clock.pausedAt)
  return Math.max(0, now - startedAt - clock.pausedMs - currentPause)
}
export const BELT_SPACING = 2.3
export const BELT_LEFT = -12

export function onlinePlatePosition(lane: DraftLane, slot: number, elapsedMs: number) {
  const config = ONLINE_LANES[lane]
  const width = config.slots * BELT_SPACING
  const distance = 1 + slot * BELT_SPACING - Math.max(0, elapsedMs) / config.durationMs * width
  const generation = Math.max(0, Math.ceil(-distance / width))
  return { generation, x: BELT_LEFT + distance + generation * width }
}
