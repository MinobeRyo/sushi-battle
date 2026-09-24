import type { Inspect, FieldCard } from './types'
import { EFFECT_FULL, R, C, ARCH_LABEL } from './battlePresentation'
import { motion } from 'framer-motion'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'

// ── CardDetailSheet ──────────────────────────────────────────────────────────
export function CardDetailSheet({
  inspect, attackBuff, kiretaStack, onPlay, onClose,
}: {
  inspect: Inspect
  attackBuff: Record<string, number>
  kiretaStack: number
  onPlay: () => void
  onClose: () => void
}) {
  const { card, canPlay, remainingTurns } = inspect
  const isPersist = card.type === 'persist'
  const buff = attackBuff[card.base] ?? 0
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const isField = remainingTurns !== undefined
  const effectDesc = card.effect ? EFFECT_FULL[card.effect] : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 40,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'linear-gradient(180deg,#faf6ef,#f3ebe0)',
          borderRadius: 'clamp(16px, 2vw, 28px) clamp(16px, 2vw, 28px) 0 0',
          padding: 'clamp(16px, 2.5vh, 32px) clamp(16px, 3vw, 36px) clamp(20px, 3vh, 40px)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'clamp(12px, 2vh, 20px)' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: R.f2xs, fontWeight: 700, color: '#fff',
                background: isPersist ? C.persBorder : C.instBorder,
                borderRadius: 6, padding: '2px 8px',
              }}>
                {isPersist ? '🔄 持続型' : '⚡ 即時型'}
              </span>
              {card.archetype.map(a => (
                <span key={a} style={{
                  fontSize: R.f2xs, fontWeight: 600, color: C.txtSec,
                  background: 'rgba(0,0,0,0.07)', borderRadius: 6, padding: '2px 8px',
                }}>
                  {ARCH_LABEL[a]}
                </span>
              ))}
            </div>
            <p style={{ fontSize: R.fxl, fontWeight: 800, color: C.txtPri }}>{card.name}</p>
          </div>
          <button onClick={onClose} style={{
            fontSize: R.flg, color: C.txtMut, background: 'none', border: 'none',
            cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 'clamp(16px, 3vw, 32px)', alignItems: 'center' }}>
          <div style={{
            flexShrink: 0,
            width: 'clamp(72px, 9vw, 140px)', height: 'clamp(72px, 9vw, 140px)',
            borderRadius: 'clamp(12px, 1.2vw, 20px)',
            background: isPersist ? C.persBg : C.instBg,
            border: `2px solid ${isPersist ? C.persBorder : C.instBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SushiArt card={card} size="86%" />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', marginBottom: 'clamp(8px, 1.5vh, 14px)', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>コスト</p>
                <p style={{
                  fontSize: R.flg, fontWeight: 800,
                  color: '#fff', background: isPersist ? C.persBorder : C.instBorder,
                  borderRadius: 8, padding: '2px 12px', display: 'inline-block',
                }}>{card.cost}</p>
              </div>
              <div>
                <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>攻撃力</p>
                <p style={{ fontSize: R.flg, fontWeight: 800, color: C.atk }}>
                  ⚔ {card.attack}
                  {buff > 0 && <span style={{ color: C.ap, fontSize: R.fsm }}> +{buff}</span>}
                  {kBonus > 0 && <span style={{ color: C.kireta, fontSize: R.fsm }}> +{kBonus}✂</span>}
                </p>
              </div>
              {isPersist && (
                <div>
                  <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>
                    {isField ? '残りターン' : '持続ターン'}
                  </p>
                  <p style={{ fontSize: R.flg, fontWeight: 800, color: C.persBorder }}>
                    {isField ? `${remainingTurns}T` : `${card.fullness}T`}
                  </p>
                </div>
              )}
              <div>
                <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>ドラフト価格</p>
                <p style={{ fontSize: R.flg, fontWeight: 700, color: C.txtSec }}>¥{card.price}</p>
              </div>
            </div>

            <div style={{
              background: effectDesc ? 'rgba(251,191,36,0.14)' : 'transparent',
              borderRadius: 10, padding: effectDesc ? 'clamp(8px, 1vh, 14px)' : 0,
              border: effectDesc ? '1px solid rgba(217,119,6,0.25)' : 'none',
            }}>
              {effectDesc
                ? <p style={{ fontSize: R.fsm, color: '#78530a', fontWeight: 600, lineHeight: 1.5 }}>
                    ✦ {effectDesc}
                  </p>
                : <p style={{ fontSize: R.fsm, color: C.txtMut }}>効果なし</p>
              }
            </div>
          </div>
        </div>

        {!isField && (
          <div style={{ display: 'flex', gap: 12, marginTop: 'clamp(14px, 2.5vh, 24px)' }}>
            <button onClick={onClose}
              style={{
                flex: 1, padding: 'clamp(10px, 1.5vh, 18px)', borderRadius: 999,
                fontSize: R.fsm, fontWeight: 700, background: '#e8dfd0',
                color: C.txtSec, border: '1px solid #d4c4ae', cursor: 'pointer',
              }}>
              キャンセル
            </button>
            <motion.button
              onClick={canPlay ? onPlay : undefined}
              whileTap={canPlay ? { scale: 0.95 } : {}}
              whileHover={canPlay ? { scale: 1.02 } : {}}
              style={{
                flex: 2, padding: 'clamp(10px, 1.5vh, 18px)', borderRadius: 999,
                fontSize: R.fsm, fontWeight: 800,
                background: canPlay ? C.btnEnd : '#d4c4ae',
                color: canPlay ? '#fff' : C.txtMut,
                border: `1.5px solid ${canPlay ? C.btnEndBorder : '#c4b4a0'}`,
                cursor: canPlay ? 'pointer' : 'not-allowed',
                boxShadow: canPlay ? `0 0 20px ${C.btnEndGlow}` : 'none',
              }}
            >
              {canPlay ? `⚔ 召喚する（AP -${card.cost}）` : 'AP不足'}
            </motion.button>
          </div>
        )}
        {isField && (
          <div style={{ marginTop: 'clamp(14px, 2.5vh, 24px)' }}>
            <button onClick={onClose}
              style={{
                width: '100%', padding: 'clamp(10px, 1.5vh, 18px)', borderRadius: 999,
                fontSize: R.fsm, fontWeight: 700, background: '#e8dfd0',
                color: C.txtSec, border: '1px solid #d4c4ae', cursor: 'pointer',
              }}>
              閉じる
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── FieldSushi ────────────────────────────────────────────────────────────────
export function FieldSushi({ card, isEnemy = false, onSelect }: {
  card: FieldCard; isEnemy?: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const maxT = isPersist ? Math.max(card.fullness, 2) : 1
  return (
    <motion.div
      layout
      initial={{ scale: 0, y: isEnemy ? -24 : 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      onClick={onSelect}
      whileHover={{ scale: 1.06, boxShadow: `0 6px 20px ${isPersist ? C.persGlow : C.instGlow}` }}
      whileTap={{ scale: 0.96 }}
      style={{
        flexShrink: 0, cursor: 'pointer',
        width: R.fw, height: R.fh,
        borderRadius: 'clamp(10px, 1vw, 16px)',
        background: isPersist ? C.persBg : C.instBg,
        border: `2px solid ${isPersist ? C.persBorder : C.instBorder}`,
        boxShadow: `0 4px 16px ${isPersist ? C.persGlow : C.instGlow}, 0 1px 3px rgba(0,0,0,0.12)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'clamp(5px, 0.6vw, 10px) clamp(3px, 0.4vw, 7px) clamp(4px, 0.5vw, 8px)',
        gap: 'clamp(2px, 0.3vw, 5px)', overflow: 'hidden',
      }}
    >
      <div style={{ width: '82%', display: 'flex', justifyContent: 'center' }}>
        <SushiArt card={card} size="100%" />
      </div>
      <p style={{ fontSize: R.fxs, color: C.txtPri, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: '90%' }}>
        {card.name.slice(0, 6)}
      </p>
      <div style={{ display: 'flex', gap: 'clamp(3px, 0.4vw, 6px)', alignItems: 'center' }}>
        <span style={{ fontSize: R.fxs, color: C.atk, fontWeight: 700 }}>⚔ {card.attack}</span>
        {isPersist && <span style={{ fontSize: R.fxs, color: C.persBorder, fontWeight: 700 }}>×{card.turnsLeft}</span>}
      </div>
      {isPersist && (
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: maxT }, (_, i) => (
            <div key={i} style={{
              width: R.dot, height: R.dot, maxWidth: 12, maxHeight: 12, borderRadius: '50%',
              background: i < card.turnsLeft ? '#16a34a' : C.apEmpty,
              border: `1px solid ${i < card.turnsLeft ? '#15803d' : '#c4b4a0'}`,
            }} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ── HandSushi ─────────────────────────────────────────────────────────────────
export function HandSushi({
  card, canPlay, attackBuff, kiretaStack, isSelected, onSelect,
}: {
  card: Card; canPlay: boolean; attackBuff: Record<string, number>
  kiretaStack: number; isSelected: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const buff = attackBuff[card.base] ?? 0
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const effectLabel = card.effect
    ? (EFFECT_FULL[card.effect]?.slice(0, 14) + '…')
    : null

  const bgGrad = canPlay ? (isPersist ? C.persBg : C.instBg) : '#f0e8dc'
  const borderColor = isSelected
    ? '#1d4ed8'
    : canPlay ? (isPersist ? C.persBorder : C.instBorder) : '#d4c4ae'
  const glow = canPlay
    ? `0 8px 24px ${isPersist ? C.persGlow : C.instGlow}, 0 2px 6px rgba(0,0,0,0.1)`
    : '0 1px 4px rgba(0,0,0,0.08)'

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -20, scale: 1.06 }}
      whileTap={{ scale: 0.93, y: -6 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      style={{
        flexShrink: 0,
        width: R.hw, height: R.hh,
        borderRadius: 'clamp(12px, 1.2vw, 20px)',
        background: bgGrad, border: `2px solid ${borderColor}`,
        opacity: canPlay ? 1 : 0.45,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: isSelected ? `0 0 0 3px #3b82f6, ${glow}` : glow,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'clamp(5px, 0.6vw, 9px) clamp(6px, 0.7vw, 10px) 0' }}>
        <span style={{
          fontSize: R.fsm, fontWeight: 800, color: '#fff',
          background: isPersist ? C.persBorder : C.instBorder,
          borderRadius: 6, padding: '1px 6px', lineHeight: 1.4,
        }}>{card.cost}</span>
        <span style={{ fontSize: R.fxs }}>{isPersist ? '🔄' : '⚡'}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '0 4px' }}>
        <SushiArt card={card} size="88%" />
      </div>
      <p style={{ fontSize: R.fxs, color: C.txtPri, fontWeight: 700, textAlign: 'center', padding: '0 4px', lineHeight: 1.25 }}>
        {card.name.slice(0, 8)}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: 'clamp(2px, 0.3vw, 4px) 4px' }}>
        <span style={{ fontSize: R.fsm, color: C.atk, fontWeight: 800 }}>
          ⚔ {card.attack}
          {buff > 0 && <span style={{ color: C.ap, fontSize: R.fxs }}>+{buff}</span>}
          {kBonus > 0 && <span style={{ color: C.kireta, fontSize: R.fxs }}>+{kBonus}</span>}
        </span>
        {isPersist && <span style={{ fontSize: R.fxs, color: C.persBorder, fontWeight: 700 }}>{card.fullness}T</span>}
      </div>
      <p style={{
        fontSize: R.f2xs, color: effectLabel ? '#78530a' : 'transparent',
        textAlign: 'center', padding: 'clamp(1px, 0.2vw, 3px) 4px clamp(4px, 0.5vw, 8px)',
        lineHeight: 1.2, minHeight: 'clamp(14px, 1.4vw, 20px)',
        background: effectLabel ? 'rgba(251,191,36,0.18)' : 'transparent',
      }}>
        {effectLabel ?? '　'}
      </p>
    </motion.button>
  )
}
