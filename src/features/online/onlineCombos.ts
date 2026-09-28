import type { PublicComboEvent, RoomSnapshot } from '../../network/protocol'
import type { PlayerId } from '../../game/types'
import { COMBO_META } from '../../game/battleRules'

export function onlineComboAnnouncement(event: PublicComboEvent, viewer: PlayerId) {
  const combo = COMBO_META[event.comboId]
  return combo ? {
    name: combo.name, desc: combo.desc, playerLabel: event.playerId === viewer ? 'YOU' : 'OPPONENT',
  } : null
}

export type OnlineComboCursor = {
  matchId: string | null
  revision: number
  sequence: number
  snapshot: RoomSnapshot | null
  awaitingSnapshot: boolean
}

// 同じsnapshotの再送や、pollで中間revisionが抜ける場合も連番から未表示分だけを取り出す。
export function consumeOnlineCombos(
  previous: OnlineComboCursor | null, snapshot: RoomSnapshot | null, connected: boolean,
): { cursor: OnlineComboCursor; events: PublicComboEvent[]; reset: boolean } {
  const match = snapshot?.match
  const events = match?.comboEvents ?? []
  const latest = events.at(-1)?.sequence ?? 0
  const baseline: OnlineComboCursor = {
    matchId: match?.matchId ?? null, revision: match?.revision ?? -1, sequence: latest,
    snapshot, awaitingSnapshot: !connected,
  }
  if (!connected) return { cursor: baseline, events: [], reset: true }
  // Socketのconnect通知だけでは古いsnapshotが残る。復帰応答が届いてから履歴位置を同期する。
  if (previous?.awaitingSnapshot && snapshot === previous.snapshot) {
    return { cursor: previous, events: [], reset: false }
  }
  if (!previous || !match || previous.matchId !== match.matchId || previous.awaitingSnapshot) {
    return { cursor: baseline, events: [], reset: true }
  }
  if (match.revision < previous.revision) return { cursor: previous, events: [], reset: false }
  return {
    cursor: { ...baseline, sequence: Math.max(previous.sequence, latest) },
    events: events.filter(event => event.sequence > previous.sequence),
    reset: false,
  }
}
