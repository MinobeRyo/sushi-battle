#!/usr/bin/env node
// Cloudflare の Durable Object と同じ Request/Response 経路で、部屋サーバーを検証する。
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createFetchRoomServer } from '../server/fetchRoomTransport.ts'
import { sameHex, randomBelow } from '../server/webCrypto.ts'
import { finishPurchases } from './online-test-helpers.mjs'

let passed = 0
const id = () => randomBytes(32).toString('hex')
async function test(label, run) {
  await run()
  passed++
  console.log(`  ✓ ${label}`)
}
function post(server, body, headers = {}) {
  return server.fetch(new Request('https://sushi.example/api/room', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body,
  }))
}
function client(server) {
  const clientId = id()
  return async (event = 'poll', payload) => {
    const response = await post(server, JSON.stringify({ clientId, event, payload }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return response.json()
  }
}

console.log('\n[Cloudflare経路] Request/Response の部屋サーバー')
const server = createFetchRoomServer({ random: () => 0.5 })
try {
  await test('部屋の作成・参加・購入を経て、両者に同じ試合が始まる', async () => {
    const host = client(server)
    const guest = client(server)
    assert.deepEqual(await host(), {})
    const created = await host('room:create')
    assert.equal(created.reply.ok, true)
    assert.match(created.reply.session.code, /^\d{6}$/)
    assert.match(created.reply.session.token, /^[a-f0-9]{64}$/)
    const joined = await guest('room:join', { code: created.reply.session.code })
    assert.equal(joined.reply.ok, true)
    assert.equal(joined.reply.session.playerId, 2)
    for (const request of [host, guest]) {
      await finishPurchases(async (event, payload) => (await request(event, payload)).reply,
        async () => (await request()).snapshot)
    }
    const [left, right] = await Promise.all([host(), guest()])
    assert.ok(left.snapshot.match)
    assert.equal(left.snapshot.match.matchId, right.snapshot.match.matchId)
    assert.equal('deck' in left.snapshot.match.you, false)
    assert.equal('hand' in left.snapshot.match.opponent, false)
  })

  await test('切断後は再参加トークンで同じ席に戻れる', async () => {
    const host = client(server)
    const session = (await host('room:create')).reply.session
    const other = client(server)
    const resumed = await other('room:resume', { code: session.code, token: session.token })
    assert.equal(resumed.reply.ok, true)
    assert.equal(resumed.reply.session.playerId, 1)
    assert.equal((await host()).closed, 'replaced')
    const wrong = await client(server)('room:resume', { code: session.code, token: id() })
    assert.deepEqual(wrong.reply, { ok: false, error: 'invalid_token' })
  })

  await test('不正な要求は本文を読まずに、または読んだうえで拒否する', async () => {
    const get = await server.fetch(new Request('https://sushi.example/api/room'))
    assert.equal(get.status, 405)
    assert.equal((await post(server, '{}', { 'Content-Type': 'text/plain' })).status, 415)
    assert.equal((await post(server, '{')).status, 400)
    assert.equal((await post(server, JSON.stringify({ clientId: 'x', event: 'poll' }))).status, 400)
    assert.equal((await post(server, 'x'.repeat(17 * 1024))).status, 413)
    // Content-Length のない分割送信でも上限を守る。
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(4096)) },
    })
    const chunked = await server.fetch(new Request('https://sushi.example/api/room', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half',
    }))
    assert.equal(chunked.status, 413)
  })

  await test('Web Crypto の補助関数が範囲と比較を守る', async () => {
    for (let index = 0; index < 1000; index++) {
      const value = randomBelow(1_000_000)
      assert.ok(Number.isInteger(value) && value >= 0 && value < 1_000_000)
    }
    const token = id()
    assert.equal(sameHex(token, token), true)
    assert.equal(sameHex(token, id()), false)
    assert.equal(sameHex(token, token.slice(1)), false)
  })
} finally {
  server.close()
}
console.log(`  ${passed} 件成功`)
