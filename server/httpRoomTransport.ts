import type { IncomingMessage, ServerResponse } from 'node:http'
import type { createRoomService } from './roomService'
import { createRoomRequestHandler, MAX_ROOM_BODY_BYTES, ROOM_RESPONSE_HEADERS } from './roomRequestHandler'

type RoomService = ReturnType<typeof createRoomService>

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise(resolve => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_ROOM_BODY_BYTES) {
        chunks.length = 0
        resolve(null)
      } else chunks.push(chunk)
    })
    request.on('end', () => resolve(size > MAX_ROOM_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
    request.on('aborted', () => resolve(null))
  })
}

/** Node の http サーバー用の入出力。判定は roomRequestHandler に任せる。 */
export function createHttpRoomTransport(options: {
  service: RoomService
  presenceTtlMs: number
  resumeTtlMs: number
  originAllowed: (origin: string | undefined) => boolean
}) {
  const handler = createRoomRequestHandler(options)
  return {
    async handle(request: IncomingMessage, response: ServerResponse) {
      const result = await handler.handle({
        method: request.method,
        origin: request.headers.origin,
        contentType: request.headers['content-type'],
        declaredSize: Number(request.headers['content-length']),
        readBody: () => readBody(request),
      })
      response.writeHead(result.status, ROOM_RESPONSE_HEADERS)
      response.end(JSON.stringify(result.body))
    },
    close: handler.close,
  }
}
