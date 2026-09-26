import type { Card } from '../../../types'
import { useRef, useState, useMemo, useId, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { SushiGeometry } from '../models/SushiGeometry'
import { Html, Text } from '@react-three/drei'
import * as THREE from 'three'
import { PLATE_HIT_POSITION, PLATE_HIT_SIZE } from './plateHitArea'

const SPACING = 2.3 // world-unit spacing between plates

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

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
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
  isPaused: () => boolean
  hoveredSlots: Set<string>
  onSelect: (card: Card, markSold: () => boolean, offerId: string) => void
}

function BeltPlate3D({ drawCard, laneZ, initialX, speed, wrapWidth, onSelect, isPaused, hoveredSlots }: BeltPlate3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const posX = useRef(initialX)
  const slotId = useId()
  const generationRef = useRef(0)
  const soldRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [{ card, generation }, setCard] = useState(() => ({ card: drawCard(), generation: 0 }))
  const [sold, setSold] = useState(false)
  const colors = PRICE_COLOR[card.price] ?? PRICE_COLOR[300]

  const clearHover = () => {
    hoveredSlots.delete(slotId)
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  useEffect(() => () => {
    hoveredSlots.delete(slotId)
    document.body.style.cursor = 'auto'
  }, [hoveredSlots, slotId])

  useFrame((_, delta) => {
    if (!isPaused()) posX.current -= speed * Math.min(delta, 0.1)
    if (posX.current < LEFT_EDGE) {
      // 右端へ戻し、バッグから新しいカードを補充
      posX.current += wrapWidth
      generationRef.current += 1
      soldRef.current = false
      setCard({ card: drawCard(), generation: generationRef.current })
      setSold(false)
    }

    if (groupRef.current) {
      groupRef.current.position.x = posX.current
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
      >
        <cylinderGeometry args={[0.72, 0.72, 0.12, 32]} />
        <meshStandardMaterial color={colors.plate} roughness={0.25} metalness={0.05} />
      </mesh>
      {/* 寿司の高さと皿の周りを含む、見た目より少し広いクリック領域。 */}
      <mesh
        position={PLATE_HIT_POSITION}
        onClick={(e) => {
          e.stopPropagation()
          if (soldRef.current || generationRef.current !== generation) return
          clearHover()
          onSelect(card, () => {
            if (soldRef.current || generationRef.current !== generation) return false
            soldRef.current = true
            clearHover()
            setSold(true)
            return true
          }, `${slotId}:${generation}`)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (e.pointerType === 'touch') return
          hoveredSlots.add(slotId)
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={clearHover}
      >
        <boxGeometry args={PLATE_HIT_SIZE} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
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
      {hovered && (
        <>
          <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.84, 0.9, 40]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <Html center position={[0, 1.2, 0]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #d9a55e', background: '#2c1006ee', color: '#fff2d9', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {card.name} <span style={{ color: '#fcd34d' }}>¥{card.price}</span>
            </div>
          </Html>
        </>
      )}
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
  paused?: boolean
  onSelect: (card: Card, markSold: () => boolean, offerId: string) => void
}

export function BeltLane3D({ label, cards, duration, laneZ, isShinkansen, onSelect, paused = false }: BeltLane3DProps) {
  const hoveredSlots = useRef(new Set<string>())
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
          isPaused={() => paused || hoveredSlots.current.size > 0}
          hoveredSlots={hoveredSlots.current}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
