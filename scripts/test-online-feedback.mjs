import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoomService } from '../server/roomService.ts'
import { consumeOnlineCombos, onlineComboAnnouncement } from '../src/features/online/onlineCombos.ts'
import { canPlayOnlineCard } from '../src/features/online/onlineBattleActions.ts'

const combo = (sequence, playerId = 1, comboId = 'umi_zanmai') => ({ sequence, playerId, comboId })
const snapshot = (revision, comboEvents = [], patch = {}) => ({
  playerId: 1, draft: null, match: { matchId: 'match-1', revision, comboEvents }, ...patch,
})

test('初回表示は過去の演出を再生せず、pollでまとめて届いた両者の発動を順に取り出す', () => {
  const first = consumeOnlineCombos(null, snapshot(3, [combo(1)]), true)
  assert.deepEqual(first.events, [])
  const next = consumeOnlineCombos(first.cursor, snapshot(12, [combo(1), combo(2, 2), combo(3)]), true)
  assert.deepEqual(next.events, [combo(2, 2), combo(3)])
  assert.deepEqual(next.events.map(event => onlineComboAnnouncement(event, 1).playerLabel), ['OPPONENT', 'YOU'])
  assert.deepEqual(next.events.map(event => onlineComboAnnouncement(event, 2).playerLabel), ['YOU', 'OPPONENT'])
})

test('重複snapshot・古いrevisionを再生せず、同じコンボの再発動は別の連番で表示する', () => {
  let cursor = consumeOnlineCombos(null, snapshot(0), true).cursor
  const latest = snapshot(5, [combo(1), combo(2)])
  const first = consumeOnlineCombos(cursor, latest, true)
  assert.equal(first.events.length, 2)
  cursor = first.cursor
  for (const duplicate of [latest, structuredClone(latest), snapshot(2, [combo(1)])]) {
    const result = consumeOnlineCombos(cursor, duplicate, true)
    assert.deepEqual(result.events, [])
    cursor = result.cursor
  }
  assert.deepEqual(consumeOnlineCombos(cursor, snapshot(6, [combo(1), combo(2), combo(3)]), true).events, [combo(3)])
})

test('再接続は新しいsnapshotまで待ち、切断前の履歴も復帰時の履歴も再生しない', () => {
  const stale = snapshot(5, [combo(1)])
  let cursor = consumeOnlineCombos(null, stale, true).cursor
  const disconnected = consumeOnlineCombos(cursor, stale, false)
  assert.equal(disconnected.reset, true)
  cursor = disconnected.cursor
  const connected = consumeOnlineCombos(cursor, stale, true)
  assert.equal(connected.cursor.awaitingSnapshot, true)
  assert.deepEqual(connected.events, [])
  const resumed = consumeOnlineCombos(connected.cursor, snapshot(8, [combo(1), combo(2, 2)]), true)
  assert.deepEqual(resumed.events, [])
  assert.equal(resumed.reset, true)
  assert.deepEqual(consumeOnlineCombos(resumed.cursor, snapshot(9, [combo(1), combo(2, 2), combo(3)]), true).events, [combo(3)])
})

test('追加注文から戻っても旧演出を繰り返さず、再戦では連番を新しい試合に切り替える', () => {
  let cursor = consumeOnlineCombos(null, snapshot(0), true).cursor
  cursor = consumeOnlineCombos(cursor, snapshot(2, [combo(1)]), true).cursor
  const reorder = consumeOnlineCombos(cursor, snapshot(3, [combo(1)], { draft: { mode: 'reorder' } }), true)
  assert.equal(reorder.reset, false)
  assert.deepEqual(reorder.events, [])
  const resumed = consumeOnlineCombos(reorder.cursor, snapshot(5, [combo(1)]), true)
  assert.deepEqual(resumed.events, [])
  cursor = consumeOnlineCombos(resumed.cursor, snapshot(6, [combo(1), combo(2)]), true).cursor
  const rematch = consumeOnlineCombos(cursor, snapshot(0, [], { match: { matchId: 'match-2', revision: 0, comboEvents: [] } }), true)
  assert.equal(rematch.reset, true)
  const next = snapshot(1, [], { match: { matchId: 'match-2', revision: 1, comboEvents: [combo(1, 2)] } })
  assert.deepEqual(consumeOnlineCombos(rematch.cursor, next, true).events, [combo(1, 2)])
})

