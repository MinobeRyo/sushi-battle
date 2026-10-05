import { useEffect, useId, useRef, useState } from 'react'
import type { Inspect, FieldCard } from './types'
import { EFFECT_FULL, C, ARCH_LABEL } from './battlePresentation'
import { motion, useIsPresent } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'
import { cardAttackBuff } from './battleStatusModel'
import { countNamahamu, FIELD_MAX, getSacrificeBonus, getSacrificeLimit, getDestroyTargets, getDestroyTargetError } from './battleEngine'
import { NAMAHAM_CARD } from '../../data/cards'
import './BattleCards.css'

const EFFECT_SHORT: Record<string, string> = {
  self_digest_5: '自分のお腹 −5',
  refund_ap_1_if_tako: '机にたこ系がいれば AP +1',
  buff_current_makimono_2: '場の巻物（軍艦以外）攻撃 +2',
  draw_random_akami_1: '山札の赤身1枚を引く',
  digest_stop_akami_1_or_2: '消化停止1回・赤身三種後2回',
  destroy_enemy_persist_1: '相手の持続1枚を選んで破壊',
  reduce_random_akami_cost_1: 'ランダムな赤身1枚の消費AP −1',
  digest_boost_2: '毎ターンの消化 +2',
  digest_stop_1t: '相手の消化を1ターン停止',
  kireta_stack: '切れ味 +1',
  kireta_consume_x3: '切れ味全消費 ×3攻撃',
  kireta_consume_2_draw_2: '切れ味2で2枚引く',
  belly_boost_70: '相手お腹70以上で攻撃 +8',
  belly_boost_60: '相手お腹60以上で攻撃 +5',
  belly_boost_65: '相手お腹65以上で攻撃 +6',
  belly_boost_persist_50_namahamu_deck_1: '腹50以上で+2・生ハムを山札へ',
  generate_namahamu_1: '生ハムを1体生成',
  generate_namahamu_2: '生ハムを2体生成',
  sacrifice_namahamu_1_7: '生ハム1体で攻撃 +7',
  sacrifice_namahamu_2_8: '生ハム2体まで・各 +8',
  chain_on_kaisen_summon: '海鮮召喚で連鎖攻撃',
  draw_1: '召喚時に1枚引く',
  draw_2: '召喚時に2枚引く',
  draw_persist_ika_tako_1: '持続いか・たこを1枚引く',
  akami_ap_each_turn_1: '赤身三種後・開始時AP +1',
  akami_draw_2_digest_3: '赤身三種後・2枚引き腹 −3',
  ap_next_1: '次のターン AP +1',
  multi_base: 'マグロ・えびも兼ねる',
}

function shortEffect(card: Card) {
  if (card.id === NAMAHAM_CARD.id) return '生成専用・生贄にできる'
  return card.effect ? EFFECT_SHORT[card.effect] ?? '特殊効果あり・詳細を確認' : '特殊効果なし'
}

export function CardDetailSheet({
  inspect, attackBuff, kiretaStack, fieldCards, enemyFieldCards = [], enemyCardAttack, sacrificeAttackBonus = 0, onPlay, onClose,
}: {
  inspect: Inspect
  attackBuff: Record<string, number>
  kiretaStack: number
  fieldCards: FieldCard[]
  enemyFieldCards?: FieldCard[]
  enemyCardAttack?: (card: FieldCard) => number
  sacrificeAttackBonus?: number
  onPlay: (sacrificeCount?: number, targetFieldId?: string) => void
  onClose: () => void
}) {
  const isPresent = useIsPresent()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sacrificeHeadingId = useId()
  const destroyHeadingId = useId()
  const [destroySelection, setDestroySelection] = useState<{ cardKey: string; targetFieldId: string } | null>(null)
  const [sacrificeSelection, setSacrificeSelection] = useState<{ cardKey: string; count: number } | null>(null)
  const { card, canPlay, remainingTurns } = inspect
  const isPersist = card.type === 'persist'
  const buff = cardAttackBuff(card, attackBuff)
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const isField = remainingTurns !== undefined
  const showActualAttack = isField && inspect.actualAttack !== undefined
  const isGenerated = card.id === NAMAHAM_CARD.id
  const effectDesc = isGenerated
    ? '生成専用カードです。牛タン寿司・ローストビーフ寿司は机に生成し、焼肉寿司は自分の終了時に山札へ1枚、肉祭りは手札に2枚追加します。0AP・基本攻撃1・自分の3ターン持続。肉祭りが発動するたび、自分の全生ハムの攻撃が試合中+1ずつ累積します。カルビ寿司・和牛にぎりの生贄にできます。購入はできません。'
    : card.effect ? EFFECT_FULL[card.effect] : null
  const cardKey = 'instanceId' in card ? String(card.instanceId) : card.id
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
  const targetFieldId = destroySelection?.cardKey === cardKey ? destroySelection.targetFieldId : undefined
  const targetError = getDestroyTargetError(card, enemyFieldCards, targetFieldId)
  const canConfirm = canPlay && isPresent && selectedSacrifices !== null && !lacksFieldSpace && !targetError
  const playLabel = !canPlay ? inspect.playBlockedReason ?? '召喚できません'
    : selectedSacrifices === null ? '生ハムを残すか、消費するか選択'
    : lacksFieldSpace ? '机がいっぱいです（8枚まで）'
    : targetError ? '破壊する相手の持続型を選択'
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
                {!showActualAttack && selectedAttackBonus > 0 && <span> +{selectedAttackBonus}（生贄）</span>}
              </dd>
            </div>
            {isPersist && <div><dt>{isField ? '残りターン' : '持続ターン'}</dt><dd>{isField ? remainingTurns : card.fullness}ターン</dd></div>}
            <div><dt>{isGenerated ? '入手方法' : 'ドラフト価格'}</dt><dd>{isGenerated ? '生成専用' : `¥${card.price}`}</dd></div>
          </dl>
        </div>
        <div className="battle-detail-effect">
          <h3>特殊効果</h3>
          <p>{effectDesc ?? '特殊効果なし'}</p>
        </div>

        {needsSacrificeChoice && (
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
            <p className="battle-sacrifice-note">同じターンに合計2体を生贄にすると、肉祭りで追加5ダメージ・手札に0AP生ハム2枚追加・全生ハムの攻撃が試合中+1（累積）。1ターンに1回、手札7枚を超える分は追加されません。</p>
          </section>
        )}

        {!isField && card.effect === 'destroy_enemy_persist_1' && (
          <section className="battle-destroy-target" aria-labelledby={destroyHeadingId}>
            <h3 id={destroyHeadingId}>破壊する相手の持続型を選択</h3>
            {destroyTargets.length > 0 ? <>
              <p>相手の机から1枚を選び、下の召喚ボタンで確定します。</p>
              <div className="battle-destroy-options" role="group" aria-labelledby={destroyHeadingId}>
                {destroyTargets.map(target => (
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
              onClick={canConfirm ? () => onPlay(selectedSacrifices ?? 0, targetFieldId) : undefined}
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
