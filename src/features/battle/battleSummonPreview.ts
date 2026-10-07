import type { Card } from '../../types'
import type { BattleView } from './types'
import { INBOUND_DON_SACRIFICE_BONUS } from '../../data/sideMenus'
import {
  applySummon, calcFieldDmg, FIELD_MAX, getDefenseReserveError, getDefenseTargets,
  getDestroyTargetError, getSacrificeError, hasNamahamuAura, isDefenseCard,
  MAKI_COMP_5, makimonoCount, MAX_BELLY,
} from './battleEngine'

export type BattleSummonOptions = {
  sacrificeCount?: number
  reserveDefense?: boolean
  targetFieldId?: string
}

export type BattleSummonPreview = {
  ok: true
  apBefore: number
  apAfter: number
  fieldAttackBefore: number
  fieldAttackAfter: number
  /** 召喚後の場全体の強化を反映した、このカード1枚の通常攻撃。 */
  cardAttack: number
  /** 相手の回答で攻撃が変わるため、回答後の確定値として表示しない。 */
  awaitsDefense: boolean
} | { ok: false; reason: string }

/**
 * 召喚操作直後のAPと通常攻撃を計算する。入力は変更せず、乱数も使用しない。
 * ドロー・山札生成・割引対象の予想や、相手の防御回答は含まない。
 * 対象破壊・生贄・防御予約は、詳細画面で確定した選択をoptionsへ渡せる。
 */
export function previewBattleSummon(view: BattleView, card: Card, options: BattleSummonOptions = {}): BattleSummonPreview {
  const reject = (reason: string): BattleSummonPreview => ({ ok: false, reason })
  if (view.phase !== 'player') return reject('not_your_turn')
  const currentCard = 'instanceId' in card
    ? view.pHand.find(item => item.instanceId === card.instanceId)
    : view.pHand.find(item => item === card)
  if (!currentCard) return reject('card_not_in_hand')
  if (view.pAP < currentCard.cost) return reject('insufficient_ap')
  const sacrificeCount = options.sacrificeCount ?? 0
  const sacrificeError = getSacrificeError(currentCard, view.pField, sacrificeCount)
  if (sacrificeError) return reject(sacrificeError)
  const defenseError = getDefenseReserveError(currentCard, view.pField, view.pKiretaStack, view.pKiretaSpent, options.reserveDefense)
  if (defenseError) return reject(defenseError)
  const targetError = getDestroyTargetError(currentCard, view.cField, options.targetFieldId)
  if (targetError) return reject(targetError)
  if (view.pField.length - sacrificeCount >= FIELD_MAX) return reject('field_full')

  const activeMenu = (id: string) => [view.pSideMenu, view.cSideMenu].some(menu => menu?.id === id && menu.status === 'active')
  // matchEngineのtempuraTriggeredThisTurnと同じ条件。
  // 設置前の召喚も含め、当ターンの肉・えびの召喚履歴から判定できる。
  const tempuraAlreadyTriggered = (view.pThisTurnArch.niku ?? 0) > 0 || view.pThisTurnBases.includes('えび')
  const tempuraTarget = currentCard.archetype.includes('niku') || [currentCard.base, ...(currentCard.subBases ?? [])].includes('えび')
  const tempuraBonus = tempuraTarget && !tempuraAlreadyTriggered && activeMenu('tempura') ? 3 : 0
  const result = applySummon({
    card: currentCard, fieldId: currentCard.instanceId,
    belly: view.pBelly, kireta: view.pKiretaStack, field: view.pField,
    summonedIds: view.pSummonedIds, summonedArch: view.pSummonedArch,
    thisTurnBases: view.pThisTurnBases, thisTurnArch: view.pThisTurnArch,
    combosFired: view.pCombosFired, attackBuff: view.pAttackBuff,
    drawBonus: view.pDrawBonus, nikuMatsuri: view.pNikuMatsuri,
    sacrificedThisTurn: view.pSacrificedThisTurn, sacrificeCount,
    reserveDefense: options.reserveDefense,
    sacrificeAttackBonus: view.pSideMenu?.id === 'inbound_don' && view.pSideMenu.status === 'active' ? INBOUND_DON_SACRIFICE_BONUS : 0,
    kiretaSpent: view.pKiretaSpent, enemyBelly: view.cBelly, turnAttackBonus: tempuraBonus,
  })
  const enemyField = view.cField.filter(item => item.fid !== options.targetFieldId)
  const defense = enemyField.find(item => item.defenseState === 'ready' && isDefenseCard(item))
  const kaisenReattack = result.fired.some(combo => combo.id === 'umi_zanmai')
  // 召喚時に防御が入るのは海鮮の再攻撃のみ。通常のガリはここでは使えない。
  const awaitsDefense = result.extraDmg > 0 && kaisenReattack && !!defense
    && getDefenseTargets(result.field, result.attackBuff, result.kireta, view.cBelly)
      .some(item => item.archetype.includes('kaisen'))
  // 固定ダメージで腹の閾値を越えると、場の条件付き攻撃も即座に変化する。
  const enemyBellyAfter = awaitsDefense ? view.cBelly : Math.min(MAX_BELLY, view.cBelly + Math.max(0, result.extraDmg))
  const afterCost = view.pAP - currentCard.cost
  const apAfter = afterCost + Math.max(0, Math.min(result.apRefund, view.pMaxAP - afterCost))
  const summoned = result.field.find(item => item.fid === currentCard.instanceId)!
  return {
    ok: true,
    apBefore: view.pAP,
    apAfter,
    fieldAttackBefore: calcFieldDmg(view.pField, view.pAttackBuff, view.pKiretaStack, view.cBelly),
    fieldAttackAfter: calcFieldDmg(result.field, result.attackBuff, result.kireta, enemyBellyAfter),
    cardAttack: calcFieldDmg([summoned], result.attackBuff, result.kireta, enemyBellyAfter, {
      gunkanBoost: makimonoCount(result.field) >= MAKI_COMP_5,
      namahamuBoost: hasNamahamuAura(result.field),
    }),
    awaitsDefense,
  }
}
