import { useEffect, useRef } from 'react'
import type { Inspect, FieldCard } from './types'
import { EFFECT_FULL, C, ARCH_LABEL } from './battlePresentation'
import { motion, useIsPresent } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'
import { cardAttackBuff } from './battleStatusModel'
import './BattleCards.css'

const EFFECT_SHORT: Record<string, string> = {
  self_digest_5: '自分のお腹 −5',
  digest_boost_2: '毎ターンの消化 +2',
  digest_stop_1t: '相手の消化を1ターン停止',
  kireta_stack: '切れ味 +1',
  kireta_consume_x3: '切れ味全消費 ×3攻撃',
  kireta_consume_2_draw_2: '切れ味2で2枚引く',
  belly_boost_70: '相手お腹70以上で攻撃 +8',
  belly_boost_60: '相手お腹60以上で攻撃 +5',
  belly_boost_65: '相手お腹65以上で攻撃 +6',
  belly_boost_persist_50: '相手お腹50以上で攻撃 +2',
  chain_on_kaisen_summon: '海鮮召喚で連鎖攻撃',
  draw_1: '召喚時に1枚引く',
  draw_2: '召喚時に2枚引く',
  ap_next_1: '次のターン AP +1',
  multi_base: 'マグロ・えびも兼ねる',
}

function shortEffect(card: Card) {
  return card.effect ? EFFECT_SHORT[card.effect] ?? '特殊効果あり・詳細を確認' : '特殊効果なし'
}

export function CardDetailSheet({
  inspect, attackBuff, kiretaStack, onPlay, onClose,
}: {
  inspect: Inspect
  attackBuff: Record<string, number>
  kiretaStack: number
  onPlay: () => void
  onClose: () => void
}) {
  const isPresent = useIsPresent()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const { card, canPlay, remainingTurns } = inspect
  const isPersist = card.type === 'persist'
  const buff = cardAttackBuff(card, attackBuff)
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const isField = remainingTurns !== undefined
  const showActualAttack = isField && inspect.actualAttack !== undefined
  const effectDesc = card.effect ? EFFECT_FULL[card.effect] : null

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

        <div className="battle-detail-body">
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
                {!showActualAttack && kBonus > 0 && <span> +{kBonus}（切れ味）</span>}
              </dd>
            </div>
            {isPersist && <div><dt>{isField ? '残りターン' : '持続ターン'}</dt><dd>{isField ? remainingTurns : card.fullness}ターン</dd></div>}
            <div><dt>ドラフト価格</dt><dd>¥{card.price}</dd></div>
          </dl>
        </div>
        <div className="battle-detail-effect">
          <h3>特殊効果</h3>
          <p>{effectDesc ?? '特殊効果なし'}</p>
        </div>

        <div className="battle-detail-actions">
          <button type="button" className="battle-detail-cancel" onClick={onClose}>{isField ? '閉じる' : 'キャンセル'}</button>
          {!isField && (
            <motion.button
              type="button"
              className="battle-detail-play"
              onClick={canPlay && isPresent ? onPlay : undefined}
              disabled={!canPlay || !isPresent}
              whileTap={canPlay ? { scale: 0.95 } : {}}
              whileHover={canPlay ? { scale: 1.02 } : {}}
            >
              {canPlay ? `召喚する（AP −${card.cost}）` : inspect.playBlockedReason ?? '召喚できません'}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function FieldSushi({ card, isEnemy = false, actualAttack, onSelect }: {
  card: FieldCard; isEnemy?: boolean; actualAttack?: number; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  return (
    <motion.button
      type="button"
      className="battle-field-card"
      data-card-type={card.type}
      aria-label={`${card.name}、攻撃力${actualAttack ?? card.attack}${isPersist ? `、残り${card.turnsLeft}ターン` : ''}の詳細`}
      layout
      initial={{ scale: 0, y: isEnemy ? -24 : 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      onClick={onSelect}
      whileHover={{ scale: 1.03, boxShadow: `0 6px 20px ${isPersist ? C.persGlow : C.instGlow}` }}
      whileTap={{ scale: 0.96 }}
    >
      <div className="battle-field-card-art" aria-hidden="true"><SushiArt card={card} size="100%" fit /></div>
      <p className="battle-field-card-name">{card.name}</p>
      <div className="battle-field-card-stats">
        <span className="battle-field-card-attack">攻撃 {actualAttack ?? card.attack}</span>
        <span className="battle-field-card-turns">{isPersist ? `残り${card.turnsLeft}T` : '即時'}</span>
      </div>
      <p className="battle-field-card-effect">{shortEffect(card)}</p>
    </motion.button>
  )
}

export function HandSushi({
  card, canPlay, attackBuff, kiretaStack, isSelected, onSelect,
}: {
  card: Card; canPlay: boolean; attackBuff: Record<string, number>
  kiretaStack: number; isSelected: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const buff = cardAttackBuff(card, attackBuff)
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0

  return (
    <motion.button
      type="button"
      className="battle-hand-card"
      data-card-type={card.type}
      data-playable={canPlay}
      data-selected={isSelected}
      aria-label={`${card.name}、消費AP${card.cost}の詳細${canPlay ? '、召喚可能' : ''}`}
      onClick={onSelect}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.93, y: -6 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <div className="battle-hand-card-heading">
        <span className="battle-hand-card-cost">AP {card.cost}</span>
        <span className="battle-hand-card-type">{isPersist ? '持続' : '即時'}</span>
      </div>
      <div className="battle-hand-card-art" aria-hidden="true"><SushiArt card={card} size="96%" fit /></div>
      <p className="battle-hand-card-name">{card.name}</p>
      <div className="battle-hand-card-stats">
        <span className="battle-hand-card-attack">攻撃 {card.attack + buff + kBonus}</span>
        {isPersist && <span className="battle-hand-card-turns">{card.fullness}T</span>}
      </div>
      <p className="battle-hand-card-effect">{shortEffect(card)}</p>
    </motion.button>
  )
}
