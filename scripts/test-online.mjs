#!/usr/bin/env node
// 実際のSocket.IOクライアントで試す。固定ポート・ブラウザ・外部サービスは不要。
// 実行: node --import tsx scripts/test-online.mjs
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { createGameServer } from '../server/gameServer.ts'
import { finishPurchases } from './online-test-helpers.mjs'

const sockets = new Set()
const servers = new Set()
let passed = 0
let failed = 0
let nextActionId = 0
const TIMEOUT = 3000

async function test(label, run) {
  try {
    await run()
    passed++
    console.log(`  ✓ ${label}`)
  } catch (error) {
    failed++
    console.error(`  ✗ ${label}\n${error.stack}`)
    throw error
  }
}

async function startServer(options = {}) {
  // 初手に低APの寿司がある購入・配札を再現する。乱数の消費順にも依存させない。
  const server = await createGameServer({ port: 0, host: '127.0.0.1', random: () => 0.5, ...options })
  servers.add(server)
  return server
}

async function connect(url) {
  const socket = io(url, { transports: ['websocket'], autoConnect: false, reconnection: false, forceNew: true })
  sockets.add(socket)
  const client = { socket, latest: null, snapshots: [], closed: [] }
  socket.on('room:state', snapshot => {
    client.latest = snapshot
    client.snapshots.push(snapshot)
  })
  socket.on('room:closed', reason => client.closed.push(reason))
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Socket.IO接続がタイムアウトしました')), TIMEOUT)
    const finish = error => {
      clearTimeout(timeout)
      socket.off('connect', onConnect)
      socket.off('connect_error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onConnect = () => finish()
    const onError = error => finish(error)
    socket.once('connect', onConnect)
    socket.once('connect_error', onError)
    socket.connect()
  })
  return client
}

function rpc(client, event, payload) {
  return new Promise((resolve, reject) => {
    const args = payload === undefined ? [] : [payload]
    client.socket.timeout(TIMEOUT).emit(event, ...args, (error, result) => {
      if (error) reject(new Error(`${event}の応答がタイムアウトしました`, { cause: error }))
      else resolve(result)
    })
  })
}

function waitSnapshot(client, predicate) {
  if (client.latest && predicate(client.latest)) return Promise.resolve(client.latest)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.off('room:state', listener)
      reject(new Error('期待する部屋状態が配信されませんでした'))
    }, TIMEOUT)
    const listener = snapshot => {
      if (!predicate(snapshot)) return
      clearTimeout(timeout)
      client.socket.off('room:state', listener)
      resolve(snapshot)
    }
    client.socket.on('room:state', listener)
  })
}

function waitClosed(client, reason) {
  if (client.closed.includes(reason)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.off('room:closed', listener)
      reject(new Error(`部屋終了の通知がありません: ${reason}`))
    }, TIMEOUT)
    const listener = actual => {
      if (actual !== reason) return
      clearTimeout(timeout)
      client.socket.off('room:closed', listener)
      resolve()
    }
    client.socket.on('room:closed', listener)
  })
}

function nextAction(client, patch = {}) {
  const match = client.latest?.match
  assert.ok(match)
  return {
    type: 'end_turn', matchId: match.matchId, expectedRevision: match.revision,
    actionId: `test-action-${++nextActionId}`, ...patch,
  }
}

async function finishBoth(host, guest) {
  for (const client of [host, guest]) {
    await waitSnapshot(client, state => Boolean(state.draft))
    await finishPurchases((event, payload) => rpc(client, event, payload), () => client.latest)
  }
  await Promise.all([host, guest].map(client => waitSnapshot(client, state => !state.draft && state.match?.phase === 'playing')))
}

async function acceptedAction(client, action) {
  const before = client.latest.match.revision
  const reply = await rpc(client, 'match:action', action)
  assert.deepEqual(reply, { ok: true })
  return waitSnapshot(client, snapshot => snapshot.match?.revision > before)
}

