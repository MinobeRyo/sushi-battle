import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createMatch, otherPlayer, transitionMatch } from '../src/game/matchEngine'
import type { MatchState, PlayerId, RandomSource } from '../src/game/types'
import type { JoinReply, OnlineAction, PublicComboEvent, PublicMatch, Reply, RoomSnapshot } from '../src/network/protocol'
import type { RoomEvent } from '../src/network/httpProtocol'
import { applyDraftAction, applyDraftHover, createOnlineDraft, publicDraft, refreshOnlineDraft, releaseDraftHover, validDraftAction, validDraftHover } from './onlineDraft'
import type { OnlineDraft } from './onlineDraft'

export type RoomPeer = {
  id: string
  data: { code?: string; playerId?: PlayerId }
  state: (snapshot: RoomSnapshot) => void
  closed: (reason: string) => void
}
type Seat = { token: string; peerId: string | null; expiry?: ReturnType<typeof setTimeout> }
type ProcessedAction = { fingerprint: string; reply: Reply }
type Room = {
  code: string
  seats: Partial<Record<PlayerId, Seat>>
  match: MatchState | null
  draft: OnlineDraft | null
  draftTimer?: ReturnType<typeof setInterval>
  rematch: Set<PlayerId>
  processed: Map<string, ProcessedAction>
  comboEvents: PublicComboEvent[]
}
const MAX_PROCESSED_ACTIONS = 4096
const MAX_ROOMS = 1000
const MAX_COMBO_EVENTS = 64

function publicMatch(match: MatchState, playerId: PlayerId, comboEvents: PublicComboEvent[]): PublicMatch {
  // 公開用オブジェクトは明示的に取り除いた値から作る。山札順・相手手札は送らない。
  const { deck, ...you } = match.players[playerId]
  const { hand: opponentHand, deck: opponentDeck, ...opponent } = match.players[otherPlayer(playerId)]
  return {
    matchId: match.matchId, revision: match.revision, activePlayerId: match.activePlayerId,
    turn: match.turn, phase: match.phase, pendingAttack: match.pendingAttack, winnerId: match.winnerId,
    you: { ...you, deckCount: deck.length },
    opponent: { ...opponent, handCount: opponentHand.length, deckCount: opponentDeck.length },
    log: match.log,
    comboEvents,
  }
}

function snapshot(room: Room, playerId: PlayerId): RoomSnapshot {
  return {
    code: room.code, playerId, serverNow: Date.now(),
    connected: { 1: Boolean(room.seats[1]?.peerId), 2: Boolean(room.seats[2]?.peerId) },
    rematchRequested: { 1: room.rematch.has(1), 2: room.rematch.has(2) },
    match: room.match ? publicMatch(room.match, playerId, room.comboEvents) : null,
    draft: room.draft ? publicDraft(room.draft, playerId) : null,
  }
}