test('pollに発動と追加注文の開始がまとまっても、新しい演出を失わず戻った際に繰り返さない', () => {
  const cursor = consumeOnlineCombos(null, snapshot(0), true).cursor
  const reorder = consumeOnlineCombos(cursor, snapshot(4, [combo(1), combo(2, 2)], { draft: { mode: 'reorder' } }), true)
  assert.equal(reorder.reset, false)
  assert.deepEqual(reorder.events, [combo(1), combo(2, 2)])
  const resumed = consumeOnlineCombos(reorder.cursor, snapshot(5, [combo(1), combo(2, 2)]), true)
  assert.deepEqual(resumed.events, [])
})

test('履歴の先頭が省略されても残った未表示分を取り出し、未知のコンボは描画しない', () => {
  const cursor = consumeOnlineCombos(null, snapshot(1, [combo(1)]), true).cursor
  assert.deepEqual(consumeOnlineCombos(cursor, snapshot(100, [combo(65), combo(66)]), true).events, [combo(65), combo(66)])
  assert.equal(onlineComboAnnouncement(combo(1, 1, 'future-combo'), 1), null)
})

test('相手ターンに開いたカード詳細も、手番・AP・机・現在の手札に応じて召喚可否を更新する', () => {
  const card = { instanceId: 'my-card', cost: 2 }
  const match = { you: { hand: [card], ap: 2, field: [] } }
  assert.equal(canPlayOnlineCard(match, false, card), false)
  assert.equal(canPlayOnlineCard(match, true, card), true)
  assert.equal(canPlayOnlineCard({ you: { ...match.you, ap: 1 } }, true, card), false)
  assert.equal(canPlayOnlineCard({ you: { ...match.you, field: Array(8).fill({}) } }, true, card), false)
  assert.equal(canPlayOnlineCard({ you: { ...match.you, hand: [] } }, true, card), false)
  assert.equal(canPlayOnlineCard(match, true, { fid: 'field-card', cost: 1 }), false)
  assert.equal(canPlayOnlineCard(match, true, { instanceId: 'opponent-card', cost: 1 }), false)
  assert.equal(canPlayOnlineCard({ you: { ...match.you, ap: 1 } }, true, { ...card, cost: 0 }), false)
})

