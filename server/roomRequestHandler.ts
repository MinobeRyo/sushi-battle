import { ROOM_EVENTS } from '../src/network/httpProtocol'
import type { HttpRoomRequest, HttpRoomResponse } from '../src/network/httpProtocol'
import type { createRoomService, RoomPeer } from './roomService'
import { detachTimer } from './webCrypto'

type RoomService = ReturnType<typeof createRoomService>
type HttpPeer = { peer: RoomPeer; lastSeen: number; roomCode?: string }
export const MAX_ROOM_BODY_BYTES = 16 * 1024
const MAX_PEERS = 4096

/** 実行環境（Node の http / Cloudflare Workers）から独立した、1要求ぶんの入力。 */
export type RoomRequestInput = {
  method: string | undefined
  origin: string | undefined
  contentType: string | undefined
  declaredSize: number
  /** 上限を超えた・読めなかった場合は null。 */
  readBody: () => Promise<string | null>
}
export type RoomRequestResult = { status: number; body: HttpRoomResponse }

function validRequest(value: unknown): value is HttpRoomRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const request = value as Partial<HttpRoomRequest>
  return typeof request.clientId === 'string' && /^[a-f0-9]{64}$/.test(request.clientId)
    && (request.event === 'poll' || ROOM_EVENTS.some(event => event === request.event))
}

export function createRoomRequestHandler(options: {
  service: RoomService
  presenceTtlMs: number
  resumeTtlMs: number
  originAllowed: (origin: string | undefined) => boolean
}) {
  const { service, presenceTtlMs, originAllowed } = options
  const peers = new Map<string, HttpPeer>()
  const tombstones = new Map<string, { reason: string; until: number; roomCode?: string }>()
  const closedTtlMs = Math.max(options.resumeTtlMs, 120_000)
  let stopped = false

  const sweep = () => {
    const now = Date.now()
    for (const [id, entry] of peers) {
      if (now - entry.lastSeen < presenceTtlMs) continue
      peers.delete(id)
      service.disconnect(entry.peer)
    }
    for (const [id, entry] of tombstones) {
      // 置換された古いタブは、試合が続く限り自動復帰で席を取り返せない。
      if (entry.reason === 'replaced' && entry.roomCode && service.hasRoom(entry.roomCode)) continue
      if (entry.until <= now) tombstones.delete(id)
    }
  }
  const timer = setInterval(sweep, Math.min(presenceTtlMs, 1000))
  detachTimer(timer)

  const createPeer = (id: string): HttpPeer => {
    const entry: HttpPeer = {
      lastSeen: Date.now(),
      peer: {
        id: `http:${id}`, data: {},
        // HTTPでは要求が来た時点の最新状態を返すため、配信の待ち行列は不要。
        state: snapshot => { entry.roomCode = snapshot.code },
        closed: reason => {
          peers.delete(id)
          service.disconnect(entry.peer)
          tombstones.set(id, { reason, until: Date.now() + closedTtlMs, roomCode: entry.roomCode })
        },
      },
    }
    peers.set(id, entry)
    service.connect(entry.peer)
    return entry
  }

  return {
    async handle(input: RoomRequestInput): Promise<RoomRequestResult> {
      const reject = (status: number, error: string): RoomRequestResult => ({ status, body: { reply: { ok: false, error } } })
      if (stopped) return reject(503, 'server_shutdown')
      if (input.method !== 'POST') return reject(405, 'method_not_allowed')
      if (!originAllowed(input.origin)) return reject(403, 'origin_not_allowed')
      if (!/^application\/json(?:\s*;|$)/i.test(input.contentType ?? '')) return reject(415, 'json_required')
      if (Number.isFinite(input.declaredSize) && input.declaredSize > MAX_ROOM_BODY_BYTES) return reject(413, 'request_too_large')
      const body = await input.readBody()
      if (stopped) return reject(503, 'server_shutdown')
      if (body === null) return reject(413, 'request_too_large')
      let parsed: unknown
      try { parsed = JSON.parse(body) } catch { return reject(400, 'invalid_json') }
      if (!validRequest(parsed)) return reject(400, 'invalid_request')
      sweep()
      const closed = tombstones.get(parsed.clientId)
      if (closed) return { status: 200, body: { closed: closed.reason } }
      let entry = peers.get(parsed.clientId)
      if (!entry && parsed.event === 'poll') return { status: 200, body: {} }
      if (!entry) {
        // 切断通知を追い出さずに、保持する接続と通知の合計を制限する。
        if (peers.size + tombstones.size >= MAX_PEERS) return reject(503, 'server_full')
        entry = createPeer(parsed.clientId)
      }
      entry.lastSeen = Date.now()
      const reply = parsed.event === 'poll' ? undefined : service.handle(entry.peer, parsed.event, parsed.payload)
      const closedAfter = tombstones.get(parsed.clientId)
      return {
        status: 200,
        body: {
          ...(reply ? { reply } : {}),
          ...(closedAfter ? { closed: closedAfter.reason } : { snapshot: service.snapshot(entry.peer) }),
        },
      }
    },
    close() {
      stopped = true
      clearInterval(timer)
      for (const entry of peers.values()) service.disconnect(entry.peer)
      peers.clear()
      tombstones.clear()
    },
  }
}

export const ROOM_RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const
