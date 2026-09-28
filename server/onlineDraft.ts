import { randomUUID } from 'node:crypto'
import { CARDS, getCardsByLane } from '../src/data/cards'
import { shuffled } from '../src/game/battleRules'
import { DRAFT_HOVER_LEASE_MS, ONLINE_LANES, onlineLaneElapsed, onlinePlatePosition } from '../src/game/draftOffers'
import type { DraftLane, DraftLaneClock, DraftOffer } from '../src/game/draftOffers'
import type { PlayerId, RandomSource } from '../src/game/types'
import type { Card } from '../src/types'
import { completeDraft, createDraftState, orderShinkansen, pickupShinkansen, purchaseBeltCard } from '../src/features/draft/draftEngine'
import type { DraftState } from '../src/features/draft/draftEngine'
import type { OnlineDraftAction, OnlineDraftHover, PublicDraft, Reply } from '../src/network/protocol'

type DraftPlayer = {
  state: DraftState; revision: number; offers: DraftOffer[]; bags: Record<DraftLane, Card[]>
  laneClocks: Record<DraftLane, DraftLaneClock>; hoverSequence: number
}
export type OnlineDraft = {
  id: string; mode: 'initial' | 'reorder'; startedAt: number; initialBudget: number
  players: Record<PlayerId, DraftPlayer>
}

export function createOnlineDraft(mode: OnlineDraft['mode'], now: number, random: RandomSource): OnlineDraft {
  const initialBudget = mode === 'initial' ? 3000 : 1500
  const player = (): DraftPlayer => ({
    state: createDraftState(initialBudget, mode === 'initial' ? 90 : 45, now), revision: 0,
    offers: [], bags: { general: [], build: [] },
    laneClocks: {
      general: { pausedMs: 0, pausedAt: null, pauseUntil: null },
      build: { pausedMs: 0, pausedAt: null, pauseUntil: null },
    }, hoverSequence: 0,
  })
  const draft: OnlineDraft = { id: randomUUID(), mode, startedAt: now, initialBudget, players: { 1: player(), 2: player() } }
  refreshOnlineDraft(draft, now, random)
  return draft
}

// UIを閉じていても締切は進む。各席の購入カードと特急配送は復帰時に保持する。
export function refreshOnlineDraft(draft: OnlineDraft, now: number, random: RandomSource): boolean {
  let changed = false
  for (const id of [1, 2] as const) {
    const player = draft.players[id]
    if (player.state.completed) continue
    if (now >= player.state.deadlineAt) {
      player.state = completeDraft(player.state).state
      player.revision++
      changed = true
      continue
    }
    for (const lane of ['general', 'build'] as const) {
      const clock = player.laneClocks[lane]
      if (clock.pauseUntil !== null && now >= clock.pauseUntil) {
        releaseLane(clock, now)
        changed = true
      }
      for (let slot = 0; slot < ONLINE_LANES[lane].slots; slot++) {
        const generation = onlinePlatePosition(lane, slot, onlineLaneElapsed(draft.startedAt, clock, now)).generation
        const index = player.offers.findIndex(offer => offer.lane === lane && offer.slot === slot)
        if (index >= 0 && player.offers[index].generation === generation) continue
        if (!player.bags[lane].length) player.bags[lane] = shuffled(getCardsByLane(lane), random)
        const offer: DraftOffer = {
          id: `${draft.id}:${id}:${lane}:${slot}:${generation}`, lane, slot, generation,
          card: player.bags[lane].pop()!, sold: false,
        }
        if (index < 0) player.offers.push(offer)
        else player.offers[index] = offer
        changed = true
      }
    }
  }
  return changed
}

export function publicDraft(draft: OnlineDraft, id: PlayerId): PublicDraft {
  const player = draft.players[id]
  const { purchasedIds: _, ...you } = player.state
  return {
    draftId: draft.id, mode: draft.mode, startedAt: draft.startedAt, initialBudget: draft.initialBudget,
    revision: player.revision, you, offers: player.offers,
    laneClocks: player.laneClocks,
    opponentCompleted: draft.players[id === 1 ? 2 : 1].state.completed,
  }
}

