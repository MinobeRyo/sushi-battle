import { DurableObject } from 'cloudflare:workers'
import { createFetchRoomServer } from '../server/fetchRoomTransport'

type Env = {
  ASSETS: Fetcher
  ROOMS: DurableObjectNamespace<RoomLobby>
}

/**
 * すべての部屋を1つの Durable Object に置く。部屋番号の重複確認と
 * 接続IDの管理が、Node 版の対戦サーバーと同じ1か所で済む。
 */
export class RoomLobby extends DurableObject<Env> {
  private readonly rooms = createFetchRoomServer()

  async fetch(request: Request) {
    return this.rooms.fetch(request)
  }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json(200, { ok: true, roomTransport: 'http-polling-v1' })
    if (url.pathname === '/api/room') {
      // 画面と同じオリジンからの要求だけを受け付ける。
      const origin = request.headers.get('origin')
      if (origin !== null && origin !== url.origin) return json(403, { reply: { ok: false, error: 'origin_not_allowed' } })
      return env.ROOMS.get(env.ROOMS.idFromName('lobby')).fetch(request)
    }
    if (url.pathname.startsWith('/api/')) return json(404, { ok: false, error: 'not_found' })
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
