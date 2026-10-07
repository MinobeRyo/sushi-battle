import { useEffect, useId, useRef, useState } from 'react'
import { getDefenseReductionRate, MAX_BELLY } from './battleEngine'
import { defensePreview } from './defensePreview'
import { SushiArt } from '../../components/SushiArt'
import type { FieldCard, PendingAttack } from '../../game/types'
import './DefensePrompt.css'

export function DefensePrompt({ attack, belly, gari, defenseCard, enemyField = [], attackBuff = {}, kiretaStack = 0, ready, onRespond, onLeave }: {
  attack: PendingAttack
  belly: number
  gari: number
  defenseCard?: FieldCard
  enemyField?: FieldCard[]
  attackBuff?: Record<string, number>
  kiretaStack?: number
  ready: boolean
  onRespond: (useGari: boolean, useDefense?: boolean, targetFieldId?: string) => void
  onLeave?: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const [useGari, setUseGari] = useState(false)
  const [useDefense, setUseDefense] = useState(false)
  const [targetFieldId, setTargetFieldId] = useState<string>()
  const canGari = attack.source === 'end_turn' && gari > 0
  const needsTarget = defenseCard?.effect === 'reserve_target_half_2'
  const preview = defensePreview(attack, enemyField, attackBuff, kiretaStack, belly, defenseCard, useDefense, useGari && canGari, targetFieldId)
  const canDefense = defenseCard?.defenseState === 'ready' && defenseCard.fid === attack.defenseCardId && preview.targets.length > 0
  const validTarget = !needsTarget || preview.targets.some(card => card.fid === targetFieldId)
  const canConfirm = ready && (!useDefense || canDefense && validTarget)
  const range = (low: number, high: number) => low === high ? String(low) : `${low}〜${high}`
  const minBelly = Math.min(MAX_BELLY, belly + preview.min)
  const maxBelly = Math.min(MAX_BELLY, belly + preview.max)

  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    headingRef.current?.focus()
    return () => dialog.close()
  }, [])

  return <dialog ref={dialogRef} className="battle-defense battle-defense--combined" aria-labelledby={headingId}
    onCancel={event => event.preventDefault()}>
    <p className="battle-defense__eyebrow">相手の攻撃</p>
    <h2 ref={headingRef} tabIndex={-1} id={headingId}>防御を選ぶ</h2>
    <div className="battle-defense__preview" aria-live="polite">
      <div><span>受ける攻撃</span><p><s>{attack.amount}</s><span aria-hidden="true"> → </span><strong>{range(preview.min, preview.max)}</strong></p></div>
      <div className={maxBelly >= MAX_BELLY ? 'is-lethal' : ''}><span>お腹</span><p>{belly} → <strong>{range(minBelly, maxBelly)}</strong><small> / {MAX_BELLY}</small></p></div>
    </div>
    <div className="battle-defense__options">
      {attack.source === 'end_turn' && <button type="button" aria-pressed={useGari} disabled={!ready || !canGari}
        onClick={() => setUseGari(value => !value)}>
        <span className="battle-defense__option-title">ガリ <small>残り{gari}個</small></span>
        <strong>受ける攻撃 −50%</strong><span>{useGari ? '選択中' : canGari ? '使う' : '残りなし'}</span>
      </button>}
      {defenseCard && <button type="button" aria-pressed={useDefense} disabled={!ready || !canDefense}
        onClick={() => setUseDefense(value => !value)}>
        <span className="battle-defense__option-title">{defenseCard.name}</span>
        <strong>{needsTarget ? '選んだ' : 'ランダムな'}1体 −{getDefenseReductionRate(defenseCard) * 100}%</strong>
        <span>{useDefense ? '選択中' : '使う'}</span>
      </button>}
    </div>
    {useDefense && needsTarget && <div className="battle-defense__targets" role="group" aria-label="防御する相手のカード">
      {preview.targets.map(card => <button key={card.fid} type="button" aria-pressed={targetFieldId === card.fid}
        disabled={!ready} onClick={() => setTargetFieldId(card.fid)}>
        <SushiArt card={card} size={52} /><span>{card.name}</span>
      </button>)}
    </div>}
    {useDefense && !needsTarget && <p className="battle-defense__hint">対象は決定時にランダムで選ばれます。</p>}
    {useDefense && needsTarget && !validTarget && <p className="battle-defense__hint">相手のカードを1枚選択</p>}
    <button className="battle-defense__confirm" type="button" disabled={!canConfirm}
      onClick={() => { if (canConfirm) onRespond(useGari && canGari, useDefense, useDefense && needsTarget ? targetFieldId : undefined) }}>
      {useGari || useDefense ? 'この防御で決定' : 'そのまま受ける'}
    </button>
    {!ready && <p className="battle-defense__connection" role="status">通信を待っています…</p>}
    {onLeave && <button type="button" className="battle-defense__leave" onClick={onLeave}>部屋を退出</button>}
  </dialog>
}