function validAction(value: unknown): value is OnlineAction {
  if (!value || typeof value !== 'object') return false
  const action = value as Partial<OnlineAction>
  return typeof action.actionId === 'string' && action.actionId.length > 0 && action.actionId.length <= 128
    && typeof action.matchId === 'string' && action.matchId.length > 0 && action.matchId.length <= 128
    && Number.isSafeInteger(action.expectedRevision) && action.expectedRevision! >= 0
    && (action.type === 'end_turn' || action.type === 'use_side_menu'
      || (action.type === 'respond_defense' && typeof action.useGari === 'boolean') || (action.type === 'play_card'
      && typeof action.cardInstanceId === 'string' && action.cardInstanceId.length > 0 && action.cardInstanceId.length <= 200
      && (action.sacrificeCount === undefined || (Number.isSafeInteger(action.sacrificeCount) && action.sacrificeCount >= 0))
      && (action.targetFieldId === undefined || (typeof action.targetFieldId === 'string'
        && action.targetFieldId.length > 0 && action.targetFieldId.length <= 200))))
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function sameToken(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export function createRoomService({ resumeTtlMs, random }: { resumeTtlMs: number; random: RandomSource }) {
  const peers = new Map<string, RoomPeer>()
  const rooms = new Map<string, Room>()

  const sendState = (room: Room) => {
    for (const playerId of [1, 2] as const) {
      const seat = room.seats[playerId]
      if (seat?.peerId) peers.get(seat.peerId)?.state(snapshot(room, playerId))
    }
  }

  const closeRoom = (room: Room, reason: string) => {
    if (!rooms.delete(room.code)) return
    clearInterval(room.draftTimer)
    for (const playerId of [1, 2] as const) {
      const seat = room.seats[playerId]
      if (seat?.expiry) clearTimeout(seat.expiry)
      if (seat?.peerId) {
        const peer = peers.get(seat.peerId)
        if (peer?.data.code === room.code) {
          peer.data = {}
          peer.closed(reason)
        }
      }
    }
  }

  const currentRoom = (peer: RoomPeer) => {
    const { code, playerId } = peer.data
    const room = code ? rooms.get(code) : undefined
    if (!room || !playerId || room.seats[playerId]?.peerId !== peer.id) return null
    return { room, playerId }
  }

  const finishDraftIfReady = (room: Room) => {
    const draft = room.draft
    if (!draft || !draft.players[1].state.completed || !draft.players[2].state.completed) return
    if (draft.mode === 'initial') {
      room.match = createMatch({ mode: 'two_player', matchId: randomUUID(),
        deck: draft.players[1].state.deck, p2Deck: draft.players[2].state.deck,
        sideMenu: draft.players[1].state.sideMenu, p2SideMenu: draft.players[2].state.sideMenu }, random)
    } else if (room.match) {
      // 購入は同時進行。共通エンジンへの反映だけ、要求される手番順に行う。
      while (room.match.phase === 'reorder' && room.match.reorderPlayerId) {
        const playerId: PlayerId = room.match.reorderPlayerId
        room.match = transitionMatch(room.match, {
          type: 'complete_reorder', playerId, cards: draft.players[playerId].state.deck,
        }, random).state
      }
    }
    room.draft = null
    clearInterval(room.draftTimer)
    delete room.draftTimer
  }

  const refreshDraft = (room: Room) => {
    if (!room.draft) return
    const changed = refreshOnlineDraft(room.draft, Date.now(), random)
    finishDraftIfReady(room)
    if (changed) sendState(room)
  }

  const startDraft = (room: Room, mode: OnlineDraft['mode']) => {
    clearInterval(room.draftTimer)
    if (mode === 'initial') { room.match = null; room.comboEvents = [] }
    room.draft = createOnlineDraft(mode, Date.now(), random)
    room.rematch.clear()
    room.draftTimer = setInterval(() => refreshDraft(room), 250)
    room.draftTimer.unref()
  }

  const joinSeat = (peer: RoomPeer, room: Room, playerId: PlayerId): JoinReply => {
    let seat = room.seats[playerId]
    if (!seat) {
      seat = { token: randomBytes(32).toString('hex'), peerId: null }
      room.seats[playerId] = seat
    }
    const previousPeerId = seat.peerId
    if (seat.expiry) clearTimeout(seat.expiry)
    delete seat.expiry
    seat.peerId = peer.id
    peer.data = { code: room.code, playerId }
    // 古い接続のdisconnect通知が新しい接続を切断扱いにしないよう、先に席を付け替える。
    if (previousPeerId && previousPeerId !== peer.id) {
      const previous = peers.get(previousPeerId)
      if (previous) {
        previous.data = {}
        previous.closed('replaced')
        disconnect(previous)
      }
    }
    if (!room.match && !room.draft && room.seats[1] && room.seats[2]) startDraft(room, 'initial')
    if (room.draft) releaseDraftHover(room.draft, playerId, Date.now())
    refreshDraft(room)
    sendState(room)
    return { ok: true, session: { code: room.code, playerId, token: seat.token }, snapshot: snapshot(room, playerId) }
  }

  const handle = (peer: RoomPeer, event: RoomEvent, payload?: unknown): JoinReply | Reply => {
    const request = payload as Record<string, unknown> | undefined
    switch (event) {
      case 'room:create': {
        const current = currentRoom(peer)
        // 応答が届かなかった同じ接続の再試行は、同じ参加情報を返す。
        if (current) return joinSeat(peer, current.room, current.playerId)
        if (rooms.size >= MAX_ROOMS) return { ok: false, error: 'server_full' }
        let code: string
        do { code = randomInt(0, 1_000_000).toString().padStart(6, '0') } while (rooms.has(code))
        const room: Room = { code, seats: {}, match: null, draft: null, rematch: new Set(), processed: new Map(), comboEvents: [] }
        rooms.set(code, room)
        return joinSeat(peer, room, 1)
      }
      case 'room:join': {
        if (!request || typeof request.code !== 'string' || !/^\d{6}$/.test(request.code.trim())) {
          return { ok: false, error: 'invalid_code' }
        }
        const code = request.code.trim()
        const current = currentRoom(peer)
        if (current) {
          if (current.room.code === code) return joinSeat(peer, current.room, current.playerId)
          return { ok: false, error: 'already_in_room' }
        }
        const room = rooms.get(code)
        if (!room) return { ok: false, error: 'room_not_found' }
        // 切断した席はTTL内は本人の復帰用に予約する。
        if (room.seats[2]) return { ok: false, error: 'room_full' }
        return joinSeat(peer, room, 2)
      }
      case 'room:resume': {
        if (!request || typeof request.code !== 'string' || !validToken(request.token)) {
          return { ok: false, error: 'invalid_token' }
        }
        const room = rooms.get(request.code.trim().toUpperCase())
        if (!room) return { ok: false, error: 'room_not_found' }
        const token = request.token
        const playerId = ([1, 2] as const).find(id => room.seats[id] && sameToken(room.seats[id]!.token, token))
        if (!playerId) return { ok: false, error: 'invalid_token' }
        const current = currentRoom(peer)
        if (current && (current.room !== room || current.playerId !== playerId)) {
          return { ok: false, error: 'already_in_room' }
        }
        return joinSeat(peer, room, playerId)
      }
      case 'room:leave': {
        const current = currentRoom(peer)
        if (!current) return { ok: false, error: 'not_in_room' }
        closeRoom(current.room, 'left')
        return { ok: true }
      }
      case 'draft:hover': {
        const current = currentRoom(peer)
        if (!current) return { ok: false, error: 'not_in_room' }
        if (!validDraftHover(payload)) return { ok: false, error: 'invalid_action' }
        const { room, playerId } = current
        refreshDraft(room)
        if (!room.draft) return { ok: false, error: 'draft_not_started' }
        const reply = applyDraftHover(room.draft, playerId, payload, Date.now())
        sendState(room)
        return reply
      }
      case 'draft:action': {
        const current = currentRoom(peer)
        if (!current) return { ok: false, error: 'not_in_room' }
        const { room, playerId } = current
        if (!validDraftAction(payload)) return { ok: false, error: 'invalid_action' }
        const action = payload
        const key = `draft:${playerId}:${action.actionId}`
        const fingerprint = JSON.stringify([action.draftId, action.expectedRevision, action.type,
          action.type === 'buy' ? action.offerId : action.type === 'order' ? action.cardId
            : action.type === 'buy_side_menu' ? action.sideMenuId : null])
        const previous = room.processed.get(key)
        refreshDraft(room)
        if (previous) {
          sendState(room)
          return previous.fingerprint === fingerprint ? previous.reply : { ok: false, error: 'action_id_conflict' }
        }
        if (!room.draft) return { ok: false, error: 'draft_not_started' }
        const reply = applyDraftAction(room.draft, playerId, action, Date.now())
        if (reply.ok) {
          room.processed.set(key, { fingerprint, reply })
          if (room.processed.size > MAX_PROCESSED_ACTIONS) room.processed.delete(room.processed.keys().next().value!)
          finishDraftIfReady(room)
        }
        sendState(room)
        return reply
      }
      case 'match:action': {
        const current = currentRoom(peer)
        if (!current) return { ok: false, error: 'not_in_room' }
        const { room, playerId } = current
        const action = payload
        if (!validAction(action)) return { ok: false, error: 'invalid_action' }
        const key = `${playerId}:${action.actionId}`
        const fingerprint = JSON.stringify([action.matchId, action.expectedRevision, action.type,
          action.cardInstanceId ?? null, action.useGari ?? null, action.sacrificeCount ?? 0, action.targetFieldId ?? null])
        const previous = room.processed.get(key)
        if (previous) {
          sendState(room)
          return previous.fingerprint === fingerprint ? previous.reply : { ok: false, error: 'action_id_conflict' }
        }
        if (!room.match) return { ok: false, error: 'match_not_started' }
        if (!room.seats[1]?.peerId || !room.seats[2]?.peerId) return { ok: false, error: 'players_disconnected' }
        if (room.match.matchId !== action.matchId || room.match.revision !== action.expectedRevision) {
          sendState(room)
          return { ok: false, error: room.match.matchId !== action.matchId ? 'stale_match' : 'stale_revision' }
        }
        const result = transitionMatch(room.match, action.type === 'play_card'
          ? { type: 'play_card', playerId, cardInstanceId: action.cardInstanceId!, sacrificeCount: action.sacrificeCount, targetFieldId: action.targetFieldId }
          : action.type === 'respond_defense'
            ? { type: 'respond_defense', playerId, useGari: action.useGari! }
          : { type: action.type, playerId }, random)
        if (result.error) return { ok: false, error: result.error }
        room.match = result.state
        // HTTPのpoll間に複数操作があっても発動を取りこぼさない。再送は上の処理済み判定で除外する。
        let sequence = room.comboEvents.at(-1)?.sequence ?? 0
        const combos = result.events.filter(event => event.type === 'combo').map(event => ({
          sequence: ++sequence, playerId: event.playerId, comboId: event.comboId,
        }))
        if (combos.length) room.comboEvents = [...room.comboEvents, ...combos].slice(-MAX_COMBO_EVENTS)
        if (room.match.phase === 'reorder') {
          startDraft(room, 'reorder')
        }
        const accepted: Reply = { ok: true }
        room.processed.set(key, { fingerprint, reply: accepted })
        if (room.processed.size > MAX_PROCESSED_ACTIONS) room.processed.delete(room.processed.keys().next().value!)
        sendState(room)
        return accepted
      }
      case 'match:rematch': {
        const current = currentRoom(peer)
        if (!current) return { ok: false, error: 'not_in_room' }
        const { room, playerId } = current
        if (room.match?.phase !== 'over') return { ok: false, error: 'match_not_over' }
        if (!room.seats[1]?.peerId || !room.seats[2]?.peerId) return { ok: false, error: 'players_disconnected' }
        room.rematch.add(playerId)
        if (room.rematch.size === 2) startDraft(room, 'initial')
        sendState(room)
        return { ok: true }
      }
    }
  }

  const disconnect = (peer: RoomPeer) => {
    peers.delete(peer.id)
    const current = currentRoom(peer)
    if (!current) return
    const { room, playerId } = current
    const seat = room.seats[playerId]!
    if (room.draft) releaseDraftHover(room.draft, playerId, Date.now())
    seat.peerId = null
    seat.expiry = setTimeout(() => {
      if (!seat.peerId) closeRoom(room, 'expired')
    }, resumeTtlMs)
    seat.expiry.unref()
    sendState(room)
  }

  return {
    connect(peer: RoomPeer) { peers.set(peer.id, peer) },
    handle,
    disconnect,
    hasRoom(code: string) { return rooms.has(code) },
    snapshot(peer: RoomPeer) {
      const current = currentRoom(peer)
      if (current) refreshDraft(current.room)
      return current ? snapshot(current.room, current.playerId) : undefined
    },
    close() {
      for (const room of [...rooms.values()]) closeRoom(room, 'server_shutdown')
      peers.clear()
    },
  }
}
