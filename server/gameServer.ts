import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import { createMatch, otherPlayer, transitionMatch } from '../src/game/matchEngine'
import type { MatchState, PlayerId, RandomSource } from '../src/game/types'
import type { ClientToServerEvents, JoinReply, OnlineAction, PublicMatch, Reply, RoomSnapshot, ServerToClientEvents } from '../src/network/protocol'
import { fixedDeck } from './fixedDeck'

type SocketData = { code?: string; playerId?: PlayerId }
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type Seat = { token: string; socketId: string | null; expiry?: ReturnType<typeof setTimeout> }
type ProcessedAction = { fingerprint: string; reply: Reply }
type Room = {
  code: string
  seats: Partial<Record<PlayerId, Seat>>
  match: MatchState | null
  rematch: Set<PlayerId>
  processed: Map<string, ProcessedAction>
}

export type GameServerOptions = {
  port?: number
  host?: string
  resumeTtlMs?: number
  allowedOrigins?: string[]
  random?: RandomSource
}

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
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
    connected: { 1: Boolean(room.seats[1]?.socketId), 2: Boolean(room.seats[2]?.socketId) },
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

function replyTo<T>(reply: unknown, result: T) {
  if (typeof reply === 'function') reply(result)
}

export async function createGameServer(options: GameServerOptions = {}) {
  const host = options.host ?? '127.0.0.1'
  const resumeTtlMs = options.resumeTtlMs ?? 120_000
  if (!Number.isFinite(resumeTtlMs) || resumeTtlMs <= 0) throw new Error('resumeTtlMs must be positive')
  const random = options.random ?? Math.random
  const allowedOrigins = new Set(options.allowedOrigins ?? DEFAULT_ORIGINS)
  const originAllowed = (origin: string | undefined) => origin === undefined || allowedOrigins.has(origin)
  const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
      return
    }
    response.writeHead(404)
    response.end('Not found')
  })
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: (origin, callback) => callback(null, originAllowed(origin)) },
    allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin)),
    maxHttpBufferSize: 16 * 1024,
  })
  const rooms = new Map<string, Room>()

  const sendState = (room: Room) => {
    for (const playerId of [1, 2] as const) {
      const seat = room.seats[playerId]
      if (seat?.socketId) io.to(seat.socketId).emit('room:state', snapshot(room, playerId))
    }
  }

  const closeRoom = (room: Room, reason: string) => {
    if (!rooms.delete(room.code)) return
    for (const playerId of [1, 2] as const) {
      const seat = room.seats[playerId]
      if (seat?.expiry) clearTimeout(seat.expiry)
      if (seat?.socketId) {
        const socket = io.sockets.sockets.get(seat.socketId)
        if (socket?.data.code === room.code) {
          socket.data = {}
          socket.emit('room:closed', reason)
        }
      }
    }
  }

  const currentRoom = (socket: GameSocket) => {
    const { code, playerId } = socket.data
    const room = code ? rooms.get(code) : undefined
    if (!room || !playerId || room.seats[playerId]?.socketId !== socket.id) return null
    return { room, playerId }
  }

  const startMatch = (room: Room) => {
    room.match = createMatch({ mode: 'two_player', matchId: randomUUID(), deck: fixedDeck(), p2Deck: fixedDeck() }, random)
    room.rematch.clear()
  }

  const joinSeat = (socket: GameSocket, room: Room, playerId: PlayerId, reply: unknown) => {
    let seat = room.seats[playerId]
    if (!seat) {
      seat = { token: randomBytes(32).toString('hex'), socketId: null }
      room.seats[playerId] = seat
    }
    const previousSocketId = seat.socketId
    if (seat.expiry) clearTimeout(seat.expiry)
    delete seat.expiry
    seat.socketId = socket.id
    socket.data = { code: room.code, playerId }
    // 古い接続のdisconnect通知が新しい接続を切断扱いにしないよう、先に席を付け替える。
    if (previousSocketId && previousSocketId !== socket.id) {
      const previous = io.sockets.sockets.get(previousSocketId)
      if (previous) {
        previous.data = {}
        previous.emit('room:closed', 'replaced')
        previous.disconnect(true)
      }
    }
    if (!room.match && room.seats[1] && room.seats[2]) startMatch(room)
    replyTo<JoinReply>(reply, {
      ok: true, session: { code: room.code, playerId, token: seat.token }, snapshot: snapshot(room, playerId),
    })
    sendState(room)
  }

  io.on('connection', socket => {
    socket.on('room:create', reply => {
      const current = currentRoom(socket)
      // ACKが届かなかった同じ接続の再試行では、新しい部屋を作らず参加情報を返す。
      if (current) return joinSeat(socket, current.room, current.playerId, reply)
      if (rooms.size >= MAX_ROOMS) return replyTo<JoinReply>(reply, { ok: false, error: 'server_full' })
      let code: string
      do { code = randomInt(0, 1_000_000).toString().padStart(6, '0') } while (rooms.has(code))
      const room: Room = { code, seats: {}, match: null, rematch: new Set(), processed: new Map() }
      rooms.set(code, room)
      joinSeat(socket, room, 1, reply)
    })

    socket.on('room:join', (request, reply) => {
      if (!request || typeof request.code !== 'string' || !/^\d{6}$/.test(request.code.trim())) {
        return replyTo<JoinReply>(reply, { ok: false, error: 'invalid_code' })
      }
      const code = request.code.trim()
      const current = currentRoom(socket)
      if (current) {
        if (current.room.code === code) return joinSeat(socket, current.room, current.playerId, reply)
        return replyTo<JoinReply>(reply, { ok: false, error: 'already_in_room' })
      }
      const room = rooms.get(code)
      if (!room) return replyTo<JoinReply>(reply, { ok: false, error: 'room_not_found' })
      // 切断した席はTTL内は本人の復帰用に予約する。
      if (room.seats[2]) return replyTo<JoinReply>(reply, { ok: false, error: 'room_full' })
      joinSeat(socket, room, 2, reply)
    })

    socket.on('room:resume', (request, reply) => {
      if (!request || typeof request.code !== 'string' || !validToken(request.token)) {
        return replyTo<JoinReply>(reply, { ok: false, error: 'invalid_token' })
      }
      const room = rooms.get(request.code.trim().toUpperCase())
      if (!room) return replyTo<JoinReply>(reply, { ok: false, error: 'room_not_found' })
      const playerId = ([1, 2] as const).find(id => room.seats[id] && sameToken(room.seats[id]!.token, request.token))
      if (!playerId) return replyTo<JoinReply>(reply, { ok: false, error: 'invalid_token' })
      const current = currentRoom(socket)
      if (current && (current.room !== room || current.playerId !== playerId)) {
        return replyTo<JoinReply>(reply, { ok: false, error: 'already_in_room' })
      }
      joinSeat(socket, room, playerId, reply)
    })

    socket.on('room:leave', reply => {
      const current = currentRoom(socket)
      if (!current) return replyTo<Reply>(reply, { ok: false, error: 'not_in_room' })
      closeRoom(current.room, 'left')
      replyTo<Reply>(reply, { ok: true })
    })

    socket.on('match:action', (action, reply) => {
      const current = currentRoom(socket)
      if (!current) return replyTo<Reply>(reply, { ok: false, error: 'not_in_room' })
      const { room, playerId } = current
      if (!validAction(action)) return replyTo<Reply>(reply, { ok: false, error: 'invalid_action' })
      const key = `${playerId}:${action.actionId}`
      const fingerprint = JSON.stringify([action.matchId, action.expectedRevision, action.type, action.cardInstanceId ?? null])
      const previous = room.processed.get(key)
      if (previous) {
        replyTo(reply, previous.fingerprint === fingerprint ? previous.reply : { ok: false, error: 'action_id_conflict' })
        sendState(room)
        return
      }
      if (!room.match) return replyTo<Reply>(reply, { ok: false, error: 'match_not_started' })
      if (!room.seats[1]?.socketId || !room.seats[2]?.socketId) {
        return replyTo<Reply>(reply, { ok: false, error: 'players_disconnected' })
      }
      if (room.match.matchId !== action.matchId || room.match.revision !== action.expectedRevision) {
        replyTo<Reply>(reply, { ok: false, error: room.match.matchId !== action.matchId ? 'stale_match' : 'stale_revision' })
        sendState(room)
        return
      }
      const result = transitionMatch(room.match, action.type === 'play_card'
        ? { type: 'play_card', playerId, cardInstanceId: action.cardInstanceId! }
        : { type: 'end_turn', playerId }, random)
      if (result.error) return replyTo<Reply>(reply, { ok: false, error: result.error })
      room.match = result.state
      if (room.match.phase === 'reorder') {
        // この試遊版では追加注文画面を挟まず、双方へ同じ固定デッキを補充する。
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
      replyTo(reply, accepted)
      sendState(room)
    })

    socket.on('match:rematch', reply => {
      const current = currentRoom(socket)
      if (!current) return replyTo<Reply>(reply, { ok: false, error: 'not_in_room' })
      const { room, playerId } = current
      if (room.match?.phase !== 'over') return replyTo<Reply>(reply, { ok: false, error: 'match_not_over' })
      if (!room.seats[1]?.socketId || !room.seats[2]?.socketId) {
        return replyTo<Reply>(reply, { ok: false, error: 'players_disconnected' })
      }
      room.rematch.add(playerId)
      if (room.rematch.size === 2) startMatch(room)
      replyTo<Reply>(reply, { ok: true })
      sendState(room)
    })

    socket.on('disconnect', () => {
      const current = currentRoom(socket)
      if (!current) return
      const { room, playerId } = current
      const seat = room.seats[playerId]!
      seat.socketId = null
      seat.expiry = setTimeout(() => {
        if (!seat.socketId) closeRoom(room, 'expired')
      }, resumeTtlMs)
      seat.expiry.unref()
      sendState(room)
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(options.port ?? 3001, host, () => {
      httpServer.off('error', reject)
      resolve()
    })
  })
  const port = (httpServer.address() as AddressInfo).port
  let closing: Promise<void> | null = null
  const close = () => {
    if (closing) return closing
    for (const room of [...rooms.values()]) closeRoom(room, 'server_shutdown')
    closing = new Promise<void>((resolve, reject) => {
      io.close(error => error ? reject(error) : resolve())
    })
    return closing
  }
  return { httpServer, io, port, url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`, close }
}
