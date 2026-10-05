import type { Card } from '../../types'
import { COMBO_EFFECT_PARTS, getCardEffectDescription, type EffectTextPart } from './battlePresentation'
import { hasAkamiMori } from './battleEngine'
import './CardEffectText.css'

export function CardEffectText({ card, variant = 'full', combosFired = [], tone = 'light' }: {
  card: Card
  variant?: 'short' | 'full'
  combosFired?: readonly string[]
  tone?: 'light' | 'dark'
}) {
  const conditional = card.effect ? COMBO_EFFECT_PARTS[card.effect]?.[variant] : undefined
  const plain = getCardEffectDescription(card, variant)
  const active = hasAkamiMori(combosFired)
  const renderPart = (part: EffectTextPart, index: number) => part.combo
    ? <span key={index} className="card-effect-condition" data-combo-condition={part.combo}
      data-active={active} title={`赤身三種盛り：${active ? '成立済み' : '未成立'}`}>{part.text}</span>
    : <span key={index}>{part.text}</span>
  const lines = conditional ?? plain.split('\n').map(text => ({ text }))
  return <span className={`card-effect-text${tone === 'dark' ? ' card-effect-text--dark' : ''}`}>
    {variant === 'full'
      ? <span className="card-effect-lines">{lines.map((part, index) =>
        <span className="card-effect-line" key={index}>{renderPart(part, index)}</span>)}</span>
      : conditional ? conditional.map(renderPart) : plain}
  </span>
}
