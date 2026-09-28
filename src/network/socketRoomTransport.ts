import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from './protocol'
import type { RoomRequestEvent, RoomRequestPayloads, RoomRequestReply, RoomTransport, RoomTransportCallbacks } from './roomTransportTypes'

export function createSocketRoomTransport(callbacks: RoomTransportCallbacks): RoomTransport {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ autoConnect: false })
  socket.on('connect', callbacks.onConnect)
  socket.on('disconnect', callbacks.onDisconnect)
  socket.on('connect_error', callbacks.onConnectError)
  socket.on('room:state', callbacks.onSnapshot)
  socket.on('room:closed', callbacks.onClosed)

  return {
    get connected() { return socket.connected },
    connect: () => { socket.connect() },
    disconnect: () => {
      socket.removeAllListeners()
      socket.disconnect()
    },
    async request<E extends RoomRequestEvent>(event: E, payload?: RoomRequestPayloads[E]): Promise<RoomRequestReply<E>> {
      const pending = socket.timeout(8000)
      switch (event) {
        case 'room:create': return await pending.emitWithAck('room:create') as RoomRequestReply<E>
        case 'room:join': return await pending.emitWithAck('room:join', payload as RoomRequestPayloads['room:join']) as RoomRequestReply<E>
        case 'room:resume': return await pending.emitWithAck('room:resume', payload as RoomRequestPayloads['room:resume']) as RoomRequestReply<E>
        case 'room:leave': return await pending.emitWithAck('room:leave') as RoomRequestReply<E>
        case 'match:action': return await pending.emitWithAck('match:action', payload as RoomRequestPayloads['match:action']) as RoomRequestReply<E>
        case 'draft:action': return await pending.emitWithAck('draft:action', payload as RoomRequestPayloads['draft:action']) as RoomRequestReply<E>
        case 'draft:hover': return await pending.emitWithAck('draft:hover', payload as RoomRequestPayloads['draft:hover']) as RoomRequestReply<E>
        case 'match:rematch': return await pending.emitWithAck('match:rematch') as RoomRequestReply<E>
        default: throw new Error('Unknown room event')
      }
    },
  }
}
