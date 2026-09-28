import { useEffect, useRef } from 'react'
import type { RoomSnapshot } from '../../network/protocol'
import { useComboAnnouncements } from '../battle/useComboAnnouncements'
import { consumeOnlineCombos, onlineComboAnnouncement } from './onlineCombos'
import type { OnlineComboCursor } from './onlineCombos'

// 購入画面への切替でもcursorを保持するため、OnlineBattleではなくOnlineScreenで使う。
export function useOnlineComboAnnouncements(snapshot: RoomSnapshot | null, connected: boolean) {
  const cursor = useRef<OnlineComboCursor | null>(null)
  const { comboAnim, announceCombo, clearCombos } = useComboAnnouncements()
  useEffect(() => {
    const next = consumeOnlineCombos(cursor.current, snapshot, connected)
    cursor.current = next.cursor
    if (next.reset) clearCombos()
    for (const event of next.events) {
      const combo = snapshot && onlineComboAnnouncement(event, snapshot.playerId)
      if (combo) announceCombo(combo)
    }
  }, [snapshot, connected, announceCombo, clearCombos])
  return comboAnim
}
