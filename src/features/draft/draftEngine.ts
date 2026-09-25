import type { Card } from '../../types'

export const DRAFT_MAX_CARDS = 20
export const SHINKANSEN_TOTAL = 3

export type DraftState = {
  budget: number
  deck: Card[]
  shinkansenLeft: number
  shinkansenPlate: { card: Card; orderId: string } | null
  purchasedIds: string[]
  deadlineAt: number
  completed: boolean
}

type Rejection = 'completed' | 'expired' | 'duplicate' | 'full' | 'budget' | 'delivery_pending' | 'orders_used' | 'no_delivery'
type DraftChange = { state: DraftState; accepted: boolean; reason?: Rejection }

// 時刻は呼び出し側から受け取る。ブラウザにも将来の対戦サーバーにも依存しない。
export function createDraftState(budget: number, seconds: number, now: number): DraftState {
  return {
    budget, deck: [], shinkansenLeft: SHINKANSEN_TOTAL, shinkansenPlate: null,
    purchasedIds: [], deadlineAt: now + Math.max(0, seconds) * 1000, completed: false,
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
