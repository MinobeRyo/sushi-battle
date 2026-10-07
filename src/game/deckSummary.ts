import type { Card } from '../types'
import type { CardInstance } from './types'

export type DeckSummaryEntry = { card: Card; count: number }

// 山札の順序・個体ID・内部プロパティを含めず、種類ごとの残数だけを公開する。
export function summarizeDeck(deck: readonly CardInstance[]): DeckSummaryEntry[] {
  const entries = new Map<string, DeckSummaryEntry>()
  for (const card of deck) {
    const publicCard: Card = {
      id: card.id, name: card.name, base: card.base,
      ...(card.variant === undefined ? {} : { variant: card.variant }),
      ...(card.subBases === undefined ? {} : { subBases: [...card.subBases] }),
      topping: card.topping, type: card.type, cost: card.cost, price: card.price,
      attack: card.attack, fullness: card.fullness, effect: card.effect,
      archetype: [...card.archetype], lane: card.lane,
    }
    // 割引済み・訳あり個体は、同名でも異なる実際の数値で表示する。
    const key = JSON.stringify(publicCard)
    const entry = entries.get(key)
    if (entry) {
      entry.count += 1
      continue
    }
    entries.set(key, { card: publicCard, count: 1 })
  }
  return [...entries.entries()].sort(([keyA, a], [keyB, b]) => a.card.cost - b.card.cost
    || (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0)
    || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)).map(([, entry]) => entry)
}
