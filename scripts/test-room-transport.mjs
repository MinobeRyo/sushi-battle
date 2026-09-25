#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHttpRoomTransport } from '../src/network/httpRoomTransport.ts'

const snapshot = {
  code: '123456', playerId: 1, connected: { 1: true, 2: false },
  rematchRequested: { 1: false, 2: false }, match: null,
}
const session = { code: '123456', playerId: 1, token: 'resume-secret' }
const joined = { reply: { ok: true, session, snapshot }, snapshot }
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }

function fixture() {
  let now = 0
  let timerId = 0
  let hidden = false
  let id = 0
  let active = 0
  let maxActive = 0
  const timers = new Map()
  const calls = []
  const events = []
  const callbacks = {
    onConnect: () => events.push('connect'),
    onDisconnect: () => events.push('disconnect'),
    onConnectError: () => events.push('error'),
    onSnapshot: value => events.push(['snapshot', value]),
    onClosed: reason => events.push(['closed', reason]),
    onSessionMissing: () => events.push('missing'),
  }
  const transport = createHttpRoomTransport('https://example.test/~user/game/api.php', callbacks, {
    newClientId: () => (++id).toString(16).padStart(64, '0'),
    isHidden: () => hidden,
    setTimer(callback, delay) { const key = ++timerId; timers.set(key, { at: now + delay, callback }); return key },
    clearTimer(key) { timers.delete(key) },
    fetcher(url, options) {
      assert.equal(url, 'https://example.test/~user/game/api.php')
      assert.equal(options.credentials, 'omit')
      assert.equal(options.method, 'POST')
      active++
      maxActive = Math.max(maxActive, active)
      return new Promise((resolve, reject) => {
        let settled = false
        const settle = fn => value => {
          if (settled) return
          settled = true
          active--
          fn(value)
        }
        const fail = settle(reject)
        options.signal.addEventListener('abort', () => fail(new Error('Aborted')), { once: true })
        calls.push({
          body: JSON.parse(options.body), signal: options.signal, time: now,
          reply: settle(body => resolve({ ok: true, status: 200, json: async () => body })),
          fail,
        })
      })
    },
  })
  async function advance(ms) {
    const target = now + ms
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at
      timers.delete(next[0])
      next[1].callback()
      await flush()
    }
    now = target
    await flush()
  }
  async function connect() {
    transport.connect()
    calls.at(-1).reply({})
    await flush()
    assert.equal(transport.connected, true)
  }
  async function create() {
    const result = transport.request('room:create')
    calls.at(-1).reply(joined)
    await result
    await flush()
  }
  return { transport, calls, events, callbacks, advance, connect, create, get maxActive() { return maxActive }, setHidden(value) { hidden = value } }
}

let passed = 0
async function test(name, run) {
  await run()
  passed++
  console.log(`  ✓ ${name}`)
}

await test('initial handshake, idle polling and active polling wait after each response', async () => {
  const f = fixture()
  await f.connect()
  assert.equal(f.calls[0].body.event, 'poll')
  assert.match(f.calls[0].body.clientId, /^[a-f0-9]{64}$/)
  await f.advance(4999)
  assert.equal(f.calls.length, 1)
  await f.advance(1)
  assert.equal(f.calls.length, 2)
  f.calls.at(-1).reply({})
  await flush()
  await f.create()
  await f.advance(1000)
  assert.equal(f.calls.at(-1).body.event, 'poll')
  const count = f.calls.length
  await f.advance(4000)
  assert.equal(f.calls.length, count)
  f.calls.at(-1).reply({ snapshot })
  await flush()
  await f.advance(999)
  assert.equal(f.calls.length, count)
  await f.advance(1)
  assert.equal(f.calls.length, count + 1)
  assert.equal(f.maxActive, 1)
  f.transport.disconnect()
})

await test('actions queue behind a poll; hidden tabs use five second polling', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  await f.advance(1000)
  const count = f.calls.length
  const action = f.transport.request('match:rematch')
  assert.equal(f.calls.length, count)
  f.calls.at(-1).reply({ snapshot })
  await flush()
  assert.equal(f.calls.at(-1).body.event, 'match:rematch')
  f.setHidden(true)
  f.calls.at(-1).reply({ reply: { ok: true }, snapshot })
  await action
  await f.advance(4999)
  assert.equal(f.calls.length, count + 1)
  await f.advance(1)
  assert.equal(f.calls.length, count + 2)
  assert.equal(f.maxActive, 1)
  f.transport.disconnect()
})

await test('connection errors retry at two, four, eight and at most ten seconds', async () => {
  const f = fixture()
  f.transport.connect()
  for (const delay of [2000, 4000, 8000, 10000, 10000]) {
    f.calls.at(-1).fail(new Error('Offline'))
    await flush()
    const count = f.calls.length
    await f.advance(delay - 1)
    assert.equal(f.calls.length, count)
    await f.advance(1)
    assert.equal(f.calls.length, count + 1)
  }
  f.calls.at(-1).reply({})
  await flush()
  assert.equal(f.transport.connected, true)
  assert.equal(f.events.filter(event => event === 'connect').length, 1)
  f.transport.disconnect()
})

