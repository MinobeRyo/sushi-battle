import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text, RoundedBox } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import { PurchaseModal } from './PurchaseModal'
import { getCardsByLane, CARDS } from '../../data/cards'
import { SushiArt } from '../../components/SushiArt'
import type { Card } from '../../types'

// ─── constants ────────────────────────────────────────────────────────────────

const DRAFT_SECONDS = 90
const INITIAL_BUDGET = 3000
const SHINKANSEN_TOTAL = 3
const SPACING = 2.3   // world-unit spacing between plates
const LEFT_EDGE = -12 // plate wraps when it goes below this x

const PRICE_COLOR: Record<number, { plate: string; rim: string }> = {
  100: { plate: '#e8e8e3', rim: '#9ca3af' },
  150: { plate: '#d1fae5', rim: '#34d399' },
  200: { plate: '#fef9c3', rim: '#eab308' },
  250: { plate: '#ffedd5', rim: '#f97316' },
  300: { plate: '#fee2e2', rim: '#ef4444' },
  400: { plate: '#f3e8ff', rim: '#a855f7' },
  500: { plate: '#fffbeb', rim: '#f59e0b' },
}


const NETA_MAT: Record<string, { color: string; roughness: number; metalness: number }> = {
  akami:    { color: '#c41e3a', roughness: 0.65, metalness: 0.0 },
  hikari:   { color: '#c8d4dc', roughness: 0.3, metalness: 0.1 },
  kaisen:   { color: '#e8733a', roughness: 0.55, metalness: 0.0 },
  niku:     { color: '#7c3014', roughness: 0.75, metalness: 0.0 },
  gunkan:   { color: '#2f4f2f', roughness: 0.70, metalness: 0.0 },
  makimono: { color: '#2d5a1b', roughness: 0.80, metalness: 0.0 },
  general:  { color: '#f5c518', roughness: 0.50, metalness: 0.0 },
}

const BASE_NETA_COLOR: Record<string, string> = {
  'たまご': '#f5c518', 'サーモン': '#e8722a', 'えび': '#e05050',
  'いか': '#e8e4dc', 'たこ': '#b24f8a', 'なす': '#6b2fa0',
  'アボカド': '#5d8a3c', 'うに': '#ef9b12', 'いくら': '#f8420a',
  'コーン': '#fbd23c', 'チーズ': '#f0d060', '明太子': '#e03828',
  'きゅうり': '#4a9a38', 'かんぴょう': '#c8b478', 'かに': '#d94030',
  'マグロ': '#b01020', 'アジ': '#9ab0c0', 'サバ': '#8090a8',
  'コハダ': '#788898', 'イワシ': '#8698aa', '和牛': '#7c3014', 'カルビ': '#8c3818',
  'うめ': '#d04060', '納豆': '#b89040',
  'いなり': '#c8883c', 'ツナサラダ': '#ded0b2',
}

const ARCHETYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  akami:    { bg: '#7f1d1d', text: '#fca5a5', label: '赤身' },
  makimono: { bg: '#14532d', text: '#86efac', label: '巻物' },
  hikari:   { bg: '#1e3a5f', text: '#93c5fd', label: '光り物' },
  kaisen:   { bg: '#164e63', text: '#67e8f9', label: '海鮮' },
  niku:     { bg: '#7c2d12', text: '#fdba74', label: '肉寿司' },
  gunkan:   { bg: '#78350f', text: '#fcd34d', label: '軍艦' },
  general:  { bg: '#292524', text: '#d6d3d1', label: '汎用' },
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Sushi geometry ──────────────────────────────────────────────────────────

const GUNKAN_BASES = new Set(['うに', 'いくら', 'とびこ', 'コーン', '明太子', '納豆', 'うめ', 'アボカド'])

function NigiriNeta({ color, roughness, metalness, map }: {
  color: string; roughness: number; metalness: number; map?: THREE.Texture | null
}) {
  const geometry = useMemo(() => {
    const segsX = 24, segsZ = 6
    const w = 1.00, d = 0.58, thickness = 0.08
    const halfW = w / 2
    const droopY = (x: number) => -0.15 * (x / halfW) ** 2

    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const addV = (x: number, y: number, z: number, u: number, v: number) => {
      pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1
    }

    // 上面・下面の頂点グリッド
    const top: number[][] = [], bot: number[][] = []
    for (let zi = 0; zi <= segsZ; zi++) {
      top.push([]); bot.push([])
      for (let xi = 0; xi <= segsX; xi++) {
        const x = (xi / segsX - 0.5) * w
        const z = (zi / segsZ - 0.5) * d
        const y = droopY(x)
        top[zi].push(addV(x, y, z, xi / segsX, zi / segsZ))
        bot[zi].push(addV(x, y - thickness, z, xi / segsX, zi / segsZ))
      }
    }

    // 上面ポリゴン（上向き法線）
    for (let zi = 0; zi < segsZ; zi++)
      for (let xi = 0; xi < segsX; xi++) {
        const [a, b, c, dd] = [top[zi][xi], top[zi][xi+1], top[zi+1][xi], top[zi+1][xi+1]]
        idx.push(a, c, b, b, c, dd)
      }

    // 下面ポリゴン（下向き法線）
    for (let zi = 0; zi < segsZ; zi++)
      for (let xi = 0; xi < segsX; xi++) {
        const [a, b, c, dd] = [bot[zi][xi], bot[zi][xi+1], bot[zi+1][xi], bot[zi+1][xi+1]]
        idx.push(a, b, c, b, dd, c)
      }

    // 前壁
    for (let xi = 0; xi < segsX; xi++) {
      idx.push(top[0][xi], top[0][xi+1], bot[0][xi], top[0][xi+1], bot[0][xi+1], bot[0][xi])
    }
    // 後壁
    for (let xi = 0; xi < segsX; xi++) {
      idx.push(top[segsZ][xi], bot[segsZ][xi], top[segsZ][xi+1], top[segsZ][xi+1], bot[segsZ][xi], bot[segsZ][xi+1])
    }
    // 左壁
    for (let zi = 0; zi < segsZ; zi++) {
      idx.push(top[zi][0], bot[zi][0], top[zi+1][0], top[zi+1][0], bot[zi][0], bot[zi+1][0])
    }
    // 右壁
    for (let zi = 0; zi < segsZ; zi++) {
      idx.push(top[zi][segsX], top[zi+1][segsX], bot[zi][segsX], top[zi+1][segsX], bot[zi+1][segsX], bot[zi][segsX])
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry}>
      {/* key でテクスチャ有無の切替時にマテリアルを作り直す（白くなる不具合対策） */}
      <meshPhysicalMaterial
        key={map ? map.uuid : 'plain'}
        color={map ? '#ffffff' : color}
        map={map ?? undefined}
        roughness={roughness}
        metalness={metalness}
        clearcoat={0.45}
        clearcoatRoughness={0.35}
      />
    </mesh>
  )
}

// サーモン用の白い筋テクスチャ（Canvas生成）
function useStripeTexture(base: string, color: string): THREE.Texture | null {
  return useMemo(() => {
    if (base !== 'サーモン') return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 256, 128)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    for (let x = -20; x <= 300; x += 44) {
      ctx.beginPath()
      ctx.moveTo(x - 22, 142)
      ctx.quadraticCurveTo(x + 12, 64, x - 22, -14)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [base, color])
}

// 光り物用テクスチャ：白い身＋銀青の皮と暗い波模様（Canvas生成）
// pale=true で酢締め（シメサバ）の白っぽい見た目に
function useHikariTexture(skinColor: string | null, pale?: boolean): THREE.Texture | null {
  return useMemo(() => {
    if (!skinColor) return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    // 銀白の身（下地）
    ctx.fillStyle = pale ? '#f6f3ee' : '#eef1f2'
    ctx.fillRect(0, 0, 256, 128)
    // 背側の皮（上端から中央へグラデーション）
    const grad = ctx.createLinearGradient(0, 0, 0, 128)
    grad.addColorStop(0, pale ? skinColor + 'b0' : skinColor)
    grad.addColorStop(0.42, skinColor + (pale ? '55' : 'aa'))
    grad.addColorStop(0.75, 'rgba(200,212,220,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 256, 128)
    // 皮の暗い波模様
    ctx.strokeStyle = pale ? 'rgba(55,80,100,0.22)' : 'rgba(55,80,100,0.4)'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    for (let x = -10; x <= 270; x += 26) {
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.quadraticCurveTo(x + 14, 34, x, 62)
      ctx.stroke()
    }
    // 銀のハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 8
    for (const y of [46, 84]) {
      ctx.beginPath()
      ctx.moveTo(0, y + 8)
      ctx.quadraticCurveTo(128, y - 10, 256, y + 6)
      ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [skinColor, pale])
}

// えび用テクスチャ：白い身に赤い縞（Canvas生成）
function useEbiTexture(): THREE.Texture | null {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    // 蒸しえびの白い身
    ctx.fillStyle = '#f7ecdc'
    ctx.fillRect(0, 0, 256, 128)
    // 赤い縞
    ctx.strokeStyle = '#ef5230'
    ctx.lineWidth = 13
    ctx.lineCap = 'round'
    for (let x = 4; x <= 280; x += 30) {
      ctx.beginPath()
      ctx.moveTo(x - 26, 142)
      ctx.quadraticCurveTo(x + 14, 64, x - 26, -14)
      ctx.stroke()
    }
    // 尾側（u=1側）を濃い赤に
    const grad = ctx.createLinearGradient(196, 0, 256, 0)
    grad.addColorStop(0, 'rgba(222,58,18,0)')
    grad.addColorStop(1, 'rgba(222,58,18,0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(196, 0, 60, 128)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])
}

// たこ用テクスチャ：白い身の両端に紫の皮（Canvas生成）
function useTakoTexture(): THREE.Texture | null {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    // 白い身
    ctx.fillStyle = '#f4ede6'
    ctx.fillRect(0, 0, 256, 128)
    // かすかな身の筋
    ctx.strokeStyle = 'rgba(214,192,186,0.55)'
    ctx.lineWidth = 3
    for (let x = 10; x < 256; x += 34) {
      ctx.beginPath()
      ctx.moveTo(x, 6)
      ctx.quadraticCurveTo(x + 10, 64, x, 122)
      ctx.stroke()
    }
    // 皮（両端の赤紫の縁、波打つ境界）
    ctx.fillStyle = '#8e3a5f'
    for (const edge of [0, 1]) {
      const yBase = edge === 0 ? 0 : 128
      const dir = edge === 0 ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(0, yBase)
      for (let x = 0; x <= 256; x += 8) {
        ctx.lineTo(x, yBase + dir * (13 + 7 * Math.sin(x / 16 + edge * 2.3)))
      }
      ctx.lineTo(256, yBase)
      ctx.closePath()
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])
}

// シャリ - ふっくらした楕円（共通）
function Shari() {
  return (
    <mesh position={[0, 0.29, 0]} scale={[1.52, 0.56, 0.88]}>
      <sphereGeometry args={[0.31, 28, 20]} />
      <meshStandardMaterial color="#f5f0e8" roughness={0.88} metalness={0} />
    </mesh>
  )
}

// マヨネーズの絞り（ジグザグの一本チューブ）
function MayoSqueeze() {
  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 6; i++) {
      const x = -0.2 + (i / 6) * 0.4
      const z = (i % 2 === 0 ? 1 : -1) * 0.075
      pts.push(new THREE.Vector3(x, 0.6 + (i % 2) * 0.005, z))
    }
    return new THREE.CatmullRomCurve3(pts)
  }, [])
  return (
    <mesh>
      <tubeGeometry args={[curve, 36, 0.022, 8, false]} />
      <meshPhysicalMaterial color="#f8f4e8" roughness={0.3} metalness={0} clearcoat={0.6} clearcoatRoughness={0.25} />
    </mesh>
  )
}

// 握りの薬味トッピング共通描画
function NigiriTopping({ topping }: { topping?: string | null }) {
  if (topping === 'オニオン') {
    // 白い薄切りスライス
    return (
      <>
        {([
          [-0.15, 0.05, 0.3], [0.05, -0.08, -0.4], [0.18, 0.1, 0.9], [-0.02, 0.12, 1.8],
        ] as Array<[number, number, number]>).map(([x, z, ry], i) => (
          <mesh key={i} position={[x, 0.55, z]} rotation={[0, ry, 0]} scale={[1, 0.25, 0.35]}>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshPhysicalMaterial color="#f4f1e8" roughness={0.35} metalness={0} clearcoat={0.5} clearcoatRoughness={0.3} transparent opacity={0.92} />
          </mesh>
        ))}
      </>
    )
  }
  if (topping === '大葉') {
    // ネタの下・前後の縁からのぞく緑の葉
    // ネタは両端(x方向)で垂れ下がるため、x幅はネタ中央部に収めて貫通を防ぐ
    return (
      <mesh position={[0, 0.44, 0]} scale={[0.8, 0.035, 1.0]}>
        <sphereGeometry args={[0.36, 18, 12]} />
        <meshStandardMaterial color="#3f8f2f" roughness={0.6} metalness={0} />
      </mesh>
    )
  }
  if (topping === 'アボカド') {
    // 大きめのアボカドスライス＋マヨの絞り
    return (
      <>
        {([
          [-0.1, 0.555, 0.01, 0.2], [0.08, 0.56, -0.01, -0.25],
        ] as Array<[number, number, number, number]>).map(([x, y, z, ry], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, ry, 0]} scale={[1, 0.24, 0.62]}>
            <sphereGeometry args={[0.17, 14, 10]} />
            <meshPhysicalMaterial color="#8fba4f" roughness={0.45} metalness={0} clearcoat={0.3} clearcoatRoughness={0.4} />
          </mesh>
        ))}
        <MayoSqueeze />
      </>
    )
  }
  if (topping === '生姜') {
    // おろし生姜＋ねぎ
    return (
      <>
        <mesh position={[0, 0.565, 0]} scale={[1.3, 0.5, 1]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color="#e6c46a" roughness={0.75} metalness={0} />
        </mesh>
        {([[0.1, 0.555, 0.05], [-0.09, 0.55, -0.04]] as Array<[number, number, number]>).map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshStandardMaterial color="#54b435" roughness={0.6} metalness={0} />
          </mesh>
        ))}
      </>
    )
  }
  if (topping === 'ネギ') {
    // 刻みねぎを散らす
    return (
      <>
        {([
          [0, 0.555, 0], [0.14, 0.545, 0.06], [-0.13, 0.55, -0.05], [0.06, 0.55, -0.1], [-0.05, 0.545, 0.1],
        ] as Array<[number, number, number]>).map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.028, 8, 6]} />
            <meshStandardMaterial color="#54b435" roughness={0.6} metalness={0} />
          </mesh>
        ))}
      </>
    )
  }
  return null
}

