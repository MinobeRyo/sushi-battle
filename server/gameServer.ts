import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server } from 'socket.io'
import type { PlayerId, RandomSource } from '../src/game/types'
import type { ClientToServerEvents, ServerToClientEvents } from '../src/network/protocol'
import { createRoomService } from './roomService'
import type { RoomPeer } from './roomService'
import { createHttpRoomTransport } from './httpRoomTransport'

type SocketData = { code?: string; playerId?: PlayerId }
export type GameServerOptions = {
  port?: number
  host?: string
  resumeTtlMs?: number
  httpPresenceTtlMs?: number
  allowedOrigins?: string[]
  random?: RandomSource
}
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

export async function createGameServer(options: GameServerOptions = {}) {
  const host = options.host ?? '127.0.0.1'
  const resumeTtlMs = options.resumeTtlMs ?? 120_000
  const presenceTtlMs = options.httpPresenceTtlMs ?? 20_000
  if (!Number.isFinite(resumeTtlMs) || resumeTtlMs <= 0) throw new Error('resumeTtlMs must be positive')
  if (!Number.isFinite(presenceTtlMs) || presenceTtlMs <= 0) throw new Error('httpPresenceTtlMs must be positive')
  const allowedOrigins = new Set(options.allowedOrigins ?? DEFAULT_ORIGINS)
  const originAllowed = (origin: string | undefined) => origin === undefined || allowedOrigins.has(origin)
  const service = createRoomService({ resumeTtlMs, random: options.random ?? Math.random })
  const httpTransport = createHttpRoomTransport({ service, presenceTtlMs, resumeTtlMs, originAllowed })
  const httpServer = createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, (request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ ok: true, roomTransport: 'http-polling-v1' }))
      return
    }
    if (request.url === '/api/room') {
      void httpTransport.handle(request, response).catch(() => {
        if (!response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          response.end(JSON.stringify({ reply: { ok: false, error: 'internal_error' } }))
        } else response.destroy()
      })
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
  io.on('connection', socket => {
    const peer: RoomPeer = {
      id: `socket:${socket.id}`, data: {},
      state: snapshot => socket.emit('room:state', snapshot),
      closed: reason => {
        socket.emit('room:closed', reason)
        if (reason === 'replaced') socket.disconnect(true)
      },
    }
    service.connect(peer)
    const replyTo = (reply: unknown, result: unknown) => { if (typeof reply === 'function') reply(result) }
    socket.on('room:create', reply => replyTo(reply, service.handle(peer, 'room:create')))
    socket.on('room:join', (request, reply) => replyTo(reply, service.handle(peer, 'room:join', request)))
    socket.on('room:resume', (request, reply) => replyTo(reply, service.handle(peer, 'room:resume', request)))
    socket.on('room:leave', reply => replyTo(reply, service.handle(peer, 'room:leave')))
    socket.on('match:action', (action, reply) => replyTo(reply, service.handle(peer, 'match:action', action)))
    socket.on('draft:action', (action, reply) => replyTo(reply, service.handle(peer, 'draft:action', action)))
    socket.on('match:rematch', reply => replyTo(reply, service.handle(peer, 'match:rematch')))
    socket.on('disconnect', () => service.disconnect(peer))
  })

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(options.port ?? 3001, host, () => {
        httpServer.off('error', reject)
        resolve()
      })
    })
  } catch (error) {
    httpTransport.close()
    service.close()
    void io.close()
    throw error
  }
  const port = (httpServer.address() as AddressInfo).port
  let closing: Promise<void> | null = null
  const close = () => {
    if (closing) return closing
    httpTransport.close()
    service.close()
    closing = new Promise<void>((resolve, reject) => {
      io.close(error => error ? reject(error) : resolve())
      // 送信途中のHTTP本文やkeep-alive接続も終了し、再起動を待たせない。
      httpServer.closeAllConnections()
    })
    return closing
  }
  return { httpServer, io, port, url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`, close }
}
