import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'
import { ShinkansenOrderModal } from './ShinkansenOrderModal'
import { PurchaseModal } from './PurchaseModal'
import { getCardsByLane } from '../../data/cards'
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
  hikari:   { color: '#b0bec5', roughness: 0.22, metalness: 0.38 },
  kaisen:   { color: '#e8733a', roughness: 0.55, metalness: 0.0 },
  niku:     { color: '#7c3014', roughness: 0.75, metalness: 0.0 },
  makimono: { color: '#2d5a1b', roughness: 0.80, metalness: 0.0 },
  general:  { color: '#f5c518', roughness: 0.50, metalness: 0.0 },
}

const BASE_NETA_COLOR: Record<string, string> = {
  'たまご': '#f5c518', 'サーモン': '#e8722a', 'えび': '#e05050',
  'いか': '#e8e4dc', 'たこ': '#b24f8a', 'なす': '#6b2fa0',
  'アボカド': '#5d8a3c', 'うに': '#f0a830', 'いくら': '#e03020',
  'コーン': '#f5c518', 'チーズ': '#f0d060', '明太子': '#e03828',
  'きゅうり': '#4a9a38', 'かんぴょう': '#c8b478', 'かに': '#d94030',
  'マグロ': '#b01020', 'アジ': '#9ab0c0', 'サバ': '#8090a8',
  'コハダ': '#788898', '和牛': '#7c3014', 'カルビ': '#8c3818',
  'うめ': '#d04060', '納豆': '#b89040',
  'いなり': '#c8883c', 'ツナサラダ': '#ded0b2',
}

const ARCHETYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  akami:    { bg: '#7f1d1d', text: '#fca5a5', label: '赤身' },
  makimono: { bg: '#14532d', text: '#86efac', label: '巻物' },
  hikari:   { bg: '#1e3a5f', text: '#93c5fd', label: '光り物' },
  kaisen:   { bg: '#164e63', text: '#67e8f9', label: '海鮮' },
  niku:     { bg: '#7c2d12', text: '#fdba74', label: '肉寿司' },
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

const GUNKAN_BASES = new Set(['うに', 'いくら', 'とびこ', 'コーン', '明太子', '納豆', 'うめ', 'チーズ', 'アボカド'])

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
      <meshPhysicalMaterial
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

