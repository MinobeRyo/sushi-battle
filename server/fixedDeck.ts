import { CARDS } from '../src/data/cards'
import type { Card } from '../src/types'

// 通信の試遊段階は両者同じ構成。購入・ドラフトの通信対応は別段階で行う。
export const FIXED_DECK_IDS = [
  'tamago', 'tamago', 'tamago', 'cheese', 'cheese',
  'salmon', 'salmon', 'inari', 'inari',
  'tuna_salad_gunkan', 'tuna_salad_gunkan', 'corn_gunkan', 'corn_gunkan',
  'ebi_avocado', 'mentaiko', 'kappa_maki',
] as const

export function fixedDeck(): Card[] {
  return FIXED_DECK_IDS.map(id => {
    const card = CARDS.find(candidate => candidate.id === id)
    if (!card) throw new Error(`Unknown fixed deck card: ${id}`)
    return card
  })
}
