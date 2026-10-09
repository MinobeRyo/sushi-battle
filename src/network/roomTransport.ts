import { createHttpRoomTransport } from './httpRoomTransport'
import { createSocketRoomTransport } from './socketRoomTransport'
import type { RoomTransportCallbacks } from './roomTransportTypes'

export function createRoomTransport(callbacks: RoomTransportCallbacks) {
  if (import.meta.env.VITE_ROOM_TRANSPORT === 'php') {
    // Vite の base を使い、/~ユーザー名/作品名/ 配下から同じ階層の PHP に接続する。
    const endpoint = new URL(`${import.meta.env.BASE_URL}api.php`, window.location.origin).href
    return createHttpRoomTransport(endpoint, callbacks)
  }
  if (import.meta.env.VITE_ROOM_TRANSPORT === 'http') {
    // Cloudflare Workers: 画面と同じ Worker の /api/room に接続する。
    const endpoint = new URL(`${import.meta.env.BASE_URL}api/room`, window.location.origin).href
    return createHttpRoomTransport(endpoint, callbacks)
  }
  return createSocketRoomTransport(callbacks)
}