test('実サーバーの両者コンボを同じ公開履歴に保持し、再送・追加注文で消失や重複を起こさない', t => {
  const service = createRoomService({ resumeTtlMs: 120_000, random: () => 0.5 })
  t.after(() => service.close())
  const peer = id => ({ id, data: {}, latest: null, state(value) { this.latest = structuredClone(value) }, closed() {} })
  const host = peer('combo-host'), guest = peer('combo-guest')
  for (const client of [host, guest]) service.connect(client)
  const created = service.handle(host, 'room:create')
  assert.equal(created.ok, true)
  const joined = service.handle(guest, 'room:join', { code: created.session.code })
  assert.equal(joined.ok, true)
  let actionId = 0
  const read = client => structuredClone(service.snapshot(client))
  const draft = (client, command) => {
    const current = read(client).draft
    assert.deepEqual(service.handle(client, 'draft:action', {
      draftId: current.draftId, expectedRevision: current.revision, actionId: `combo-draft-${++actionId}`, ...command,
    }), { ok: true })
  }
  const buyPair = () => {
    for (const client of [host, guest]) {
      for (const cardId of ['ika', 'takowasa']) {
        draft(client, { type: 'order', cardId })
        draft(client, { type: 'pickup' })
      }
      draft(client, { type: 'complete' })
    }
  }
  const battle = (client, command = { type: 'end_turn' }) => {
    const match = read(client).match
    const action = { matchId: match.matchId, expectedRevision: match.revision, actionId: `combo-battle-${++actionId}`, ...command }
    assert.deepEqual(service.handle(client, 'match:action', action), { ok: true })
    return action
  }
  const play = (client, cardId) => {
    const card = read(client).match.you.hand.find(card => card.id === cardId)
    assert.ok(card)
    return battle(client, { type: 'play_card', cardInstanceId: card.instanceId })
  }
  const defend = (client, source) => {
    const before = read(client).match
    assert.equal(before.phase, 'defending')
    assert.equal(before.pendingAttack.source, source)
    assert.equal(before.pendingAttack.defenderId, read(client).playerId)
    battle(client, { type: 'respond_defense', useGari: false })
    assert.deepEqual(read(client).match.comboEvents, before.comboEvents)
    assert.equal(read(client).match.pendingAttack, null)
  }
  buyPair()
  const initial = read(host)
  let cursor = consumeOnlineCombos(null, initial, true).cursor
  // 3APになるまで双方が手番を終え、いか＋たこを同じ机に揃える。
  battle(host); battle(guest)
  play(host, 'ika')
  defend(guest, 'summon')
  const firstComboAction = play(host, 'takowasa')
  assert.deepEqual(read(host).match.comboEvents, [combo(1)])
  const beforeRetry = read(host).match
  assert.deepEqual(service.handle(host, 'match:action', firstComboAction), { ok: true })
  assert.deepEqual(read(host).match, beforeRetry)
  defend(guest, 'summon')
  assert.equal(read(host).match.activePlayerId, 1, '召喚コンボへの防御後は攻撃側の手番を続ける')
  battle(host)
  defend(guest, 'end_turn')
  play(guest, 'ika'); defend(host, 'summon'); play(guest, 'takowasa')
  const both = read(host)
  assert.deepEqual(both.match.comboEvents, [combo(1), combo(2, 2)])
  assert.deepEqual(read(guest).match.comboEvents, both.match.comboEvents)
  const polled = consumeOnlineCombos(cursor, both, true)
  assert.deepEqual(polled.events, both.match.comboEvents)
  cursor = polled.cursor
  for (const event of both.match.comboEvents) assert.deepEqual(Object.keys(event).sort(), ['comboId', 'playerId', 'sequence'])
  assert.equal(JSON.stringify(both.match.comboEvents).includes('instanceId'), false)
  defend(host, 'summon')
  battle(guest)
  defend(host, 'end_turn')
  const reordering = read(host)
  assert.equal(reordering.draft.mode, 'reorder')
  cursor = consumeOnlineCombos(cursor, reordering, true).cursor
  buyPair()
  const resumed = read(host)
  assert.equal(resumed.match.matchId, initial.match.matchId)
  assert.deepEqual(resumed.match.comboEvents, both.match.comboEvents)
  assert.deepEqual(consumeOnlineCombos(cursor, resumed, true).events, [])
  play(host, 'ika'); defend(guest, 'summon'); play(host, 'takowasa')
  assert.deepEqual(read(host).match.comboEvents, [combo(1), combo(2, 2), combo(3)])
  assert.deepEqual(consumeOnlineCombos(cursor, read(host), true).events, [combo(3)])
  // 再参加先も履歴を受信できるが、初回表示として過去の演出は再生しない。
  const replacement = peer('combo-resumed')
  service.connect(replacement)
  const rejoined = service.handle(replacement, 'room:resume', joined.session)
  assert.equal(rejoined.ok, true)
  assert.deepEqual(rejoined.snapshot.match.comboEvents, read(host).match.comboEvents)
  assert.deepEqual(consumeOnlineCombos(null, rejoined.snapshot, true).events, [])
})