function releaseLane(clock: DraftLaneClock, now: number) {
  if (clock.pausedAt !== null && clock.pauseUntil !== null) {
    clock.pausedMs += Math.max(0, Math.min(now, clock.pauseUntil) - clock.pausedAt)
  }
  clock.pausedAt = null
  clock.pauseUntil = null
}

export function releaseDraftHover(draft: OnlineDraft, id: PlayerId, now: number) {
  const player = draft.players[id]
  for (const lane of ['general', 'build'] as const) releaseLane(player.laneClocks[lane], now)
  // 復帰した新しい接続は新しいhover操作列を開始できる。
  player.hoverSequence = 0
}

export function validDraftHover(value: unknown): value is OnlineDraftHover {
  if (!value || typeof value !== 'object') return false
  const hover = value as Record<string, unknown>
  return typeof hover.draftId === 'string' && hover.draftId.length > 0 && hover.draftId.length <= 200
    && Number.isSafeInteger(hover.sequence) && Number(hover.sequence) > 0
    && Array.isArray(hover.lanes) && hover.lanes.length <= 2
    && hover.lanes.every(lane => lane === 'general' || lane === 'build')
    && new Set(hover.lanes).size === hover.lanes.length
}

export function applyDraftHover(draft: OnlineDraft, id: PlayerId, hover: OnlineDraftHover, now: number): Reply {
  if (hover.draftId !== draft.id) return { ok: false, error: 'stale_draft' }
  const player = draft.players[id]
  if (player.state.completed) return { ok: false, error: 'draft_completed' }
  // 解除より遅れて到着したhoverや再送でレーンを再停止させない。
  if (hover.sequence <= player.hoverSequence) return { ok: true }
  player.hoverSequence = hover.sequence
  for (const lane of ['general', 'build'] as const) {
    const clock = player.laneClocks[lane]
    if (clock.pauseUntil !== null && now >= clock.pauseUntil) releaseLane(clock, now)
    if (hover.lanes.includes(lane)) {
      clock.pausedAt ??= now
      clock.pauseUntil = now + DRAFT_HOVER_LEASE_MS
    } else releaseLane(clock, now)
  }
  return { ok: true }
}

export function validDraftAction(value: unknown): value is OnlineDraftAction {
  if (!value || typeof value !== 'object') return false
  const action = value as Record<string, unknown>
  const validId = (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 200
  return validId(action.draftId) && validId(action.actionId)
    && Number.isSafeInteger(action.expectedRevision) && Number(action.expectedRevision) >= 0
    && (action.type === 'complete' || action.type === 'pickup'
      || (action.type === 'buy' && validId(action.offerId)) || (action.type === 'order' && validId(action.cardId)))
}

export function applyDraftAction(draft: OnlineDraft, id: PlayerId, action: OnlineDraftAction, now: number): Reply {
  if (action.draftId !== draft.id) return { ok: false, error: 'stale_draft' }
  const player = draft.players[id]
  if (action.expectedRevision !== player.revision) return { ok: false, error: 'stale_revision' }
  let result
  switch (action.type) {
    case 'buy': {
      const offer = player.offers.find(offer => offer.id === action.offerId)
      if (!offer) return { ok: false, error: 'draft_offer_expired' }
      result = purchaseBeltCard(player.state, offer.id, offer.card, now)
      if (result.accepted) offer.sold = true
      break
    }
    case 'order': {
      const card = CARDS.find(card => card.id === action.cardId)
      if (!card) return { ok: false, error: 'invalid_action' }
      result = orderShinkansen(player.state, action.actionId, card, now)
      break
    }
    case 'pickup': result = pickupShinkansen(player.state); break
    case 'complete': result = completeDraft(player.state); break
  }
  if (!result.accepted) return { ok: false, error: `draft_${result.reason}` }
  player.state = result.state
  player.revision++
  return { ok: true }
}