function NigiriSushi({ archetype, base, topping, colorOverride, paleHikari }: {
  archetype: string; base: string; topping?: string | null; colorOverride?: string; paleHikari?: boolean
}) {
  const mat = NETA_MAT[archetype] ?? NETA_MAT.general
  const netaColor = colorOverride ?? BASE_NETA_COLOR[base] ?? mat.color
  const stripeTex = useStripeTexture(base, netaColor)
  const hikariTex = useHikariTexture(archetype === 'hikari' ? netaColor : null, paleHikari)
  return (
    <group>
      <Shari />
      {/* ネタ - シャリの上から両端に垂れ下がる曲面 */}
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={netaColor} roughness={mat.roughness} metalness={mat.metalness} map={stripeTex ?? hikariTex} />
      </group>
      <NigiriTopping topping={topping} />
    </group>
  )
}

// えび握り：縞模様の身＋扇状の尾
function EbiNigiri({ topping }: { topping?: string | null }) {
  const tex = useEbiTexture()
  return (
    <group>
      <Shari />
      <NigiriTopping topping={topping} />
      <group position={[0, 0.53, 0]} scale={[0.96, 1, 0.92]}>
        <NigiriNeta color="#f7ecdc" roughness={0.5} metalness={0} map={tex} />
      </group>
      {/* 尾：ネタの端から水平に広がる平たい扇（先端がやや上向き） */}
      <group position={[0.46, 0.4, 0]} rotation={[0, 0, 0.18]}>
        {/* 付け根（ネタ端との接続部） */}
        <mesh position={[0.01, 0, 0]} scale={[1.6, 0.55, 0.6]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshPhysicalMaterial color="#e04a20" roughness={0.4} metalness={0} clearcoat={0.5} clearcoatRoughness={0.3} />
        </mesh>
        {/* 平たい尾びれ3枚 */}
        {[-0.55, 0, 0.55].map((a, i) => (
          <mesh
            key={i}
            position={[0.12 * Math.cos(a), 0.01, -0.12 * Math.sin(a)]}
            rotation={[0, a, 0.15]}
            scale={[1, 0.2, 0.42]}
          >
            <sphereGeometry args={[0.14, 14, 10]} />
            <meshPhysicalMaterial color="#e04a20" roughness={0.4} metalness={0} clearcoat={0.5} clearcoatRoughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// たこ握り：白い身＋赤紫の皮エッジ
function TakoNigiri() {
  const tex = useTakoTexture()
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color="#f4ede6" roughness={0.35} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// ネギトロ：そぼろ状のミンチ＋ネギの緑（軍艦・握り共通パーツ）
const NEGITORO_LUMPS: Array<[number, number, number, number]> = [
  [0, 0.52, 0, 1.2], [0.14, 0.5, 0.06, 1], [-0.14, 0.5, 0.05, 1.05], [0.05, 0.53, -0.1, 0.9],
  [-0.07, 0.52, -0.09, 0.95], [0.18, 0.47, -0.05, 0.8], [-0.18, 0.48, 0.08, 0.85], [0.02, 0.5, 0.12, 0.9],
  [0.09, 0.57, -0.03, 0.85], [-0.09, 0.57, 0.03, 0.9], [0.23, 0.46, 0.06, 0.7], [-0.23, 0.46, -0.05, 0.7],
  [0.01, 0.585, 0.05, 0.8], [-0.03, 0.47, -0.15, 0.75], [0.05, 0.47, 0.16, 0.75],
]
const NEGI_FLECKS: Array<[number, number, number]> = [
  [0.08, 0.6, 0.02], [-0.1, 0.59, -0.05], [0, 0.615, -0.08],
  [0.15, 0.57, 0.09], [-0.16, 0.565, 0.04], [-0.02, 0.615, 0.1],
  [0.05, 0.62, -0.02], [-0.06, 0.605, 0.08], [0.12, 0.585, -0.09],
]

function NegitoroTopping() {
  return (
    <>
      {NEGITORO_LUMPS.map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1.15 * s, 0.7 * s, s]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshPhysicalMaterial color="#d6404e" roughness={0.7} metalness={0} clearcoat={0.15} clearcoatRoughness={0.5} />
        </mesh>
      ))}
      {NEGI_FLECKS.map(([x, y, z], i) => (
        <mesh key={`n${i}`} position={[x, y, z]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.028, 8, 6]} />
          <meshStandardMaterial color="#54b435" roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </>
  )
}

function NegitoroGunkan() {
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {/* ネギトロ色の盛り（シャリが見えないように） */}
      <mesh position={[0, 0.42, 0]} scale={[1, 0.38, 1]}>
        <sphereGeometry args={[0.28, 18, 12]} />
        <meshPhysicalMaterial color="#cf4552" roughness={0.65} metalness={0} clearcoat={0.15} clearcoatRoughness={0.5} />
      </mesh>
      <NegitoroTopping />
    </group>
  )
}

// ぶつ切り系軍艦の共通配置
const CHUNK_LAYOUT: Array<{ p: [number, number, number]; ry: number; s: number }> = [
  { p: [0, 0.5, 0], ry: 0.4, s: 1.05 }, { p: [0.14, 0.48, 0.06], ry: -0.7, s: 0.9 },
  { p: [-0.14, 0.49, 0.04], ry: 1.1, s: 0.95 }, { p: [0.05, 0.5, -0.11], ry: 0.2, s: 0.85 },
  { p: [-0.07, 0.48, -0.1], ry: -0.4, s: 0.9 }, { p: [0.19, 0.46, -0.04], ry: 0.9, s: 0.8 },
  { p: [-0.19, 0.46, 0.08], ry: -1, s: 0.8 }, { p: [0.02, 0.55, 0.05], ry: 0.6, s: 0.8 },
  { p: [-0.06, 0.55, -0.04], ry: -0.2, s: 0.75 }, { p: [0.1, 0.54, 0.12], ry: 1.4, s: 0.7 },
]

function TakowasaGunkan() {
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {/* たこ色の盛り（シャリが見えないように） */}
      <mesh position={[0, 0.42, 0]} scale={[1, 0.38, 1]}>
        <sphereGeometry args={[0.28, 18, 12]} />
        <meshPhysicalMaterial color="#dcc0ca" roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} />
      </mesh>
      {CHUNK_LAYOUT.map(({ p, ry, s }, i) => (
        <group key={i} position={p} rotation={[0, ry, 0]}>
          {/* 白い身 */}
          <mesh scale={[1.15 * s, 0.7 * s, 0.9 * s]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshPhysicalMaterial color="#eee0e2" roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} />
          </mesh>
          {/* 皮（上にかぶさる赤紫の薄い層） */}
          <mesh position={[0.02 * s, 0.038 * s, 0]} scale={[0.95 * s, 0.4 * s, 0.78 * s]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshPhysicalMaterial color="#94446b" roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* わさび（小さめ・深緑） */}
      {([[-0.03, 0.585, 0.02], [0.12, 0.56, -0.07], [-0.13, 0.555, 0.09]] as Array<[number, number, number]>).map(([x, y, z], i) => (
        <mesh key={`w${i}`} position={[x, y, z]} scale={[1.2, 0.6, 1]}>
          <sphereGeometry args={[0.032, 8, 6]} />
          <meshStandardMaterial color="#5d8a28" roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

// えび軍艦：丸まった小えびを敷き詰める
const EBI_GUNKAN_SHRIMP: Array<{ p: [number, number, number]; ry: number; s: number; c: string }> = [
  { p: [0, 0.51, 0], ry: 0.3, s: 1, c: '#ef8464' },
  { p: [0.13, 0.5, 0.06], ry: -1.1, s: 0.9, c: '#f5a98d' },
  { p: [-0.13, 0.5, 0.04], ry: 1.8, s: 0.95, c: '#ef8464' },
  { p: [0.05, 0.5, -0.11], ry: 0.7, s: 0.85, c: '#f5a98d' },
  { p: [-0.07, 0.5, -0.1], ry: -0.5, s: 0.9, c: '#ef8464' },
  { p: [0.18, 0.48, -0.04], ry: 2.4, s: 0.8, c: '#ef8464' },
  { p: [-0.18, 0.48, 0.08], ry: -1.7, s: 0.8, c: '#f5a98d' },
  { p: [0.02, 0.555, 0.06], ry: 1.3, s: 0.85, c: '#ef8464' },
  { p: [-0.05, 0.555, -0.05], ry: -0.9, s: 0.8, c: '#f5a98d' },
]

function EbiGunkan() {
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {/* えび色の盛り（シャリが見えないように） */}
      <mesh position={[0, 0.42, 0]} scale={[1, 0.38, 1]}>
        <sphereGeometry args={[0.28, 18, 12]} />
        <meshPhysicalMaterial color="#eb8f72" roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} />
      </mesh>
      {EBI_GUNKAN_SHRIMP.map(({ p, ry, s, c }, i) => (
        <mesh key={i} position={p} rotation={[-Math.PI / 2, 0, ry]} scale={[s, s, 0.9 * s]}>
          {/* 途切れたトーラス＝丸まったえびの形 */}
          <torusGeometry args={[0.07, 0.032, 8, 12, Math.PI * 1.25]} />
          <meshPhysicalMaterial color={c} roughness={0.45} metalness={0} clearcoat={0.3} clearcoatRoughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

// 決定的な疑似乱数（毎フレーム同じ見た目を保つ）
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// カニ軍艦：ほぐし身（曲線チューブの繊維を重ねる）
function KaniFibers() {
  const fibers = useMemo(() => {
    const rand = mulberry32(7)
    const list: { curve: THREE.CatmullRomCurve3; r: number; color: string }[] = []
    for (let i = 0; i < 30; i++) {
      const isRed = i >= 23
      const a = rand() * Math.PI * 2
      const cx = (rand() - 0.5) * 0.34
      const cz = (rand() - 0.5) * 0.26
      const len = 0.12 + rand() * 0.1
      const y0 = (isRed ? 0.56 : 0.52) + rand() * 0.04
      const dx = Math.cos(a), dz = Math.sin(a)
      const p0 = new THREE.Vector3(cx - (dx * len) / 2, y0, cz - (dz * len) / 2)
      const mid = new THREE.Vector3(cx + (rand() - 0.5) * 0.04, y0 + 0.015 + rand() * 0.02, cz + (rand() - 0.5) * 0.04)
      const p1 = new THREE.Vector3(cx + (dx * len) / 2, y0 + (rand() - 0.5) * 0.02, cz + (dz * len) / 2)
      list.push({
        curve: new THREE.CatmullRomCurve3([p0, mid, p1]),
        r: isRed ? 0.013 : 0.02 + rand() * 0.013,
        color: isRed ? '#e05548' : rand() > 0.5 ? '#f8efe8' : '#f3dcd4',
      })
    }
    return list
  }, [])
  return (
    <>
      {fibers.map((f, i) => (
        <mesh key={i}>
          <tubeGeometry args={[f.curve, 8, f.r, 6, false]} />
          <meshPhysicalMaterial color={f.color} roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} />
        </mesh>
      ))}
    </>
  )
}

function KaniGunkan() {
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {/* かに色の盛り（シャリが見えないように） */}
      <mesh position={[0, 0.42, 0]} scale={[1, 0.42, 1]}>
        <sphereGeometry args={[0.28, 18, 12]} />
        <meshPhysicalMaterial color="#f4e4da" roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} />
      </mesh>
      <KaniFibers />
    </group>
  )
}

// チーズ握り：炙りチーズのスライス
function useCheeseTexture(): THREE.Texture | null {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#f4dc94'
    ctx.fillRect(0, 0, 256, 128)
    // 炙り目（焦げの斑点）
    const spots: Array<[number, number, number, number, number]> = [
      [40, 30, 16, 10, 0.45], [120, 60, 20, 12, 0.4], [200, 40, 14, 9, 0.45],
      [80, 95, 18, 10, 0.4], [170, 100, 15, 8, 0.45], [230, 90, 12, 8, 0.4],
      [30, 70, 10, 6, 0.5], [150, 22, 11, 7, 0.5],
    ]
    for (const [x, y, rx, ry, a] of spots) {
      ctx.fillStyle = `rgba(150,88,24,${a})`
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])
}

function CheeseNigiri() {
  const tex = useCheeseTexture()
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color="#f4dc94" roughness={0.35} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// シーフード軍艦：マヨで和えたクリーム色のベースに淡い具材が埋まるサラダ風
const SEAFOOD_PIECES: Array<{ p: [number, number, number]; ry: number; s: number; c: string }> = [
  { p: [-0.13, 0.54, -0.05], ry: 0.5, s: 0.85, c: '#e59a70' },  // サーモン
  { p: [0.1, 0.55, 0.06], ry: -0.8, s: 0.8, c: '#e5988a' },     // えび
  { p: [0.16, 0.51, -0.08], ry: 0.3, s: 0.75, c: '#f3ece2' },   // いか
  { p: [-0.04, 0.56, 0.1], ry: 1.2, s: 0.75, c: '#e59a70' },
  { p: [0.01, 0.56, -0.11], ry: -0.3, s: 0.7, c: '#f3ece2' },
  { p: [-0.18, 0.5, 0.08], ry: 0.9, s: 0.7, c: '#e5988a' },
  { p: [0.21, 0.49, 0.05], ry: -1.1, s: 0.65, c: '#e59a70' },
  { p: [-0.08, 0.55, -0.13], ry: 0.1, s: 0.65, c: '#e5988a' },
]

function SeafoodGunkan() {
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {/* マヨで和えたベース（クリーム色の盛り） */}
      <mesh position={[0, 0.47, 0]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.28, 20, 14]} />
        <meshPhysicalMaterial color="#f1e8d8" roughness={0.45} metalness={0} clearcoat={0.3} clearcoatRoughness={0.4} />
      </mesh>
      {/* 具材（淡い色でベースに半分埋まる） */}
      {SEAFOOD_PIECES.map(({ p, ry, s, c }, i) => (
        <mesh key={i} position={p} rotation={[0, ry, 0]} scale={[1.2 * s, 0.6 * s, 0.9 * s]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshPhysicalMaterial color={c} roughness={0.5} metalness={0} clearcoat={0.15} clearcoatRoughness={0.4} />
        </mesh>
      ))}
      {/* 小ねぎ */}
      {([[0.05, 0.6, 0.01], [-0.09, 0.585, 0.06]] as Array<[number, number, number]>).map(([x, y, z], i) => (
        <mesh key={`g${i}`} position={[x, y, z]} scale={[1, 0.4, 1]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial color="#54b435" roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

// 天ぷら握り：衣付きの太い揚げ物＋（えび天のみ）赤い尾
const TEMPURA_SEGS: Array<[number, number, number]> = [
  [-0.32, 0.6, 0], [-0.1, 0.63, 0], [0.13, 0.63, 0], [0.34, 0.6, 0],
]
const TEMPURA_BUMPS: Array<[number, number, number]> = [
  [-0.4, 0.66, 0.06], [-0.18, 0.71, -0.07], [0.03, 0.71, 0.08], [0.24, 0.69, -0.06],
  [0.44, 0.62, 0.05], [-0.28, 0.65, 0.12], [0.15, 0.67, 0.13], [0.35, 0.64, -0.11],
]

function TempuraNigiri({ tail }: { tail: boolean }) {
  return (
    <group>
      <Shari />
      {/* 衣の本体 */}
      {TEMPURA_SEGS.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1.25, 0.8, 0.95]}>
          <sphereGeometry args={[0.17, 14, 10]} />
          <meshStandardMaterial color="#dfa042" roughness={0.78} metalness={0} />
        </mesh>
      ))}
      {/* 衣のサクサク感（小さな凹凸） */}
      {TEMPURA_BUMPS.map(([x, y, z], i) => (
        <mesh key={`b${i}`} position={[x, y, z]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#e9b45e" roughness={0.8} metalness={0} />
        </mesh>
      ))}
      {/* えび天の尾 */}
      {tail && (
        <group position={[0.5, 0.58, 0]} rotation={[0, 0, 0.45]}>
          <mesh position={[0.02, 0, 0]} scale={[1.3, 0.75, 0.85]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshPhysicalMaterial color="#de3a12" roughness={0.45} metalness={0} clearcoat={0.4} clearcoatRoughness={0.3} />
          </mesh>
          {[-0.4, 0, 0.4].map((a, i) => (
            <mesh key={i} position={[0.12, 0.04, 0]} rotation={[0, a, -Math.PI / 2 + 0.35]} scale={[0.32, 1, 1]}>
              <coneGeometry args={[0.09, 0.24, 10]} />
              <meshPhysicalMaterial color="#de3a12" roughness={0.45} metalness={0} clearcoat={0.4} clearcoatRoughness={0.3} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

// いなり：角丸の俵型ひとつ（参考画像準拠）
function InariSushi() {
  return (
    <group rotation={[0, 0.18, 0]}>
      <RoundedBox args={[0.92, 0.38, 0.56]} radius={0.13} smoothness={4} position={[0, 0.33, 0]}>
        <meshPhysicalMaterial color="#b97a2e" roughness={0.55} metalness={0} clearcoat={0.35} clearcoatRoughness={0.5} />
      </RoundedBox>
    </group>
  )
}

// 太巻き：細巻きより大きく、断面に具材数種
const FUTOMAKI_FILLS: Array<{ x: number; z: number; r: number; color: string }> = [
  { x: 0.1, z: 0, r: 0.09, color: '#f5c518' },    // たまご
  { x: -0.11, z: 0.08, r: 0.05, color: '#4a9a38' }, // きゅうり
  { x: -0.02, z: -0.12, r: 0.06, color: '#c8b478' }, // かんぴょう
  { x: -0.13, z: -0.05, r: 0.06, color: '#e87a90' }, // でんぶ
  { x: 0.02, z: 0.12, r: 0.05, color: '#d6404e' },  // まぐろ
]

function FutomakiPlate() {
  const h = 0.5
  const rNori = 0.36, rRice = 0.3
  const pieces: { x: number; rotY: number }[] = [
    { x: -0.37, rotY: 0.22 },
    { x: 0.37, rotY: -0.22 },
  ]
  return (
    <group>
      {pieces.map((p, i) => (
        <group key={i} position={[p.x, rNori + 0.02, 0]} rotation={[Math.PI / 2, p.rotY, 0]}>
          {/* 海苔 */}
          <mesh>
            <cylinderGeometry args={[rNori, rNori, h, 24, 1, true]} />
            <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* シャリ */}
          <mesh>
            <cylinderGeometry args={[rRice, rRice, h, 22, 1, true]} />
            <meshStandardMaterial color="#f0ece0" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* 具材（貫通する筒、両端の断面も見える） */}
          {FUTOMAKI_FILLS.map((f, j) => (
            <mesh key={j} position={[f.x, 0, f.z]}>
              <cylinderGeometry args={[f.r, f.r, h + 0.004, 12]} />
              <meshStandardMaterial color={f.color} roughness={0.6} metalness={0} />
            </mesh>
          ))}
          {/* 切り口（両端のリング） */}
          {[h / 2, -h / 2].map((y, j) => (
            <group key={j} position={[0, y, 0]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
              <mesh>
                <ringGeometry args={[rRice, rNori, 24]} />
                <meshStandardMaterial color="#1a2410" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.001]}>
                <circleGeometry args={[rRice, 22]} />
                <meshStandardMaterial color="#f0ece0" roughness={0.85} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

// 中トロ・大トロ：サシ（脂の白い線）入りテクスチャ
const TORO_CONF: Record<string, { flesh: string; bands: number; alpha: number; lw: number; slant: number; sheen: number }> = {
  '中トロ': { flesh: '#e05c48', bands: 5, alpha: 0.5, lw: 5, slant: 26, sheen: 0.08 },
  '大トロ': { flesh: '#ef9583', bands: 5, alpha: 0.85, lw: 12, slant: 34, sheen: 0.18 },
}

function useToroTexture(kind: string): THREE.Texture | null {
  return useMemo(() => {
    const conf = TORO_CONF[kind]
    if (!conf) return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = conf.flesh
    ctx.fillRect(0, 0, 256, 128)
    // 太い斜めのスジ（脂の白い帯）
    ctx.strokeStyle = `rgba(252,248,246,${conf.alpha})`
    ctx.lineWidth = conf.lw
    ctx.lineCap = 'round'
    for (let i = 0; i < conf.bands; i++) {
      const x = 34 + (i * 230) / conf.bands
      ctx.beginPath()
      ctx.moveTo(x + conf.slant, -8)
      ctx.lineTo(x - conf.slant, 136)
      ctx.stroke()
    }
    // 間の細かいサシ
    ctx.strokeStyle = 'rgba(252,248,246,0.3)'
    ctx.lineWidth = 2
    for (let i = 0; i < conf.bands * 3; i++) {
      const x = 14 + (i * 244) / (conf.bands * 3)
      ctx.beginPath()
      ctx.moveTo(x + conf.slant * 0.8, 0)
      ctx.lineTo(x - conf.slant * 0.8, 128)
      ctx.stroke()
    }
    // 表面の照り（上側にうっすら白）
    const sheen = ctx.createLinearGradient(0, 0, 0, 128)
    sheen.addColorStop(0, `rgba(255,255,255,${conf.sheen})`)
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, 256, 128)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [kind])
}

function ToroNigiri({ kind }: { kind: string }) {
  const tex = useToroTexture(kind)
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={TORO_CONF[kind]?.flesh ?? '#e05c48'} roughness={0.5} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// 肉寿司用テクスチャ設定
const NIKU_TEX_CONF: Record<string, { flesh: string; marbling: number; sear: number; edge?: string; gloss: number }> = {
  '和牛': { flesh: '#9e3a24', marbling: 0.9, sear: 0.35, gloss: 0.7 },
  'カルビ': { flesh: '#8f3d1d', marbling: 0.5, sear: 0.55, gloss: 0.8 },
  'ローストビーフ': { flesh: '#c25e49', marbling: 0.15, sear: 0.1, edge: '#6b3220', gloss: 0.45 },
  '焼肉': { flesh: '#7e3a16', marbling: 0.3, sear: 0.8, gloss: 0.8 },
  '牛タン': { flesh: '#c99490', marbling: 0.45, sear: 0.25, gloss: 0.4 },
}

// 肉寿司用テクスチャ：サシ（霜降り）＋炙り目（Canvas生成）
function useNikuTexture(base: string): THREE.Texture | null {
  return useMemo(() => {
    const conf = NIKU_TEX_CONF[base]
    if (!conf) return null
    const cv = document.createElement('canvas')
    cv.width = 256; cv.height = 128
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = conf.flesh
    ctx.fillRect(0, 0, 256, 128)
    // サシ（白い波線）
    const marblingLines = Math.round(conf.marbling * 12)
    ctx.strokeStyle = 'rgba(250,244,238,0.7)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 0; i < marblingLines; i++) {
      const x = 10 + (i * 236) / Math.max(1, marblingLines - 1)
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.quadraticCurveTo(x + (i % 2 === 0 ? 16 : -16), 64, x, 124)
      ctx.stroke()
    }
    // 炙り目（暗い斜めの帯）
    if (conf.sear > 0) {
      ctx.strokeStyle = `rgba(45,22,12,${conf.sear})`
      ctx.lineWidth = 11
      for (let x = 20; x <= 260; x += 56) {
        ctx.beginPath()
        ctx.moveTo(x, -8)
        ctx.lineTo(x - 36, 136)
        ctx.stroke()
      }
    }
    // ローストビーフの焼き縁（両端）
    if (conf.edge) {
      ctx.fillStyle = conf.edge
      ctx.fillRect(0, 0, 256, 13)
      ctx.fillRect(0, 115, 256, 13)
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [base])
}

// 肉寿司：サシ・炙り目・タレのツヤ
function NikuNigiri({ base }: { base: string }) {
  const tex = useNikuTexture(base)
  const conf = NIKU_TEX_CONF[base]
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={conf?.flesh ?? '#7c3014'} roughness={0.45} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// たまご握り：従来の薄いネタ＋ぴったり巻き付く海苔帯
function TamagoNigiri() {
  return (
    <group>
      <Shari />
      {/* たまごのネタ（垂れ下がる曲面） */}
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color="#f5c518" roughness={0.5} metalness={0} />
      </group>
      {/* 海苔帯：ネタの上 */}
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[0.22, 0.016, 0.6]} />
        <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
      </mesh>
      {/* 海苔帯：両側面（ネタとシャリに沿って下りる） */}
      {[-0.3, 0.3].map((z) => (
        <mesh key={z} position={[0, 0.32, z]}>
          <boxGeometry args={[0.22, 0.46, 0.016]} />
          <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

// 粒もの軍艦の粒配置（決め打ちで自然なばらつき）
// いくら用：大粒12個
const GUNKAN_DOTS_LARGE: Array<[number, number, number]> = [
  [0, 0.60, 0], [0.13, 0.58, 0.07], [-0.13, 0.58, 0.05], [0.06, 0.59, -0.11],
  [-0.08, 0.58, -0.10], [0.19, 0.55, -0.04], [-0.19, 0.55, -0.02], [0.01, 0.59, 0.13],
  [0.11, 0.56, 0.14], [-0.12, 0.56, 0.13], [0.20, 0.54, 0.09], [-0.21, 0.54, 0.08],
  // 縁と2段目を追加してぎっしり感を出す
  [0.24, 0.52, 0.02], [-0.24, 0.52, 0.03], [0.16, 0.53, -0.13], [-0.15, 0.53, -0.12],
  [0.05, 0.655, 0.04], [-0.05, 0.65, -0.04], [0.08, 0.645, -0.08], [-0.09, 0.64, 0.09],
]
// コーン・とびこ・納豆用：小粒を密に（中心+3重リング+2段目）
const GUNKAN_DOTS_SMALL: Array<[number, number, number]> = (() => {
  const pts: Array<[number, number, number]> = [[0, 0.60, 0]]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    pts.push([Math.cos(a) * 0.11, 0.585, Math.sin(a) * 0.10])
  }
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + 0.26
    pts.push([Math.cos(a) * 0.21, 0.555, Math.sin(a) * 0.17])
  }
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 + 0.13
    pts.push([Math.cos(a) * 0.26, 0.53, Math.sin(a) * 0.21])
  }
  // 2段目（中央を盛り上げる）
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5
    pts.push([Math.cos(a) * 0.07, 0.645, Math.sin(a) * 0.06])
  }
  return pts
})()

// 粒もの軍艦の見た目設定
const GUNKAN_DOT_CONF: Record<string, {
  r: number; color: string; roughness: number; clearcoat: number
  squash: number; large: boolean; emissive?: string
}> = {
  'いくら': { r: 0.095, color: '#f8420a', roughness: 0.05, clearcoat: 1, squash: 1, large: true, emissive: '#7a1400' },
  'とびこ': { r: 0.056, color: '#f06010', roughness: 0.08, clearcoat: 1, squash: 1, large: false },
  'コーン': { r: 0.058, color: '#fbd23c', roughness: 0.5, clearcoat: 0.15, squash: 0.78, large: false },
  '納豆': { r: 0.058, color: '#a8823c', roughness: 0.28, clearcoat: 0.7, squash: 0.85, large: false },
}

// うにの房：頂点を波打たせた粒々の表面を持つ舌状ジオメトリ
function UniLobe({ position, rotationY, scale, variant }: {
  position: [number, number, number]; rotationY: number; scale: [number, number, number]; variant: number
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.105, 20, 16)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
      // 位置ベースのノイズで表面に細かい粒々を作る（継ぎ目も連続）
      const n = 1
        + 0.06 * Math.sin(v.x * 58 + variant * 2.1) * Math.cos(v.y * 52 - variant * 1.3)
        + 0.045 * Math.sin((v.x + v.z) * 72 + variant * 3.7)
      pos.setXYZ(i, v.x * n, v.y * n, v.z * n)
    }
    geo.computeVertexNormals()
    return geo
  }, [variant])
  return (
    <mesh geometry={geometry} position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <meshPhysicalMaterial color="#ef9b12" roughness={0.55} metalness={0} clearcoat={0.25} clearcoatRoughness={0.5} />
    </mesh>
  )
}

// うに用：舌状の房の配置
const UNI_LOBES: Array<{ p: [number, number, number]; ry: number; s: number }> = [
  { p: [-0.15, 0.53, -0.08], ry: 0.3, s: 1 },
  { p: [0.02, 0.545, -0.09], ry: -0.2, s: 1.05 },
  { p: [0.18, 0.52, -0.07], ry: 0.4, s: 0.9 },
  { p: [-0.08, 0.545, 0.06], ry: -0.35, s: 1 },
  { p: [0.09, 0.54, 0.07], ry: 0.25, s: 0.95 },
  { p: [-0.2, 0.51, 0.05], ry: 0.1, s: 0.85 },
  { p: [-0.02, 0.5, -0.14], ry: 0.15, s: 0.8 },
  { p: [0.18, 0.5, 0.08], ry: -0.3, s: 0.75 },
  { p: [-0.19, 0.5, -0.03], ry: 0.2, s: 0.75 },
  { p: [0.03, 0.5, 0.14], ry: -0.1, s: 0.8 },
]

// 軍艦の共通カップ（海苔＋シャリ）
function GunkanCup() {
  return (
    <>
      {/* 海苔 - 高い筒状カップ */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.33, 0.33, 0.42, 26, 1, true]} />
        <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* 海苔底面 */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.33, 0.33, 0.04, 26]} />
        <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
      </mesh>
      {/* シャリ（海苔カップの中） */}
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.29, 0.29, 0.22, 22]} />
        <meshStandardMaterial color="#f5f0e8" roughness={0.85} metalness={0} />
      </mesh>
    </>
  )
}

function GunkanSushi({ base }: { base: string }) {
  const toppingColor = BASE_NETA_COLOR[base] ?? '#f0a830'
  const dotConf = GUNKAN_DOT_CONF[base]
  const isUni = base === 'うに'
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {isUni ? (
        <>
          {/* うに色の盛り（シャリが見えないように） */}
          <mesh position={[0, 0.42, 0]} scale={[1.02, 0.45, 1.02]}>
            <sphereGeometry args={[0.27, 18, 12]} />
            <meshPhysicalMaterial color="#dd8c0e" roughness={0.55} metalness={0} clearcoat={0.25} clearcoatRoughness={0.5} />
          </mesh>
          {/* うにの舌状の房（粒々の表面） */}
          {UNI_LOBES.map(({ p, ry, s }, i) => (
            <UniLobe key={i} position={p} rotationY={ry} scale={[1.5 * s, 0.62 * s, 0.85 * s]} variant={i % 4} />
          ))}
        </>
      ) : dotConf ? (
        <>
          {/* シャリの盛り（粒の土台・粒が埋まらないよう低め） */}
          <mesh position={[0, 0.46, 0]} scale={[0.95, 0.42, 0.95]}>
            <sphereGeometry args={[0.29, 18, 12]} />
            <meshStandardMaterial color="#f5f0e8" roughness={0.85} metalness={0} />
          </mesh>
          {/* 粒 */}
          {(dotConf.large ? GUNKAN_DOTS_LARGE : GUNKAN_DOTS_SMALL).map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]} scale={[1, dotConf.squash, 1]}>
              <sphereGeometry args={[dotConf.r, 12, 10]} />
              <meshPhysicalMaterial
                color={dotConf.color}
                roughness={dotConf.roughness}
                metalness={0}
                clearcoat={dotConf.clearcoat}
                clearcoatRoughness={0.12}
                emissive={dotConf.emissive ?? '#000000'}
                emissiveIntensity={dotConf.emissive ? 0.25 : 0}
              />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* 具材メイン（海苔からはみ出す） */}
          <mesh position={[0, 0.56, 0]} scale={[1.05, 0.62, 1.05]}>
            <sphereGeometry args={[0.34, 20, 14]} />
            <meshPhysicalMaterial color={toppingColor} roughness={0.4} metalness={0} clearcoat={0.5} clearcoatRoughness={0.4} />
          </mesh>
          {/* 具材サブ（でこぼこ感） */}
          <mesh position={[-0.09, 0.60, 0.07]} scale={[0.72, 0.52, 0.72]}>
            <sphereGeometry args={[0.26, 16, 12]} />
            <meshPhysicalMaterial color={toppingColor} roughness={0.45} metalness={0} clearcoat={0.5} clearcoatRoughness={0.4} />
          </mesh>
        </>
      )}
    </group>
  )
}

function MakiPlate({ base, negitoro }: { base: string; negitoro?: boolean }) {
  const fillColor = negitoro ? '#d6404e' : (BASE_NETA_COLOR[base] ?? '#f5c518')
  const h = 0.58
  const rNori = 0.26, rRice = 0.19, rFill = 0.082
  const pieces: { x: number; rotY: number }[] = [
    { x: -0.19, rotY: 0.28 },
    { x:  0.19, rotY: -0.28 },
  ]
  return (
    <group>
      {pieces.map((p, i) => (
        <group key={i} position={[p.x, 0.38, 0]} rotation={[Math.PI / 2, p.rotY, 0]}>
          {/* 海苔 */}
          <mesh>
            <cylinderGeometry args={[rNori, rNori, h, 22, 1, true]} />
            <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* シャリ */}
          <mesh>
            <cylinderGeometry args={[rRice, rRice, h, 20, 1, true]} />
            <meshStandardMaterial color="#f0ece0" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* 具材 */}
          <mesh>
            <cylinderGeometry args={[rFill, rFill, h, 14]} />
            <meshStandardMaterial color={fillColor} roughness={0.6} metalness={0} />
          </mesh>
          {/* 切り口（両端） */}
          {[h / 2, -h / 2].map((y, j) => (
            <group key={j} position={[0, y, 0]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
              <mesh>
                <ringGeometry args={[rRice, rNori, 22]} />
                <meshStandardMaterial color="#1a2410" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.001]}>
                <ringGeometry args={[rFill, rRice, 22]} />
                <meshStandardMaterial color="#f0ece0" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.002]}>
                <circleGeometry args={[rFill, 16]} />
                <meshStandardMaterial color={fillColor} roughness={0.6} />
              </mesh>
              {/* ネギトロのネギ（切り口の緑） */}
              {negitoro && ([[0.03, 0.03], [-0.04, -0.02], [0.01, -0.05]] as Array<[number, number]>).map(([dx, dy], k) => (
                <mesh key={`g${k}`} position={[dx, dy, 0.003]}>
                  <circleGeometry args={[0.022, 8]} />
                  <meshStandardMaterial color="#54b435" roughness={0.6} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

// 同じ base でも名前で色を変えたい握り
const NIGIRI_NAME_COLOR: Record<string, string> = {
  'ビントロ': '#e89f92',   // びんちょうの淡いピンク
  'づけマグロ': '#8a1220', // 漬けの濃い赤
}

// 納豆巻き：断面に豆の粒＋ピース間の糸引き
const NATTO_BEANS: Array<[number, number]> = [
  [0.03, 0.02], [-0.03, 0.03], [0, -0.035], [0.045, -0.015], [-0.045, -0.02], [0.01, 0.045],
]

function NattoMaki() {
  const h = 0.58
  const rNori = 0.26, rRice = 0.19, rFill = 0.085
  const pieces: { x: number; rotY: number }[] = [
    { x: -0.19, rotY: 0.28 },
    { x: 0.19, rotY: -0.28 },
  ]
  // 糸引き（ピース間に垂れる細い糸）
  const threads = useMemo(() => {
    const rand = mulberry32(11)
    return [0, 1, 2].map((i) => {
      const z0 = (rand() - 0.5) * 0.14
      const z1 = (rand() - 0.5) * 0.14
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.14 + i * 0.02, 0.6 + rand() * 0.04, z0),
        new THREE.Vector3(-0.02 + i * 0.02, 0.66 + rand() * 0.05, (z0 + z1) / 2),
        new THREE.Vector3(0.12 + i * 0.02, 0.61 + rand() * 0.04, z1),
      ])
    })
  }, [])
  return (
    <group>
      {pieces.map((p, i) => (
        <group key={i} position={[p.x, 0.38, 0]} rotation={[Math.PI / 2, p.rotY, 0]}>
          {/* 海苔 */}
          <mesh>
            <cylinderGeometry args={[rNori, rNori, h, 22, 1, true]} />
            <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* シャリ */}
          <mesh>
            <cylinderGeometry args={[rRice, rRice, h, 20, 1, true]} />
            <meshStandardMaterial color="#f0ece0" roughness={0.85} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* 納豆の詰まり（豆の間の地の色） */}
          <mesh>
            <cylinderGeometry args={[rFill, rFill, h, 14]} />
            <meshStandardMaterial color="#7a5c20" roughness={0.5} metalness={0} />
          </mesh>
          {/* 切り口（両端） */}
          {[h / 2, -h / 2].map((y, j) => (
            <group key={j} position={[0, y, 0]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
              <mesh>
                <ringGeometry args={[rRice, rNori, 22]} />
                <meshStandardMaterial color="#1a2410" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.001]}>
                <ringGeometry args={[rFill, rRice, 22]} />
                <meshStandardMaterial color="#f0ece0" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.002]}>
                <circleGeometry args={[rFill, 16]} />
                <meshStandardMaterial color="#7a5c20" roughness={0.5} />
              </mesh>
              {/* 豆の粒（切り口から少し盛り上がる・ネバネバのツヤ） */}
              {NATTO_BEANS.map(([bx, by], k) => (
                <mesh key={k} position={[bx, by, 0.012]} scale={[1, 0.85, 0.6]}>
                  <sphereGeometry args={[0.028, 10, 8]} />
                  <meshPhysicalMaterial color="#8a6a30" roughness={0.2} metalness={0} clearcoat={0.9} clearcoatRoughness={0.15} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      {/* 糸引き */}
      {threads.map((c, i) => (
        <mesh key={`t${i}`}>
          <tubeGeometry args={[c, 12, 0.005, 5, false]} />
          <meshPhysicalMaterial color="#e6d9a8" roughness={0.25} metalness={0} transparent opacity={0.75} clearcoat={0.6} clearcoatRoughness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function SushiGeometry({ card }: { card: Card }) {
  const archetype = card.archetype[0]
  const name = card.name
  // 専用モデル（名前ベースの判定を先に）
  if (name.includes('ネギトロ')) {
    if (name.includes('巻')) return <MakiPlate base={card.base} negitoro />
    return <NegitoroGunkan /> // ネギトロは軍艦仕立て（海苔付き）
  }
  if (name === '太巻き') return <FutomakiPlate />
  if (name === '納豆巻き') return <NattoMaki />
  if (name === 'たこわさ') return <TakowasaGunkan />
  if (card.base === 'シーフード') return <SeafoodGunkan />
  if (name === '中トロ' || name === '大トロ') return <ToroNigiri kind={name} />
  if (name === 'ツナ軍艦') return <GunkanSushi base="ツナサラダ" /> // マグロ色ではなくツナマヨ色に
  if (name === 'えび軍艦') return <EbiGunkan />
  if (name === 'カニ軍艦') return <KaniGunkan />
  if (name.includes('天')) return <TempuraNigiri tail={card.base === 'えび'} />
  if (card.base === 'いなり') return <InariSushi />
  if (card.base === 'チーズ') return <CheeseNigiri />
  if (archetype === 'niku') return <NikuNigiri base={card.base} />
  if (card.id.includes('gunkan') || card.name.includes('軍艦')) return <GunkanSushi base={card.base} />
  // 鉄火巻きなど archetype が ['akami', 'makimono'] の複合カードも巻物として扱う
  if (card.archetype.includes('makimono') || name.includes('巻き')) return <MakiPlate base={card.base} />
  if (GUNKAN_BASES.has(card.base)) return <GunkanSushi base={card.base} />
  if (card.base === 'えび') return <EbiNigiri topping={card.topping} />
  if (card.base === 'たこ') return <TakoNigiri />
  if (card.base === 'たまご') return <TamagoNigiri />
  return (
    <NigiriSushi
      archetype={archetype}
      base={card.base}
      topping={name === 'アジたたき' ? 'ネギ' : card.topping}
      colorOverride={NIGIRI_NAME_COLOR[name]}
      paleHikari={name === 'シメサバ'}
    />
  )
}

// ─── 3D Plate ─────────────────────────────────────────────────────────────────
// 各皿は「スロット」：左端に消えたら右端から新しいカードとして再登場する
// カードはレーン共有のシャッフルバッグから引く（出現の偏りを防ぐ）

interface BeltPlate3DProps {
  drawCard: () => Card
  laneZ: number
  initialX: number
  speed: number
  wrapWidth: number
  onSelect: (card: Card, markSold: () => void) => void
}

function BeltPlate3D({ drawCard, laneZ, initialX, speed, wrapWidth, onSelect }: BeltPlate3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const posX = useRef(initialX)
  const liftY = useRef(0)
  const [hovered, setHovered] = useState(false)
  const [card, setCard] = useState<Card>(() => drawCard())
  const [sold, setSold] = useState(false)
  const colors = PRICE_COLOR[card.price] ?? PRICE_COLOR[300]

  useFrame((_, delta) => {
    posX.current -= speed * delta
    if (posX.current < LEFT_EDGE) {
      // 右端へ戻し、バッグから新しいカードを補充
      posX.current += wrapWidth
      setCard(drawCard())
      setSold(false)
    }

    const targetY = hovered && !sold ? 0.28 : 0
    liftY.current += (targetY - liftY.current) * 10 * delta

    if (groupRef.current) {
      groupRef.current.position.x = posX.current
      groupRef.current.position.y = liftY.current
    }
  })

  if (sold) {
    // 購入済みの皿（この皿だけ空になり、流れ続けて右から補充される）
    return (
      <group ref={groupRef} position={[initialX, 0, laneZ]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <torusGeometry args={[0.7, 0.035, 6, 24]} />
          <meshStandardMaterial color="#57534e" transparent opacity={0.4} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={groupRef} position={[initialX, 0, laneZ]}>
      {/* Shadow */}
      <mesh position={[0.06, -0.02, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.76, 24]} />
        <meshBasicMaterial color="black" transparent opacity={0.18} />
      </mesh>
      {/* Plate body */}
      <mesh
        position={[0, 0.06, 0]}
        scale={hovered ? [1.12, 1, 1.12] : [1, 1, 1]}
        onClick={(e) => { e.stopPropagation(); onSelect(card, () => setSold(true)) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <cylinderGeometry args={[0.72, 0.72, 0.12, 32]} />
        <meshStandardMaterial color={colors.plate} roughness={0.25} metalness={0.05} />
      </mesh>
      {/* Rim ring */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.08, 32, 1, true]} />
        <meshStandardMaterial color={colors.rim} side={THREE.DoubleSide} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Gloss highlight */}
      <mesh position={[-0.18, 0.125, -0.08]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.45, 1]}>
        <circleGeometry args={[0.22, 16]} />
        <meshBasicMaterial color="white" transparent opacity={0.35} />
      </mesh>
      <SushiGeometry card={card} />
      {/* Card name */}
      <Text
        position={[0, 0.14, 0.58]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.09}
        color="#44403c"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.2}
      >
        {card.name.length > 7 ? card.name.slice(0, 7) + '…' : card.name}
      </Text>
    </group>
  )
}

// ─── Belt lane ────────────────────────────────────────────────────────────────

interface BeltLane3DProps {
  label: string
  cards: Card[]
  duration: number
  laneZ: number
  isShinkansen?: boolean
  onSelect: (card: Card, markSold: () => void) => void
}

function BeltLane3D({ label, cards, duration, laneZ, isShinkansen, onSelect }: BeltLane3DProps) {
  // 皿（スロット）は最大12枚。カードプールが大きくてもベルトの見た目・速度は一定
  const slotCount = Math.min(cards.length, 12)
  const wrapWidth = slotCount * SPACING
  const speed = duration > 0 ? wrapWidth / duration : 0
  const railColor = isShinkansen ? '#ca8a04' : '#57534e'
  const beltColor = isShinkansen ? '#0f0d0b' : '#1c1917'

  // シャッフルバッグ：プール全体を使い切るまで重複なしで引く
  const bagRef = useRef<Card[]>([])
  const drawCard = () => {
    if (bagRef.current.length === 0) bagRef.current = shuffled(cards)
    return bagRef.current.pop()!
  }

  const initialXs = useMemo(
    () => Array.from({ length: slotCount }, (_, i) => LEFT_EDGE + 1 + i * SPACING),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotCount]
  )

  return (
    <group>
      {/* Belt surface */}
      <mesh position={[0, 0, laneZ]}>
        <boxGeometry args={[28, 0.07, 1.8]} />
        <meshStandardMaterial color={beltColor} roughness={0.9} />
      </mesh>
      {/* Side rails */}
      {[-0.95, 0.95].map((dz) => (
        <mesh key={dz} position={[0, 0.09, laneZ + dz]}>
          <boxGeometry args={[28, 0.1, 0.07]} />
          <meshStandardMaterial color={railColor} metalness={isShinkansen ? 0.7 : 0.3} roughness={isShinkansen ? 0.3 : 0.7} />
        </mesh>
      ))}
      {/* Lane label */}
      <Text
        position={[-11.5, 0.35, laneZ - 0.7]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color={isShinkansen ? '#eab308' : '#a8a29e'}
        anchorX="left"
        anchorY="middle"
      >
        {label}
      </Text>
      {/* Plates（スロット式：右端に戻るたびシャッフルバッグから補充） */}
      {initialXs.map((x, i) => (
        <BeltPlate3D
          key={i}
          drawCard={drawCard}
          laneZ={laneZ}
          initialX={x}
          speed={speed}
          wrapWidth={wrapWidth}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

// ─── Shinkansen arriving plate ────────────────────────────────────────────────

function ShinkansenPlate3D({ plate, laneZ, onPickup }: {
  plate: { card: Card } | null
  laneZ: number
  onPickup: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const posX = useRef(14)
  const scaleV = useRef(0)
  const [hovered, setHovered] = useState(false)
  const active = useRef(false)

  useEffect(() => {
    if (plate) { posX.current = 14; scaleV.current = 0; active.current = true }
    else { active.current = false }
  }, [plate])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (active.current && plate) {
      posX.current += (-0.5 - posX.current) * 7 * delta
      scaleV.current += (1 - scaleV.current) * 7 * delta
    } else {
      scaleV.current += (0 - scaleV.current) * 10 * delta
    }
    groupRef.current.position.x = posX.current
    groupRef.current.scale.setScalar(Math.max(0, scaleV.current))
  })

  return (
    <group ref={groupRef} position={[14, 0, laneZ]}>
      {plate && (
        <>
          {/* Glow ring */}
          <mesh position={[0, 0.02, 0]}>
            <torusGeometry args={[0.88, 0.06, 6, 28]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} transparent opacity={0.7} />
          </mesh>
          {/* Gold plate */}
          <mesh
            position={[0, 0.06, 0]}
            scale={hovered ? [1.12, 1, 1.12] : [1, 1, 1]}
            onClick={(e) => { e.stopPropagation(); onPickup() }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
            onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
          >
            <cylinderGeometry args={[0.72, 0.72, 0.12, 32]} />
            <meshStandardMaterial color="#fffbeb" emissive="#f59e0b" emissiveIntensity={0.2} roughness={0.2} metalness={0.2} />
          </mesh>
          {/* Gold rim */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.75, 0.75, 0.08, 32, 1, true]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.2} side={THREE.DoubleSide} />
          </mesh>
          <SushiGeometry card={plate.card} />
          <Text position={[0, 0.5, 0]} rotation={[-Math.PI / 4, 0, 0]} fontSize={0.16} color="#facc15" anchorX="center" anchorY="middle">
            タップで受け取る
          </Text>
        </>
      )}
    </group>
  )
}

// ─── Counter surface ──────────────────────────────────────────────────────────

function Counter() {
  return (
    <group>
      <mesh position={[0, -0.14, 0]} receiveShadow>
        <boxGeometry args={[28, 0.28, 12]} />
        <meshStandardMaterial color="#5c2906" roughness={0.95} />
      </mesh>
      {/* Front edge */}
      <mesh position={[0, -0.01, 5.6]}>
        <boxGeometry args={[28, 0.02, 0.6]} />
        <meshStandardMaterial color="#7c3a10" roughness={0.7} />
      </mesh>
    </group>
  )
}

// ─── Full scene ───────────────────────────────────────────────────────────────

interface SceneProps {
  generalCards: Card[]
  buildCards: Card[]
  shinkansenPlate: { card: Card } | null
  onBeltSelect: (card: Card, markSold: () => void) => void
  onShinkansenPickup: () => void
}

function Scene({ generalCards, buildCards, shinkansenPlate, onBeltSelect, onShinkansenPickup }: SceneProps) {
  const LANE_SHINKANSEN = -2.6
  const LANE_GENERAL = 0
  const LANE_BUILD = 2.6

  return (
    <>
      <color attach="background" args={['#3d1a08']} />
      <fog attach="fog" args={['#1c0a04', 14, 28]} />

      <ambientLight intensity={1.2} color="#fff8ee" />
      <directionalLight position={[4, 9, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-6, 4, 0]} intensity={1.1} color="#ff9944" />
      <pointLight position={[6, 4, 0]} intensity={1.1} color="#ff9944" />
      <pointLight position={[0, 3, 5]} intensity={0.7} color="#ffaa55" />

      <Counter />

      {/* Shinkansen lane (back) */}
      <BeltLane3D
        label="🚄 新幹線レーン"
        cards={[]}
        duration={1}
        laneZ={LANE_SHINKANSEN}
        isShinkansen
        onSelect={() => {}}
      />
      <ShinkansenPlate3D plate={shinkansenPlate} laneZ={LANE_SHINKANSEN} onPickup={onShinkansenPickup} />

      {/* General belt (middle) */}
      <BeltLane3D
        label="汎用・サイドメニュー"
        cards={generalCards}
        duration={32}
        laneZ={LANE_GENERAL}
        onSelect={onBeltSelect}
      />

      {/* Build belt (front) */}
      <BeltLane3D
        label="ビルド系雑多"
        cards={buildCards}
        duration={16}
        laneZ={LANE_BUILD}
        onSelect={onBeltSelect}
      />
    </>
  )
}

// ─── 店員さんの解説モーダル（ビルド・コンボ説明） ─────────────────────────────

const BUILD_GUIDE = [
  { label: '赤身', color: '#dc2626', desc: 'マグロ・トロ系。即時攻撃の火力が高い主力ビルド。' },
  { label: '巻物', color: '#16a34a', desc: '持続型が中心。場に数ターン残ってじわじわ攻める。' },
  { label: '光り物', color: '#2563eb', desc: 'サバ・アジ・コハダ。低〜中コストで手数を出しやすい。' },
  { label: '海鮮', color: '#0891b2', desc: 'たこ・いか・えび系。小回りの利く効果持ちが多い。' },
  { label: '肉寿司', color: '#ea580c', desc: '和牛・カルビなど高コスト高火力のロマン枠。' },
  { label: '汎用', color: '#78716c', desc: 'たまご・サーモンなど低コスト。序盤のテンポと繋ぎに。' },
]

const COMBO_GUIDE = [
  { name: '赤身三種盛り', cond: 'マグロ・中トロ・大トロを各1回召喚', effect: '相手のお腹 +10／以降マグロ系の攻撃 +2' },
  { name: '巻物コンプ', cond: '巻物を5枚召喚', effect: '以降、毎ターンドロー +1' },
  { name: '高級三昧', cond: '500円皿を3枚召喚', effect: '全ステータス +1' },
  { name: '光り物 ※実装予定', cond: '大葉トッピング3枚', effect: '切れ味 ×1.5' },
]

function StaffHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, y: 14 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        style={{
          width: 420, maxWidth: '92%', maxHeight: '84%', overflowY: 'auto',
          borderRadius: 14, background: '#faf7f2', border: '2px solid #d5cec2',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)', padding: '14px 16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#44403c' }}>🧑‍🍳 店員さんの解説</span>
          <button onClick={onClose} style={{ border: 'none', background: '#e7e2d8', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', color: '#78716c', fontWeight: 800 }}>✕</button>
        </div>

        <p style={{ fontSize: 11, fontWeight: 800, color: '#b45309', margin: '0 0 6px' }}>■ ビルド（アーキタイプ）とは</p>
        <p style={{ fontSize: 10, color: '#57534e', margin: '0 0 8px', lineHeight: 1.6 }}>
          同じ系統の寿司を集めるとデッキに軸ができます。系統はカード左上のラベルで確認できます。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {BUILD_GUIDE.map((b) => (
            <div key={b.label} style={{ borderRadius: 8, background: 'white', border: `1px solid ${b.color}44`, padding: '6px 8px' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: b.color }}>● {b.label}</span>
              <p style={{ fontSize: 9, color: '#57534e', margin: '3px 0 0', lineHeight: 1.5 }}>{b.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, fontWeight: 800, color: '#b45309', margin: '0 0 6px' }}>■ コンボ（役）</p>
        <p style={{ fontSize: 10, color: '#57534e', margin: '0 0 8px', lineHeight: 1.6 }}>
          バトル中の召喚を裏でカウントし、条件を満たした瞬間に演出つきで発動します。同一ターンに揃える必要はありません。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {COMBO_GUIDE.map((c) => (
            <div key={c.name} style={{ borderRadius: 8, background: 'white', border: '1px solid #e0d9cc', padding: '6px 9px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#44403c' }}>{c.name}</span>
                <span style={{ fontSize: 8.5, color: '#a8a29e' }}>{c.cond}</span>
              </div>
              <p style={{ fontSize: 9.5, color: '#0891b2', fontWeight: 700, margin: '3px 0 0' }}>{c.effect}</p>
            </div>
          ))}
        </div>

        <div style={{ borderRadius: 8, background: '#fff3c4', border: '1px solid #f0e0b0', padding: '7px 10px' }}>
          <span style={{ fontSize: 9.5, color: '#78350f', fontWeight: 700, lineHeight: 1.6 }}>
            💡 店員のおすすめ：「鉄火巻き」はマグロ(赤身)かつ巻物なので、両方のビルドとコンボを同時に進められる繋ぎの万能カードです。
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

// タブレットのホーム画面タイル（カード絵柄の代表ネタ付き）
const TABLET_TILES = [
  { label: 'おすすめ', color: '#e8381a', card: CARDS.find((c) => c.name === '大トロ') },
  { label: '握り', color: '#0d9488', card: CARDS.find((c) => c.name === 'サーモン') },
  { label: '軍艦 巻物', color: '#16a34a', card: CARDS.find((c) => c.name === 'いくら軍艦') },
  { label: '光り物', color: '#2563eb', card: CARDS.find((c) => c.name === 'アジ') },
  { label: '肉寿司', color: '#b45309', card: CARDS.find((c) => c.name === '和牛にぎり') },
  { label: '汎用 サイド', color: '#78716c', card: CARDS.find((c) => c.name === 'たまご') },
]

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  onComplete: (deck: Card[]) => void
  playerNum?: 1 | 2
  initialBudget?: number   // 追加注文タイムでは¥1500
  seconds?: number         // 追加注文タイムでは短め
}
type SelectedItem = { card: Card; price: number; markSold?: () => void }

export function DraftScreenThree({
  onComplete,
  playerNum,
  initialBudget = INITIAL_BUDGET,
  seconds = DRAFT_SECONDS,
}: Props) {
  const [budget, setBudget] = useState(initialBudget)
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [deck, setDeck] = useState<Card[]>([])
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [shinkansenLeft, setShinkansenLeft] = useState(SHINKANSEN_TOTAL)
  const [showShinkansenModal, setShowShinkansenModal] = useState(false)
  const [shinkansenPlate, setShinkansenPlate] = useState<{ card: Card } | null>(null)
  const [handOpen, setHandOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const deckRef = useRef<Card[]>([])
  const onCompleteRef = useRef(onComplete)
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { deckRef.current = deck }, [deck])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); onCompleteRef.current(deckRef.current); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const clearAutoClose = () => {
    if (autoCloseTimer.current) { clearTimeout(autoCloseTimer.current); autoCloseTimer.current = null }
  }

  const handleBeltSelect = (card: Card, markSold: () => void) => {
    clearAutoClose()
    setSelected({ card, price: card.price, markSold })
    autoCloseTimer.current = setTimeout(() => setSelected(null), 10000)
  }

  const handlePurchase = (card: Card) => {
    clearAutoClose()
    if (!selected || budget < selected.price || deck.length >= 20) return
    setBudget(b => b - selected.price)
    setDeck(d => [...d, card])
    selected.markSold?.()  // 買った皿だけをベルトから消す
    setSelected(null)
  }

  const handleModalClose = () => { clearAutoClose(); setSelected(null) }

  const handleShinkansenOrder = (card: Card, premiumPrice: number) => {
    if (budget < premiumPrice || deck.length >= 20) return
    setBudget(b => b - premiumPrice)
    setShinkansenLeft(n => n - 1)
    setShowShinkansenModal(false)
    setShinkansenPlate({ card })
  }

  const handleShinkansenPickup = () => {
    if (!shinkansenPlate) return
    setDeck(d => [...d, shinkansenPlate.card])
    setShinkansenPlate(null)
  }

  const generalCards = getCardsByLane('general')
  // 全ビルドカードが対象（レーン側のシャッフルバッグで満遍なく流れる）
  const buildCards = useMemo(() => getCardsByLane('build'), [])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const urgent = timeLeft <= 20
  const canOrder = shinkansenLeft > 0 && !shinkansenPlate

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0 z-10"
        style={{ background: '#2c1006', borderBottom: '1px solid #78350f' }}>
        <div className="flex items-center gap-2">
          <div className={`font-mono text-lg font-bold tabular-nums tracking-wider ${urgent ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
            ⏱ {mins}:{String(secs).padStart(2, '0')}
          </div>
          {playerNum && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#78350f', color: '#fde68a' }}>
              P{playerNum}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-600">デッキ </span>
          <span className="text-amber-200 font-bold">{deck.length}</span>
          <span className="text-amber-600">/20</span>
        </div>
        <div className="text-yellow-400 font-bold text-lg tabular-nums">¥{budget.toLocaleString()}</div>
      </div>

      {/* 3D Canvas + HTML オーバーレイ */}
      <div className="flex-1 relative overflow-hidden">
        {/* Three.js scene */}
        <Canvas
          className="absolute inset-0"
          camera={{ position: [0, 5, 7.5], fov: 52 }}
          shadows
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Scene
              generalCards={generalCards}
              buildCards={buildCards}
              shinkansenPlate={shinkansenPlate}
              onBeltSelect={handleBeltSelect}
              onShinkansenPickup={handleShinkansenPickup}
            />
          </Suspense>
        </Canvas>

        {/* タブレット端末 HTML オーバーレイ（実店舗の注文パネル風） */}
        <div className="absolute top-3 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-center">
            <motion.div
              initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              style={{
                width: 340, borderRadius: 18,
                background: 'linear-gradient(170deg, #f8f6f2, #e5e0d6)',
                border: '1px solid #c8c2b6',
                boxShadow: '0 14px 36px rgba(0,0,0,0.85), inset 0 1px 2px rgba(255,255,255,0.8)',
                padding: '6px 9px 7px',
                display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
              }}
            >
              {/* カメラ */}
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3a4a3a', boxShadow: canOrder ? '0 0 3px #4ade80' : 'none' }} />
              {/* 画面 */}
              <div style={{
                width: '100%', height: 178, borderRadius: 9, overflow: 'hidden',
                background: '#eef1f5', border: '2px solid #b0aa9e',
                display: 'flex', position: 'relative' as const,
              }}>
                {/* 左：カテゴリタイル＋下部バー */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const }}>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr', gap: 4, padding: 5 }}>
                    {TABLET_TILES.map((c) => (
                      <div
                        key={c.label}
                        onClick={canOrder ? () => setShowShinkansenModal(true) : undefined}
                        style={{
                          borderRadius: 6, overflow: 'hidden', background: 'white',
                          border: '1px solid #d5d0c6', boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                          display: 'flex', flexDirection: 'column' as const,
                          cursor: canOrder ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ background: c.color, padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                          <span style={{ color: 'white', fontSize: 7.5, fontWeight: 800, whiteSpace: 'nowrap' as const }}>{c.label}</span>
                        </div>
                        <div style={{
                          flex: 1, position: 'relative' as const, minHeight: 0,
                          background: 'linear-gradient(180deg, #fdfcfa, #f0ede6)',
                        }}>
                          {c.card && (
                            <div style={{ position: 'absolute' as const, inset: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ height: '100%', maxWidth: '90%', aspectRatio: '100 / 74' }}>
                                <SushiArt card={c.card} size="100%" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 下部バー */}
                  <div style={{ display: 'flex', gap: 4, padding: '0 5px 5px', alignItems: 'stretch' }}>
                    <div onClick={() => setShowHelp(true)} style={{ background: '#1e3a5f', borderRadius: 5, padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <span style={{ fontSize: 8 }}>🧑‍🍳</span>
                      <span style={{ color: 'white', fontSize: 8, fontWeight: 800 }}>店員に聞く</span>
                    </div>
                    <div style={{ background: 'white', border: '1px solid #d5d0c6', borderRadius: 5, padding: '3px 6px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: '#57534e', fontSize: 8, fontWeight: 700 }}>💬 日本語</span>
                    </div>
                    <div onClick={() => setShowHelp(true)} style={{ marginLeft: 'auto', background: 'white', border: '1px solid #d5d0c6', borderRadius: 5, padding: '3px 6px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <span style={{ color: '#57534e', fontSize: 8, fontWeight: 700 }}>❓ 操作説明</span>
                    </div>
                  </div>
                </div>
                {/* 右：注文の状況サイドバー */}
                <div style={{ width: 96, background: '#1c2844', display: 'flex', flexDirection: 'column' as const, padding: 5, gap: 4 }}>
                  <span style={{ color: '#cbd5f0', fontSize: 8, fontWeight: 800, textAlign: 'center' as const }}>注文の状況</span>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#93a5d0', fontSize: 7 }}>特急のこり</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < shinkansenLeft ? '#facc15' : 'rgba(255,255,255,0.15)' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '3px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#93a5d0', fontSize: 7 }}>手札</span>
                    <span style={{ color: 'white', fontSize: 8, fontWeight: 800 }}>{deck.length}<span style={{ color: '#93a5d0', fontSize: 6 }}>/20枚</span></span>
                  </div>
                  <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#93a5d0', fontSize: 7 }}>利用額</span>
                      <span style={{ color: 'white', fontSize: 8, fontWeight: 700 }}>¥{(initialBudget - budget).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#93a5d0', fontSize: 7 }}>残高</span>
                      <span style={{ color: '#facc15', fontSize: 9, fontWeight: 800 }}>¥{budget.toLocaleString()}</span>
                    </div>
                  </div>
                  <div onClick={() => onComplete(deck)} style={{ background: 'linear-gradient(180deg, #f97316, #ea580c)', borderRadius: 5, padding: '4px 0', textAlign: 'center' as const, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                    <span style={{ color: 'white', fontSize: 8.5, fontWeight: 800 }}>お会計する ▶</span>
                  </div>
                </div>
                {/* 特急終了時：カテゴリ側のみ暗くする */}
                {!canOrder && (
                  <div style={{ position: 'absolute' as const, left: 0, top: 0, bottom: 0, right: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,20,20,0.55)' }}>
                    <span style={{ color: 'white', fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '4px 10px' }}>特急注文は本日終了</span>
                  </div>
                )}
                {/* 画面のテカリ */}
                <div style={{
                  position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const,
                  background: 'linear-gradient(115deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 26%, transparent 42%)',
                }} />
              </div>
              {/* ロゴ */}
              <span style={{ fontSize: 7, color: '#8a8478', fontWeight: 800, letterSpacing: 3 }}>すしバトル</span>
            </motion.div>
            <div style={{ width: 12, height: 12, background: '#8a8478', borderRadius: '0 0 3px 3px' }} />
            <div style={{ width: 44, height: 5, background: '#6e6a60', borderRadius: 3 }} />
          </div>
        </div>

        {/* Modals */}
        {selected && (
          <PurchaseModal card={selected.card} displayPrice={selected.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
        )}
        {showShinkansenModal && (
          <ShinkansenOrderModal budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)} />
        )}
        <AnimatePresence>
          {showHelp && <StaffHelpModal onClose={() => setShowHelp(false)} />}
        </AnimatePresence>
      </div>

      {/* 手札パネル */}
      <div className="flex-shrink-0 z-10" style={{ borderTop: '1px solid #78350f' }}>
        <button onClick={() => setHandOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-2" style={{ background: '#2c1006' }}>
          <span className="text-amber-400 text-sm font-bold">🀄 手札 ({deck.length}枚)</span>
          <span className="text-amber-600 text-xs">{handOpen ? '▼ 閉じる' : '▲ 確認する'}</span>
        </button>
        <AnimatePresence>
          {handOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 120, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="overflow-hidden" style={{ background: '#1c0c04' }}
            >
              <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto">
                {deck.length === 0 ? (
                  <p className="text-stone-600 text-sm w-full text-center">まだ購入していません</p>
                ) : deck.map((card, i) => {
                  const s = ARCHETYPE_STYLE[card.archetype[0]] ?? ARCHETYPE_STYLE.general
                  return (
                    <div key={`hand-${i}`} className="flex-shrink-0 flex flex-col overflow-hidden"
                      style={{ width: 56, height: 80, borderRadius: 7, background: s.bg, border: `2px solid ${s.text}44`, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      <div style={{ background: s.text + '33', padding: '2px 4px', borderBottom: `1px solid ${s.text}44` }}>
                        <p style={{ color: s.text, fontSize: 7, fontWeight: 'bold', lineHeight: 1 }}>{s.label}</p>
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 3px' }}>
                        <p style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.3, wordBreak: 'keep-all' }}>{card.name}</p>
                      </div>
                      <div style={{ padding: '2px 4px', background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: s.text, fontSize: 7, fontWeight: 'bold' }}>{card.cost}AP</span>
                        <span style={{ color: '#fbbf24', fontSize: 7, fontWeight: 'bold' }}>⚔{card.attack}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* バトルへ進むボタン */}
      <button
        onClick={() => onComplete(deck)}
        style={{
          position: 'absolute', bottom: 52, right: 12, zIndex: 50,
          padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 800,
          background: '#ea580c', color: '#fff', border: '1px solid #fb923c',
          cursor: 'pointer', boxShadow: '0 0 16px rgba(234,88,12,0.5)',
        }}
      >
        ⚔ バトルへ ({deck.length}枚)
      </button>
    </div>
  )
}