function assertPrivate(snapshot) {
  const match = snapshot.match
  if (!match) return
  assert.deepEqual(Object.keys(match).sort(), [
    'matchId', 'revision', 'activePlayerId', 'turn', 'phase', 'winnerId', 'pendingAttack', 'pendingReaction', 'you', 'opponent', 'log', 'comboEvents',
  ].sort(), '配信状態に内部試合データを追加してはいけません')
  assert.equal('deck' in match.you, false, '自分の山札の中身も未公開です')
  assert.equal('hand' in match.opponent, false, '相手の手札は送信しません')
  assert.equal('deck' in match.opponent, false, '相手の山札は送信しません')
  assert.ok(Array.isArray(match.you.hand))
  assert.ok(Number.isInteger(match.you.deckCount))
  assert.ok(Number.isInteger(match.opponent.handCount))
  assert.ok(Number.isInteger(match.opponent.deckCount))
  assert.equal(match.you.id, snapshot.playerId)
  assert.notEqual(match.opponent.id, snapshot.playerId)
}

console.log('\n[通信対戦] 実サーバー・実クライアント間の統合テスト')
try {
  const server = await startServer({ resumeTtlMs: 1000 })
  const host = await connect(server.url)
  let guest = await connect(server.url)
  const outsider = await connect(server.url)
  let hostSession
  let guestSession
  let firstAction

  await test('部屋を作成するとP1として待機し、秘密の再参加トークンを受け取る', async () => {
    const reply = await rpc(host, 'room:create')
    assert.equal(reply.ok, true)
    hostSession = reply.session
    assert.equal(hostSession.playerId, 1)
    assert.match(hostSession.code, /^\d{6}$/, 'UIの入力・保存済みセッション検証と同じ数字6桁にします')
    assert.ok(hostSession.token.length >= 16)
    assert.equal(reply.snapshot.match, null)
    assert.equal('token' in reply.snapshot, false)
    await waitSnapshot(host, snapshot => snapshot.code === hostSession.code)
  })

  await test('部屋作成を再送しても別の部屋を作らず、同じ参加情報を取得できる', async () => {
    const retry = await rpc(host, 'room:create')
    assert.equal(retry.ok, true)
    assert.deepEqual(retry.session, hostSession)
    assert.equal(retry.snapshot.code, hostSession.code)
    assert.equal(retry.snapshot.match, null)
  })

  await test('2人目の参加で同時購入を開始し、両者が完了したデッキで対戦する', async () => {
    const reply = await rpc(guest, 'room:join', { code: hostSession.code })
    assert.equal(reply.ok, true)
    guestSession = reply.session
    assert.equal(guestSession.playerId, 2)
    assert.notEqual(guestSession.token, hostSession.token)
    await waitSnapshot(host, snapshot => snapshot.draft !== null)
    assert.equal(host.latest.match, null)
    assert.equal(reply.snapshot.draft.you.budget, 3000)
    const draftId = host.latest.draft.draftId
    assert.deepEqual(await rpc(host, 'draft:hover', { draftId, lanes: ['build'], sequence: 1 }), { ok: true })
    const paused = await waitSnapshot(host, state => state.draft?.laneClocks.build.pausedAt !== null)
    assert.equal(paused.draft.laneClocks.general.pausedAt, null)
    assert.equal(guest.latest.draft.laneClocks.build.pausedAt, null)
    assert.deepEqual(await rpc(host, 'draft:hover', { draftId, lanes: [], sequence: 2 }), { ok: true })
    await waitSnapshot(host, state => state.draft?.laneClocks.build.pausedAt === null)
    await finishBoth(host, guest)
    const snapshots = await Promise.all([
      waitSnapshot(host, snapshot => snapshot.match !== null),
      waitSnapshot(guest, snapshot => snapshot.match !== null),
    ])
    for (const snapshot of snapshots) {
      assert.deepEqual(snapshot.connected, { 1: true, 2: true })
      assert.deepEqual(snapshot.rematchRequested, { 1: false, 2: false })
      assert.equal(snapshot.match.activePlayerId, 1)
      assert.ok(snapshot.match.you.hand.length + snapshot.match.you.deckCount > 0)
      assert.ok(snapshot.match.you.hand.length + snapshot.match.you.deckCount <= 20)
    }
    const full = await rpc(outsider, 'room:join', { code: hostSession.code })
    assert.equal(full.ok, false)
    assert.deepEqual(await rpc(outsider, 'room:join', { code: 'A1B2C3' }), { ok: false, error: 'invalid_code' })
  })

  await test('同じ部屋への参加再送で席・試合を維持し、別の部屋への参加は拒否する', async () => {
    const before = guest.latest.match
    const retry = await rpc(guest, 'room:join', { code: hostSession.code })
    assert.equal(retry.ok, true)
    assert.deepEqual(retry.session, guestSession)
    assert.deepEqual(retry.snapshot.match, before)
    const createRetry = await rpc(guest, 'room:create')
    assert.equal(createRetry.ok, true)
    assert.deepEqual(createRetry.session, guestSession)
    assert.deepEqual(createRetry.snapshot.match, before)
    const otherCode = String((Number(hostSession.code) + 1) % 1_000_000).padStart(6, '0')
    const otherRoom = await rpc(guest, 'room:join', { code: otherCode })
    assert.deepEqual(otherRoom, { ok: false, error: 'already_in_room' })
  })

  await test('相手の手札・両者の山札・再参加トークンを配信データへ含めない', async () => {
    for (const client of [host, guest]) {
      client.snapshots.forEach(assertPrivate)
      const other = client === host ? guest : host
      const wire = JSON.stringify(client.latest)
      for (const card of other.latest.match.you.hand) {
        assert.equal(wire.includes(card.instanceId), false)
      }
      assert.equal(wire.includes(hostSession.token), false)
      assert.equal(wire.includes(guestSession.token), false)
    }
  })

  await test('手番と本人をサーバーで判断し、なりすまし・他人のカードを拒否する', async () => {
    const before = JSON.stringify(host.latest.match)
    const wrongPlayer = await rpc(guest, 'match:action', nextAction(guest, { playerId: 1 }))
    assert.equal(wrongPlayer.ok, false)
    const wrongCard = await rpc(host, 'match:action', nextAction(host, {
      type: 'play_card', cardInstanceId: guest.latest.match.you.hand[0].instanceId,
    }))
    assert.equal(wrongCard.ok, false)
    const noRoom = await rpc(outsider, 'match:action', nextAction(host))
    assert.equal(noRoom.ok, false)
    assert.equal(JSON.stringify(host.latest.match), before)
  })

  await test('召喚を両者へ反映し、同じactionIdの再送は一度しか処理しない', async () => {
    // 購入したデッキの初手はランダムなので、初期APで出せるカードがあるとは限らない。
    // 両者の通常操作でAPと手札を増やし、召喚できる実際の状態から再送を検証する。
    for (let round = 0; round < 10; round++) {
      if (host.latest.match.you.hand.some(card => card.cost <= host.latest.match.you.ap)) break
      for (const [client, other] of [[host, guest], [guest, host]]) {
        assert.equal(client.latest.match.activePlayerId, client.latest.playerId)
        const snapshot = await acceptedAction(client, nextAction(client))
        await waitSnapshot(other, state => state.match?.revision === snapshot.match.revision)
      }
    }
    const before = host.latest.match
    const card = before.you.hand.find(c => c.cost <= before.you.ap)
    assert.ok(card, '10巡後にも召喚可能なカードがありません')
    firstAction = nextAction(host, { type: 'play_card', cardInstanceId: card.instanceId })
    const snapshot = await acceptedAction(host, firstAction)
    const after = snapshot.match
    assert.equal(after.revision, before.revision + 1)
    assert.equal(after.you.ap, before.you.ap - card.cost)
    assert.ok(after.you.field.some(c => c.fid === card.instanceId))
    await waitSnapshot(guest, state => state.match.revision === after.revision)
    assert.ok(guest.latest.match.opponent.field.some(c => c.fid === card.instanceId))
    assert.deepEqual(await rpc(host, 'match:action', firstAction), { ok: true })
    assert.equal(host.latest.match.revision, after.revision)
    assert.deepEqual(host.latest.match, after)
  })

  await test('同じactionIdの別操作と古いrevisionを拒否し、最新状態を維持する', async () => {
    const before = JSON.stringify(host.latest.match)
    const conflict = await rpc(host, 'match:action', { ...firstAction, type: 'end_turn' })
    assert.deepEqual(conflict, { ok: false, error: 'action_id_conflict' })
    const stale = await rpc(host, 'match:action', nextAction(host, { expectedRevision: 0 }))
    assert.deepEqual(stale, { ok: false, error: 'stale_revision' })
    assert.equal(JSON.stringify(host.latest.match), before)
  })

  await test('ターン終了を相手へ渡し、対戦中の再戦要求を拒否する', async () => {
    let snapshot = await acceptedAction(host, nextAction(host))
    await waitSnapshot(guest, state => state.match.revision === snapshot.match.revision)
    assert.equal(snapshot.match.phase, 'defending')
    assert.equal(snapshot.match.pendingAttack.defenderId, 2)
    assert.deepEqual(guest.latest.match.pendingAttack, snapshot.match.pendingAttack)
    snapshot = await acceptedAction(guest, nextAction(guest, { type: 'respond_defense', useGari: true }))
    await waitSnapshot(host, state => state.match.revision === snapshot.match.revision)
    assert.equal(snapshot.match.you.gari, 1)
    assert.equal(snapshot.match.pendingAttack, null)
    assert.equal(guest.latest.match.activePlayerId, 2)
    assert.equal((await rpc(host, 'match:rematch')).ok, false)
    const guestEnd = await acceptedAction(guest, nextAction(guest))
    await waitSnapshot(host, state => state.match.revision === guestEnd.match.revision)
    assert.equal(host.latest.match.activePlayerId, 1)
  })

  await test('切断時は進行を止め、予約済みの席への新規参加を拒否する', async () => {
    guest.socket.disconnect()
    await waitSnapshot(host, snapshot => snapshot.connected[2] === false)
    const revision = host.latest.match.revision
    const reply = await rpc(host, 'match:action', nextAction(host))
    assert.deepEqual(reply, { ok: false, error: 'players_disconnected' })
    assert.equal(host.latest.match.revision, revision)
    assert.equal((await rpc(outsider, 'room:join', { code: hostSession.code })).ok, false)
  })

  await test('正しいトークンだけが元の席と最新対戦状態へ復帰できる', async () => {
    const wrong = await rpc(outsider, 'room:resume', { code: hostSession.code, token: 'wrong-token' })
    assert.equal(wrong.ok, false)
    const revision = host.latest.match.revision
    guest = await connect(server.url)
    const reply = await rpc(guest, 'room:resume', { code: guestSession.code, token: guestSession.token })
    assert.equal(reply.ok, true)
    assert.equal(reply.session.playerId, 2)
    assert.equal(reply.snapshot.match.revision, revision)
    await waitSnapshot(host, snapshot => snapshot.connected[2] === true)
    await waitSnapshot(guest, snapshot => snapshot.match?.revision === revision)
    assertPrivate(guest.latest)
  })

  await test('接続中の席へ正規トークンで復帰すると、旧接続だけを置き換える', async () => {
    const oldGuest = guest
    guest = await connect(server.url)
    const reply = await rpc(guest, 'room:resume', { code: guestSession.code, token: guestSession.token })
    assert.equal(reply.ok, true)
    await waitClosed(oldGuest, 'replaced')
    await waitSnapshot(guest, snapshot => snapshot.playerId === 2 && snapshot.connected[2])
    assert.equal(guest.socket.connected, true)
    assert.equal(host.latest.connected[2], true)
  })

  await test('2クライアントが購入・追加注文・召喚を送信して対戦を最後まで進める', async () => {
    let actionCount = 0
    while (host.latest.match.phase !== 'over' && actionCount < 500) {
      if (host.latest.draft) await finishBoth(host, guest)
      const current = host.latest.match
      const client = (current.pendingAttack?.defenderId ?? current.activePlayerId) === 1 ? host : guest
      await waitSnapshot(client, state => state.match.revision >= current.revision)
      const match = client.latest.match
      assert.ok(match.phase === 'playing' || match.phase === 'defending')
      const card = match.you.field.length < 8
        ? [...match.you.hand].sort((a, b) => b.attack - a.attack).find(c => c.cost <= match.you.ap)
        : undefined
      const action = nextAction(client, match.phase === 'defending'
        ? { type: 'respond_defense', useGari: match.you.gari > 0 }
        : card ? { type: 'play_card', cardInstanceId: card.instanceId } : {})
      const snapshot = await acceptedAction(client, action)
      const other = client === host ? guest : host
      await waitSnapshot(other, state => state.match.revision >= snapshot.match.revision)
      actionCount++
    }
    assert.equal(host.latest.match.phase, 'over', '500操作以内に対戦を完走できる必要があります')
    assert.equal(guest.latest.match.phase, 'over')
    assert.equal(host.latest.match.winnerId, guest.latest.match.winnerId)
    assert.ok(host.latest.match.winnerId === 1 || host.latest.match.winnerId === 2)
    host.snapshots.forEach(assertPrivate)
    guest.snapshots.forEach(assertPrivate)
  })

  await test('再戦は双方の同意でのみ開始し、前試合の操作は再利用できない', async () => {
    const oldMatch = host.latest.match
    const staleAction = nextAction(host)
    assert.deepEqual(await rpc(host, 'match:rematch'), { ok: true })
    await waitSnapshot(host, snapshot => snapshot.rematchRequested[1])
    assert.equal(host.latest.match.matchId, oldMatch.matchId)
    assert.equal(host.latest.match.phase, 'over')
    assert.deepEqual(await rpc(host, 'match:rematch'), { ok: true })
    assert.equal(host.latest.match.matchId, oldMatch.matchId)
    assert.deepEqual(await rpc(guest, 'match:rematch'), { ok: true })
    await waitSnapshot(host, state => Boolean(state.draft))
    assert.equal(host.latest.match, null)
    assert.equal(host.latest.draft.you.budget, 3000)
    await finishBoth(host, guest)
    await Promise.all([
      waitSnapshot(host, state => state.match.matchId !== oldMatch.matchId),
      waitSnapshot(guest, state => state.match.matchId !== oldMatch.matchId),
    ])
    assert.equal(host.latest.match.phase, 'playing')
    assert.equal(host.latest.match.turn, 1)
    assert.equal(host.latest.match.revision, 0)
    assert.deepEqual(host.latest.match.comboEvents, [])
    assert.deepEqual(host.latest.rematchRequested, { 1: false, 2: false })
    const stale = await rpc(host, 'match:action', { ...staleAction, expectedRevision: 0 })
    assert.deepEqual(stale, { ok: false, error: 'stale_match' })
    assert.equal(host.latest.match.revision, 0)
  })

  await test('退出すると双方へ部屋終了を通知し、旧部屋へ参加できなくなる', async () => {
    assert.deepEqual(await rpc(host, 'room:leave'), { ok: true })
    await Promise.all([waitClosed(host, 'left'), waitClosed(guest, 'left')])
    assert.equal((await rpc(outsider, 'room:join', { code: hostSession.code })).ok, false)
    assert.equal((await rpc(host, 'match:action', nextAction(host))).ok, false)
  })
} catch (error) {
  // 個々のテストが原因を出力済み。独立したTTL検証とリソース解放は続ける。
  if (failed === 0) {
    failed++
    console.error(`  ✗ 通信テストの準備に失敗しました\n${error.stack}`)
  }
}

try {
  await test('切断復帰の猶予が過ぎると部屋を閉じ、古いトークンを無効にする', async () => {
    const server = await startServer({ resumeTtlMs: 50 })
    const host = await connect(server.url)
    const guest = await connect(server.url)
    const created = await rpc(host, 'room:create')
    const joined = await rpc(guest, 'room:join', { code: created.session.code })
    assert.equal(joined.ok, true)
    guest.socket.disconnect()
    await waitClosed(host, 'expired')
    const reconnecting = await connect(server.url)
    const reply = await rpc(reconnecting, 'room:resume', {
      code: joined.session.code, token: joined.session.token,
    })
    assert.equal(reply.ok, false)
  })
} catch {
  // 失敗の詳細はtestが出力する。
} finally {
  for (const socket of sockets) socket.disconnect()
  for (const server of servers) await server.close()
}

console.log(`\n通信対戦: ${passed}件成功 / ${failed}件失敗`)
if (failed > 0) process.exitCode = 1
