import { INBOUND_DON_SACRIFICE_BONUS } from '../data/sideMenus'
import type { SideMenuId } from '../data/sideMenus'
import type { FieldCard, MatchAction, MatchPlayer } from './types'
import { applySummon, calcFieldDmg, calcGariReduction, countNamahamu, digestBonus,
  FIELD_MAX, getDestroyTargets, getSacrificeLimit, MAX_BELLY } from './battleRules'

export const CHALLENGE_SMART_RATE = 0.8

// 評価関数に相手の手札・山札、自分の山札を公開しない。
// 未知のドローは枚数だけを評価し、実際に引いた後で次の一手を選ぶ。
type OpponentBoard = Pick<MatchPlayer,
  'field' | 'belly' | 'gari' | 'attackBuff' | 'kiretaStack' | 'sideMenu'>
type CpuView = { players: { 1: OpponentBoard; 2: Omit<MatchPlayer, 'deck'> } }

function activeMenu(player: { sideMenu: MatchPlayer['sideMenu'] }, id: SideMenuId) {
  return player.sideMenu?.id === id && player.sideMenu.status === 'active'
}

function afterGari(amount: number, gari: number) {
  return amount - (gari > 0 ? calcGariReduction(amount) : 0)
}

function futureField(field: FieldCard[]): FieldCard[] {
  return field.filter(card => card.turnsLeft > 1)
    .map(card => ({ ...card, turnAttackBonus: 0, turnsLeft: card.turnsLeft - 1 }))
}

/** 全探索の最適解ではなく、公開盤面からの軽量な一手評価。 */
export function getChallengeAction(state: CpuView, canUseMenu: boolean): MatchAction | null {
  const cpu = state.players[2]
  const enemy = state.players[1]
  const attack = (field = cpu.field, belly = enemy.belly) =>
    calcFieldDmg(field, cpu.attackBuff, cpu.kiretaStack, belly)
  const threat = (field = enemy.field, belly = cpu.belly) =>
    calcFieldDmg(field, enemy.attackBuff, enemy.kiretaStack, belly)
  const currentAttack = attack()
  // 相手がガリを使っても勝てるなら、そのまま攻撃へ進む。
  if (enemy.belly + afterGari(currentAttack, enemy.gari) >= MAX_BELLY) return null

  const available = countNamahamu(cpu.field)
  const hasSpace = (card: MatchPlayer['hand'][number]) =>
    cpu.field.length - Math.min(available, getSacrificeLimit(card)) < FIELD_MAX
  if (canUseMenu && cpu.sideMenu) {
    const id = cpu.sideMenu.id
    const useMenu = ['fries', 'tempura', 'miso', 'inbound_don'].includes(id)
      || (id === 'chawanmushi' && (cpu.belly >= 45 || cpu.skippedDigestionThisTurn > 0
        || (cpu.belly > 0 && cpu.belly + afterGari(threat(), cpu.gari) >= MAX_BELLY)))
      || (id === 'karaage' && cpu.belly < 85 && (enemy.belly >= 85
        || (enemy.belly + 15 + afterGari(attack(cpu.field, enemy.belly + 15), enemy.gari) >= MAX_BELLY
          && cpu.belly + 15 + afterGari(threat(enemy.field, cpu.belly + 15), cpu.gari) < MAX_BELLY)))
      || (id === 'ramen' && cpu.belly < 95
        && cpu.belly + 5 + afterGari(threat(enemy.field, cpu.belly + 5), cpu.gari) < MAX_BELLY
        && cpu.hand.some(card => card.cost > cpu.ap && card.cost <= cpu.ap + 1 && hasSpace(card)))
    if (useMenu) return { type: 'use_side_menu', playerId: 2 }
  }

  const currentFuture = calcFieldDmg(futureField(cpu.field), cpu.attackBuff,
    cpu.kiretaSpent ? 0 : cpu.kiretaStack, enemy.belly)
  let best: MatchAction | null = null
  let bestScore = -Infinity
  for (const card of cpu.hand) {
    if (card.cost > cpu.ap) continue
    const targets = getDestroyTargets(card, enemy.field)
    for (let sacrifices = 0; sacrifices <= Math.min(available, getSacrificeLimit(card)); sacrifices++) {
      if (cpu.field.length - sacrifices >= FIELD_MAX) continue
      const tempuraTarget = card.archetype.includes('niku') || [card.base, ...(card.subBases ?? [])].includes('えび')
      const result = applySummon({
        card, fieldId: card.instanceId, belly: cpu.belly, kireta: cpu.kiretaStack,
        field: cpu.field, summonedIds: cpu.summonedIds, summonedArch: cpu.summonedArch,
        thisTurnBases: cpu.thisTurnBases, thisTurnArch: cpu.thisTurnArch,
        combosFired: cpu.combosFired, attackBuff: cpu.attackBuff, drawBonus: cpu.drawBonus,
        nikuMatsuri: cpu.nikuMatsuri, sacrificedThisTurn: cpu.sacrificedThisTurn,
        sacrificeCount: sacrifices,
        sacrificeAttackBonus: activeMenu(cpu, 'inbound_don') ? INBOUND_DON_SACRIFICE_BONUS : 0,
        kiretaSpent: cpu.kiretaSpent, enemyBelly: enemy.belly,
        turnAttackBonus: tempuraTarget && !cpu.tempuraTriggeredThisTurn
          && (activeMenu(cpu, 'tempura') || activeMenu(enemy, 'tempura')) ? 3 : 0,
      })
      const enemyBelly = enemy.belly + result.extraDmg
      const nextAttack = calcFieldDmg(result.field, result.attackBuff, result.kireta, enemyBelly)
      const nextFuture = calcFieldDmg(futureField(result.field), result.attackBuff,
        result.kiretaSpent ? 0 : result.kireta, enemyBelly)
      for (const target of targets.length ? targets : [undefined]) {
        const remaining = target ? enemy.field.filter(item => item.fid !== target.fid) : enemy.field
        const beforeRisk = cpu.belly + afterGari(threat(), cpu.gari)
        const afterRisk = result.belly + afterGari(threat(remaining, result.belly), cpu.gari)
        const lethal = enemyBelly + afterGari(nextAttack, enemy.gari) >= MAX_BELLY
        const score = (lethal ? 10000 : 0)
          + (beforeRisk >= MAX_BELLY && afterRisk < MAX_BELLY ? 1000 : 0)
          + (result.extraDmg + nextAttack - currentAttack
            + 0.5 * (nextFuture - currentFuture)
            + 1.5 * (digestBonus(result.field) - digestBonus(cpu.field))
            + 4 * (result.drawBonus - cpu.drawBonus)
            + 1.5 * (result.drawNow + Number(result.drawPersistIkaTako))
            + result.apNext + result.apRefund
            + 0.8 * (threat() - threat(remaining, result.belly))
            + (cpu.belly >= 70 ? 1.5 : 0.5) * (cpu.belly - result.belly)) / Math.max(1, card.cost)
        if (score <= bestScore) continue
        bestScore = score
        best = { type: 'play_card', playerId: 2, cardInstanceId: card.instanceId,
          ...(getSacrificeLimit(card) ? { sacrificeCount: sacrifices } : {}),
          ...(target ? { targetFieldId: target.fid } : {}) }
      }
    }
  }
  return best
}
