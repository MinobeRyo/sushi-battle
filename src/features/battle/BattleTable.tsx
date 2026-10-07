import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useCompactLandscape } from '../../hooks/useCompactLandscape'
import { calcFieldDmg, FIELD_MAX, MAKI_COMP_5, makimonoCount, hasNamahamuAura } from './battleEngine'
import { FieldSushi } from './BattleCards'
import type { FieldCard, FloatNum } from './types'

export function BattleTable({ label, cards, isEnemy = false, attackBuff, kiretaStack, enemyBelly, nikuMatsuri, combosFired, floats, flash, onInspect, onShowStatus, selectedFieldId, children }: {
  label: string
  cards: FieldCard[]
  isEnemy?: boolean
  selectedFieldId?: string
  attackBuff: Record<string, number>
  kiretaStack: number
  enemyBelly: number
  nikuMatsuri: boolean
  combosFired?: readonly string[]
  floats: FloatNum[]
  flash: boolean
  onInspect: (card: FieldCard, actualAttack: number) => void
  onShowStatus: () => void
  children: ReactNode
}) {
  const compact = useCompactLandscape()
  const gunkanBoost = makimonoCount(cards) >= MAKI_COMP_5
  return <section className={`battle-table${isEnemy ? ' battle-table--opponent' : ''}`} aria-label={`${label}の机`}>
    <header className="battle-table-heading">
      <h2>{compact ? isEnemy ? '相手の机' : 'あなたの机' : `${label}の机`} <span>{cards.length}/{FIELD_MAX}</span></h2>{compact ? <span className="battle-table-damage">攻撃 {calcFieldDmg(cards, attackBuff, kiretaStack, enemyBelly, { nikuMatsuri })}</span> : <span>{cards.length} / {FIELD_MAX}枚</span>}
    </header>
    <div className="battle-field-cards" data-crowded={compact && cards.length > 5} role="region" aria-label={`${label}の机のカード`} tabIndex={0}>
      <AnimatePresence>
        {cards.map(card => {
          const actualAttack = calcFieldDmg([card], attackBuff, kiretaStack, enemyBelly, { nikuMatsuri, gunkanBoost, namahamuBoost: hasNamahamuAura(cards) })
          return <FieldSushi key={card.fid} card={card} isEnemy={isEnemy}
            actualAttack={actualAttack} combosFired={combosFired} compact={compact} isSelected={selectedFieldId === card.fid}
            onSelect={() => onInspect(card, actualAttack)} />
        })}
      </AnimatePresence>
      {cards.length === 0 && <p className="battle-empty-field">寿司が並ぶと、終了時に攻撃</p>}
    </div>
    <div className="battle-combo-progress">
      <div className="battle-combo-heading">
        <h3>役の進み具合</h3>
        <button type="button" className="battle-status-open" onClick={onShowStatus}
          aria-label={`${label}の状態とコンボを見る`}>状態・コンボの詳細</button>
      </div>
      {children}
    </div>
    <AnimatePresence>
      {floats.map(item => <motion.div key={item.id}
        initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -70, scale: 1.5 }}
        transition={{ duration: 1.1 }} className="battle-damage-float">+{item.dmg}</motion.div>)}
      {flash && <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.25, 0] }}
        transition={{ duration: 0.5 }} className="battle-damage-flash" />}
    </AnimatePresence>
  </section>
}
