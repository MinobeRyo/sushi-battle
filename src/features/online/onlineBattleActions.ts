import type { Card } from '../../types'
import type { PublicMatch } from '../../network/protocol'
import { FIELD_MAX } from '../../game/battleRules'

// 詳細画面を開いた時点ではなく、現在の公開状態から召喚可否を判断する。
export function canPlayOnlineCard(match: PublicMatch, canAct: boolean, card: Card): boolean {
  if (!canAct || !('instanceId' in card) || typeof card.instanceId !== 'string') return false
  const current = match.you.hand.find(item => item.instanceId === card.instanceId)
  return Boolean(current && current.cost <= match.you.ap && match.you.field.length < FIELD_MAX)
}
