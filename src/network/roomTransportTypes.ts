import type { JoinReply, OnlineAction, OnlineDraftAction, OnlineDraftHover, Reply, RoomSnapshot } from './protocol'

export type RoomRequestPayloads = {
  'room:create': undefined
  'room:join': { code: string }
  'room:resume': { code: string; token: string }
  'room:leave': undefined
  'match:action': OnlineAction
  'draft:action': OnlineDraftAction
  'draft:hover': OnlineDraftHover
  'match:rematch': undefined
}
export type RoomRequestEvent = keyof RoomRequestPayloads
export type RoomRequestReply<E extends RoomRequestEvent> =
  E extends 'room:create' | 'room:join' | 'room:resume' ? JoinReply : Reply

export type RoomTransportCallbacks = {
  onConnect: () => void
  onDisconnect: (reason: string) => void
  onConnectError: () => void
  onSnapshot: (snapshot: RoomSnapshot) => void
  onClosed: (reason: string) => void
  onSessionMissing: () => void
}

export interface RoomTransport {
  readonly connected: boolean
  connect(): void
  disconnect(): void
  request<E extends RoomRequestEvent>(event: E, payload?: RoomRequestPayloads[E]): Promise<RoomRequestReply<E>>
}
