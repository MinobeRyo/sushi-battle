import { useId } from 'react'
import type { Card } from '../types'

// ── ネタの色（baseごと） ──────────────────────────────────────────────────────

const NETA_COLOR: Record<string, string> = {
  'マグロ': '#c8102e', 'ネギトロ': '#d4526e', 'サーモン': '#f4813f', 'えび': '#f06a5e',
  'いか': '#f2ede2', 'たこ': '#c86a9e', 'たまご': '#f7c948', 'あなご': '#8a6238',
  'きゅうり': '#3f9433', 'かんぴょう': '#b89a58', 'アボカド': '#6a9a44',
  'サバ': '#7e93a8', 'アジ': '#93a9bc', 'コハダ': '#8195a8', 'イワシ': '#7d90a5', 'サンマ': '#75889d',
  '和牛': '#8e3a1e', 'カルビ': '#a04624', 'ローストビーフ': '#96402a', '焼肉': '#8a3c20', '牛タン': '#b4707e', '生ハム': '#d9868d',
  'うに': '#eda52f', 'いくら': '#e8401c', 'とびこ': '#f07818', '明太子': '#e85a4a',
  'コーン': '#f5c518', 'シーフード': '#e8956a', 'なす': '#6b2fa0', 'チーズ': '#f2d264',
  '納豆': '#b89040', 'うめ': '#d04060', 'かに': '#e05038', '太巻き': '#2d5a1b',
  'いなり': '#c8883c', 'ツナサラダ': '#ded0b2',
}

const GUNKAN_BASES = new Set(['うに', 'いくら', 'とびこ', 'コーン', '明太子', '納豆', 'うめ', 'チーズ', 'アボカド'])
const DOT_BASES = new Set(['いくら', 'とびこ', 'コーン', '納豆'])
const STRIPE_BASES = new Set(['サーモン', 'えび'])
const HIKARI_BASES = new Set(['サバ', 'アジ', 'コハダ', 'イワシ', 'サンマ'])

const NORI = '#20301a'
const RICE = '#faf6ec'

export function sushiKind(card: Card): 'maki' | 'gunkan' | 'nigiri' {
  if (card.id.includes('gunkan') || card.name.includes('軍艦')) return 'gunkan'
  if (card.archetype.includes('makimono')) return 'maki'
  if (GUNKAN_BASES.has(card.base)) return 'gunkan'
  return 'nigiri'
}

// ── 本体 ──────────────────────────────────────────────────────────────────────

export function SushiArt({ card, size = 48, fit = false }: { card: Card; size?: number | string; fit?: boolean }) {
  const kind = sushiKind(card)
  const color = NETA_COLOR[card.base] ?? '#f5c518'

  return (
    <svg
      viewBox="0 0 100 74"
      style={{ width: size, height: fit ? '100%' : 'auto', display: 'block' }}
      aria-label={card.name}
    >
      {/* 皿 */}
      <ellipse cx="50" cy="63.5" rx="45" ry="8.5" fill="rgba(0,0,0,0.10)" />
      <ellipse cx="50" cy="61" rx="44" ry="9.5" fill="#f8f6f0" stroke="#c8beb0" strokeWidth="1.2" />
      <ellipse cx="50" cy="60" rx="33" ry="6" fill="#ece5d8" opacity="0.8" />

      {card.base === '生ハム' ? (
        <Namahamu />
      ) : kind === 'maki' ? (
        <Maki color={color} />
      ) : kind === 'gunkan' ? (
        <Gunkan base={card.base} color={color} />
      ) : (
        <Nigiri base={card.base} color={color} />
      )}
    </svg>
  )
}

// 薄い肉を折り重ね、淡い脂の縁で焼いた肉と区別します。
function Namahamu() {
  return (
    <g>
      <ellipse cx="50" cy="53" rx="28" ry="10" fill={RICE} stroke="#e0d6c2" />
      <path d="M25 55l4 1m9 3 4 1m14-2 4 1m10-5 3-1" stroke="#dcd4c2" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 42C13 34 22 29 35 30C45 22 56 33 66 28C78 25 88 36 85 43L78 54C66 50 61 58 48 51C35 48 27 57 18 51Z" fill="#cf7884" stroke="#b9606e" strokeWidth="1" />
      <path d="M17 44C26 53 36 43 48 49S67 49 79 51" fill="none" stroke="#f4d9cb" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M23 36C31 25 39 26 49 33C59 40 65 28 76 32C68 37 76 46 64 46C51 46 46 35 35 42C29 45 23 42 23 36Z" fill="#e79ca0" stroke="#bd6d79" strokeWidth="1" />
      <path d="M25 36C31 29 41 32 48 36S63 39 70 33" fill="none" stroke="#f7ddce" strokeWidth="3" strokeLinecap="round" />
      <path d="M31 37l10 1m13 5 10-2M24 47l9-2m24 5 9-1" fill="none" stroke="#f9c6bc" strokeWidth="1.1" strokeLinecap="round" />
    </g>
  )
}

