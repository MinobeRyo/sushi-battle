import { useEffect, useId, useRef, useState } from 'react'
import { calcFieldDmg, calcGariReduction, getDefenseReductionRate, hasNamahamuAura, MAKI_COMP_5, makimonoCount, MAX_BELLY, withDefenseReduction } from './battleEngine'
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
  const gariOnly = attack.source === 'end_turn' && !canDefense && !useDefense
  const guardedDamage = attack.amount - calcGariReduction(attack.amount)
  const guardedBelly = Math.min(MAX_BELLY, belly + guardedDamage)
  const unguardedBelly = Math.min(MAX_BELLY, belly + attack.amount)
  const range = (low: number, high: number) => low === high ? String(low) : `${low}〜${high}`
  const minBelly = Math.min(MAX_BELLY, belly + preview.min)
  const maxBelly = Math.min(MAX_BELLY, belly + preview.max)
  const fieldDamageOptions = { gunkanBoost: makimonoCount(enemyField) >= MAKI_COMP_5, namahamuBoost: hasNamahamuAura(enemyField) }
  const targetAttack = (card: FieldCard) => calcFieldDmg([card], attackBuff, kiretaStack, belly, fieldDamageOptions)
  const consumption = [useGari && canGari ? `ガリ −1（残${gari - 1}）` : 'ガリ温存',
    useDefense && defenseCard ? `${defenseCard.name} 退場` : null].filter(Boolean).join('・')

  useEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    headingRef.current?.focus()
    return () => dialog.close()
  }, [])

  return <dialog ref={dialogRef} className={`battle-defense ${gariOnly ? 'battle-defense--gari' : 'battle-defense--combined'}${onLeave ? ' battle-defense--with-leave' : ''}`} aria-labelledby={headingId}
    onCancel={event => event.preventDefault()}>
    <header className="battle-defense__header">
      <h2 ref={headingRef} tabIndex={-1} id={headingId}>{gariOnly ? 'ガリを使う？' : '防御を選ぶ'}</h2>
      {gariOnly && <span className="battle-defense__stock">残り <strong>{gari}</strong> 個</span>}
    </header>
    {gariOnly ? <>
      <p className="battle-defense__description">相手の攻撃 <strong>+{attack.amount}</strong><span>ガリ1個で半減</span></p>
      <div className="battle-defense__choices">
        <button type="button" className="battle-defense__use" disabled={!ready || !canGari}
          aria-label={`ガリを使う。ダメージ${guardedDamage}、お腹${belly}から${guardedBelly}。${guardedBelly >= MAX_BELLY ? '満腹で負け' : `残り${Math.max(0, gari - 1)}個`}`}
          onClick={ready && canGari ? () => onRespond(true, false) : undefined}>
          <span className="battle-defense__choice-title">ガリを使う</span>
          <strong className="battle-defense__damage">+{guardedDamage}<small>ダメージ</small></strong>
          <span className="battle-defense__belly">お腹 {belly} → <b>{guardedBelly}</b></span>
          {guardedBelly >= MAX_BELLY && <span className="battle-defense__lethal">満腹で負け</span>}
          <small className="battle-defense__cost">ガリ −1 · 残{Math.max(0, gari - 1)}個</small>
        </button>
        <button type="button" className="battle-defense__keep" disabled={!ready}
          aria-label={`使わない。ダメージ${attack.amount}、お腹${belly}から${unguardedBelly}。${unguardedBelly >= MAX_BELLY ? '満腹で負け' : `ガリ${gari}個を残す`}`}
          onClick={ready ? () => onRespond(false, false) : undefined}>
          <span className="battle-defense__choice-title">使わない</span>
          <strong className="battle-defense__damage">+{attack.amount}<small>ダメージ</small></strong>
          <span className="battle-defense__belly">お腹 {belly} → <b>{unguardedBelly}</b></span>
          {unguardedBelly >= MAX_BELLY && <span className="battle-defense__lethal">満腹で負け</span>}
          <small className="battle-defense__cost">消費なし · ガリ{gari}個</small>
        </button>
      </div>
    </> : <>
    <div className="battle-defense__preview" aria-live="polite">
      <div><span>受ける量</span><p><s>+{attack.amount}</s><span aria-hidden="true"> → </span><strong>+{range(preview.min, preview.max)}</strong></p></div>
      <div className={maxBelly >= 70 ? 'is-danger' : ''}><span>お腹{maxBelly >= MAX_BELLY ? ' · 敗北' : maxBelly >= 70 ? ' · 危険' : ''}</span><p>{belly} → <strong>{range(minBelly, maxBelly)}</strong><small> / {MAX_BELLY}</small></p></div>
    </div>
    <div className="battle-defense__options">
      {attack.source === 'end_turn' && <button type="button" aria-pressed={useGari} disabled={!ready || !canGari}
        onClick={() => setUseGari(value => !value)}>
        <span className="battle-defense__option-title">ガリ <small>残り{gari}個</small></span>
        <strong>全体 −50%</strong>
      </button>}
      {defenseCard && <button type="button" aria-pressed={useDefense} disabled={!ready || !canDefense}
        onClick={() => setUseDefense(value => !value)}>
        <span className="battle-defense__option-title">{defenseCard.name}</span>
        <strong>{needsTarget ? '選ぶ' : 'ランダム'}1体 −{getDefenseReductionRate(defenseCard) * 100}%</strong>
      </button>}
    </div>
    {useDefense && needsTarget && <div className="battle-defense__target-area"><div className="battle-defense__targets" role="group" aria-label="防御する相手のカード">
      {preview.targets.map(card => {
        const after = defensePreview(attack, enemyField, attackBuff, kiretaStack, belly, defenseCard, true, useGari && canGari, card.fid)
        const afterBelly = Math.min(MAX_BELLY, belly + after.min)
        const currentAttack = targetAttack(card)
        const reducedAttack = defenseCard ? targetAttack(withDefenseReduction(card, defenseCard)) : currentAttack
        return <button key={card.fid} type="button" aria-pressed={targetFieldId === card.fid}
          data-danger={afterBelly >= 70} data-lethal={afterBelly >= MAX_BELLY}
          aria-label={`${card.name}、攻撃${currentAttack}から${reducedAttack}、受ける量${after.min}、軽減${attack.amount - after.min}、お腹${afterBelly}、${afterBelly >= MAX_BELLY ? '満腹で敗北' : '耐える'}`}
          disabled={!ready} onClick={() => setTargetFieldId(card.fid)}>
          <SushiArt card={card} size={36} /><span className="battle-defense__target-copy"><strong title={card.name}>{card.name}</strong>
            <small>受 +{after.min} <em>（攻{currentAttack}→{reducedAttack}）</em></small><b>腹{afterBelly} · {afterBelly >= MAX_BELLY ? '敗北' : '耐える'}</b></span>
        </button>
      })}
    </div></div>}
    {useDefense && needsTarget && !validTarget && <p className="battle-defense__hint">相手のカードを選択</p>}
    <button className="battle-defense__confirm" type="button" disabled={!canConfirm}
      onClick={() => { if (canConfirm) onRespond(useGari && canGari, useDefense, useDefense && needsTarget ? targetFieldId : undefined) }}>
      <span>{useGari || useDefense ? 'この防御で確定' : '使わずに受ける'}</span><small>{consumption}</small>
    </button>
    </>}
    {!ready && <p className="battle-defense__connection" role="status">通信中…</p>}
    {onLeave && <button type="button" className="battle-defense__leave" onClick={onLeave}>部屋を退出</button>}
  </dialog>
}
