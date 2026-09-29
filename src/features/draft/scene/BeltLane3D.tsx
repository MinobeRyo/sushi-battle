import type { Card } from '../../../types'
import { useRef, useState, useMemo, useId, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { SushiGeometry } from '../models/SushiGeometry'
import { Html, Text } from '@react-three/drei'
import * as THREE from 'three'
import { PlateHitTarget } from './PlateHitTarget'
import { onlinePlatePosition, sideMenuForBeltSlot } from '../../../game/draftOffers'
import { SIDE_MENU_BY_ID, type SideMenuId } from '../../../data/sideMenus'
import { SideMenuModel } from '../../side-menu/models/SideMenuModel'
import type { DraftLane, DraftOffer } from '../../../game/draftOffers'

export type OnlineBeltSupply = {
  offers: DraftOffer[]
  elapsed: (lane: DraftLane) => number
}

type PlateContents = { card: Card; sideMenuId?: never } | { card?: never; sideMenuId: SideMenuId }
export type SideMenuSelectHandler = (id: SideMenuId, markSold: () => boolean, offerId: string) => void

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
  offer?: DraftOffer
  elapsed?: () => number
  drawCard: () => Card
  lane: DraftLane
  slot: number
  sideMenuStartGeneration: number
  sideMenusEnabled: boolean
  sideMenuPurchased: boolean
  onSideMenuSelect?: SideMenuSelectHandler
  laneZ: number
  initialX: number
  speed: number
  wrapWidth: number
  paused: boolean
  hideLabels?: boolean
  portraitLabels?: boolean
  onlinePositionScale?: number
  onSelect: (card: Card, markSold: () => boolean, offerId: string) => void
}

function BeltPlate3D({ offer, elapsed, drawCard, lane, slot, sideMenuStartGeneration, sideMenusEnabled, sideMenuPurchased, onSideMenuSelect, laneZ, initialX, speed, wrapWidth, onSelect, paused, hideLabels = false, portraitLabels = false, onlinePositionScale = 1 }: BeltPlate3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const labelRef = useRef<HTMLButtonElement>(null)
  const labelPosition = useMemo(() => new THREE.Vector3(), [])
  const posX = useRef(initialX)
  const slotId = useId()
  const generationRef = useRef(0)
  const soldRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const drawLocalDish = (generation: number): PlateContents => {
    const sideMenuId = sideMenuForBeltSlot(lane, slot, generation + sideMenuStartGeneration, sideMenusEnabled)
    return sideMenuId ? { sideMenuId } : { card: drawCard() }
  }
  const [localDish, setDish] = useState<PlateContents & { generation: number }>(() => offer ?? ({ ...drawLocalDish(0), generation: 0 }))
  const { card, sideMenuId, generation } = offer ?? localDish
  const [sold, setSold] = useState(false)
  const item = sideMenuId ? SIDE_MENU_BY_ID[sideMenuId] : card!
  const colors = PRICE_COLOR[item.price] ?? PRICE_COLOR[300]

  const clearHover = () => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  useEffect(() => () => {
    document.body.style.cursor = 'auto'
  }, [])

  const notifySelection = (markSold: () => boolean, offerId: string) => {
    if (sideMenuId) onSideMenuSelect?.(sideMenuId, markSold, offerId)
    else if (card) onSelect(card, markSold, offerId)
  }

  const select = () => {
    if (offer && elapsed) {
      if (offer.sold || onlinePlatePosition(offer.lane, offer.slot, elapsed()).generation !== offer.generation) return
      clearHover()
      notifySelection(() => true, offer.id)
      return
    }
    if (soldRef.current || generationRef.current !== generation) return
    clearHover()
    notifySelection(() => {
      if (soldRef.current || generationRef.current !== generation) return false
      soldRef.current = true
      clearHover()
      setSold(true)
      return true
    }, `${slotId}:${generation}`)
  }

  useFrame(({ camera, size }, delta) => {
    if (offer && elapsed) {
      const position = onlinePlatePosition(offer.lane, offer.slot, elapsed())
      if (groupRef.current) {
        // 表示間隔だけを広げる。時刻・周回・購入できる皿の判定はサーバーと共通。
        groupRef.current.position.x = position.x * onlinePositionScale
        groupRef.current.visible = position.generation === offer.generation
      }
    } else {
      if (!paused) posX.current -= speed * Math.min(delta, 0.1)
      if (posX.current < LEFT_EDGE) {
        // 右端へ戻し、バッグから新しいカードを補充
        posX.current += wrapWidth
        generationRef.current += 1
        soldRef.current = false
        setDish({ ...drawLocalDish(generationRef.current), generation: generationRef.current })
        setSold(false)
      }

      if (groupRef.current) groupRef.current.position.x = posX.current
    }

    if (portraitLabels && groupRef.current && labelRef.current) {
      groupRef.current.updateWorldMatrix(true, false)
      labelPosition.set(-1.5, 0.1, 0).applyMatrix4(groupRef.current.matrixWorld).project(camera)
      const y = (1 - labelPosition.y) * size.height / 2
      const visible = groupRef.current.visible && Math.abs(labelPosition.x) < 1 && y >= 24 && y <= size.height - 24
      // 画面外や期限切れの皿は、ラベルからも選択・Tab移動できない。
      labelRef.current.inert = !visible
      labelRef.current.style.visibility = visible ? 'visible' : 'hidden'
    }
  })

  if (offer ? offer.sold : sold) {
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
      <group scale={sideMenuId ? [1, 1.1, 1.12] : undefined}>
      <PlateHitTarget
        onClick={(e) => {
          e.stopPropagation()
          select()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (e.pointerType === 'touch') return
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={clearHover}
      />
      </group>
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
      {sideMenuId ? <group position={[0, 0.115, 0]} scale={0.55}>
        <SideMenuModel id={sideMenuId} />
      </group> : card && <SushiGeometry card={card} />}
      {hovered && (
        <>
          <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.84, 0.9, 40]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          {!portraitLabels && <Html center position={[0, 1.2, 0]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #d9a55e', background: '#2c1006ee', color: '#fff2d9', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {item.name} <span style={{ color: '#fcd34d' }}>¥{item.price}</span>
              {sideMenuId && <small style={{ display: 'block', marginTop: 3, color: '#d9e5b3', fontSize: 10 }}>{sideMenuPurchased ? 'サイドは購入済み · 詳細を見る' : 'サイドメニュー · 1試合に1品'}</small>}
            </div>
          </Html>}
        </>
      )}
      {portraitLabels && <Html center position={[-1.5, 0.1, 0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
        <button type="button" ref={labelRef} className="vd-three-plate-label" style={{ pointerEvents: 'auto', visibility: 'hidden' }}
          onClick={event => { event.stopPropagation(); select() }}
          onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true) }}
          onPointerLeave={clearHover}
          onFocus={() => setHovered(true)} onBlur={clearHover}
          aria-label={`${item.name}、${item.price}円。${sideMenuId ? sideMenuPurchased ? 'サイドは購入済み。' : 'サイドメニュー。' : ''}詳細を見る`}
        >
          <span>{item.name}</span><strong>¥{item.price.toLocaleString()}</strong>
        </button>
      </Html>}
      {/* Card name */}
      {!hideLabels && <Text
        position={[0, 0.14, 0.58]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.09}
        color="#44403c"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.2}
      >
        {sideMenuId ? `${item.name}\n¥${item.price}` : item.name.length > 7 ? item.name.slice(0, 7) + '…' : item.name}
      </Text>}
    </group>
  )
}

