import type { Card } from '../types'

// オンラインではサーバーの経過時間から皿の位置と周回を決める。
export const ONLINE_LANES = {
  general: { slots: 10, durationMs: 32_000 / 1.2 },
  build: { slots: 12, durationMs: 16_000 / 1.2 },
} as const
export type DraftLane = keyof typeof ONLINE_LANES
export type DraftOffer = { id: string; lane: DraftLane; slot: number; generation: number; card: Card; sold: boolean }
export const BELT_SPACING = 2.3
export const BELT_LEFT = -12

export function onlinePlatePosition(lane: DraftLane, slot: number, elapsedMs: number) {
  const config = ONLINE_LANES[lane]
  const width = config.slots * BELT_SPACING
  const distance = 1 + slot * BELT_SPACING - Math.max(0, elapsedMs) / config.durationMs * width
  const generation = Math.max(0, Math.ceil(-distance / width))
  return { generation, x: BELT_LEFT + distance + generation * width }
}
