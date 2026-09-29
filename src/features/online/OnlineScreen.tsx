import { useState } from 'react'
import type { PublicMatch, RoomSnapshot } from '../../network/protocol'
import { BattleBoard, type BattleController } from '../battle/BattleScreen'
import type { ComboAnim, Inspect } from '../battle/types'
import { OnlineLobby } from './OnlineLobby'
import { toOnlineBattleView } from './onlineBattleView'
import { useOnlineRoom, type OnlineRoomController } from './useOnlineRoom'
import { DraftScreenThree } from '../draft/DraftScreenThree'
import { useOnlineComboAnnouncements } from './useOnlineComboAnnouncements'
import { canPlayOnlineCard } from './onlineBattleActions'
import { ComboCutIn } from '../battle/ComboCutIn'
import { AnimatePresence } from 'framer-motion'

export function OnlineScreen({ onBack }: { onBack: () => void }) {
  const room = useOnlineRoom()
  const comboAnim = useOnlineComboAnnouncements(room.snapshot, room.status === 'connected')
  const leave = () => { void room.leaveRoom().finally(onBack) }
  if (room.snapshot?.draft) return <div className="relative h-full">
    <OnlineDraftScreen key={room.snapshot.draft.draftId} room={room} snapshot={room.snapshot} onBack={leave} />
    <AnimatePresence>{comboAnim && <ComboCutIn key={comboAnim.key} combo={comboAnim} />}</AnimatePresence>
  </div>
  if (!room.snapshot?.match) return <OnlineLobby room={room} onBack={leave} />
  return <OnlineBattle key={room.snapshot.match.matchId} room={room}
    snapshot={room.snapshot} match={room.snapshot.match} comboAnim={comboAnim} onBack={leave} />
}

function OnlineDraftScreen({ room, snapshot, onBack }: {
  room: OnlineRoomController; snapshot: RoomSnapshot; onBack: () => void
}) {
  const draft = snapshot.draft!
  const connected = room.status === 'connected'
  const opponentConnected = snapshot.connected[snapshot.playerId === 1 ? 2 : 1]
  return <div className="flex h-full flex-col bg-stone-950">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-amber-100">
      <span>部屋 {snapshot.code} · あなたは P{snapshot.playerId} · {draft.mode === 'initial' ? 'デッキ構築' : '追加注文'}</span>
      <span role="status">{!connected ? '再接続中です。制限時間は進みます。' : room.pending ? '購入内容を確認中…'
        : !opponentConnected ? '相手が再接続中です。購入は続けられます。'
          : draft.opponentCompleted ? '相手は購入を完了しています' : 'それぞれのレーンで同時に購入できます'}</span>
      <button onClick={onBack} className="rounded border border-stone-600 px-3 py-1 hover:bg-stone-800">部屋を退出</button>
    </div>
    {room.error && <p role="alert" className="bg-red-950 px-4 py-2 text-sm text-red-100">{room.error}</p>}
    <div className="relative min-h-0 flex-1">
      {draft.you.completed ? <div className="flex h-full flex-col items-center justify-center gap-4 px-5 text-center text-amber-100">
        <h1 className="text-2xl font-bold">購入が完了しました</h1>
        <p>{draft.you.deck.length}枚購入 · 残金 ¥{draft.you.budget.toLocaleString()}</p>
        <p>相手の購入が終わると、{draft.mode === 'initial' ? '対戦が始まります。' : '対戦を再開します。'}</p>
        <p className="text-sm text-stone-400">制限時間になると自動で購入を締め切ります。</p>
      </div> : <DraftScreenThree playerNum={snapshot.playerId} mode={draft.mode}
        initialBudget={draft.initialBudget} seconds={draft.mode === 'initial' ? 90 : 45}
        onComplete={() => {}} online={{ draft, now: room.serverNow, disabled: !connected || room.pending, send: room.draftAction }} />}
    </div>
  </div>
}

function OnlineBattle({ room, snapshot, match, comboAnim, onBack }: {
  room: OnlineRoomController; snapshot: RoomSnapshot; match: PublicMatch; comboAnim: ComboAnim | null; onBack: () => void
}) {
  const [showLog, setShowLog] = useState(false)
  const [inspect, setInspect] = useState<Inspect | null>(null)
  const ready = room.status === 'connected' && snapshot.connected[1] && snapshot.connected[2]
  const yourTurn = match.activePlayerId === snapshot.playerId
  const canAct = ready && !room.pending && yourTurn && match.phase === 'playing'
  const phase = match.phase === 'over' ? 'over' : canAct ? 'player'
    : !ready || room.pending ? 'syncing' : 'waiting'
  const requested = snapshot.rematchRequested[snapshot.playerId]
  const opponentRequested = snapshot.rematchRequested[snapshot.playerId === 1 ? 2 : 1]
  const currentInspect = inspect && {
    ...inspect,
    canPlay: canPlayOnlineCard(match, canAct, inspect.card),
  }
  const game: BattleController = {
    s: toOnlineBattleView(match, phase), showLog, setShowLog,
    comboAnim, floats: [], inspect: currentInspect, setInspect, reorderStep: 'p',
    playCard: card => {
      if (!canAct || !('instanceId' in card) || typeof card.instanceId !== 'string') return
      setInspect(null)
      void room.playCard(card.instanceId)
    },
    endTurn: () => { if (canAct) { setInspect(null); void room.endTurn() } },
    restart: () => { void room.rematch() },
    handlePassReady: () => {}, handleReorderComplete: () => {},
  }
  return (
    <div className="flex h-full flex-col bg-stone-950">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs text-amber-100">
        <span>部屋 {snapshot.code} · あなたは P{snapshot.playerId} · オンライン対戦</span>
        <span role="status">{match.phase === 'over' ? '対戦終了' : !ready ? '再接続を待っています（操作を一時停止中）'
          : room.pending ? '操作を確認中…' : yourTurn ? 'あなたのターン' : '相手のターン'}</span>
        <button onClick={onBack} className="rounded border border-stone-600 px-3 py-1 hover:bg-stone-800">部屋を退出</button>
      </div>
      {room.error && <p role="alert" className="bg-red-950 px-4 py-2 text-sm text-red-100">{room.error}</p>}
      {opponentRequested && <p className="bg-amber-950 px-4 py-2 text-center text-sm text-amber-100">相手が再戦を希望しています。</p>}
      <div className="min-h-0 flex-1">
        <BattleBoard game={game} mode="online" onBack={onBack}
          canRestart={ready && !room.pending && !requested}
          restartLabel={requested ? '相手の再戦希望を待っています' : '再戦を希望する'} />
      </div>
    </div>
  )
}
