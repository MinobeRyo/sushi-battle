import { MAX_BELLY, CARD_BY_ID, makimonoCount, MAKI_COMP_5, MAKI_COMP_3, GUNKAN_BOOST, OBA_REQUIRED } from './battleEngine'
import { R, C } from './battlePresentation'
import { motion } from 'framer-motion'
import type { FieldCard } from './types'
import type React from 'react'

// ── BellyGauge ────────────────────────────────────────────────────────────────
export function BellyGauge({ value, label, flip = false }: { value: number; label: string; flip?: boolean }) {
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

// ── コンボ進捗バー ────────────────────────────────────────────────────────────

function StatusPill({ icon, label, value, on, tone, onGold }: {
  icon: string; label: string; value: string; on: boolean; tone: string; onGold?: boolean
}) {
  // カウンター席は金色なので、薄い半透明のままだと文字が沈む。白地を敷いて読ませる。
  const bg = onGold
    ? (on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)')
    : (on ? `${tone}1f` : 'rgba(0,0,0,0.035)')
  const border = onGold
    ? (on ? tone : 'rgba(92,58,10,0.28)')
    : (on ? `${tone}66` : 'rgba(0,0,0,0.07)')
  const labelColor = on ? tone : (onGold ? '#6b4a12' : C.txtMut)
  const valueColor = on ? tone : (onGold ? '#5c3a0a' : C.txtSec)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'clamp(3px, 0.35vw, 5px)',
      padding: '1px clamp(6px, 0.7vw, 10px)', borderRadius: 999,
      background: bg, border: `1px solid ${border}`,
      whiteSpace: 'nowrap', lineHeight: 1.6, flexShrink: 0,
      boxShadow: onGold ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
    }}>
      <span style={{ fontSize: R.f2xs }}>{icon}</span>
      <span style={{ fontSize: R.f2xs, color: labelColor, fontWeight: on ? 700 : 600 }}>{label}</span>
      <span style={{
        fontSize: R.fxs, color: valueColor, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  )
}

// 大葉トッピングを何枚召喚したか（光り物三昧の進捗）
function obaSummoned(summonedIds: string[]) {
  return summonedIds.filter(id => CARD_BY_ID[id]?.topping === '大葉').length
}

type SideStatus = {
  summonedIds: string[]; combosFired: string[]; field: FieldCard[]
  attackBuff: Record<string, number>; drawBonus: number
  kireta: number; kiretaSpent: boolean; nikuMatsuri: boolean
  digestStopTurns?: number; apNextBonus?: number
}

// 相手側は「今なにが効いているか」だけを出す（進捗の途中経過は出さない）
export function ComboStatusBar({ st, compact, inline, onGold, hideKireta }: {
  st: SideStatus; compact?: boolean; inline?: boolean; onGold?: boolean; hideKireta?: boolean
}) {
  const akamiFired = st.combosFired.includes('akami_mori')
  const makiFired = st.combosFired.includes('maki_comp_3')
  const obaFired = st.combosFired.includes('hikari_zanmai')
  const maki = makimonoCount(st.field)
  const gunkanOn = maki >= MAKI_COMP_5
  const akam = ['maguro', 'chutoro', 'otoro'].filter(id => st.summonedIds.includes(id)).length
  const oba = obaSummoned(st.summonedIds)
  const magBuff = st.attackBuff['マグロ'] ?? 0

  const pills: React.ReactNode[] = []
  const push = (key: string, node: React.ReactNode) => pills.push(<div key={key}>{node}</div>)

  if (!hideKireta) push('kireta', <StatusPill icon="✂" label="切れ味"
    value={st.kiretaSpent ? `${st.kireta} → 0` : `${st.kireta}`}
    on={st.kireta > 0} tone={C.kireta} onGold={onGold} />)

  if (akamiFired) push('akami', <StatusPill icon="🐟" label="赤身" value={`マグロ +${magBuff}`} on tone="#b45309" onGold={onGold} />)
  else if (!compact) push('akami', <StatusPill icon="🐟" label="赤身" value={`${akam}/3`} on={false} tone="#b45309" onGold={onGold} />)

  if (makiFired) push('maki', <StatusPill icon="🌀" label="巻物" value={`ドロー +${st.drawBonus}`} on tone="#15803d" onGold={onGold} />)
  else if (!compact) push('maki', <StatusPill icon="🌀" label="巻物" value={`${Math.min(maki, MAKI_COMP_3)}/${MAKI_COMP_3}`} on={false} tone="#15803d" onGold={onGold} />)

  // 進捗の分母は「机の巻物枚数」。軍艦の枚数と読み違えないようにラベル側に倍率を出す
  if (gunkanOn) push('gunkan', <StatusPill icon="🍙" label={`軍艦×${GUNKAN_BOOST}`} value="発動中" on tone="#b45309" onGold={onGold} />)
  else if (!compact) push('gunkan', <StatusPill icon="🍙" label={`軍艦×${GUNKAN_BOOST}`} value={`${maki}/${MAKI_COMP_5}`} on={false} tone="#b45309" onGold={onGold} />)

  if (obaFired) push('oba', <StatusPill icon="✨" label="大葉" value="発動済" on tone="#2563eb" onGold={onGold} />)
  else if (!compact || oba > 0) push('oba', <StatusPill icon="✨" label="大葉" value={`${oba}/${OBA_REQUIRED}`} on={false} tone="#2563eb" onGold={onGold} />)

  if (st.nikuMatsuri) push('niku', <StatusPill icon="🥩" label="肉祭り" value="ボーナス×2" on tone="#9a3412" onGold={onGold} />)
  if (st.apNextBonus) push('ap', <StatusPill icon="⚡" label="次のAP" value={`+${st.apNextBonus}`} on tone="#b45309" onGold={onGold} />)
  if (st.digestStopTurns) push('digest', <StatusPill icon="⊘" label="消化停止" value={`${st.digestStopTurns}回`} on tone="#b91c1c" onGold={onGold} />)

  if (pills.length === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      // 幅が足りないときは中央寄せを解除して横スクロールにする（両端が切れて触れなくなるのを防ぐ）
      justifyContent: inline ? 'safe center' : 'center',
      flexWrap: inline ? 'nowrap' : 'wrap',
      gap: 'clamp(3px, 0.4vw, 6px)',
      marginTop: inline ? 0 : 'clamp(4px, 0.6vh, 8px)',
      maxWidth: '100%', minWidth: 0,
      overflowX: inline ? 'auto' : 'visible',
      scrollbarWidth: 'none',
    }}>{pills}</div>
  )
}
