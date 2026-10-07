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
  'いなり': '#c8883c', 'ツナサラダ': '#ded0b2', '合鴨': '#b76760',
}

const GUNKAN_BASES = new Set(['うに', 'いくら', 'とびこ', 'コーン', '明太子', '納豆', 'うめ', 'チーズ', 'アボカド'])
const DOT_BASES = new Set(['いくら', 'コーン', '納豆'])
const STRIPE_BASES = new Set(['サーモン', 'えび'])
const HIKARI_BASES = new Set(['サバ', 'アジ', 'コハダ', 'イワシ', 'サンマ'])

const NORI = '#20301a'
const RICE = '#faf6ec'

export function sushiKind(card: Card): 'maki' | 'gunkan' | 'nigiri' {
  if (card.variant === 'rare_corn' || card.archetype.includes('gunkan')) return 'gunkan'
  if (card.id.includes('gunkan') || card.name.includes('軍艦')) return 'gunkan'
  if (card.archetype.includes('makimono')) return 'maki'
  if (GUNKAN_BASES.has(card.base)) return 'gunkan'
  return 'nigiri'
}

// ── 本体 ──────────────────────────────────────────────────────────────────────

export function SushiArt({ card, size = 48, fit = false, tight = false }: { card: Card; size?: number | string; fit?: boolean; tight?: boolean }) {
  const kind = sushiKind(card)
  const color = NETA_COLOR[card.base] ?? '#f5c518'

  return (
    <svg
      viewBox={tight ? "0 14 100 60" : "0 0 100 74"}
      style={{ width: size, height: fit ? '100%' : 'auto', display: 'block' }}
      aria-label={card.name}
    >
      {/* 皿 */}
      <ellipse cx="50" cy="63.5" rx="45" ry="8.5" fill="rgba(0,0,0,0.10)" />
      <ellipse cx="50" cy="61" rx="44" ry="9.5" fill="#f8f6f0" stroke="#c8beb0" strokeWidth="1.2" />
      <ellipse cx="50" cy="60" rx="33" ry="6" fill="#ece5d8" opacity="0.8" />

      {card.variant === 'neta_missing' ? (
        <DroppedNigiri color={color} />
      ) : card.variant === 'sideways' || card.variant === 'rare_corn' ? (
        <SidewaysGunkan base={card.base} color={color} tuna={card.id === 'tuna_gunkan'} mayo={card.topping === 'マヨ'} />
      ) : card.base === '合鴨' ? (
        <Aigamo />
      ) : card.base === '生ハム' ? (
        <Namahamu />
      ) : kind === 'maki' ? (
        <Maki color={color} />
      ) : kind === 'gunkan' ? (
        <Gunkan base={card.base} color={color} tuna={card.id === 'tuna_gunkan'} mayo={card.topping === 'マヨ'} />
      ) : (
        <Nigiri base={card.base} color={color} />
      )}
    </svg>
  )
}

function Aigamo() {
  const detailId = useId()
  const slice = 'M16 38C18 31 29 26 42 25C57 23 73 26 82 32C88 36 85 43 78 47C65 54 43 52 28 48C21 46 15 43 16 38Z'
  return <g>
    <defs>
      <linearGradient id={`${detailId}-meat`} x1="0" y1="0" x2="0.3" y2="1">
        <stop stopColor="#cdb0a4" /><stop offset="1" stopColor="#b59287" />
      </linearGradient>
      <linearGradient id={`${detailId}-fat`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#f3e6d4" /><stop offset="1" stopColor="#e3ccb0" />
      </linearGradient>
      <clipPath id={`${detailId}-slice`}><path d={slice} /></clipPath>
    </defs>
    <ellipse cx="50" cy="53" rx="29" ry="10" fill={RICE} stroke="#e0d6c2" />
    <path d="M27 54l4 1m7 3 4 1m9-2 4 1m9-4 4-1" stroke="#ded3bd" strokeWidth="1.3" strokeLinecap="round" />
    <g transform="rotate(-7 50 40)">
      {/* 脂を全周の二重線にせず、薄いスライスの手前側だけに残す。 */}
      <path d={slice} transform="translate(0 1.4)" fill="#a77e5e" />
      <path d={slice} fill={`url(#${detailId}-meat)`} stroke="#9e7a62" strokeWidth=".65" />
      <g clipPath={`url(#${detailId}-slice)`}>
        <path d="M13 42C23 40 32 45 44 46S67 49 85 38L90 50C64 63 25 56 13 48Z" fill={`url(#${detailId}-fat)`} />
        <g fill="none" stroke="#e5c8b9" strokeWidth=".65" opacity=".65">
          <path d="M25 33q8 1 14 5m-11-7q10 0 17 6m-1-7q4 5 12 8m-9-8q6 1 12 6m3-5q3 5 10 7m-43 2 10 3m2-2 8 3m7-5 10 4" />
          <path d="M37 30l1 4m14-1-1 3m14-1-1 4" />
        </g>
        {[[23, 37, .7], [32, 29, .55], [41, 42, .65], [49, 32, .6], [56, 39, .85], [66, 31, .6], [74, 36, .7], [70, 47, .65], [30, 45, .8], [79, 41, .65], [51, 48, .55]].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * .7} transform={`rotate(${i * 37} ${x} ${y})`} fill={i % 3 ? '#705642' : '#997247'} />
        ))}
      </g>
      <path d="M17 41C21 47 43 52 60 51Q74 51 81 45" fill="none" stroke="#9d704d" strokeWidth=".7" />
    </g>
  </g>
}

