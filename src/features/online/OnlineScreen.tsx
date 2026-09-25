import { useState } from 'react'
import type { PublicMatch, RoomSnapshot } from '../../network/protocol'
import { BattleBoard, type BattleController } from '../battle/BattleScreen'
import type { Inspect } from '../battle/types'
import { OnlineLobby } from './OnlineLobby'
import { toOnlineBattleView } from './onlineBattleView'
import { useOnlineRoom, type OnlineRoomController } from './useOnlineRoom'

export function OnlineScreen({ onBack }: { onBack: () => void }) {
  const room = useOnlineRoom()
  const leave = () => { void room.leaveRoom().finally(onBack) }
  if (!room.snapshot?.match) return <OnlineLobby room={room} onBack={leave} />
  return <OnlineBattle key={room.snapshot.match.matchId} room={room}
    snapshot={room.snapshot} match={room.snapshot.match} onBack={leave} />
}

function OnlineBattle({ room, snapshot, match, onBack }: {
  room: OnlineRoomController; snapshot: RoomSnapshot; match: PublicMatch; onBack: () => void
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
    canPlay: inspect.canPlay && canAct && match.you.hand.some(card =>
      'instanceId' in inspect.card && card.instanceId === inspect.card.instanceId),
  }
  const game: BattleController = {
    s: toOnlineBattleView(match, phase), showLog, setShowLog,
    comboAnim: null, floats: [], inspect: currentInspect, setInspect, reorderStep: 'p',
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
        <span>部屋 {snapshot.code} · あなたは P{snapshot.playerId} · 固定デッキ対戦</span>
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
