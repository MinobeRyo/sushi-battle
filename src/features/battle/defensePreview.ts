import type { FieldCard, PendingAttack } from '../../game/types'
import { calcFieldDmg, calcGariReduction, calcKaisenReattackDamage, getDefenseTargets, withDefenseReduction } from './battleEngine'

export function defensePreview(attack: PendingAttack, field: FieldCard[], buff: Record<string, number>, kireta: number,
  belly: number, defenseCard: FieldCard | undefined, useDefense: boolean, useGari: boolean, targetFieldId?: string) {
  const targets = getDefenseTargets(field, buff, kireta, belly)
    .filter(card => attack.source === 'end_turn' || card.archetype.includes('kaisen'))
  const possibleTargets = defenseCard?.effect === 'reserve_target_half_2'
    ? targets.filter(card => card.fid === targetFieldId) : targets
  const amounts = useDefense && defenseCard && possibleTargets.length
    ? possibleTargets.map(target => {
      const changed = field.map(card => card.fid === target.fid ? withDefenseReduction(card, defenseCard) : card)
      return attack.source === 'end_turn' ? calcFieldDmg(changed, buff, kireta, belly)
        : (attack.fixedDamage ?? 0) + (attack.kaisenReattack ? calcKaisenReattackDamage(changed, buff, kireta, belly) : 0)
    }) : [attack.amount]
  const received = amounts.map(amount => useGari && attack.source === 'end_turn' ? amount - calcGariReduction(amount) : amount)
  return { targets, min: Math.min(...received), max: Math.max(...received) }
}