// サーモン・えび用の白い筋テクスチャ（Canvas生成）
function useStripeTexture(base: string, color: string): THREE.Texture | null {
  return useMemo(() => {
    if (base !== 'サーモン' && base !== 'えび') return null
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

function NigiriSushi({ archetype, base }: { archetype: string; base: string }) {
  const mat = NETA_MAT[archetype] ?? NETA_MAT.general
  const netaColor = BASE_NETA_COLOR[base] ?? mat.color
  const stripeTex = useStripeTexture(base, netaColor)
  return (
    <group>
      {/* シャリ - ふっくらした楕円 */}
      <mesh position={[0, 0.29, 0]} scale={[1.52, 0.56, 0.88]}>
        <sphereGeometry args={[0.31, 28, 20]} />
        <meshStandardMaterial color="#f5f0e8" roughness={0.88} metalness={0} />
      </mesh>
      {/* ネタ - シャリの上から両端に垂れ下がる曲面 */}
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={netaColor} roughness={mat.roughness} metalness={mat.metalness} map={stripeTex} />
      </group>
      {/* たまごの海苔帯 */}
      {base === 'たまご' && (
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.22, 0.54, 0.66]} />
          <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
        </mesh>
      )}
    </group>
  )
}

// 粒もの軍艦（いくら・とびこ・コーン・納豆）の粒配置（決め打ちで自然なばらつき）
const GUNKAN_DOT_BASES = new Set(['いくら', 'とびこ', 'コーン', '納豆'])
const GUNKAN_DOTS: Array<[number, number, number]> = [
  [0, 0.60, 0], [0.13, 0.58, 0.07], [-0.13, 0.58, 0.05], [0.06, 0.59, -0.11],
  [-0.08, 0.58, -0.10], [0.19, 0.55, -0.04], [-0.19, 0.55, -0.02], [0.01, 0.59, 0.13],
  [0.11, 0.56, 0.14], [-0.12, 0.56, 0.13], [0.20, 0.54, 0.09], [-0.21, 0.54, 0.08],
]

function GunkanSushi({ base }: { base: string }) {
  const toppingColor = BASE_NETA_COLOR[base] ?? '#f0a830'
  const isDots = GUNKAN_DOT_BASES.has(base)
  return (
    <group scale={[1.45, 1, 0.85]}>
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
      {isDots ? (
        <>
          {/* シャリの盛り（粒の土台） */}
          <mesh position={[0, 0.48, 0]} scale={[1, 0.55, 1]}>
            <sphereGeometry args={[0.29, 18, 12]} />
            <meshStandardMaterial color="#f5f0e8" roughness={0.85} metalness={0} />
          </mesh>
          {/* 粒（ツヤのある小球） */}
          {GUNKAN_DOTS.map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]}>
              <sphereGeometry args={[0.075, 12, 10]} />
              <meshPhysicalMaterial
                color={toppingColor}
                roughness={0.12}
                metalness={0}
                clearcoat={1}
                clearcoatRoughness={0.12}
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

function MakiPlate({ base }: { base: string }) {
  const fillColor = BASE_NETA_COLOR[base] ?? '#f5c518'
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
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

function SushiGeometry({ card }: { card: Card }) {
  const archetype = card.archetype[0]
  if (card.id.includes('gunkan') || card.name.includes('軍艦')) return <GunkanSushi base={card.base} />
  if (archetype === 'makimono') return <MakiPlate base={card.base} />
  if (GUNKAN_BASES.has(card.base)) return <GunkanSushi base={card.base} />
  return <NigiriSushi archetype={archetype} base={card.base} />
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

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { onComplete: (deck: Card[]) => void }
type SelectedItem = { card: Card; price: number; markSold?: () => void }

export function DraftScreenThree({ onComplete }: Props) {
  const [budget, setBudget] = useState(INITIAL_BUDGET)
  const [timeLeft, setTimeLeft] = useState(DRAFT_SECONDS)
  const [deck, setDeck] = useState<Card[]>([])
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [shinkansenLeft, setShinkansenLeft] = useState(SHINKANSEN_TOTAL)
  const [showShinkansenModal, setShowShinkansenModal] = useState(false)
  const [shinkansenPlate, setShinkansenPlate] = useState<{ card: Card } | null>(null)
  const [handOpen, setHandOpen] = useState(false)

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
        <div className={`font-mono text-lg font-bold tabular-nums tracking-wider ${urgent ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
          ⏱ {mins}:{String(secs).padStart(2, '0')}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#0c4a6e', color: '#7dd3fc' }}>
            ◈ Three.js
          </span>
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

        {/* タブレット端末 HTML オーバーレイ */}
        <div className="absolute top-3 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-center">
            <motion.button
              onClick={canOrder ? () => setShowShinkansenModal(true) : undefined}
              whileHover={canOrder ? { scale: 1.04, y: -4 } : {}}
              whileTap={canOrder ? { scale: 0.96 } : {}}
              transition={{ type: 'spring', stiffness: 380, damping: 24 }}
              style={{
                width: 220, height: 140, borderRadius: 12,
                background: canOrder
                  ? 'linear-gradient(160deg, #ddd 0%, #bbb 50%, #ccc 100%)'
                  : 'linear-gradient(160deg, #555 0%, #333 100%)',
                border: `4px solid ${canOrder ? '#aaa' : '#222'}`,
                boxShadow: canOrder
                  ? '0 12px 32px rgba(0,0,0,0.9), inset 0 1px 3px rgba(255,255,255,0.5)'
                  : '0 6px 16px rgba(0,0,0,0.7)',
                display: 'flex', flexDirection: 'column' as const,
                alignItems: 'center', padding: '5px 7px 7px', gap: 4,
                cursor: canOrder ? 'pointer' : 'default',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: canOrder ? '#888' : '#333' }} />
              <div style={{
                flex: 1, width: '100%', borderRadius: 7, overflow: 'hidden',
                background: canOrder ? '#faf7f2' : '#050505',
                border: `2px solid ${canOrder ? '#b8b0a0' : '#000'}`,
                display: 'flex', flexDirection: 'column' as const,
              }}>
                {canOrder ? (
                  <>
                    <div style={{ background: '#e8381a', padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>🚄 特急注文</span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[...Array(3)].map((_, i) => (
                          <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < shinkansenLeft ? '#facc15' : 'rgba(255,255,255,0.2)' }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, padding: '5px 6px' }}>
                      {[
                        { label: '赤身', color: '#dc2626' }, { label: '巻物', color: '#16a34a' },
                        { label: '光り物', color: '#2563eb' }, { label: '海鮮', color: '#0891b2' },
                        { label: '肉寿司', color: '#ea580c' }, { label: '汎用', color: '#78716c' },
                      ].map(c => (
                        <div key={c.label} style={{ borderRadius: 4, background: c.color + '1a', border: `1.5px solid ${c.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: c.color, fontSize: 10, fontWeight: 'bold' }}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: '#e8381a', padding: '4px', textAlign: 'center' as const }}>
                      <span style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>タップして注文する</span>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#555', fontSize: 12, fontWeight: 'bold' }}>本日終了</span>
                  </div>
                )}
              </div>
              <div style={{ width: 40, height: 3, borderRadius: 2, background: canOrder ? '#aaa' : '#333' }} />
            </motion.button>
            <div style={{ width: 9, height: 10, background: '#777', borderRadius: '0 0 3px 3px' }} />
            <div style={{ width: 28, height: 4, background: '#666', borderRadius: 3 }} />
          </div>
        </div>

        {/* Modals */}
        {selected && (
          <PurchaseModal card={selected.card} displayPrice={selected.price} isPremium={false} budget={budget} deckCount={deck.length} onPurchase={handlePurchase} onClose={handleModalClose} />
        )}
        {showShinkansenModal && (
          <ShinkansenOrderModal budget={budget} onOrder={handleShinkansenOrder} onClose={() => setShowShinkansenModal(false)} />
        )}
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
