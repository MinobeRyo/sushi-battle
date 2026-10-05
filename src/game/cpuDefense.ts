import { calcGariReduction, digestBonus, digestionAmount, MAX_BELLY } from './battleRules'
import type { MatchState } from './types'

/** 公開済みの攻撃と自分の場から、挑戦CPUのガリの使用価値を判断します。 */
export function shouldChallengeUseGari(state: MatchState): boolean {
  const attack = state.pendingAttack
  if (state.mode !== 'cpu' || state.phase !== 'defending'
    || attack?.defenderId !== 2 || attack.source !== 'end_turn') return false

  const cpu = state.players[2]
  const reduction = calcGariReduction(attack.amount)
  if (cpu.gari <= 0 || reduction <= 0) return false

  const afterDamage = cpu.belly + attack.amount
  // 敗北判定は消化より先です。半減で生き残れる場合は最優先で使います。
  if (afterDamage >= MAX_BELLY) return afterDamage - reduction < MAX_BELLY

  const misoBonus = cpu.sideMenu?.id === 'miso' && cpu.sideMenu.status === 'active' ? 2 : 0
  const digestion = cpu.digestStopTurns > 0 ? 0
    : digestionAmount(state.turn) + digestBonus(cpu.field) + misoBonus
  const afterWithout = Math.max(0, afterDamage - digestion)
  const afterWith = Math.max(0, afterDamage - reduction - digestion)
  const usefulReduction = afterWithout - afterWith

  // 危険域では小さい攻撃にも備え、余裕がある間は最後の1個を大きな攻撃へ残します。
  const threshold = afterWithout >= 75 ? (cpu.gari >= 2 ? 4 : 6)
    : afterWithout >= 50 ? 8
    : cpu.gari >= 2 ? 10 : 12
  return usefulReduction >= threshold
}
