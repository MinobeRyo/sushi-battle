import type { JoinReply, Reply, RoomSnapshot } from './protocol'

export const ROOM_EVENTS = ['room:create', 'room:join', 'room:resume', 'room:leave', 'match:action', 'match:rematch'] as const
export type RoomEvent = typeof ROOM_EVENTS[number]
export type HttpRoomRequest = {
  // タブごとの秘密の接続ID。URLには入れず、HTTPSのPOST本文で送る。
  clientId: string
  event: RoomEvent | 'poll'
  payload?: unknown
}
export type HttpRoomResponse = {
  reply?: JoinReply | Reply
  snapshot?: RoomSnapshot
  closed?: string
}
