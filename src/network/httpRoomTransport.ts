import type { JoinReply, Reply } from './protocol'
import type { HttpRoomResponse } from './httpProtocol'
import type { RoomRequestEvent, RoomRequestPayloads, RoomRequestReply, RoomTransport, RoomTransportCallbacks } from './roomTransportTypes'

type PendingRequest = {
  event: RoomRequestEvent
  payload: RoomRequestPayloads[RoomRequestEvent]
  resolve: (reply: Reply | JoinReply) => void
  reject: (error: Error) => void
}

type Timer = ReturnType<typeof setTimeout>
type HttpRoomOptions = {
  fetcher?: typeof fetch
  newClientId?: () => string
  isHidden?: () => boolean
  setTimer?: (callback: () => void, delay: number) => Timer
  clearTimer?: (timer: Timer) => void
}

function newClientId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** One short request at a time: PHP workers are released between polls. */
export function createHttpRoomTransport(
  endpoint: string,
  callbacks: RoomTransportCallbacks,
  options: HttpRoomOptions = {},
): RoomTransport {
  const fetcher = options.fetcher ?? fetch
  const createClientId = options.newClientId ?? newClientId
  const isHidden = options.isHidden ?? (() => document.visibilityState === 'hidden')
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout
  let clientId = createClientId()
  let connected = false
  let stopped = true
  let busy = false
  let roomActive = false
  let closed = false
  let failures = 0
  let generation = 0
  let nextPoll: Timer | undefined
  let activeController: AbortController | undefined
  const queue: PendingRequest[] = []

  const cancelPoll = () => {
    if (nextPoll !== undefined) clearTimer(nextPoll)
    nextPoll = undefined
  }

  const forgetSeat = () => {
    clientId = createClientId()
    roomActive = false
    closed = false
  }

  const rejectQueued = (message: string) => {
    const requests = queue.splice(0)
    if (requests.some(request => request.event === 'room:leave')) forgetSeat()
    for (const request of requests) request.reject(new Error(message))
  }

  function schedule() {
    if (stopped || closed || busy) return
    cancelPoll()
    if (queue.length > 0 && connected) {
      void run(queue.shift())
      return
    }
    const delay = failures > 0
      ? Math.min(10000, 2000 * 2 ** Math.min(failures - 1, 3))
      : roomActive && !isHidden() ? 1000 : 5000
    nextPoll = setTimer(() => {
      nextPoll = undefined
      void run()
    }, delay)
  }

  async function run(request?: PendingRequest) {
    if (stopped || busy) return
    busy = true
    const runGeneration = generation
    const controller = new AbortController()
    activeController = controller
    const timeout = setTimer(() => controller.abort(), 8000)
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, event: request?.event ?? 'poll', ...(request?.payload !== undefined ? { payload: request.payload } : {}) }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Room request failed: ${response.status}`)
      const value: unknown = await response.json()
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid room response')
      const result = value as HttpRoomResponse
      if (stopped || runGeneration !== generation) throw new Error('Connection closed')
      if (request && !result.reply && !result.closed) throw new Error('Missing room reply')
      const reconnecting = !connected
      connected = true
      failures = 0

      if (result.closed) {
        roomActive = false
        closed = true
        rejectQueued('Room closed')
        // Clearing the saved seat first prevents a reconnect callback from taking it back.
        callbacks.onClosed(result.closed)
        if (reconnecting) callbacks.onConnect()
      } else {
        const lostSession = !request && roomActive && !result.snapshot
        if (request?.event === 'room:leave' || lostSession) roomActive = false
        if (result.snapshot) {
          roomActive = true
          callbacks.onSnapshot(result.snapshot)
        }
        if (reconnecting) callbacks.onConnect()
        else if (lostSession) callbacks.onSessionMissing()
      }
      if (request) request.resolve(result.reply ?? { ok: false, error: result.closed ?? 'invalid_reply' })
    } catch (error) {
      request?.reject(error instanceof Error ? error : new Error('Room request failed'))
      if (!stopped && runGeneration === generation) {
        const wasConnected = connected
        connected = false
        failures += 1
        rejectQueued('Connection lost')
        if (wasConnected) callbacks.onDisconnect('transport error')
        else callbacks.onConnectError()
      }
    } finally {
      clearTimer(timeout)
      if (runGeneration === generation) {
        // Even when its reply is lost, leaving must stop heartbeats for the old seat.
        if (request?.event === 'room:leave') forgetSeat()
        activeController = undefined
        busy = false
        schedule()
      }
    }
  }

  return {
    get connected() { return connected },
    connect() {
      if (!stopped) return
      stopped = false
      void run()
    },
    disconnect() {
      stopped = true
      connected = false
      generation += 1
      cancelPoll()
      activeController?.abort()
      activeController = undefined
      busy = false
      rejectQueued('Connection closed')
    },
    request<E extends RoomRequestEvent>(event: E, payload?: RoomRequestPayloads[E]): Promise<RoomRequestReply<E>> {
      if (stopped || !connected) return Promise.reject(new Error('Not connected'))
      if (closed) {
        if (event !== 'room:create' && event !== 'room:join') return Promise.reject(new Error('Room closed'))
        // A deliberate new join is a new peer; a replaced seat never auto-resumes.
        clientId = createClientId()
        closed = false
      }
      cancelPoll()
      return new Promise<RoomRequestReply<E>>((resolve, reject) => {
        queue.push({ event, payload, resolve: reply => resolve(reply as RoomRequestReply<E>), reject })
        schedule()
      })
    },
  }
}