// ── にぎり ────────────────────────────────────────────────────────────────────

function Nigiri({ base, color }: { base: string; color: string }) {
  const clipId = useId()
  const isHikari = HIKARI_BASES.has(base)
  return (
    <g>
      {/* シャリ */}
      <ellipse cx="50" cy="53" rx="30" ry="10.5" fill={RICE} stroke="#e0d6c2" strokeWidth="1" />
      <circle cx="30" cy="55" r="1.4" fill="#e8dfc9" />
      <circle cx="66" cy="56" r="1.4" fill="#e8dfc9" />
      <circle cx="48" cy="59" r="1.4" fill="#e8dfc9" />
      {/* ネタの落ち影 */}
      <ellipse cx="50" cy="48" rx="30" ry="6" fill="rgba(0,0,0,0.10)" />
      {/* ネタ */}
      <g transform="rotate(-4 50 40)">
        <clipPath id={clipId}>
          <rect x="16" y="30" width="68" height="20" rx="9.5" />
        </clipPath>
        <rect x="16" y="30" width="68" height="20" rx="9.5" fill={color} />
        {/* サーモン・えびの白い筋 */}
        {STRIPE_BASES.has(base) && (
          <g clipPath={`url(#${clipId})`} stroke="rgba(255,255,255,0.55)" strokeWidth="3.4" fill="none">
            <path d="M26 54 Q34 40 26 26" />
            <path d="M42 54 Q50 40 42 26" />
            <path d="M58 54 Q66 40 58 26" />
            <path d="M74 54 Q82 40 74 26" />
          </g>
        )}
        {/* 光り物：背の青と銀の照り */}
        {isHikari && (
          <g clipPath={`url(#${clipId})`}>
            <rect x="16" y="30" width="68" height="7.5" fill="#4c5e70" opacity="0.9" />
            <rect x="16" y="36" width="68" height="2.4" fill="#dfe8ee" opacity="0.75" />
          </g>
        )}
        {/* ハイライト */}
        <rect x="23" y="33" width="38" height="4.6" rx="2.3" fill="#ffffff" opacity="0.32" />
      </g>
      {/* たまごの海苔帯 */}
      {base === 'たまご' && <rect x="44" y="27" width="12" height="33" rx="2" fill={NORI} opacity="0.94" />}
    </g>
  )
}

// ── 軍艦 ──────────────────────────────────────────────────────────────────────

function Gunkan({ base, color }: { base: string; color: string }) {
  const dots: Array<[number, number]> = [
    [40, 26.5], [50, 25], [60, 26.5], [35, 30], [45, 29.5], [55, 29.5], [65, 30], [50, 30.5],
  ]
  return (
    <g>
      {/* 海苔カップ */}
      <path d="M27 33 Q27 29 32 29 L68 29 Q73 29 73 33 L72 51 Q72 57 65 57 L35 57 Q28 57 28 51 Z" fill={NORI} />
      <rect x="30.5" y="33" width="6" height="18" rx="3" fill="#ffffff" opacity="0.08" />
      {/* シャリ（覗く部分） */}
      <ellipse cx="50" cy="30" rx="21" ry="4.6" fill={RICE} />
      {DOT_BASES.has(base) ? (
        // 粒もの（いくら・とびこ・コーン・納豆）
        <g>
          {dots.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="4.4" fill={color} stroke="rgba(0,0,0,0.18)" strokeWidth="0.7" />
              <circle cx={x - 1.3} cy={y - 1.4} r="1.3" fill="#ffffff" opacity="0.65" />
            </g>
          ))}
        </g>
      ) : (
        // 盛りもの（うに・明太子・チーズなど）
        <g>
          <ellipse cx="50" cy="26.5" rx="20" ry="7" fill={color} />
          <ellipse cx="45" cy="24.5" rx="10" ry="4" fill="#ffffff" opacity="0.20" />
          <ellipse cx="58" cy="28" rx="7" ry="3.4" fill="rgba(0,0,0,0.10)" />
        </g>
      )}
    </g>
  )
}

// ── 巻物（断面2貫） ───────────────────────────────────────────────────────────

function Maki({ color }: { color: string }) {
  const piece = (cx: number, cy: number, r: number) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={NORI} stroke="#141f0e" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r * 0.72} fill={RICE} />
      <circle cx={cx} cy={cy} r={r * 0.34} fill={color} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.12} fill="#ffffff" opacity="0.5" />
    </g>
  )
  return (
    <g>
      {piece(35, 42, 15.5)}
      {piece(66, 45, 14.5)}
    </g>
  )
}
