import type { Card } from '../../types'
import { CARDS } from '../../data/cards'
import { canMakeUnlucky, createRareCorn, createUnluckyCard } from '../../data/cardVariants'
import type { RandomSource } from '../../game/types'
import { isSideMenuId, SIDE_MENU_BY_ID } from '../../data/sideMenus'
import type { SideMenuId } from '../../data/sideMenus'

export const DRAFT_MAX_CARDS = 20
export const SHINKANSEN_TOTAL = 3
export const OMAKASE_PRICE = 500
export const OMAKASE_VALUE = 750
export const OMAKASE_COUNT = 3
export const OMAKASE_UNLUCKY_CHANCE = 0.20
export const OMAKASE_RARE_CHANCE = 0.03

// 同じ寿司が含まれてもよい、定価合計750円の3皿セット。
const OMAKASE_SETS: Card[][] = []
for (let a = 0; a < CARDS.length; a++) {
  for (let b = a; b < CARDS.length; b++) {
    for (let c = b; c < CARDS.length; c++) {
      const set = [CARDS[a], CARDS[b], CARDS[c]]
      if (set.every(card => card.price > 0) && set.some(canMakeUnlucky)
        && set.reduce((total, card) => total + card.price, 0) === OMAKASE_VALUE) OMAKASE_SETS.push(set)
    }
  }
}

export type DraftState = {
  budget: number
  deck: Card[]
  shinkansenLeft: number
  shinkansenPlate: { card: Card; orderId: string } | null
  purchasedIds: string[]
  deadlineAt: number
  completed: boolean
  sideMenu: SideMenuId | null
  sideMenuEnabled: boolean
  omakaseCards: Card[] | null
}

type Rejection = 'completed' | 'expired' | 'duplicate' | 'full' | 'budget' | 'delivery_pending' | 'orders_used' | 'no_delivery'
  | 'side_menu_disabled' | 'side_menu_owned' | 'invalid_side_menu' | 'omakase_used' | 'omakase_unavailable'
export type DraftChange = { state: DraftState; accepted: boolean; reason?: Rejection }

// 時刻は呼び出し側から受け取る。ブラウザにも将来の対戦サーバーにも依存しない。
export function createDraftState(budget: number, seconds: number, now: number, sideMenuEnabled = true): DraftState {
  return {
    budget, deck: [], shinkansenLeft: SHINKANSEN_TOTAL, shinkansenPlate: null,
    purchasedIds: [], deadlineAt: now + Math.max(0, seconds) * 1000, completed: false,
    sideMenu: null, sideMenuEnabled, omakaseCards: null,
  }
}

export function purchaseSideMenu(state: DraftState, id: SideMenuId, now: number): DraftChange {
  if (state.completed) return reject(state, 'completed')
  if (now >= state.deadlineAt) return reject(state, 'expired')
  if (!state.sideMenuEnabled) return reject(state, 'side_menu_disabled')
  if (!isSideMenuId(id)) return reject(state, 'invalid_side_menu')
  if (state.sideMenu !== null) return reject(state, 'side_menu_owned')
  if (state.shinkansenLeft <= 0) return reject(state, 'orders_used')
  const menu = SIDE_MENU_BY_ID[id]
  if (state.budget < menu.price) return reject(state, 'budget')
  return {
    accepted: true,
    state: { ...state, budget: state.budget - menu.price, sideMenu: id, shinkansenLeft: state.shinkansenLeft - 1 },
  }
}

export function draftSecondsLeft(state: DraftState, now: number) {
  return Math.max(0, Math.ceil((state.deadlineAt - now) / 1000))
}

export function shinkansenPrice(card: Card) {
  return Math.ceil((card.price * 1.5) / 50) * 50
}

function reject(state: DraftState, reason: Rejection): DraftChange {
  return { state, accepted: false, reason }
}

function purchaseRejection(state: DraftState, purchaseId: string, price: number, now: number): Rejection | undefined {
  if (state.completed) return 'completed'
  if (now >= state.deadlineAt) return 'expired'
  if (state.purchasedIds.includes(purchaseId)) return 'duplicate'
  if (state.deck.length >= DRAFT_MAX_CARDS) return 'full'
  if (state.budget < price) return 'budget'
}

export function purchaseBeltCard(state: DraftState, offerId: string, card: Card, now: number): DraftChange {
  const purchaseId = `belt:${offerId}`
  const reason = purchaseRejection(state, purchaseId, card.price, now)
  if (reason) return reject(state, reason)
  return {
    accepted: true,
    state: {
      ...state, budget: state.budget - card.price, deck: [...state.deck, card],
      purchasedIds: [...state.purchasedIds, purchaseId],
    },
  }
}

export function orderShinkansen(state: DraftState, orderId: string, card: Card, now: number): DraftChange {
  const purchaseId = `shinkansen:${orderId}`
  const price = shinkansenPrice(card)
  const reason = purchaseRejection(state, purchaseId, price, now)
  if (reason) return reject(state, reason)
  if (state.shinkansenPlate) return reject(state, 'delivery_pending')
  if (state.shinkansenLeft <= 0) return reject(state, 'orders_used')
  return {
    accepted: true,
    state: {
      ...state, budget: state.budget - price, deck: [...state.deck, card],
      purchasedIds: [...state.purchasedIds, purchaseId], shinkansenLeft: state.shinkansenLeft - 1,
      shinkansenPlate: { card, orderId },
    },
  }
}

// 受領は配送表示を消すだけ。所有権は支払い時点で確定している。
export function pickupShinkansen(state: DraftState): DraftChange {
  if (state.completed) return reject(state, 'completed')
  if (!state.shinkansenPlate) return reject(state, 'no_delivery')
  return { accepted: true, state: { ...state, shinkansenPlate: null } }
}

export function completeDraft(state: DraftState): DraftChange {
  if (state.completed) return reject(state, 'completed')
  return { accepted: true, state: { ...state, completed: true } }
}

/** 抽選はすべての購入条件が確定してから一度だけ行います。 */
export function orderOmakase(state: DraftState, now: number, random: RandomSource): DraftChange {
  if (state.completed) return reject(state, 'completed')
  if (now >= state.deadlineAt) return reject(state, 'expired')
  if (state.omakaseCards !== null) return reject(state, 'omakase_used')
  if (state.shinkansenLeft <= 0) return reject(state, 'orders_used')
  if (state.deck.length + OMAKASE_COUNT > DRAFT_MAX_CARDS) return reject(state, 'full')
  if (state.budget < OMAKASE_PRICE) return reject(state, 'budget')
  if (!OMAKASE_SETS.length) return reject(state, 'omakase_unavailable')
  const cards = OMAKASE_SETS[Math.floor(random() * OMAKASE_SETS.length)].slice()
  const outcome = random()
  if (outcome < OMAKASE_RARE_CHANCE) {
    const index = Math.floor(random() * cards.length)
    cards[index] = createRareCorn(cards[index].price)
  } else if (outcome < OMAKASE_RARE_CHANCE + OMAKASE_UNLUCKY_CHANCE) {
    const candidates = cards.map((card, index) => ({ card, index })).filter(({ card }) => canMakeUnlucky(card))
    const chosen = candidates[Math.floor(random() * candidates.length)]
    cards[chosen.index] = createUnluckyCard(chosen.card)
  }
  return {
    accepted: true,
    state: { ...state, budget: state.budget - OMAKASE_PRICE, deck: [...state.deck, ...cards], omakaseCards: cards, shinkansenLeft: state.shinkansenLeft - 1 },
  }
}
