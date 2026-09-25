import type { IncomingMessage, ServerResponse } from 'node:http'
import { ROOM_EVENTS } from '../src/network/httpProtocol'
import type { HttpRoomRequest, HttpRoomResponse } from '../src/network/httpProtocol'
import type { createRoomService, RoomPeer } from './roomService'

type RoomService = ReturnType<typeof createRoomService>
type HttpPeer = { peer: RoomPeer; lastSeen: number; roomCode?: string }
const MAX_BODY_BYTES = 16 * 1024
const MAX_PEERS = 4096

function send(response: ServerResponse, status: number, body: HttpRoomResponse) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise(resolve => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0
        resolve(null)
      } else chunks.push(chunk)
    })
    request.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
    request.on('aborted', () => resolve(null))
  })
}

function validRequest(value: unknown): value is HttpRoomRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const request = value as Partial<HttpRoomRequest>
  return typeof request.clientId === 'string' && /^[a-f0-9]{64}$/.test(request.clientId)
    && (request.event === 'poll' || ROOM_EVENTS.some(event => event === request.event))
}

export function createHttpRoomTransport(options: {
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
  timer.unref()

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
    async handle(request: IncomingMessage, response: ServerResponse) {
      const reject = (status: number, error: string) => send(response, status, { reply: { ok: false, error } })
      if (stopped) return reject(503, 'server_shutdown')
      if (request.method !== 'POST') return reject(405, 'method_not_allowed')
      if (!originAllowed(request.headers.origin)) return reject(403, 'origin_not_allowed')
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
        return reject(415, 'json_required')
      }
      const declaredSize = Number(request.headers['content-length'])
      if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) return reject(413, 'request_too_large')
      const body = await readBody(request)
      if (stopped) return reject(503, 'server_shutdown')
      if (body === null) return reject(413, 'request_too_large')
      let parsed: unknown
      try { parsed = JSON.parse(body) } catch { return reject(400, 'invalid_json') }
      if (!validRequest(parsed)) return reject(400, 'invalid_request')
      sweep()
      const closed = tombstones.get(parsed.clientId)
      if (closed) return send(response, 200, { closed: closed.reason })
      let entry = peers.get(parsed.clientId)
      if (!entry && parsed.event === 'poll') return send(response, 200, {})
      if (!entry) {
        // 切断通知を追い出さずに、保持する接続と通知の合計を制限する。
        if (peers.size + tombstones.size >= MAX_PEERS) return reject(503, 'server_full')
        entry = createPeer(parsed.clientId)
      }
      entry.lastSeen = Date.now()
      const reply = parsed.event === 'poll' ? undefined : service.handle(entry.peer, parsed.event, parsed.payload)
      const closedAfter = tombstones.get(parsed.clientId)
      send(response, 200, {
        ...(reply ? { reply } : {}),
        ...(closedAfter ? { closed: closedAfter.reason } : { snapshot: service.snapshot(entry.peer) }),
      })
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
