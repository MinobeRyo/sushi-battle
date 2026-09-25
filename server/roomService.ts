import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createMatch, otherPlayer, transitionMatch } from '../src/game/matchEngine'
import type { MatchState, PlayerId, RandomSource } from '../src/game/types'
import type { JoinReply, OnlineAction, PublicMatch, Reply, RoomSnapshot } from '../src/network/protocol'
import type { RoomEvent } from '../src/network/httpProtocol'
import { fixedDeck } from './fixedDeck'

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
  rematch: Set<PlayerId>
  processed: Map<string, ProcessedAction>
}
const MAX_PROCESSED_ACTIONS = 4096
const MAX_ROOMS = 1000

function publicMatch(match: MatchState, playerId: PlayerId): PublicMatch {
  // 公開用オブジェクトは明示的に取り除いた値から作る。山札順・相手手札は送らない。
  const { deck, ...you } = match.players[playerId]
  const { hand: opponentHand, deck: opponentDeck, ...opponent } = match.players[otherPlayer(playerId)]
  return {
    matchId: match.matchId, revision: match.revision, activePlayerId: match.activePlayerId,
    turn: match.turn, phase: match.phase, winnerId: match.winnerId,
    you: { ...you, deckCount: deck.length },
    opponent: { ...opponent, handCount: opponentHand.length, deckCount: opponentDeck.length },
    log: match.log,
  }
}

function snapshot(room: Room, playerId: PlayerId): RoomSnapshot {
  return {
    code: room.code, playerId,
    connected: { 1: Boolean(room.seats[1]?.peerId), 2: Boolean(room.seats[2]?.peerId) },
    rematchRequested: { 1: room.rematch.has(1), 2: room.rematch.has(2) },
    match: room.match ? publicMatch(room.match, playerId) : null,
  }
}

function validAction(value: unknown): value is OnlineAction {
  if (!value || typeof value !== 'object') return false
  const action = value as Partial<OnlineAction>
  return typeof action.actionId === 'string' && action.actionId.length > 0 && action.actionId.length <= 128
    && typeof action.matchId === 'string' && action.matchId.length > 0 && action.matchId.length <= 128
    && Number.isSafeInteger(action.expectedRevision) && action.expectedRevision! >= 0
    && (action.type === 'end_turn' || (action.type === 'play_card'
      && typeof action.cardInstanceId === 'string' && action.cardInstanceId.length > 0 && action.cardInstanceId.length <= 200))
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

  const startMatch = (room: Room) => {
    room.match = createMatch({ mode: 'two_player', matchId: randomUUID(), deck: fixedDeck(), p2Deck: fixedDeck() }, random)
    room.rematch.clear()
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
    if (!room.match && room.seats[1] && room.seats[2]) startMatch(room)
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
        const room: Room = { code, seats: {}, match: null, rematch: new Set(), processed: new Map() }
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
      case 'match:action': {
        const current = currentRoom(peer)
        if (!current) return { ok: false, error: 'not_in_room' }
        const { room, playerId } = current
        const action = payload
        if (!validAction(action)) return { ok: false, error: 'invalid_action' }
        const key = `${playerId}:${action.actionId}`
        const fingerprint = JSON.stringify([action.matchId, action.expectedRevision, action.type, action.cardInstanceId ?? null])
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
          ? { type: 'play_card', playerId, cardInstanceId: action.cardInstanceId! }
          : { type: 'end_turn', playerId }, random)
        if (result.error) return { ok: false, error: result.error }
        room.match = result.state
        if (room.match.phase === 'reorder') {
          // 試遊版では双方へ同じ固定デッキを補充する。
          while (room.match.phase === 'reorder' && room.match.reorderPlayerId) {
            room.match = transitionMatch(room.match, {
              type: 'complete_reorder', playerId: room.match.reorderPlayerId, cards: fixedDeck(),
            }, random).state
          }
          room.match.log = ['試遊版：双方に固定デッキを補充しました',
            ...room.match.log.filter(message => !message.includes('追加注文'))].slice(0, 40)
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
        if (room.rematch.size === 2) startMatch(room)
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
      return current ? snapshot(current.room, current.playerId) : undefined
    },
    close() {
      for (const room of [...rooms.values()]) closeRoom(room, 'server_shutdown')
      peers.clear()
    },
  }
}
