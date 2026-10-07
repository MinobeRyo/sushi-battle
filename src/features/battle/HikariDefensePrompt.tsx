import { useEffect, useId, useRef, useState } from 'react'
import type { FieldCard, PendingReaction } from '../../game/types'
import { calcFieldDmg, calcKaisenReattackDamage, getDefenseCost, getDefenseReductionRate, getDefenseTargets, hasNamahamuAura, MAKI_COMP_5, makimonoCount, MAX_BELLY, withDefenseReduction } from './battleEngine'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import { ScreenPager } from '../../components/ScreenPager'
import './DefensePrompt.css'
import './HikariDefensePrompt.css'

export function HikariDefensePrompt({ reaction, defenseCard, enemyField, attackBuff, kiretaStack, enemyBelly, ready, onRespond, onLeave }: {
  reaction: PendingReaction
  defenseCard?: FieldCard
  enemyField: FieldCard[]
  attackBuff: Record<string, number>
  kiretaStack: number
  enemyBelly: number
  ready: boolean
  onRespond: (useDefense: boolean, targetFieldId?: string) => void
  onLeave?: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const descriptionId = useId()
  const [selection, setSelection] = useState<{ defenseCardId: string; targetFieldId: string } | null>(null)
  const compact = useCompactLandscape()
  const [targetPage, setTargetPage] = useState(0)
  const targets = getDefenseTargets(enemyField, attackBuff, kiretaStack, enemyBelly)
  const targetPages = Math.max(1, Math.ceil(targets.length / 4))
  const currentTargetPage = Math.min(targetPage, targetPages - 1)
  const needsTarget = !!defenseCard && getDefenseCost(defenseCard) === 2
  const targetFieldId = selection?.defenseCardId === reaction.defenseCardId
    && targets.some(card => card.fid === selection.targetFieldId) ? selection.targetFieldId : undefined
  const canUse = ready && defenseCard?.fid === reaction.defenseCardId && defenseCard.defenseState === 'ready' && targets.length > 0 && (!needsTarget || !!targetFieldId)
  const gunkanBoost = makimonoCount(enemyField) >= MAKI_COMP_5
  const namahamuBoost = hasNamahamuAura(enemyField)
  const attack = (card: FieldCard) => calcFieldDmg([card], attackBuff, kiretaStack, enemyBelly, { gunkanBoost, namahamuBoost })
  const reduced = (card: FieldCard) => defenseCard ? withDefenseReduction(card, defenseCard) : card
  const received = (field: FieldCard[]) => reaction.fixedDamage
    + (reaction.kaisenReattack ? calcKaisenReattackDamage(field, attackBuff, kiretaStack, enemyBelly) : 0)
  const receivedAfter = (target: FieldCard) => received(enemyField.map(card => card.fid === target.fid ? reduced(card) : card))
  const unchangedDamage = received(enemyField)
  const choices = needsTarget ? targets.filter(card => card.fid === targetFieldId) : targets
  const possibleDamage = choices.length ? choices.map(receivedAfter) : [unchangedDamage]
  const minDamage = Math.min(...possibleDamage), maxDamage = Math.max(...possibleDamage)
  const range = (low: number, high: number) => low === high ? String(low) : `${low}〜${high}`
  const damageLabel = needsTarget && !targetFieldId ? '対象を選択' : `+${range(minDamage, maxDamage)}`
  const bellyAfter = range(Math.min(MAX_BELLY, enemyBelly + minDamage), Math.min(MAX_BELLY, enemyBelly + maxDamage))
  const reductionRate = defenseCard ? getDefenseReductionRate(defenseCard) * 100 : 50

  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    headingRef.current?.focus()
    return () => dialog.close()
  }, [])

  // 通信・手番の変更や退場後に、以前の対象を使い回さない。
  useEffect(() => {
    if (selection && (!ready || !targetFieldId)) setSelection(null)
  }, [ready, selection, targetFieldId])

  return (
    <dialog ref={dialogRef} className={`battle-defense battle-hikari-defense${onLeave ? ' battle-defense--with-leave' : ''}`} aria-labelledby={headingId}
      aria-describedby={descriptionId} onCancel={event => event.preventDefault()}>
      <h2 ref={headingRef} tabIndex={-1} id={headingId}>{defenseCard?.name ?? '光り物'}で防御？</h2>
      <div id={descriptionId} className="battle-hikari-defense__description">
        <p>{needsTarget ? '相手を1枚選ぶ' : 'ランダムな1枚'} · このターン攻撃 −{reductionRate}%</p>
      </div>
      {needsTarget && <div className="battle-hikari-defense__targets" role="group" aria-label="攻撃を半減するカード">
        {(compact ? targets.slice(currentTargetPage * 4, currentTargetPage * 4 + 4) : targets).map(card => (
          <button type="button" key={card.fid} aria-pressed={targetFieldId === card.fid} disabled={!ready}
            onClick={() => setSelection({ defenseCardId: reaction.defenseCardId, targetFieldId: card.fid })}>
            {!compact && <small>相手の机・左から{enemyField.findIndex(item => item.fid === card.fid) + 1}枚目</small>}
            <strong>{card.name}</strong>
            <span>攻撃 {attack(card)} → {attack(reduced(card))}</span>
            <b className="battle-hikari-defense__received">今回受ける +{receivedAfter(card)}</b>
            {!compact && <small>{card.type === 'persist' ? `残り${card.turnsLeft}ターン` : '即時型'}</small>}
          </button>
        ))}
      </div>}
      {compact && needsTarget && targetPages > 1 && <ScreenPager page={currentTargetPage} pages={targetPages} onPageChange={setTargetPage} />}
      <div className="battle-defense__choices">
        <button type="button" className="battle-defense__use" disabled={!canUse}
          onClick={canUse ? () => onRespond(true, needsTarget ? targetFieldId : undefined) : undefined}>
          <span className="battle-defense__choice-title">防御を使う</span>
          <strong className="battle-defense__damage">{damageLabel}<small>今回受ける量</small></strong>
          <span className="battle-defense__belly">お腹 {enemyBelly} → <b>{needsTarget && !targetFieldId ? '—' : bellyAfter}</b>{!(needsTarget && !targetFieldId) && enemyBelly + maxDamage >= MAX_BELLY && <em> 満腹で負け</em>}</span>
          <small>防御1枚退場 · AP・切れ味消費なし</small>
        </button>
        <button type="button" className="battle-defense__keep" disabled={!ready}
          onClick={ready ? () => onRespond(false) : undefined}>
          <span className="battle-defense__choice-title">見送る</span>
          <strong className="battle-defense__damage">+{unchangedDamage}<small>今回受ける量</small></strong>
          <span className="battle-defense__belly">お腹 {enemyBelly} → <b>{Math.min(MAX_BELLY, enemyBelly + unchangedDamage)}</b>{enemyBelly + unchangedDamage >= MAX_BELLY && <em> 満腹で負け</em>}</span>
          <small>温存 · 相手ターン終了で退場</small>
        </button>
      </div>
      {!compact && <div className="battle-defense__note">
        <p>固定ダメージは軽減されません。</p>
      </div>}
      {!ready && <p className="battle-defense__connection" role="status">通信を待っています…</p>}
      {onLeave && <button type="button" className="battle-defense__leave" onClick={onLeave}>部屋を退出</button>}
    </dialog>
  )
}
