import { useEffect, useId, useRef, useState } from 'react'
import type { FieldCard, PendingReaction } from '../../game/types'
import { calcFieldDmg, getDefenseCost, getDefenseTargets, MAKI_COMP_5, makimonoCount } from './battleEngine'
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
  const targets = getDefenseTargets(enemyField, attackBuff, kiretaStack, enemyBelly)
  const needsTarget = !!defenseCard && getDefenseCost(defenseCard) === 2
  const targetFieldId = selection?.defenseCardId === reaction.defenseCardId
    && targets.some(card => card.fid === selection.targetFieldId) ? selection.targetFieldId : undefined
  const canUse = ready && defenseCard?.fid === reaction.defenseCardId && defenseCard.defenseState === 'ready' && targets.length > 0 && (!needsTarget || !!targetFieldId)
  const gunkanBoost = makimonoCount(enemyField) >= MAKI_COMP_5
  const attack = (card: FieldCard) => calcFieldDmg([card], attackBuff, kiretaStack, enemyBelly, { gunkanBoost })

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
    <dialog ref={dialogRef} className="battle-defense battle-hikari-defense" aria-labelledby={headingId}
      aria-describedby={descriptionId} onCancel={event => event.preventDefault()}>
      <p className="battle-defense__eyebrow">相手が寿司を召喚しました</p>
      <h2 ref={headingRef} tabIndex={-1} id={headingId}>{defenseCard?.name ?? '光り物'}で防御しますか？</h2>
      <div id={descriptionId} className="battle-hikari-defense__description">
        <p>{needsTarget ? '相手の机から1枚を選び、このターンの攻撃を半減します。' : '相手の机のランダムな1枚の攻撃を、このターン半減します。'}</p>
        <p>強化後の攻撃を半分にして、端数を切り捨てます。</p>
      </div>
      {needsTarget && <div className="battle-hikari-defense__targets" role="group" aria-label="攻撃を半減するカード">
        {targets.map(card => (
          <button type="button" key={card.fid} aria-pressed={targetFieldId === card.fid} disabled={!ready}
            onClick={() => setSelection({ defenseCardId: reaction.defenseCardId, targetFieldId: card.fid })}>
            <small>相手の机・左から{enemyField.findIndex(item => item.fid === card.fid) + 1}枚目</small>
            <strong>{card.name}</strong>
            <span>攻撃 {attack(card)} → {attack({ ...card, attackHalved: true })}</span>
            <small>{card.type === 'persist' ? `残り${card.turnsLeft}ターン` : '即時型'}</small>
          </button>
        ))}
      </div>}
      <div className="battle-defense__choices">
        <button type="button" className="battle-defense__use" disabled={!canUse}
          onClick={canUse ? () => onRespond(true, needsTarget ? targetFieldId : undefined) : undefined}>
          <span className="battle-defense__choice-title">防御を使う</span>
          <span>{needsTarget ? targetFieldId ? '選んだカードの攻撃を半減' : '半減するカードを選んでください' : 'ランダムな1枚の攻撃を半減'}</span>
          <small>使用後、この防御カードは退場</small>
        </button>
        <button type="button" className="battle-defense__keep" disabled={!ready}
          onClick={ready ? () => onRespond(false) : undefined}>
          <span className="battle-defense__choice-title">見送る</span>
          <span>次の相手の召喚まで温存</span>
          <small>使わなくても、この相手ターンの終了時に退場</small>
        </button>
      </div>
      <div className="battle-defense__note">
        <p>固定ダメージは半減しません。</p>
        <p>海の幸三昧の再攻撃には半減後の攻撃を使います。</p>
        <p>ここでAP・切れ味は消費しません。</p>
      </div>
      {!ready && <p className="battle-defense__connection" role="status">通信を待っています…</p>}
      {onLeave && <button type="button" className="battle-defense__leave" onClick={onLeave}>部屋を退出</button>}
    </dialog>
  )
}
