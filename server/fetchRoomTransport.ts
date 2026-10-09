import { createRoomService } from './roomService'
import type { RandomSource } from '../src/game/types'
import { createRoomRequestHandler, MAX_ROOM_BODY_BYTES, ROOM_RESPONSE_HEADERS } from './roomRequestHandler'

async function readLimitedText(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_ROOM_BODY_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * Request/Response だけで動く部屋サーバー。Cloudflare の Durable Object から使う。
 * 発信元の確認は呼び出し側（Worker の入口）で行う。
 */
export function createFetchRoomServer(options: {
  resumeTtlMs?: number
  presenceTtlMs?: number
  random?: RandomSource
  originAllowed?: (origin: string | undefined) => boolean
} = {}) {
  const resumeTtlMs = options.resumeTtlMs ?? 120_000
  const presenceTtlMs = options.presenceTtlMs ?? 20_000
  const service = createRoomService({ resumeTtlMs, random: options.random ?? Math.random })
  const handler = createRoomRequestHandler({
    service, presenceTtlMs, resumeTtlMs, originAllowed: options.originAllowed ?? (() => true),
  })
  return {
    async fetch(request: Request): Promise<Response> {
      const result = await handler.handle({
        method: request.method,
        origin: request.headers.get('origin') ?? undefined,
        contentType: request.headers.get('content-type') ?? undefined,
        declaredSize: Number(request.headers.get('content-length') ?? Number.NaN),
        readBody: () => readLimitedText(request),
      })
      return new Response(JSON.stringify(result.body), { status: result.status, headers: ROOM_RESPONSE_HEADERS })
    },
    close() {
      handler.close()
      service.close()
    },
  }
}
