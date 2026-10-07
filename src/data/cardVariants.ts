import type { Card } from '../types'

/** 効果とコンボ判定に使うIDは元のカードを保ちます。 */
export function createUnluckyCard(card: Card): Card {
  const sideways = card.archetype.includes('gunkan')
  return {
    ...card,
    name: `${sideways ? '真横を向いた' : 'ネタが落ちた'}${card.name}`,
    attack: Math.floor(card.attack / 2),
    variant: sideways ? 'sideways' : 'neta_missing',
  }
}

export function canMakeUnlucky(card: Card): boolean {
  // 巻き寿司・いなり・単品のチーズは「ネタ落ち」の対象にしません。
  return card.archetype.includes('gunkan')
    || (!card.archetype.includes('makimono') && !['inari', 'cheese'].includes(card.id))
}

export function createRareCorn(price: number): Card {
  return {
    id: 'mayo_corn_sideways', name: '真横を向いたマヨコーン', base: 'コーン', topping: 'マヨ',
    type: 'instant', cost: 2, price, attack: 12, fullness: 0, effect: null,
    archetype: ['makimono', 'gunkan'], lane: 'general', variant: 'rare_corn',
  }
}