// ─── Belt lane ────────────────────────────────────────────────────────────────

interface BeltLane3DProps {
  supply?: OnlineBeltSupply
  lane?: DraftLane
  sideMenusEnabled?: boolean
  sideMenuPurchased?: boolean
  onSideMenuSelect?: SideMenuSelectHandler
  label: string
  cards: Card[]
  duration: number
  laneZ: number
  isShinkansen?: boolean
  paused?: boolean
  hideLabels?: boolean
  portraitLabels?: boolean
  plateSpacing?: number
  onSelect: (card: Card, markSold: () => boolean, offerId: string) => void
}

export function BeltLane3D({ supply, lane = 'general', sideMenusEnabled = false, sideMenuPurchased = false, onSideMenuSelect, label, cards, duration, laneZ, isShinkansen, onSelect, paused = false, hideLabels = false, portraitLabels = false, plateSpacing = SPACING }: BeltLane3DProps) {
  // ローカルだけ、開始時のサイド2品を一度選びます。皿の実世代・ID・売約判定は変えません。
  const [sideMenuStartGeneration] = useState(() => !supply && lane === 'general' && sideMenusEnabled ? Math.floor(Math.random() * 3) : 0)
  // 皿（スロット）は最大12枚。カードプールが大きくてもベルトの見た目・速度は一定
  const slotCount = supply?.offers.length ?? Math.min(cards.length, 12)
  const onlinePositionScale = plateSpacing / SPACING
  const wrapWidth = slotCount * plateSpacing
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
    () => Array.from({ length: slotCount }, (_, i) => supply
      ? (LEFT_EDGE + 1 + i * SPACING) * onlinePositionScale
      : LEFT_EDGE + 1 + i * plateSpacing),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotCount, Boolean(supply), plateSpacing, onlinePositionScale]
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
      {!hideLabels && <Text
        position={[-11.5, 0.35, laneZ - 0.7]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color={isShinkansen ? '#eab308' : '#a8a29e'}
        anchorX="left"
        anchorY="middle"
      >
        {label}
      </Text>}
      {/* Plates（スロット式：右端に戻るたびシャッフルバッグから補充） */}
      {initialXs.map((x, i) => (
        <BeltPlate3D
          key={i}
          offer={supply?.offers[i]}
          elapsed={supply && (() => supply.elapsed(supply.offers[i].lane))}
          drawCard={drawCard}
          lane={lane}
          slot={i}
          sideMenuStartGeneration={sideMenuStartGeneration}
          sideMenusEnabled={sideMenusEnabled}
          sideMenuPurchased={sideMenuPurchased}
          onSideMenuSelect={onSideMenuSelect}
          laneZ={laneZ}
          initialX={x}
          speed={speed}
          wrapWidth={wrapWidth}
          paused={paused}
          hideLabels={hideLabels}
          portraitLabels={portraitLabels}
          onlinePositionScale={onlinePositionScale}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
