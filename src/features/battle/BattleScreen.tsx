import { useRef, useReducer, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CARDS } from '../../data/cards'
import type { Card, Archetype } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldCard = Card & { fid: string; turnsLeft: number }
type Phase = 'player' | 'animating' | 'cpu' | 'over'
type FloatNum = { id: number; dmg: number; target: 'cpu' | 'player' }
type ComboAnim = { name: string; emoji: string; desc: string }
type Inspect = { card: Card; canPlay: boolean; remainingTurns?: number }

type S = {
  pHand: Card[]; pField: FieldCard[]; pDeck: Card[]
  pBelly: number; pAP: number; pMaxAP: number
  pSummonedIds: string[]; pSummonedArch: Record<string, number>
  pDrawBonus: number; pAttackBuff: Record<string, number>; pCombosFired: string[]
  cHand: Card[]; cField: FieldCard[]; cDeck: Card[]
  cBelly: number
  turn: number; phase: Phase; winner: 'player' | 'cpu' | null
  log: string[]; flash: 'cpu' | 'player' | null
}

// ── 回転寿司カラーパレット ────────────────────────────────────────────────────

const C = {
  bgMain: 'linear-gradient(180deg,#faf6ef 0%,#f3ebe0 100%)',
  bgArea: 'rgba(255,255,255,0.55)',
  bgAreaCpu: 'rgba(240,248,255,0.35)',
  bgHand: 'linear-gradient(180deg,#ede4d6,#e4d8c4)',
  bgAction: '#ede6d8',
  counter: 'linear-gradient(180deg,#e8c98a,#d4a85c 50%,#e8c98a)',
  counterTop: '#f2db9a', counterBot: '#b8782e',
  txtPri: '#3d2b1f', txtSec: '#7c6248', txtMut: '#a8917a',
  instBg: 'linear-gradient(160deg,#fff7ed,#ffedd5)', instBorder: '#f97316', instGlow: 'rgba(249,115,22,0.25)', instCost: '#ea580c',
  persBg: 'linear-gradient(160deg,#f0fdf4,#dcfce7)', persBorder: '#16a34a', persGlow: 'rgba(22,163,74,0.25)', persCost: '#15803d',
  fieldBorder: 'rgba(0,0,0,0.07)', atk: '#dc2626', ap: '#d97706', apBorder: '#b45309', apEmpty: '#d4c4ae',
  gaugeTrack: '#e0d4c0',
  btnEnd: 'linear-gradient(135deg,#e07b1a,#c05a0e)', btnEndBorder: '#f4a050', btnEndGlow: 'rgba(224,123,26,0.5)',
}

// ── レスポンシブスケール ──────────────────────────────────────────────────────

