import { useEffect, useId, useRef } from 'react'
import { GARI_REDUCTION, MAX_BELLY } from './battleEngine'
import type { PendingAttack } from '../../game/types'
import './DefensePrompt.css'

export function DefensePrompt({ attack, belly, gari, ready, onRespond, onLeave }: {
  attack: PendingAttack
  belly: number
  gari: number
  ready: boolean
  onRespond: (useGari: boolean) => void
  onLeave?: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const descriptionId = useId()
  const reduction = Math.min(GARI_REDUCTION, attack.amount)
  const guardedDamage = attack.amount - reduction
  const guardedBelly = Math.min(MAX_BELLY, belly + guardedDamage)
  const unguardedBelly = Math.min(MAX_BELLY, belly + attack.amount)

  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    // キーボードで直前の操作を繰り返しても、薬味を誤って消費しない。
    headingRef.current?.focus()
    return () => dialog.close()
  }, [])

  return (
    <dialog ref={dialogRef} className="battle-defense" aria-labelledby={headingId}
      aria-describedby={descriptionId} onCancel={event => event.preventDefault()}>
      <p className="battle-defense__eyebrow">防御の番です</p>
      <h2 ref={headingRef} tabIndex={-1} id={headingId}>ガリを使いますか？</h2>
      <p id={descriptionId} className="battle-defense__description">
        {attack.source === 'summon' ? 'カード・コンボの追加ダメージ' : '相手の攻撃'}
        <strong>{attack.amount}</strong>が届きます。
      </p>
      <div className="battle-defense__stock">
        <span>現在のお腹 <strong>{belly} / {MAX_BELLY}</strong></span>
        <span>ガリ <strong>残り{gari}個</strong></span>
      </div>
      <div className="battle-defense__choices">
        <button type="button" className="battle-defense__use" disabled={!ready || gari <= 0}
          onClick={() => onRespond(true)}>
          <span className="battle-defense__choice-title">ガリを使う</span>
          <span>{reduction}軽減 · 受けるダメージ {guardedDamage}</span>
          <strong className={guardedBelly >= MAX_BELLY ? 'is-lethal' : ''}>お腹 {guardedBelly} / {MAX_BELLY}</strong>
          <small>{guardedBelly >= MAX_BELLY ? '軽減しても満腹になります' : `使用後のガリ ${Math.max(0, gari - 1)}個`}</small>
        </button>
        <button type="button" className="battle-defense__keep" disabled={!ready}
          onClick={() => onRespond(false)}>
          <span className="battle-defense__choice-title">温存する</span>
          <span>受けるダメージ {attack.amount}</span>
          <strong className={unguardedBelly >= MAX_BELLY ? 'is-lethal' : ''}>お腹 {unguardedBelly} / {MAX_BELLY}</strong>
          <small>{unguardedBelly >= MAX_BELLY ? '満腹になり、この対戦は敗北です' : `ガリ ${gari}個を残します`}</small>
        </button>
      </div>
      <p className="battle-defense__note">ガリ1個でダメージを最大{GARI_REDUCTION}軽減。APは使いません。<br />数値は攻撃を受けた直後のお腹です。</p>
      {!ready && <p className="battle-defense__connection" role="status">通信を待っています…</p>}
      {onLeave && <button type="button" className="battle-defense__leave" onClick={onLeave}>部屋を退出</button>}
    </dialog>
  )
}
