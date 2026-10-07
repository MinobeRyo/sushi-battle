import { useEffect, useId, useRef, useState } from 'react'
import type { Inspect, FieldCard } from './types'
import { C, ARCH_LABEL, getCardEffectDescription } from './battlePresentation'
import { motion, useIsPresent } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'
import { cardAttackBuff } from './battleStatusModel'
import { countNamahamu, FIELD_MAX, getSacrificeBonus, getSacrificeLimit, getDestroyTargets, getDestroyTargetError, getDefenseCost, getDefenseReserveError, hasNamahamuAura } from './battleEngine'
import { NAMAHAM_CARD } from '../../data/cards'
import { CardEffectText } from './CardEffectText'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import { ScreenPager } from '../../components/ScreenPager'
import './BattleCards.css'

export function CardDetailSheet({
  inspect, attackBuff, kiretaStack, kiretaSpent = false, fieldCards, combosFired, enemyFieldCards = [], enemyCardAttack, sacrificeAttackBonus = 0, onPlay, onClose,
}: {
  inspect: Inspect
  attackBuff: Record<string, number>
  kiretaStack: number
  kiretaSpent?: boolean
  fieldCards: FieldCard[]
  combosFired?: readonly string[]
  enemyFieldCards?: FieldCard[]
  enemyCardAttack?: (card: FieldCard) => number
  sacrificeAttackBonus?: number
  onPlay: (sacrificeCount?: number, targetFieldId?: string, reserveDefense?: boolean) => void
  onClose: () => void
}) {
  const isPresent = useIsPresent()
  const compact = useCompactLandscape()
  const [detailTab, setDetailTab] = useState<string | null>(null)
  const [targetPage, setTargetPage] = useState(0)
  const [effectPage, setEffectPage] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sacrificeHeadingId = useId()
  const destroyHeadingId = useId()
  const defenseHeadingId = useId()
  const [defenseSelection, setDefenseSelection] = useState<{ cardKey: string; reserve: boolean } | null>(null)
  const [destroySelection, setDestroySelection] = useState<{ cardKey: string; targetFieldId: string } | null>(null)
  const [sacrificeSelection, setSacrificeSelection] = useState<{ cardKey: string; count: number } | null>(null)
  const { card, canPlay, remainingTurns } = inspect
  const effectPages = Math.max(1, Math.ceil(getCardEffectDescription(card).split('\n').length / 4))
  const currentEffectPage = Math.min(effectPage, effectPages - 1)
  const isPersist = card.type === 'persist'
  const buff = cardAttackBuff(card, attackBuff)
  const auraBonus = card.base === '生ハム' && hasNamahamuAura(fieldCards) ? 2 : 0
  const isField = remainingTurns !== undefined
  const showActualAttack = isField && inspect.actualAttack !== undefined
  const isGenerated = card.id === NAMAHAM_CARD.id
  const cardKey = 'instanceId' in card ? String(card.instanceId) : card.id
  const defenseCost = getDefenseCost(card)
  const reserveDefense = !isField && defenseSelection?.cardKey === cardKey && defenseSelection.reserve
  const defenseError = getDefenseReserveError(card, fieldCards, kiretaStack, kiretaSpent, true)
  const defenseBlockedReason = defenseError === 'insufficient_kireta' ? '切れ味が足りません'
    : defenseError === 'defense_already_reserved' ? '防御カードは1枚までです' : undefined
  const kBonus = card.archetype.includes('hikari') ? Math.max(0, kiretaStack - (reserveDefense ? defenseCost : 0)) : 0
  const availableNamahamu = countNamahamu(fieldCards)
  const maxSacrifices = Math.min(getSacrificeLimit(card), availableNamahamu)
  const needsSacrificeChoice = !isField && maxSacrifices > 0
  const selectedSacrifices = !needsSacrificeChoice ? 0
    : sacrificeSelection?.cardKey === cardKey && sacrificeSelection.count <= maxSacrifices
      ? sacrificeSelection.count : null
  const sacrificeBonus = getSacrificeBonus(card) + sacrificeAttackBonus
  const selectedAttackBonus = (selectedSacrifices ?? 0) * sacrificeBonus
  const lacksFieldSpace = selectedSacrifices !== null && fieldCards.length - selectedSacrifices >= FIELD_MAX
  const destroyTargets = getDestroyTargets(card, enemyFieldCards)
  const targetPages = Math.max(1, Math.ceil(destroyTargets.length / 4))
  const currentTargetPage = Math.min(targetPage, targetPages - 1)
  const detailTabs = [
    { id: 'basic', label: '基本' }, { id: 'effect', label: '効果' },
    ...(!isField && defenseCost > 0 ? [{ id: 'defense', label: '防御予約' }] : []),
    ...(needsSacrificeChoice ? [{ id: 'sacrifice', label: '生ハム' }] : []),
    ...(!isField && card.effect === 'destroy_enemy_persist_1' ? [{ id: 'target', label: '対象を選ぶ' }] : []),
  ]
  const activeTab = detailTabs.some(tab => tab.id === detailTab) ? detailTab : canPlay && detailTabs.length > 2 ? detailTabs[2].id : 'basic'
  const targetFieldId = destroySelection?.cardKey === cardKey ? destroySelection.targetFieldId : undefined
  const targetError = getDestroyTargetError(card, enemyFieldCards, targetFieldId)
  const canConfirm = canPlay && isPresent && selectedSacrifices !== null && !lacksFieldSpace && !targetError && !(reserveDefense && defenseError)
  const playLabel = !canPlay ? inspect.playBlockedReason ?? '召喚できません'
    : selectedSacrifices === null ? '生ハムを残すか、消費するか選択'
    : lacksFieldSpace ? '机がいっぱいです（8枚まで）'
    : targetError ? '破壊する相手の持続型を選択'
    : reserveDefense && defenseError ? defenseBlockedReason ?? '防御予約できません'
    : reserveDefense ? `防御を予約して召喚（AP −${card.cost}・切れ味 −${defenseCost}）`
    : selectedSacrifices > 0 ? `${selectedSacrifices}体を消費して召喚（AP −${card.cost}）`
    : `召喚する（AP −${card.cost}）`

  // 最新の場から消えた対象や、操作不能になった際の選択は引き継がない。
  useEffect(() => {
    if (destroySelection && (destroySelection.cardKey !== cardKey || !canPlay
      || !getDestroyTargets(card, enemyFieldCards).some(target => target.fid === destroySelection.targetFieldId))) {
      setDestroySelection(null)
    }
  }, [card, cardKey, canPlay, destroySelection, enemyFieldCards])

  useEffect(() => {
    if (!canPlay) setDefenseSelection(null)
  }, [canPlay])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => previousFocus?.focus({ preventScroll: true })
  }, [])

  return (
    <motion.div
      className="battle-detail-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
        if (event.key !== 'Tab') return
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        const first = buttons?.[0]
        const last = buttons?.[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <motion.div
        ref={dialogRef}
        className="battle-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name}の詳細`}
        data-card-type={card.type}
        data-card-variant={card.variant}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onClick={event => event.stopPropagation()}
      >
        <div className="battle-detail-heading">
          <div>
            <div className="battle-detail-tags">
              <span className="battle-detail-type">{isPersist ? '持続型' : '即時型'}</span>
              {card.archetype.map(archetype => <span key={archetype}>{ARCH_LABEL[archetype]}</span>)}
            </div>
            <h2>{card.name}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="battle-detail-dismiss" onClick={onClose} aria-label="カード詳細を閉じる">✕</button>
        </div>

        {compact && <nav className="battle-detail-tabs" aria-label="カード詳細の表示">
          {detailTabs.map(tab => <button type="button" key={tab.id} aria-pressed={activeTab === tab.id} onClick={() => setDetailTab(tab.id)}>{tab.label}</button>)}
        </nav>}
        {(!compact || activeTab === 'basic') && <div className="battle-detail-body">
          <div className="battle-detail-art" aria-hidden="true">
            <SushiArt card={card} size="92%" />
          </div>
          <dl className="battle-detail-stats">
            <div><dt>消費AP</dt><dd>{card.cost}</dd></div>
            <div>
              <dt>{showActualAttack ? '現在の攻撃力' : '攻撃力'}</dt>
              <dd className="battle-detail-attack">
                {showActualAttack ? inspect.actualAttack : card.attack}
                {!showActualAttack && buff > 0 && <span> +{buff}</span>}
                {!showActualAttack && auraBonus > 0 && <span> +{auraBonus}（合鴨）</span>}
                {!showActualAttack && kBonus > 0 && <span> +{kBonus}（切れ味）</span>}
                {!showActualAttack && selectedAttackBonus > 0 && <span> +{selectedAttackBonus}（生贄）</span>}
              </dd>
            </div>
            {isPersist && <div><dt>{isField ? '残りターン' : '持続ターン'}</dt><dd>{isField ? remainingTurns : card.fullness}ターン</dd></div>}
            <div><dt>{isGenerated ? '入手方法' : 'ドラフト価格'}</dt><dd>{isGenerated ? '生成専用' : `¥${card.price}`}</dd></div>
          </dl>
        </div>}
        {(!compact || activeTab === 'effect') && <div className="battle-detail-effect">
          <h3>特殊効果</h3>
          <p><CardEffectText card={card} variant="full" combosFired={combosFired} lineRange={compact ? { start: currentEffectPage * 4, count: 4 } : undefined} /></p>
          {compact && effectPages > 1 && <ScreenPager page={currentEffectPage} pages={effectPages} onPageChange={setEffectPage} />}
        </div>}

        {!isField && defenseCost > 0 && (!compact || activeTab === 'defense') && (
          <section className="battle-defense-reserve" aria-labelledby={defenseHeadingId}>
            <h3 id={defenseHeadingId}>召喚後の防御を予約</h3>
            <p>攻撃後に防御待機。次の相手の攻撃時、ガリと一緒に選べます。</p>
            <div className="battle-defense-reserve-options" role="group" aria-labelledby={defenseHeadingId}>
              <button type="button" aria-pressed={!reserveDefense} disabled={!canPlay || !isPresent}
                onClick={() => setDefenseSelection({ cardKey, reserve: false })}>
                <strong>通常召喚</strong><span>切れ味を消費しない</span>
              </button>
              <button type="button" aria-pressed={reserveDefense} disabled={!canPlay || !isPresent || !!defenseError}
                onClick={() => setDefenseSelection({ cardKey, reserve: true })}>
                <strong>防御を予約</strong><span>切れ味 {defenseCost} 消費</span>
                {defenseBlockedReason && <small>{defenseBlockedReason}</small>}
              </button>
            </div>
          </section>
        )}

        {needsSacrificeChoice && (!compact || activeTab === 'sacrifice') && (
          <section className="battle-sacrifice" aria-labelledby={sacrificeHeadingId}>
            <div className="battle-sacrifice-heading">
              <h3 id={sacrificeHeadingId}>生ハムをどうしますか？</h3>
              <span>場に <strong>{availableNamahamu}体</strong></span>
            </div>
            <p>残して毎ターン攻撃するか、消費してこの寿司を強化できます。</p>
            {sacrificeAttackBonus > 0 && <p>インバウン丼：生贄1体につき、さらに攻撃 +{sacrificeAttackBonus}（下の数値に含みます）。</p>}
            <div className="battle-sacrifice-options" role="group" aria-labelledby={sacrificeHeadingId}>
              {Array.from({ length: maxSacrifices + 1 }, (_, count) => {
                const needsSpace = fieldCards.length - count >= FIELD_MAX
                return (
                  <button type="button" key={count}
                    aria-pressed={selectedSacrifices === count}
                    disabled={!canPlay || !isPresent || needsSpace}
                    onClick={() => setSacrificeSelection({ cardKey, count })}>
                    <span>{count === 0 ? '生ハムを残す' : `${count}体を消費する`}</span>
                    <strong>攻撃 +{count * sacrificeBonus}</strong>
                    <small>{needsSpace ? '机が満杯のため選べません' : `生ハムは残り${availableNamahamu - count}体`}</small>
                  </button>
                )
              })}
            </div>
            <div className="battle-sacrifice-note">
              <p>同ターンに計2体で肉祭り：5ダメージ・生ハムを山札に1枚・全生ハムの攻撃＋1。</p>
            </div>
          </section>
        )}

        {!isField && card.effect === 'destroy_enemy_persist_1' && (!compact || activeTab === 'target') && (
          <section className="battle-destroy-target" aria-labelledby={destroyHeadingId}>
            <h3 id={destroyHeadingId}>破壊する相手の持続型を選択</h3>
            {destroyTargets.length > 0 ? <>
              <p>相手の机から1枚を選び、下の召喚ボタンで確定します。</p>
              <div className="battle-destroy-options" role="group" aria-labelledby={destroyHeadingId}>
                {(compact ? destroyTargets.slice(currentTargetPage * 4, currentTargetPage * 4 + 4) : destroyTargets).map(target => (
                  <button type="button" key={target.fid}
                    aria-pressed={targetFieldId === target.fid}
                    disabled={!canPlay || !isPresent}
                    onClick={() => setDestroySelection({ cardKey, targetFieldId: target.fid })}>
                    <small>相手の机・左から{enemyFieldCards.findIndex(item => item.fid === target.fid) + 1}枚目</small>
                    <strong>{target.name}</strong>
                    <span>{enemyCardAttack ? '攻撃' : '基本攻撃'} {enemyCardAttack?.(target) ?? target.attack}・残り{target.turnsLeft}ターン</span>
                  </button>
                ))}
              </div>
              {compact && <ScreenPager page={currentTargetPage} pages={targetPages} onPageChange={setTargetPage} />}
              {targetError === 'invalid_target' && <p role="status">選んだ対象がいなくなりました。選び直してください。</p>}
            </> : <p>相手の机に持続型がありません。破壊効果を使わずに召喚できます。</p>}
          </section>
        )}

        <div className="battle-detail-actions">
          <button type="button" className="battle-detail-cancel" onClick={onClose}>{isField ? '閉じる' : 'キャンセル'}</button>
          {!isField && (
            <motion.button
              type="button"
              className="battle-detail-play"
              onClick={canConfirm ? () => onPlay(selectedSacrifices ?? 0, targetFieldId, reserveDefense) : undefined}
              disabled={!canConfirm}
              whileTap={canConfirm ? { scale: 0.95 } : {}}
              whileHover={canConfirm ? { scale: 1.02 } : {}}
            >
              {playLabel}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function FieldSushi({ card, isEnemy = false, actualAttack, combosFired, compact = false, onSelect }: {
  card: FieldCard; isEnemy?: boolean; actualAttack?: number; combosFired?: readonly string[]; compact?: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const defenseLabel = card.defenseState === 'ready' ? '防御待機' : card.defenseState === 'reserved' ? '防御予約' : null
  const reductionLabel = card.attackHalved ? '攻撃半減' : card.attackReductionRate ? `攻撃${Math.round(card.attackReductionRate * 100)}％減` : null
  const statusLabel = [defenseLabel, reductionLabel].filter(Boolean).join('・')
  return (
    <motion.button
      type="button"
      className="battle-field-card"
      data-card-type={card.type}
      data-card-variant={card.variant}
      data-defense-state={card.defenseState}
      data-attack-halved={card.attackHalved || undefined}
      aria-label={`${card.name}${statusLabel ? `、${statusLabel}` : ''}、攻撃力${actualAttack ?? card.attack}${isPersist ? `、残り${card.turnsLeft}ターン` : ''}の詳細`}
      layout
      initial={{ scale: 0, y: isEnemy ? -24 : 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      onClick={onSelect}
      whileHover={{ scale: 1.03, boxShadow: `0 6px 20px ${isPersist ? C.persGlow : C.instGlow}` }}
      whileTap={{ scale: 0.96 }}
    >
      <div className="battle-field-card-art" aria-hidden="true"><SushiArt card={card} size="100%" fit tight={compact} /></div>
      <p className="battle-field-card-name">{compact ? card.name.replace(/にぎり|寿司|軍艦/g, '') : card.name}</p>
      <div className="battle-field-card-stats">
        <span className="battle-field-card-attack">{compact ? '攻' : '攻撃 '}{actualAttack ?? card.attack}{reductionLabel && <small className="battle-field-card-debuff"> {reductionLabel.replace('攻撃', '')}</small>}</span>
        <span className="battle-field-card-turns">{(compact && defenseLabel ? '防御' : defenseLabel) ?? (compact ? `${card.turnsLeft}T` : isPersist ? `残り${card.turnsLeft}T` : '即時')}</span>
      </div>
      <p className="battle-field-card-effect"><CardEffectText card={card} variant="short" combosFired={combosFired} /></p>
    </motion.button>
  )
}

export function HandSushi({
  card, canPlay, attackBuff, kiretaStack, namahamuBoost = false, isSelected, combosFired, compact = false, blockedLabel, actualAttack, onSelect,
}: {
  card: Card; canPlay: boolean; attackBuff: Record<string, number>
  kiretaStack: number; namahamuBoost?: boolean; isSelected: boolean; combosFired?: readonly string[]; compact?: boolean; blockedLabel?: string; actualAttack?: number; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const buff = cardAttackBuff(card, attackBuff)
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const auraBonus = card.base === '生ハム' && namahamuBoost ? 2 : 0

  return (
    <motion.button
      type="button"
      className="battle-hand-card"
      data-card-type={card.type}
      data-card-variant={card.variant}
      data-playable={canPlay}
      data-selected={isSelected}
      aria-label={`${card.name}、消費AP${card.cost}の詳細${canPlay ? '、召喚可能' : ''}`}
      onClick={onSelect}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.93, y: -6 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <div className="battle-hand-card-heading">
        <span className="battle-hand-card-cost">AP{compact ? '' : ' '}{card.cost}</span>
        <span className="battle-hand-card-type">{!canPlay && compact ? blockedLabel ?? '不可' : isPersist ? '持続' : '即時'}</span>
      </div>
      <div className="battle-hand-card-art" aria-hidden="true"><SushiArt card={card} size="100%" fit tight={compact} /></div>
      <p className="battle-hand-card-name">{card.name}</p>
      <div className="battle-hand-card-stats">
        <span className="battle-hand-card-attack">{compact ? '攻' : '攻撃 '}{actualAttack ?? card.attack + buff + kBonus + auraBonus}</span>
        {isPersist && <span className="battle-hand-card-turns">×{card.fullness}T</span>}
      </div>
      <p className="battle-hand-card-effect"><CardEffectText card={card} variant="short" combosFired={combosFired} /></p>
    </motion.button>
  )
}