// 横倒しの軍艦は、手前を向く具の面と奥に寝た海苔を別々に描く。
// 直立の絵を平面回転すると、海苔が皿から立ち上がって見えてしまう。
function SidewaysGunkan({ base, color, tuna, mayo }: { base: string; color: string; tuna: boolean; mayo: boolean }) {
  const clipId = useId()
  const smallRoe = base === 'とびこ'
  const roe = base === 'いくら' || smallRoe
  const grains = smallRoe ? 180 : base === 'いくら' ? 22 : 18
  let grainSeed = 619
  const randomGrain = () => { grainSeed = (Math.imul(grainSeed, 1664525) + 1013904223) >>> 0; return grainSeed / 4294967296 }
  return <g>
    <ellipse cx="50" cy="60" rx="31" ry="4" fill="#000" opacity=".15" />
    {/* 皿に接する低い海苔の胴。奥側が上、開口部が手前。 */}
    <path d="M19 42C20 30 38 20 57 21C73 22 81 29 82 41L79 51C74 60 60 64 45 61L25 55Z" fill={NORI} />
    <path d="M29 32C41 24 61 24 71 30" fill="none" stroke="#4e5c38" strokeWidth="4" strokeLinecap="round" opacity=".55" />
    <path d="M76 34Q80 45 74 51" fill="none" stroke="#121e0f" strokeWidth="3" opacity=".5" />
    <g transform="rotate(12 45 46)">
      <ellipse cx="45" cy="46" rx="27" ry="14" fill="#14200f" />
      <clipPath id={clipId}><ellipse cx="45" cy="46" rx="24.4" ry="11.7" /></clipPath>
      <g clipPath={`url(#${clipId})`}>
        <ellipse cx="45" cy="46" rx="24.4" ry="11.7" fill={tuna ? '#dcae98' : roe ? smallRoe ? '#dc6509' : '#bd3d12' : color} />
        {(roe || DOT_BASES.has(base) || tuna) ? Array.from({ length: grains }, (_, i) => {
          const radius = Math.sqrt(smallRoe ? randomGrain() : (i + .5) / grains)
          const angle = smallRoe ? randomGrain() * Math.PI * 2 : i * 2.399963
          const x = 45 + Math.cos(angle) * radius * 23
          const y = 46 + Math.sin(angle) * radius * 11
          return tuna ? <g key={i} transform={`translate(${x} ${y}) rotate(${i % 2 ? -25 : 20})`}>
            <path d="M-4-2L1-3 5-1 3 2-2 3-5 1Z" fill={i % 3 ? '#e8bfa9' : '#f3d5bf'} />
            <path d="M-3 0L3-1" stroke="#ca9783" strokeWidth=".5" />
          </g>
            : <g key={i}>
              <circle cx={x} cy={y} r={smallRoe ? .6 + randomGrain() * .3 : base === 'いくら' ? 3.3 : 3.5} fill={roe ? smallRoe ? i % 3 ? '#f68b10' : '#eb7808' : i % 3 ? '#ed6822' : '#f88930' : color} stroke={smallRoe ? '#f2942428' : '#ae521830'} strokeWidth=".5" />
              {!smallRoe && <ellipse cx={x - .8} cy={y - 1.2} rx="1.2" ry=".6" fill="#ffe8b2" opacity=".55" />}
            </g>
        }) : <ellipse cx="42" cy="42" rx="16" ry="5" fill="#fff" opacity=".18" />}
        {mayo && <path d="M22 44l9-5 1 13 10-16 2 18 10-16 2 14 9-9" fill="none" stroke="#fff5cf" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
      </g>
      <path d="M19 48C24 59 54 64 68 52" fill="none" stroke="#101b0d" strokeWidth="2.3" strokeLinecap="round" />
    </g>
  </g>
}

function DroppedNigiri({ color }: { color: string }) {
  return <g>
    <ellipse cx="59" cy="39" rx="26" ry="12" fill={RICE} stroke="#ded3bd" />
    <path d="M41 38l4 1m7-4 4 1m4 9 4-1m7-6 4 1" stroke="#ded3bd" strokeWidth="1.6" strokeLinecap="round" />
    <g transform="rotate(12 38 57)">
      <ellipse cx="38" cy="58" rx="27" ry="7" fill="#000" opacity=".12" />
      <path d="M13 51Q32 46 58 50L63 59Q42 64 17 59Z" fill={color} />
      <path d="M20 52Q37 49 50 53" fill="none" stroke="#fff" opacity=".22" strokeWidth="2" />
    </g>
  </g>
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

const TOBIKO_ART_GRAINS = (() => {
  let seed = 431
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const grains: { x: number; y: number; r: number; color: string }[] = []
  const colors = ['#ef7b0f', '#f58a18', '#f79324', '#ec7610']
  for (let row = -8; row <= 8; row++) {
    for (let column = -18; column <= 18; column++) {
      const x = (column + random() - .5) * 1.18
      const y = (row + random() - .5) * 1.12
      if ((x / 20.8) ** 2 + (y / 8.5) ** 2 > 1) continue
      grains.push({ x: 50 + x, y: 25.5 + y, r: .46 + random() * .25, color: colors[Math.floor(random() * colors.length)] })
    }
  }
  return grains
})()

function Gunkan({ base, color, tuna = false, mayo = false }: { base: string; color: string; tuna?: boolean; mayo?: boolean }) {
  const roeGlowId = useId()
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
      {tuna ? (
        <g>
          <ellipse cx="50" cy="28" rx="21" ry="6" fill="#d9a086" />
          {Array.from({ length: 22 }, (_, i) => {
            const radius = Math.sqrt((i + .5) / 22)
            const angle = i * 2.399963
            const x = 50 + Math.cos(angle) * radius * 18
            const y = 25.5 + Math.sin(angle) * radius * 7
            return <g key={i} transform={`translate(${x} ${y}) rotate(${i % 2 ? -18 : 22})`}>
              <path d="M-6-1-3-3 0-2 3-3 6 0 3 2 0 1-4 3Z" fill={i % 3 ? '#edbea3' : '#dda086'} stroke="#ce937b" strokeWidth=".35" />
              <path d="M-3 0 3-.7" fill="none" stroke="#f5d6bd" strokeWidth=".55" />
            </g>
          })}
        </g>
      ) : base === 'とびこ' ? (
        <g>
          <ellipse cx="50" cy="25.5" rx="21" ry="8.5" fill="#ed7b10" />
          {TOBIKO_ART_GRAINS.map(({ x, y, r, color }, i) => <circle key={i} cx={x} cy={y} r={r} fill={color} />)}
        </g>
      ) : base === 'いくら' ? (
        <g>
          <defs><radialGradient id={roeGlowId} cx="35%" cy="28%" r="75%">
            <stop offset="0" stopColor="#ffb357" /><stop offset=".43" stopColor="#f57621" /><stop offset="1" stopColor="#d34b0d" />
          </radialGradient></defs>
          <ellipse cx="50" cy="27" rx="21" ry="7" fill="#dd5b16" />
          {Array.from({ length: 27 }, (_, i) => {
            const radius = Math.sqrt((i + .5) / 27)
            const angle = i * 2.399963
            return { x: 50 + Math.cos(angle) * radius * 18.5, y: 25.5 + Math.sin(angle) * radius * 8, r: 2.75 + (i % 3) * .15 }
          }).sort((a, b) => a.y - b.y).map(({ x, y, r }, i) => <g key={i}>
            <circle cx={x} cy={y} r={r} fill={`url(#${roeGlowId})`} stroke="#dd6219" strokeWidth=".35" />
            <path d={`M${x - r * .6} ${y - r * .25}q${r * .15} ${-r * .55} ${r * .65} ${-r * .4}`} stroke="#ffe3b7" strokeWidth=".65" strokeLinecap="round" opacity=".65" fill="none" />
          </g>)}
        </g>
      ) : DOT_BASES.has(base) ? (
        // コーン・納豆
        <g>
          {dots.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="4.4" fill={color} stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
              <circle cx={x - 1.1} cy={y - 1.2} r=".9" fill="#ffffff" opacity="0.28" />
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
      {mayo && <path d="M33 26l7-4-1 9 10-10-1 10 10-9-1 8 9-5" fill="none" stroke="#fff5cf" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round" />}
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
