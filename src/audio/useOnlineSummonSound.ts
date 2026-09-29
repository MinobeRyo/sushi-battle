import { useEffect, useRef } from 'react'
import type { PublicMatch } from '../network/protocol'

/** 初期表示・再接続で届いた履歴を除き、確定した新しい召喚だけを通知する。 */
export function useOnlineSummonSound(match: PublicMatch, ready: boolean, onSummon: () => void): void {
  const previous = useRef<{
    match: PublicMatch
    count: number
    awaitingSnapshot: boolean
  } | null>(null)

  useEffect(() => {
    const count = match.you.summonedIds.length + match.opponent.summonedIds.length
    const before = previous.current
    // 接続だけが先に復旧して古い状態が残る場合は、新しい状態が届くまで待つ。
    const awaitingSnapshot = !ready || Boolean(before?.awaitingSnapshot && before.match === match)
    previous.current = { match, count, awaitingSnapshot }
    if (!ready || !before || before.awaitingSnapshot || before.match.matchId !== match.matchId) return
    if (match.revision > before.match.revision && count > before.count) onSummon()
  }, [match, ready, onSummon])
}