const R = {
  fw: 'clamp(72px, 6.5vw, 120px)', fh: 'clamp(98px, 8.8vw, 160px)',
  hw: 'clamp(84px, 7.5vw, 140px)', hh: 'clamp(126px, 11.5vw, 210px)',
  gap: 'clamp(6px, 0.65vw, 12px)',
  fe: 'clamp(28px, 2.9vw, 52px)', he: 'clamp(32px, 3.3vw, 60px)',
  f2xs: 'clamp(8px, 0.75vw, 11px)', fxs: 'clamp(9px, 0.9vw, 13px)',
  fsm: 'clamp(11px, 1.1vw, 16px)', fmd: 'clamp(13px, 1.3vw, 19px)',
  flg: 'clamp(16px, 1.6vw, 24px)', fxl: 'clamp(20px, 2.2vw, 32px)',
  dot: 'clamp(9px, 1vw, 15px)', gauge: 'clamp(10px, 1.1vh, 16px)',
  counter: 'clamp(46px, 5.5vh, 68px)', hand: 'clamp(152px, 15.5vw, 284px)',
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BELLY = 100
const HAND_LIMIT = 7
const FIELD_MAX = 8
const INIT_AP = 3
const DIGESTION = 5

const CARD_EMOJI: Record<string, string> = {
  'マグロ': '🐟', 'サーモン': '🐠', 'えび': '🦐', 'いか': '🦑', 'たこ': '🐙',
  'たまご': '🥚', 'きゅうり': '🥒', 'かんぴょう': '🌿', 'サバ': '🐡',
  'アジ': '🐡', 'コハダ': '🐡', 'イワシ': '🐟', '和牛': '🥩', 'カルビ': '🥩',
  'うに': '🌟', 'いくら': '🔴', 'とびこ': '🟠', 'コーン': '🌽',
  'シーフード': '🦞', 'なす': '🍆', '明太子': '🔴', 'チーズ': '🧀',
  '納豆': '🫘', 'うめ': '🍑', 'アボカド': '🥑', 'かに': '🦀',
  'ネギトロ': '🐟', 'ローストビーフ': '🥩', '焼肉': '🥩', '牛タン': '🥩',
  'サンマ': '🐡', '太巻き': '🌀',
}

const EFFECT_FULL: Record<string, string> = {
  'self_digest_3': '召喚時、自分のお腹が -3（消化促進）',
  'digest_stop_1t': '召喚時、相手の消化を 1ターン止める',
  'kireta_stack': '召喚時、切れ味スタック +1（コハダで全消費×2）',
  'kireta_consume_x2': '切れ味スタックを全消費し、スタック数×2のダメージ',
  'belly_boost_70': '相手お腹が70以上のとき 攻撃 +8',
  'belly_boost_60': '相手お腹が60以上のとき 攻撃 +5',
  'belly_boost_65': '相手お腹が65以上のとき 攻撃 +',
  'belly_boost_persist_50': '机に居る間、相手お腹50以上で 攻撃 +2',
  'chain_on_kaisen_summon': '海鮮系カードを召喚するたびに追加攻撃',
  'multi_base': '複数のbaseコンボ条件を同時に満たせる',
  'multi_base_combo': '複数のbaseコンボ条件を同時に満たせる',
}

const ARCH_LABEL: Record<Archetype, string> = {
  akami: '🔴 赤身', makimono: '🌀 巻物', hikari: '✨ 光り物',
  kaisen: '🦞 海鮮', niku: '🥩 肉寿司', general: '⭐ 汎用',
}

function cardEmoji(c: Card) { return CARD_EMOJI[c.base] ?? '🍣' }

// ── Combos ────────────────────────────────────────────────────────────────────

const COMBOS: Array<{
  id: string; name: string; emoji: string; desc: string
  check: (ids: string[], arch: Record<string, number>) => boolean
  instantDmg: number
  applyBuff: (buff: Record<string, number>, draw: number) => { buff: Record<string, number>; draw: number }
}> = [
  {
    id: 'akami_mori', name: '赤身三種盛り！！！', emoji: '🐟',
    desc: '即時+10ダメージ / マグロ系攻撃+2',
    check: (ids) => ['maguro', 'chutoro', 'otoro'].every(id => ids.includes(id)),
    instantDmg: 10,
    applyBuff: (buff, draw) => ({ buff: { ...buff, 'マグロ': (buff['マグロ'] ?? 0) + 2 }, draw }),
  },
  {
    id: 'maki_comp', name: '巻物コンプ！！！', emoji: '🌀',
    desc: '以降ドロー+1',
    check: (_ids, arch) => (arch['makimono'] ?? 0) >= 5,
    instantDmg: 0,
    applyBuff: (buff, draw) => ({ buff, draw: draw + 1 }),
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

let fidN = 0
const toField = (c: Card): FieldCard => ({
  ...c, fid: `${c.id}-${++fidN}`,
  turnsLeft: c.type === 'persist' ? Math.max(c.fullness, 2) : 1,
})

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function calcFieldDmg(field: FieldCard[], buff: Record<string, number>) {
  return field.reduce((sum, c) => sum + c.attack + (buff[c.base] ?? 0), 0)
}

// ── CPU ───────────────────────────────────────────────────────────────────────

function getCpuDeck(): Card[] {
  const ids = ['tamago', 'salmon', 'ebi', 'mentaiko', 'cheese', 'wasabi_nasu', 'corn_gunkan', 'seafood_gunkan', 'botan_ebi']
  const found = ids.map(id => CARDS.find(c => c.id === id)).filter(Boolean) as Card[]
  const extra = CARDS.filter(c => c.lane === 'general' && !found.some(f => f.id === c.id))
  return shuffled([...found, ...extra]).slice(0, 15)
}

function cpuChoose(hand: Card[], ap: number): Card[] {
  const sorted = [...hand].sort((a, b) => b.attack - a.attack)
  const played: Card[] = []
  let rem = ap
  for (const c of sorted) {
    if (c.cost <= rem && played.length < FIELD_MAX) { played.push(c); rem -= c.cost }
  }
  return played
}

// ── Initial state ─────────────────────────────────────────────────────────────

function initState(deck: Card[]): S {
  const pDeck = shuffled(deck.length > 0 ? deck : CARDS.filter(c => c.lane === 'general').slice(0, 10))
  const cpuAll = shuffled(getCpuDeck())
  return {
    pHand: pDeck.slice(0, 5), pField: [], pDeck: pDeck.slice(5),
    pBelly: 0, pAP: INIT_AP, pMaxAP: INIT_AP,
    pSummonedIds: [], pSummonedArch: {}, pDrawBonus: 0, pAttackBuff: {}, pCombosFired: [],
    cHand: cpuAll.slice(0, 5), cField: [], cDeck: cpuAll.slice(5),
    cBelly: 0, turn: 1, phase: 'player', winner: null, log: ['バトル開始！'], flash: null,
  }
}

// ── CardDetailSheet ──────────────────────────────────────────────────────────

function CardDetailSheet({
  inspect, attackBuff, onPlay, onClose,
}: {
  inspect: Inspect
  attackBuff: Record<string, number>
  onPlay: () => void
  onClose: () => void
}) {
  const { card, canPlay, remainingTurns } = inspect
  const isPersist = card.type === 'persist'
  const buff = attackBuff[card.base] ?? 0
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
        {/* ヘッダー */}
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

        {/* 本体 */}
        <div style={{ display: 'flex', gap: 'clamp(16px, 3vw, 32px)', alignItems: 'center' }}>
          {/* 絵文字 */}
          <div style={{
            flexShrink: 0,
            width: 'clamp(72px, 9vw, 140px)', height: 'clamp(72px, 9vw, 140px)',
            borderRadius: 'clamp(12px, 1.2vw, 20px)',
            background: isPersist ? C.persBg : C.instBg,
            border: `2px solid ${isPersist ? C.persBorder : C.instBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(40px, 5.5vw, 88px)',
          }}>
            {cardEmoji(card)}
          </div>

          {/* ステータス */}
          <div style={{ flex: 1 }}>
            {/* 数値行 */}
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
                  ⚔ {card.attack}{buff > 0 && <span style={{ color: C.ap, fontSize: R.fsm }}> +{buff}</span>}
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

            {/* 効果 */}
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

        {/* アクションボタン */}
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

function FieldSushi({ card, isEnemy = false, onSelect }: {
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
      <span style={{ fontSize: R.fe, lineHeight: 1 }}>{cardEmoji(card)}</span>
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

function HandSushi({
  card, canPlay, attackBuff, isSelected, onSelect,
}: {
  card: Card; canPlay: boolean; attackBuff: Record<string, number>
  isSelected: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const buff = attackBuff[card.base] ?? 0
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: R.he }}>
        {cardEmoji(card)}
      </div>
      <p style={{ fontSize: R.fxs, color: C.txtPri, fontWeight: 700, textAlign: 'center', padding: '0 4px', lineHeight: 1.25 }}>
        {card.name.slice(0, 8)}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: 'clamp(2px, 0.3vw, 4px) 4px' }}>
        <span style={{ fontSize: R.fsm, color: C.atk, fontWeight: 800 }}>
          ⚔ {card.attack}{buff > 0 && <span style={{ color: C.ap, fontSize: R.fxs }}>+{buff}</span>}
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

// ── BellyGauge ────────────────────────────────────────────────────────────────

function BellyGauge({ value, label, flip = false }: { value: number; label: string; flip?: boolean }) {
  const pct = Math.min(value / MAX_BELLY, 1)
  const color = pct < 0.4 ? '#16a34a' : pct < 0.7 ? '#d97706' : '#dc2626'
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: R.fsm, color: C.txtSec, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: R.fsm, color, fontWeight: 700 }}>{value} / {MAX_BELLY}</span>
      </div>
      <div style={{ height: R.gauge, borderRadius: 999, overflow: 'hidden', background: C.gaugeTrack, transform: flip ? 'scaleX(-1)' : undefined }}>
        <motion.div animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.45 }}
          style={{ height: '100%', borderRadius: 999, background: color }} />
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function BattleScreen({ deck, onBack }: { deck: Card[]; onBack?: () => void }) {
  const ref = useRef<S>(initState(deck))
  const [, tick] = useReducer(n => n + 1, 0)
  const [showLog, setShowLog] = useState(false)
  const [comboAnim, setComboAnim] = useState<ComboAnim | null>(null)
  const [floats, setFloats] = useState<FloatNum[]>([])
  const [inspect, setInspect] = useState<Inspect | null>(null)
  const floatId = useRef(0)
  const s = ref.current

  const set = (patch: Partial<S>) => { Object.assign(ref.current, patch); tick() }
  const addLog = (msg: string) => { ref.current.log = [msg, ...ref.current.log].slice(0, 40) }

  const addFloat = (dmg: number, target: 'cpu' | 'player') => {
    const id = ++floatId.current
    setFloats(f => [...f, { id, dmg, target }])
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
  }

  const drawCards = (hand: Card[], dk: Card[], n: number): [Card[], Card[]] => {
    const drawn = dk.slice(0, n)
    return [[...hand, ...drawn].slice(0, HAND_LIMIT), dk.slice(n)]
  }

  const checkWin = (pBelly: number, cBelly: number): boolean => {
    if (pBelly >= MAX_BELLY) { set({ winner: 'cpu', phase: 'over' }); return true }
    if (cBelly >= MAX_BELLY) { set({ winner: 'player', phase: 'over' }); return true }
    return false
  }

  const playCard = (card: Card) => {
    const { pAP, pField, pHand, phase, pSummonedIds, pSummonedArch, pCombosFired, pAttackBuff, pDrawBonus } = ref.current
    if (phase !== 'player' || pAP < card.cost || pField.length >= FIELD_MAX) return

    setInspect(null)
    addLog(`あなた ▶ ${cardEmoji(card)} ${card.name} 召喚`)
    const newIds = [...pSummonedIds, card.id]
    const newArch = { ...pSummonedArch }
    for (const a of card.archetype) newArch[a] = (newArch[a] ?? 0) + 1

    let newBuff = { ...pAttackBuff }
    let newDraw = pDrawBonus
    let extraDmg = 0
    const newlyFired: string[] = []

    for (const combo of COMBOS) {
      if (!pCombosFired.includes(combo.id) && combo.check(newIds, newArch)) {
        newlyFired.push(combo.id)
        const r = combo.applyBuff(newBuff, newDraw)
        newBuff = r.buff; newDraw = r.draw
        extraDmg += combo.instantDmg
        setComboAnim({ name: combo.name, emoji: combo.emoji, desc: combo.desc })
        setTimeout(() => setComboAnim(null), 2800)
        addLog(`🎉 コンボ発動: ${combo.name}！ ${combo.desc}`)
      }
    }

    const newCBelly = ref.current.cBelly + extraDmg
    if (extraDmg > 0) addFloat(extraDmg, 'cpu')

    set({
      pField: [...pField, toField(card)],
      pHand: pHand.filter(c => c !== card),
      pAP: pAP - card.cost,
      pSummonedIds: newIds, pSummonedArch: newArch,
      pCombosFired: [...pCombosFired, ...newlyFired],
      pAttackBuff: newBuff, pDrawBonus: newDraw, cBelly: newCBelly,
    })
    if (extraDmg > 0) checkWin(ref.current.pBelly, newCBelly)
  }

  const endTurn = () => {
    if (ref.current.phase !== 'player') return
    setInspect(null)
    set({ phase: 'animating' })
    setTimeout(() => {
      const { pField, cBelly, pDeck, pHand, pDrawBonus, turn, pAttackBuff } = ref.current
      const totalDmg = calcFieldDmg(pField, pAttackBuff)
      if (totalDmg > 0) { addLog(`あなたの攻撃: ${totalDmg} ダメージ！`); addFloat(totalDmg, 'cpu') }
      const newCBelly = cBelly + totalDmg
      set({ flash: 'cpu', cBelly: newCBelly })
      setTimeout(() => set({ flash: null }), 500)
      if (checkWin(ref.current.pBelly, newCBelly)) return

      const newPField = pField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
      const [h1, d1] = drawCards(pHand, pDeck, 1 + pDrawBonus)
      set({ pField: newPField, pHand: h1, pDeck: d1, phase: 'cpu' })

      setTimeout(() => {
        const { cHand, cField, cBelly: cb2, pBelly, cDeck } = ref.current
        const cpuAfterDigest = Math.max(0, cb2 - DIGESTION)
        const newTurn = turn + 1
        const cpuMaxAP = Math.min(INIT_AP + newTurn - 1, 10)
        const toPlay = cpuChoose(cHand, cpuMaxAP)
        let newCField = [...cField]
        if (toPlay.length > 0) {
          addLog(`CPU ▶ ${toPlay.map(c => c.name).join(' / ')} 召喚`)
          newCField = [...cField, ...toPlay.map(toField)].slice(0, FIELD_MAX)
        }
        const cpuDmg = calcFieldDmg(newCField, {})
        if (cpuDmg > 0) { addLog(`CPU攻撃: ${cpuDmg} ダメージ！`); addFloat(cpuDmg, 'player') }
        const newPBelly = pBelly + cpuDmg
        set({ flash: 'player', cBelly: cpuAfterDigest, pBelly: newPBelly })
        setTimeout(() => set({ flash: null }), 500)
        if (checkWin(newPBelly, ref.current.cBelly)) return

        const nextCField = newCField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
        const [nextCHand, nextCDeck] = drawCards(cHand.filter(c => !toPlay.includes(c)), cDeck, 1)
        const pAfterDigest = Math.max(0, ref.current.pBelly - DIGESTION)
        const nextMaxAP = Math.min(INIT_AP + newTurn - 1, 10)
        addLog(`── ターン ${newTurn} ──`)
        set({
          cField: nextCField, cHand: nextCHand, cDeck: nextCDeck,
          pBelly: pAfterDigest, turn: newTurn, pAP: nextMaxAP, pMaxAP: nextMaxAP, phase: 'player',
        })
      }, 1000)
    }, 200)
  }

  const isPlayerTurn = s.phase === 'player'
  const previewDmg = calcFieldDmg(s.pField, s.pAttackBuff)
  const akamiFired = s.pCombosFired.includes('akami_mori')
  const makiFired = s.pCombosFired.includes('maki_comp')
  const akamCount = ['maguro', 'chutoro', 'otoro'].filter(id => s.pSummonedIds.includes(id)).length
  const makiCount = s.pSummonedArch['makimono'] ?? 0
  const phaseLabel = s.phase === 'player' ? 'あなたのターン' : s.phase === 'animating' ? '攻撃中…' : 'CPU思考中…'

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: C.bgMain, color: C.txtPri,
      overflow: 'hidden', userSelect: 'none', position: 'relative',
    }}>

      {/* ══ CPU エリア ══ */}
      <div style={{
        flex: '5 1 0', minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: 'clamp(10px, 1.5vh, 20px) clamp(12px, 2vw, 28px) clamp(8px, 1vh, 14px)',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.5vw, 20px)', marginBottom: 'clamp(8px, 1.2vh, 14px)' }}>
          <span style={{ fontSize: R.flg, flexShrink: 0 }}>💻</span>
          <div style={{ flex: 1 }}><BellyGauge value={s.cBelly} label="CPU お腹" flip /></div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <p style={{ fontSize: R.fxs, color: C.txtMut }}>手札 {s.cHand.length} 枚</p>
            <p style={{ fontSize: R.fxs, color: C.txtMut }}>山札 {s.cDeck.length} 枚</p>
          </div>
        </div>
        <div style={{
          flex: 1, background: C.bgAreaCpu, border: `1px solid ${C.fieldBorder}`,
          borderRadius: 'clamp(12px, 1.2vw, 18px)', padding: 'clamp(8px, 1vw, 16px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          gap: R.gap, flexWrap: 'wrap', position: 'relative',
          minHeight: 'clamp(90px, 10vh, 150px)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <span style={{ position: 'absolute', top: 'clamp(7px, 0.8vh, 11px)', left: 'clamp(12px, 1.2vw, 18px)', fontSize: R.fxs, color: C.txtMut, fontWeight: 700, letterSpacing: 1 }}>CPU の机</span>
          <AnimatePresence>
            {s.cField.map(c => (
              <FieldSushi key={c.fid} card={c} isEnemy
                onSelect={() => setInspect({ card: c, canPlay: false, remainingTurns: c.turnsLeft })}
              />
            ))}
          </AnimatePresence>
          {s.cField.length === 0 && <span style={{ fontSize: R.fsm, color: C.apEmpty }}>空</span>}
        </div>
        <AnimatePresence>
          {floats.filter(f => f.target === 'cpu').map(f => (
            <motion.div key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: R.flg, fontWeight: 900, color: '#dc2626', textShadow: '0 0 24px rgba(220,38,38,0.7)', pointerEvents: 'none', zIndex: 20, letterSpacing: 1 }}
            >-{f.dmg}</motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {s.flash === 'cpu' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0] }} transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10, borderRadius: 12 }} />
          )}
        </AnimatePresence>
      </div>

      {/* ══ カウンター席 ══ */}
      <div style={{
        flexShrink: 0, height: R.counter, background: C.counter,
        borderTop: `2px solid ${C.counterTop}`, borderBottom: `2px solid ${C.counterBot}`,
        display: 'flex', alignItems: 'center', padding: '0 clamp(14px, 2vw, 30px)',
        position: 'relative', gap: 'clamp(8px, 1vw, 16px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25, backgroundImage: 'repeating-linear-gradient(90deg,transparent,transparent 80px,rgba(255,255,255,0.5) 80px,rgba(255,255,255,0.5) 82px)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 5, background: 'rgba(0,0,0,0.12)', transform: 'translateY(-50%)', borderRadius: 2 }} />
        <span style={{ fontSize: R.fsm, color: '#5c3a0a', fontWeight: 700, zIndex: 1, textShadow: '0 1px 2px rgba(255,255,255,0.4)' }}>🍵 カウンター席</span>
        <div style={{ flex: 1 }} />
        {previewDmg > 0 && (
          <motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }}
            style={{ zIndex: 1, fontSize: R.fsm, color: '#fff', fontWeight: 800, background: '#dc2626', borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)', boxShadow: '0 2px 8px rgba(220,38,38,0.4)' }}>
            ⚔ {previewDmg}
          </motion.span>
        )}
        <span style={{ zIndex: 1, fontSize: R.fsm, color: '#5c3a0a', fontWeight: 800, background: 'rgba(255,255,255,0.45)', borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)' }}>T{s.turn}</span>
        <span style={{ zIndex: 1, fontSize: R.fsm, fontWeight: 700, color: isPlayerTurn ? '#7c2d12' : '#a89070' }}>{phaseLabel}</span>
      </div>

      {/* ══ プレイヤーエリア ══ */}
      <div style={{
        flex: '5 1 0', minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: 'clamp(8px, 1vh, 14px) clamp(12px, 2vw, 28px) clamp(6px, 0.8vh, 12px)',
        position: 'relative',
      }}>
        <div style={{
          flex: 1, background: C.bgArea, border: `1px solid ${C.fieldBorder}`,
          borderRadius: 'clamp(12px, 1.2vw, 18px)', padding: 'clamp(8px, 1vw, 16px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          gap: R.gap, flexWrap: 'wrap', position: 'relative',
          minHeight: 'clamp(90px, 10vh, 150px)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <span style={{ position: 'absolute', top: 'clamp(7px, 0.8vh, 11px)', left: 'clamp(12px, 1.2vw, 18px)', fontSize: R.fxs, color: C.txtMut, fontWeight: 700, letterSpacing: 1 }}>あなたの机</span>
          <div style={{ position: 'absolute', top: 'clamp(6px, 0.7vh, 10px)', right: 'clamp(10px, 1.2vw, 18px)', display: 'flex', gap: 'clamp(8px, 1vw, 16px)', alignItems: 'center' }}>
            {akamiFired
              ? <span style={{ fontSize: R.fxs, color: '#b45309', fontWeight: 700 }}>🐟 ✓</span>
              : akamCount > 0 && <span style={{ fontSize: R.fxs, color: C.txtMut }}>🐟 {akamCount}/3</span>
            }
            {makiFired
              ? <span style={{ fontSize: R.fxs, color: '#15803d', fontWeight: 700 }}>🌀 ✓</span>
              : makiCount > 0 && <span style={{ fontSize: R.fxs, color: C.txtMut }}>🌀 {Math.min(makiCount, 5)}/5</span>
            }
          </div>
          <AnimatePresence>
            {s.pField.map(c => (
              <FieldSushi key={c.fid} card={c}
                onSelect={() => setInspect({ card: c, canPlay: false, remainingTurns: c.turnsLeft })}
              />
            ))}
          </AnimatePresence>
          {s.pField.length === 0 && <span style={{ fontSize: R.fsm, color: C.apEmpty, paddingTop: 'clamp(8px, 1vh, 16px)' }}>空</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.5vw, 20px)', marginTop: 'clamp(8px, 1.2vh, 14px)' }}>
          <span style={{ fontSize: R.flg, flexShrink: 0 }}>🍱</span>
          <div style={{ flex: 1 }}><BellyGauge value={s.pBelly} label="あなた お腹" /></div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', gap: 'clamp(3px, 0.4vw, 6px)', flexWrap: 'wrap', maxWidth: 'clamp(80px, 10vw, 160px)', justifyContent: 'flex-end' }}>
              {Array.from({ length: s.pMaxAP }, (_, i) => (
                <div key={i} style={{
                  width: R.dot, height: R.dot, maxWidth: 15, maxHeight: 15, borderRadius: '50%',
                  background: i < s.pAP ? C.ap : C.apEmpty,
                  border: `1px solid ${i < s.pAP ? C.apBorder : '#c4b4a0'}`,
                  boxShadow: i < s.pAP ? '0 0 6px rgba(217,119,6,0.6)' : 'none',
                }} />
              ))}
            </div>
            <span style={{ fontSize: R.fxs, color: C.txtSec, fontWeight: 600 }}>{s.pAP}/{s.pMaxAP} AP</span>
          </div>
        </div>
        <AnimatePresence>
          {floats.filter(f => f.target === 'player').map(f => (
            <motion.div key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: R.flg, fontWeight: 900, color: '#dc2626', textShadow: '0 0 24px rgba(220,38,38,0.7)', pointerEvents: 'none', zIndex: 20, letterSpacing: 1 }}
            >-{f.dmg}</motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {s.flash === 'player' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.3, 0] }} transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10, borderRadius: 12 }} />
          )}
        </AnimatePresence>
      </div>

      {/* ══ アクションバー ══ */}
      <div style={{
        flexShrink: 0, background: C.bgAction, borderTop: '1px solid #d4c4ae',
        padding: 'clamp(5px, 0.8vh, 10px) clamp(12px, 2vw, 28px)',
        display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 16px)',
      }}>
        <button onClick={() => setShowLog(v => !v)}
          style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
          <p style={{ fontSize: R.fxs, color: C.txtSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📜 {s.log[0] ?? ''}
          </p>
        </button>
        <motion.button onClick={endTurn} disabled={!isPlayerTurn} whileTap={isPlayerTurn ? { scale: 0.91 } : {}}
          style={{
            flexShrink: 0, padding: 'clamp(9px, 1.2vh, 16px) clamp(18px, 2.5vw, 36px)',
            borderRadius: 999, fontSize: R.fsm, fontWeight: 800,
            background: isPlayerTurn ? C.btnEnd : '#d4c4ae',
            color: isPlayerTurn ? '#fff' : '#a89070',
            border: `1.5px solid ${isPlayerTurn ? C.btnEndBorder : '#c4b4a0'}`,
            cursor: isPlayerTurn ? 'pointer' : 'default',
            boxShadow: isPlayerTurn ? `0 0 20px ${C.btnEndGlow}` : 'none',
            outline: 'none',
          }}
        >
          {s.phase === 'animating' ? '攻撃中…' : s.phase === 'cpu' ? 'CPU思考中…' : 'ターン終了'}
        </motion.button>
      </div>

      {/* ══ 手札 ══ */}
      <div style={{
        flexShrink: 0, height: R.hand, background: C.bgHand, borderTop: '1px solid #ccc0a8',
        padding: 'clamp(10px, 1.2vh, 18px) clamp(12px, 2vw, 28px) clamp(14px, 2vh, 24px)',
        display: 'flex', gap: R.gap, overflowX: 'auto', alignItems: 'flex-end',
        justifyContent: 'center', boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.08)',
      }}>
        {s.pHand.length === 0
          ? <p style={{ fontSize: R.fmd, color: C.txtMut }}>手札がありません</p>
          : s.pHand.map((card, i) => (
            <HandSushi key={`${card.id}-${i}`} card={card}
              canPlay={isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX}
              attackBuff={s.pAttackBuff}
              isSelected={inspect?.card === card}
              onSelect={() => setInspect({
                card,
                canPlay: isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX,
              })}
            />
          ))
        }
      </div>

      {/* ══ バトルログ ══ */}
      <AnimatePresence>
        {showLog && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
              background: 'rgba(250,246,239,0.97)', borderTop: '1px solid #d4c4ae',
              padding: 'clamp(12px, 2vh, 20px) clamp(14px, 2vw, 24px)',
              overflowY: 'auto', zIndex: 30, boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: R.fmd, color: C.txtSec, fontWeight: 700 }}>バトルログ</span>
              <button onClick={() => setShowLog(false)} style={{ fontSize: R.flg, color: C.txtMut, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            {s.log.map((msg, i) => (
              <p key={i} style={{ fontSize: R.fsm, lineHeight: 1.8, color: msg.startsWith('──') ? C.apEmpty : msg.startsWith('🎉') ? '#b45309' : C.txtSec }}>{msg}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ カード詳細シート ══ */}
      <AnimatePresence>
        {inspect && (
          <CardDetailSheet
            inspect={inspect}
            attackBuff={s.pAttackBuff}
            onPlay={() => playCard(inspect.card)}
            onClose={() => setInspect(null)}
          />
        )}
      </AnimatePresence>

      {/* ══ コンボ演出 ══ */}
      <AnimatePresence>
        {comboAnim && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <motion.div
              initial={{ scale: 0.2, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 1.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
              style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '3px solid #d97706', borderRadius: 'clamp(16px, 2vw, 28px)', padding: 'clamp(20px, 3vh, 40px) clamp(36px, 5vw, 72px)', textAlign: 'center', boxShadow: '0 8px 60px rgba(217,119,6,0.6)' }}
            >
              <motion.p animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 0.4, repeat: 2 }} style={{ fontSize: 'clamp(48px, 8vw, 96px)', marginBottom: 12 }}>{comboAnim.emoji}</motion.p>
              <p style={{ fontSize: 'clamp(18px, 3vw, 36px)', fontWeight: 900, color: '#78350f', letterSpacing: 2, marginBottom: 10 }}>{comboAnim.name}</p>
              <p style={{ fontSize: R.fmd, color: '#92400e' }}>{comboAnim.desc}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ ゲームオーバー ══ */}
      <AnimatePresence>
        {s.winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div initial={{ scale: 0.4, y: 32 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 14, stiffness: 180 }} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(60px, 12vw, 120px)', marginBottom: 16 }}>{s.winner === 'player' ? '🎉' : '😔'}</p>
              <p style={{ fontSize: 'clamp(24px, 4.5vw, 56px)', fontWeight: 700, color: '#fff', marginBottom: 8 }}>{s.winner === 'player' ? '勝利！' : '敗北…'}</p>
              <p style={{ fontSize: R.fmd, color: '#a89070', marginBottom: 32 }}>{s.turn} ターンで決着</p>
              <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', justifyContent: 'center' }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={() => { ref.current = initState(deck); tick() }}
                  style={{ padding: 'clamp(12px, 1.5vh, 20px) clamp(28px, 4vw, 56px)', borderRadius: 999, fontSize: R.fmd, fontWeight: 800, background: C.btnEnd, color: '#fff', border: `1.5px solid ${C.btnEndBorder}`, cursor: 'pointer', boxShadow: `0 0 24px ${C.btnEndGlow}` }}
                >もう一回</motion.button>
                {onBack && (
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onBack}
                    style={{ padding: 'clamp(12px, 1.5vh, 20px) clamp(28px, 4vw, 56px)', borderRadius: 999, fontSize: R.fmd, fontWeight: 700, background: 'rgba(255,255,255,0.12)', color: '#ccc', border: '1.5px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                  >タイトルへ</motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
