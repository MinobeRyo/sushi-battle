#!/usr/bin/env node
// 実際のHTTP要求で検証する。外部サービス・固定ポートは不要。
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { Readable } from 'node:stream'
import { io } from 'socket.io-client'
import { createGameServer } from '../server/gameServer.ts'
import { finishPurchases } from './online-test-helpers.mjs'

const servers = new Set()
const sockets = new Set()
let passed = 0
let nextActionId = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const id = () => randomBytes(32).toString('hex')

async function test(label, run) {
  await run()
  passed++
  console.log(`  ✓ ${label}`)
}
async function start(options = {}) {
  // 初手に低APの寿司がある購入・配札を再現する。乱数の消費順にも依存させない。
  const server = await createGameServer({ port: 0, host: '127.0.0.1', random: () => 0.5, ...options })
  servers.add(server)
  return server
}
async function finishBoth(left, right, buy = true) {
  for (const client of [left, right]) {
    await finishPurchases(async (event, payload) => (await client.request(event, payload)).reply,
      async () => (await client.request()).snapshot, buy)
  }
}
function client(server) {
  const clientId = id()
  return {
    clientId,
    async request(event = 'poll', payload) {
      const response = await fetch(`${server.url}/api/room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, event, payload }),
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      return response.json()
    },
    async dropReply(event, payload) {
      const response = await fetch(`${server.url}/api/room`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, event, payload }),
      })
      // サーバーは処理済みでも、利用者には応答本文が届かなかった場合。
      await response.body.cancel()
    },
  }
}
function action(snapshot, patch = {}) {
  assert.ok(snapshot.match)
  return {
    type: 'end_turn', matchId: snapshot.match.matchId,
    expectedRevision: snapshot.match.revision, actionId: `http-action-${++nextActionId}`, ...patch,
  }
}
function privateSnapshot(snapshot) {
  const match = snapshot.match
  if (!match) return
  assert.equal('deck' in match.you, false)
  assert.equal('hand' in match.opponent, false)
  assert.equal('deck' in match.opponent, false)
  assert.equal('token' in snapshot, false)
  assert.equal(match.you.id, snapshot.playerId)
}
async function waitFor(read, predicate, timeout = 2000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const value = await read()
    if (predicate(value)) return value
    await pause(10)
  }
  throw new Error('期待するHTTP応答がありません')
}

console.log('\n[HTTP対戦] 短いPOST要求の統合テスト')
try {
  const server = await start()
  const host = client(server)
  const guest = client(server)
  const outsider = client(server)
  let hostSession
  let guestSession

  await test('未参加pollは空で返り、作成応答が失われても同じ部屋・席を回収できる', async () => {
    assert.deepEqual(await host.request(), {})
    await host.dropReply('room:create')
    const waiting = await host.request()
    assert.equal(waiting.snapshot.playerId, 1)
    assert.equal(waiting.snapshot.match, null)
    const retry = await host.request('room:create')
    assert.equal(retry.reply.ok, true)
    hostSession = retry.reply.session
    assert.equal(hostSession.code, waiting.snapshot.code)
    assert.match(hostSession.token, /^[a-f0-9]{64}$/)
    assert.deepEqual((await host.request('room:create')).reply.session, hostSession)
  })

  await test('参加応答の再送で購入状態を作り直さず、席とトークンを維持する', async () => {
    await guest.dropReply('room:join', { code: hostSession.code })
    const started = (await guest.request()).snapshot
    const retry = await guest.request('room:join', { code: hostSession.code })
    assert.equal(retry.reply.ok, true)
    guestSession = retry.reply.session
    assert.equal(guestSession.playerId, 2)
    assert.deepEqual(retry.snapshot.match, started.match)
    assert.equal(retry.snapshot.draft.draftId, started.draft.draftId)
    assert.deepEqual((await guest.request('room:create')).reply.session, guestSession)
    assert.deepEqual((await outsider.request('room:join', { code: hostSession.code })).reply, { ok: false, error: 'room_full' })
    const draftId = started.draft.draftId
    const paused = await host.request('draft:hover', { draftId, lanes: ['general'], sequence: 1 })
    assert.deepEqual(paused.reply, { ok: true })
    assert.notEqual(paused.snapshot.draft.laneClocks.general.pausedAt, null)
    assert.equal(paused.snapshot.draft.laneClocks.build.pausedAt, null)
    assert.equal((await guest.request()).snapshot.draft.laneClocks.general.pausedAt, null)
    const resumed = await host.request('draft:hover', { draftId, lanes: [], sequence: 2 })
    assert.deepEqual(resumed.reply, { ok: true })
    assert.equal(resumed.snapshot.draft.laneClocks.general.pausedAt, null)
    await finishBoth(host, guest)
  })

  await test('HTTPの状態にも相手の手札・山札・再参加トークンを含めない', async () => {
    const snapshots = await Promise.all([host.request(), guest.request()])
    for (let index = 0; index < snapshots.length; index++) {
      const { snapshot } = snapshots[index]
      privateSnapshot(snapshot)
      assert.deepEqual(snapshot.connected, { 1: true, 2: true })
      const wire = JSON.stringify(snapshot)
      for (const card of snapshots[1 - index].snapshot.match.you.hand) assert.equal(wire.includes(card.instanceId), false)
      assert.equal(wire.includes(hostSession.token), false)
      assert.equal(wire.includes(guestSession.token), false)
    }
    assert.deepEqual(await outsider.request(), {})
  })

  await test('部屋コードだけのなりすまし・他人のカード・手番違いを拒否する', async () => {
    const hostState = (await host.request()).snapshot
    const guestState = (await guest.request()).snapshot
    assert.deepEqual((await outsider.request('match:action', action(hostState))).reply, { ok: false, error: 'not_in_room' })
    assert.equal((await guest.request('match:action', action(guestState, { playerId: 1 }))).reply.ok, false)
    assert.equal((await host.request('match:action', action(hostState, {
      type: 'play_card', cardInstanceId: guestState.match.you.hand[0].instanceId,
    }))).reply.ok, false)
    assert.deepEqual((await outsider.request('room:resume', { code: hostSession.code, token: id() })).reply,
      { ok: false, error: 'invalid_token' })
    assert.deepEqual((await host.request()).snapshot.match, hostState.match)
  })

  await test('召喚の応答が失われても再送は一度だけ反映し、古い操作を拒否する', async () => {
    // 購入後の初手はランダム。AP不足なら正規のターン進行で召喚可能な状態を準備する。
    for (let round = 0; round < 10; round++) {
      const state = (await host.request()).snapshot
      if (state.match.you.hand.some(card => card.cost <= state.match.you.ap)) break
      for (const active of [host, guest]) {
        const snapshot = (await active.request()).snapshot
        assert.equal(snapshot.match.activePlayerId, snapshot.playerId)
        const result = await active.request('match:action', action(snapshot))
        assert.deepEqual(result.reply, { ok: true })
      }
    }
    const before = (await host.request()).snapshot
    const card = before.match.you.hand.find(card => card.cost <= before.match.you.ap)
    assert.ok(card, '10巡後にも召喚可能なカードがありません')
    const play = action(before, { type: 'play_card', cardInstanceId: card.instanceId })
    await host.dropReply('match:action', play)
    const retry = await host.request('match:action', play)
    assert.deepEqual(retry.reply, { ok: true })
    assert.equal(retry.snapshot.match.revision, before.match.revision + 1)
    assert.equal(retry.snapshot.match.you.field.filter(card => card.fid === play.cardInstanceId).length, 1)
    const conflict = await host.request('match:action', { ...play, type: 'end_turn' })
    assert.deepEqual(conflict.reply, { ok: false, error: 'action_id_conflict' })
    assert.deepEqual((await host.request('match:action', action(before))).reply, { ok: false, error: 'stale_revision' })
    assert.equal((await guest.request()).snapshot.match.revision, retry.snapshot.match.revision)
  })

  await test('HTTPの防御待ちを再接続で引き継ぎ、応答消失後もガリを一度だけ消費する', async () => {
    const left = client(server), right = client(server)
    const created = await left.request('room:create')
    const joined = await right.request('room:join', { code: created.reply.session.code })
    assert.equal(joined.reply.ok, true)
    const draft = (await left.request()).snapshot.draft
    assert.deepEqual((await left.request('draft:action', {
      draftId: draft.draftId, expectedRevision: draft.revision, actionId: `gari-draft-${++nextActionId}`,
      type: 'order', cardId: 'salmon',
    })).reply, { ok: true })
    await finishBoth(left, right, false)
    let before = (await left.request()).snapshot
    const salmon = before.match.you.hand.find(card => card.id === 'salmon')
    assert.ok(salmon)
    const played = await left.request('match:action', action(before, {
      type: 'play_card', cardInstanceId: salmon.instanceId,
    }))
    assert.deepEqual(played.reply, { ok: true })
    const attack = await left.request('match:action', action(played.snapshot))
    assert.deepEqual(attack.reply, { ok: true })
    assert.equal(attack.snapshot.match.phase, 'defending')
    assert.deepEqual(attack.snapshot.match.pendingAttack, { attackerId: 1, defenderId: 2, amount: 8, source: 'end_turn' })
    before = (await right.request()).snapshot
    assert.equal(before.match.you.gari, 2)
    assert.equal(before.match.you.belly, 0)
    assert.deepEqual(before.match.pendingAttack, attack.snapshot.match.pendingAttack)
    const resumed = client(server)
    const resume = await resumed.request('room:resume', joined.reply.session)
    assert.equal(resume.reply.ok, true)
    assert.deepEqual(resume.snapshot.match, before.match)
    assert.deepEqual(await right.request(), { closed: 'replaced' })
    const defense = action(resume.snapshot, { type: 'respond_defense', useGari: true })
    await resumed.dropReply('match:action', defense)
    const retry = await resumed.request('match:action', defense)
    assert.deepEqual(retry.reply, { ok: true })
    const after = retry.snapshot.match
    assert.equal(after.revision, before.match.revision + 1)
    assert.equal(after.you.gari, 1)
    assert.equal(after.you.belly, 2, '8の攻撃を半減して4受け、手番開始時に2消化する')
    assert.equal(after.pendingAttack, null)
    assert.equal(after.activePlayerId, 2)
    assert.equal(after.phase, 'playing')
    assert.deepEqual((await resumed.request('match:action', { ...defense, useGari: false })).reply,
      { ok: false, error: 'action_id_conflict' })
    assert.deepEqual((await resumed.request('match:action', { ...defense, actionId: `stale-defense-${++nextActionId}` })).reply,
      { ok: false, error: 'stale_revision' })
    assert.deepEqual((await resumed.request()).snapshot.match, after)
    assert.equal((await left.request()).snapshot.match.opponent.gari, 1)
    privateSnapshot(retry.snapshot)
    await left.request('room:leave')
  })

  await test('HTTPだけで2人の対戦を完走し、双方の同意で再戦する', async () => {
    let snapshot = (await host.request()).snapshot
    let steps = 0
    while (snapshot.match.phase !== 'over' && steps++ < 500) {
      if (snapshot.draft) await finishBoth(host, guest)
      const active = (snapshot.match.pendingAttack?.defenderId ?? snapshot.match.activePlayerId) === 1 ? host : guest
      snapshot = (await active.request()).snapshot
      const match = snapshot.match
      const card = match.you.field.length < 8
        ? [...match.you.hand].sort((a, b) => b.attack - a.attack).find(card => card.cost <= match.you.ap)
        : undefined
      const result = await active.request('match:action', action(snapshot, match.phase === 'defending'
        ? { type: 'respond_defense', useGari: match.you.gari > 0 }
        : card ? { type: 'play_card', cardInstanceId: card.instanceId } : {}))
      assert.deepEqual(result.reply, { ok: true })
      snapshot = result.snapshot
      privateSnapshot(snapshot)
    }
    assert.equal(snapshot.match.phase, 'over')
    const oldId = snapshot.match.matchId
    const consent = await host.request('match:rematch')
    assert.deepEqual(consent.reply, { ok: true })
    assert.equal(consent.snapshot.match.matchId, oldId)
    const rematch = await guest.request('match:rematch')
    assert.deepEqual(rematch.reply, { ok: true })
    assert.equal(rematch.snapshot.match, null)
    assert.equal(rematch.snapshot.draft.mode, 'initial')
    await finishBoth(host, guest)
    const restarted = (await host.request()).snapshot.match
    assert.notEqual(restarted.matchId, oldId)
    assert.equal(restarted.phase, 'playing')
    assert.equal(restarted.revision, 0)
  })

  await test('正規トークンで接続を引き継ぎ、旧HTTP接続の全要求をreplacedで止める', async () => {
    const replacement = client(server)
    const resumed = await replacement.request('room:resume', guestSession)
    assert.equal(resumed.reply.ok, true)
    for (const event of ['poll', 'room:create', 'room:resume', 'match:action']) {
      assert.deepEqual(await guest.request(event, guestSession), { closed: 'replaced' })
    }
    assert.equal((await host.request()).snapshot.connected[2], true)
    const leave = await replacement.request('room:leave')
    assert.deepEqual(leave.reply, { ok: true })
    assert.equal(leave.closed, 'left')
    assert.deepEqual(await host.request(), { closed: 'left' })
    assert.deepEqual(await replacement.request('room:create'), { closed: 'left' })
    assert.deepEqual((await client(server).request('room:resume', guestSession)).reply, { ok: false, error: 'room_not_found' })
  })

  await test('Origin・JSON・メソッド・本文サイズを変更処理前に検査する', async () => {
    const candidate = client(server)
    const body = JSON.stringify({ clientId: candidate.clientId, event: 'room:create' })
    const cases = [
      [{ method: 'GET' }, 405],
      [{ method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }, 415],
      [{ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body }, 403],
      [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, 400],
      [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'guessable', event: 'room:create' }) }, 400],
      [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: candidate.clientId, event: 'arbitrary' }) }, 400],
      [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `${body}${' '.repeat(16 * 1024)}` }, 413],
      [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half', body: Readable.from([body, ' '.repeat(16 * 1024)]) }, 413],
    ]
    for (const [options, status] of cases) {
      const result = await fetch(`${server.url}/api/room`, options)
      assert.equal(result.status, status)
      assert.equal(result.headers.get('cache-control'), 'no-store')
      await result.arrayBuffer()
      assert.deepEqual(await candidate.request(), {})
    }
    const accepted = await fetch(`${server.url}/api/room`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Origin: 'http://localhost:5173' }, body,
    })
    assert.equal(accepted.status, 200)
    assert.equal((await accepted.json()).reply.ok, true)
  })

  await test('HTTPとSocket.IOが同じ部屋・試合を共有し、相互に接続を引き継げる', async () => {
    const http = client(server)
    const created = await http.request('room:create')
    const socket = io(server.url, { transports: ['websocket'], reconnection: false, forceNew: true })
    sockets.add(socket)
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
    const rpc = (event, payload) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, payload,
      (error, result) => error ? reject(error) : resolve(result)))
    const joined = await rpc('room:join', { code: created.reply.session.code })
    assert.equal(joined.ok, true)
    assert.ok((await http.request()).snapshot.draft)
    const replacement = client(server)
    const replaced = new Promise(resolve => socket.once('room:closed', resolve))
    assert.equal((await replacement.request('room:resume', joined.session)).reply.ok, true)
    assert.equal(await replaced, 'replaced')
    assert.equal((await http.request()).snapshot.connected[2], true)
    const second = io(server.url, { transports: ['websocket'], reconnection: false, forceNew: true })
    sockets.add(second)
    await new Promise((resolve, reject) => { second.once('connect', resolve); second.once('connect_error', reject) })
    const takeover = await new Promise((resolve, reject) => second.timeout(2000).emit('room:resume', created.reply.session,
      (error, result) => error ? reject(error) : resolve(result)))
    assert.equal(takeover.ok, true)
    assert.deepEqual(await http.request(), { closed: 'replaced' })
    assert.equal((await replacement.request()).snapshot.connected[1], true)
    second.disconnect()
    socket.disconnect()
  })

  await test('HTTPでもサイド皿を購入でき、再送とレーン・タブレット間の追加購入を防ぐ', async () => {
    const left = client(server), right = client(server)
    const created = await left.request('room:create')
    assert.equal((await right.request('room:join', { code: created.reply.session.code })).reply.ok, true)
    const sendDraft = async (buyer, command) => {
      const draft = (await buyer.request()).snapshot.draft
      return buyer.request('draft:action', {
        draftId: draft.draftId, expectedRevision: draft.revision,
        actionId: `http-side-${++nextActionId}`, ...command,
      })
    }
    const initial = (await left.request()).snapshot.draft
    const sides = initial.offers.filter(offer => offer.sideMenuId)
    assert.deepEqual(sides.map(offer => offer.slot), [3, 7])
    assert.ok(sides.every(offer => !('card' in offer)))
    const purchase = {
      type: 'buy', offerId: sides[0].id, draftId: initial.draftId,
      expectedRevision: initial.revision, actionId: `http-side-${++nextActionId}`,
    }
    await left.dropReply('draft:action', purchase)
    const retry = await left.request('draft:action', purchase)
    assert.deepEqual(retry.reply, { ok: true })
    const after = retry.snapshot.draft
    assert.equal(after.you.sideMenu, sides[0].sideMenuId)
    assert.equal(after.you.budget, initial.you.budget - 300)
    assert.equal(after.you.deck.length, 0)
    assert.equal(after.you.shinkansenLeft, initial.you.shinkansenLeft)
    assert.equal(after.offers.find(offer => offer.id === sides[0].id).sold, true)
    assert.equal(after.revision, initial.revision + 1)
    assert.deepEqual((await sendDraft(left, { type: 'buy', offerId: sides[0].id })).reply,
      { ok: false, error: 'draft_duplicate' })
    assert.deepEqual((await sendDraft(left, { type: 'buy', offerId: sides[1].id })).reply,
      { ok: false, error: 'draft_side_menu_owned' })
    assert.deepEqual((await sendDraft(left, { type: 'buy_side_menu', sideMenuId: 'ramen' })).reply,
      { ok: false, error: 'draft_side_menu_owned' })
    assert.deepEqual((await left.request()).snapshot.draft.you, after.you)

    const tablet = await sendDraft(right, { type: 'buy_side_menu', sideMenuId: 'ramen' })
    assert.deepEqual(tablet.reply, { ok: true })
    const rightOffer = tablet.snapshot.draft.offers.find(offer => offer.sideMenuId)
    assert.deepEqual((await sendDraft(right, { type: 'buy', offerId: rightOffer.id })).reply,
      { ok: false, error: 'draft_side_menu_owned' })
    assert.deepEqual((await right.request()).snapshot.draft.you, tablet.snapshot.draft.you)
    await finishBoth(left, right, false)
    const match = (await left.request()).snapshot.match
    assert.equal(match.you.sideMenu.id, sides[0].sideMenuId)
    assert.equal(match.opponent.sideMenu.id, 'ramen')
    privateSnapshot({ match, playerId: 1 })
    await left.request('room:leave')
  })

  await test('poll停止で一時切断し、同じclientIdでもトークンで状態を回復できる', async () => {
    const ttlServer = await start({ httpPresenceTtlMs: 100, resumeTtlMs: 500 })
    const left = client(ttlServer)
    const right = client(ttlServer)
    const created = await left.request('room:create')
    const joined = await right.request('room:join', { code: created.reply.session.code })
    await finishBoth(left, right, false)
    const gone = await waitFor(() => left.request(), value => value.snapshot?.connected[2] === false)
    const denied = await left.request('match:action', action(gone.snapshot))
    assert.deepEqual(denied.reply, { ok: false, error: 'players_disconnected' })
    assert.deepEqual(await right.request(), {})
    const resumed = await right.request('room:resume', joined.reply.session)
    assert.equal(resumed.reply.ok, true)
    assert.deepEqual(resumed.snapshot.connected, { 1: true, 2: true })
    assert.equal(resumed.snapshot.match.matchId, gone.snapshot.match.matchId)
    const stillConnected = await left.request()
    assert.equal(stillConnected.snapshot.connected[2], true)
  })

  await test('復帰期限が過ぎた部屋を破棄し、残った利用者へexpiredを返す', async () => {
    const ttlServer = await start({ httpPresenceTtlMs: 100, resumeTtlMs: 100 })
    const left = client(ttlServer)
    const right = client(ttlServer)
    const created = await left.request('room:create')
    const joined = await right.request('room:join', { code: created.reply.session.code })
    await waitFor(() => left.request(), value => value.closed === 'expired')
    assert.deepEqual((await client(ttlServer).request('room:resume', joined.reply.session)).reply,
      { ok: false, error: 'room_not_found' })
    assert.deepEqual(await right.request(), {})
    await ttlServer.close()
    await ttlServer.close()
    servers.delete(ttlServer)
    await assert.rejects(fetch(`${ttlServer.url}/health`))
  })
  await test('サーバー終了時は本文の送信途中でもHTTP接続を解放する', async () => {
    const stopping = await start()
    const received = new Promise(resolve => stopping.httpServer.once('request', resolve))
    const pending = httpRequest(`${stopping.url}/api/room`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    })
    pending.on('error', () => {})
    pending.write('{')
    await received
    let deadline
    try {
      await Promise.race([
        stopping.close(),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('HTTP終了待ちが残りました')), 1000) }),
      ])
    } finally {
      clearTimeout(deadline)
      pending.destroy()
    }
    servers.delete(stopping)
  })
} catch (error) {
  console.error(error.stack)
  process.exitCode = 1
} finally {
  for (const socket of sockets) socket.disconnect()
  for (const server of servers) await server.close()
}
console.log(`\nHTTP対戦: ${passed}件成功`)