await test('a missing server seat asks for one resume while retaining a single request', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  let resumed
  f.callbacks.onSessionMissing = () => {
    f.events.push('missing')
    resumed = f.transport.request('room:resume', { code: session.code, token: session.token })
  }
  await f.advance(1000)
  f.calls.at(-1).reply({})
  await flush()
  assert.equal(f.events.filter(event => event === 'missing').length, 1)
  assert.equal(f.calls.at(-1).body.event, 'room:resume')
  f.calls.at(-1).reply(joined)
  await resumed
  await f.advance(1000)
  f.calls.at(-1).reply({ snapshot })
  await flush()
  assert.equal(f.events.filter(event => event === 'missing').length, 1)
  assert.equal(f.maxActive, 1)
  f.transport.disconnect()
})

await test('replaced seats stop polling and only a deliberate new join rotates identity', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  const oldId = f.calls.at(-1).body.clientId
  await f.advance(1000)
  f.calls.at(-1).reply({ closed: 'replaced' })
  await flush()
  const count = f.calls.length
  await f.advance(60000)
  assert.equal(f.calls.length, count)
  assert.equal(f.transport.connected, true)
  await assert.rejects(f.transport.request('room:resume', { code: session.code, token: session.token }), /Room closed/)
  const join = f.transport.request('room:join', { code: '654321' })
  assert.notEqual(f.calls.at(-1).body.clientId, oldId)
  f.calls.at(-1).reply({ reply: { ok: false, error: 'room_not_found' } })
  assert.deepEqual(await join, { ok: false, error: 'room_not_found' })
  f.transport.disconnect()
})

await test('a lost create reply preserves identity so a deliberate retry recovers the token', async () => {
  const f = fixture()
  await f.connect()
  const request = f.transport.request('room:create')
  const rejection = assert.rejects(request, /Aborted/)
  const oldId = f.calls.at(-1).body.clientId
  await f.advance(8000)
  await rejection
  assert.equal(f.transport.connected, false)
  await f.advance(2000)
  f.calls.at(-1).reply({ snapshot })
  await flush()
  const retry = f.transport.request('room:create')
  assert.equal(f.calls.at(-1).body.clientId, oldId)
  f.calls.at(-1).reply(joined)
  assert.deepEqual((await retry).session, session)
  assert.equal(f.maxActive, 1)
  f.transport.disconnect()
})

await test('disconnect aborts the request, rejects queued commands and suppresses stale callbacks', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  await f.advance(1000)
  const pendingPoll = f.calls.at(-1)
  const action = f.transport.request('match:rematch')
  const rejection = assert.rejects(action, /Connection closed/)
  const count = f.events.length
  f.transport.disconnect()
  assert.equal(pendingPoll.signal.aborted, true)
  pendingPoll.reply({ snapshot })
  await rejection
  await f.advance(60000)
  assert.equal(f.events.length, count)
  // Effect cleanup followed by a new connection cannot consume the previous response.
  f.transport.connect()
  f.calls.at(-1).reply({})
  await flush()
  assert.equal(f.events.at(-1), 'connect')
  f.transport.disconnect()
})

await test('room close rejects commands waiting behind the poll', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  await f.advance(1000)
  const pending = f.transport.request('match:rematch')
  const rejection = assert.rejects(pending, /Room closed/)
  f.calls.at(-1).reply({ closed: 'left' })
  await rejection
  await flush()
  assert.deepEqual(f.events.at(-1), ['closed', 'left'])
  assert.equal(f.calls.at(-1).body.event, 'poll')
  f.transport.disconnect()
})

await test('a lost leave request does not keep the abandoned seat alive', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  const oldId = f.calls.at(-1).body.clientId
  const leaving = f.transport.request('room:leave')
  const rejection = assert.rejects(leaving, /Offline/)
  assert.equal(f.calls.at(-1).body.clientId, oldId)
  f.calls.at(-1).fail(new Error('Offline'))
  await rejection
  await f.advance(2000)
  assert.equal(f.calls.at(-1).body.event, 'poll')
  assert.notEqual(f.calls.at(-1).body.clientId, oldId)
  f.calls.at(-1).reply({})
  await flush()
  f.transport.disconnect()
})

await test('a queued leave also forgets its seat if the pending poll fails', async () => {
  const f = fixture()
  await f.connect()
  await f.create()
  const oldId = f.calls.at(-1).body.clientId
  await f.advance(1000)
  const leaving = f.transport.request('room:leave')
  const rejection = assert.rejects(leaving, /Connection lost/)
  f.calls.at(-1).fail(new Error('Offline'))
  await rejection
  await f.advance(2000)
  assert.notEqual(f.calls.at(-1).body.clientId, oldId)
  f.calls.at(-1).reply({})
  await flush()
  f.transport.disconnect()
})

console.log(`\n${passed} room transport tests passed.`)
