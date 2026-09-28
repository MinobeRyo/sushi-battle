import type { Card } from '../../../types'
import { BeltLane3D } from './BeltLane3D'
import type { OnlineBeltSupply } from './BeltLane3D'
import { ShinkansenPlate3D } from './ShinkansenPlate3D'
import { DraftCamera } from './DraftCamera'

// 選択中やホバー中は停止できるので、通常時は従来より20%速く流す。
const BELT_SPEED_MULTIPLIER = 1.2

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
  onlineSupply?: OnlineBeltSupply
  generalCards: Card[]
  buildCards: Card[]
  shinkansenPlate: { card: Card } | null
  onBeltSelect: (card: Card, markSold: () => boolean, offerId: string) => void
  onShinkansenPickup: () => void
  paused?: boolean
  sevenPlates?: boolean
}

export function Scene({ onlineSupply, generalCards, buildCards, shinkansenPlate, onBeltSelect, onShinkansenPickup, paused = false, sevenPlates = false }: SceneProps) {
  const LANE_SHINKANSEN = -2.6
  const LANE_GENERAL = 0
  const LANE_BUILD = 2.6

  return (
    <>
      <DraftCamera sevenPlates={sevenPlates} />
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
        supply={onlineSupply && { ...onlineSupply, offers: onlineSupply.offers.filter(offer => offer.lane === 'general') }}
        duration={32 / BELT_SPEED_MULTIPLIER}
        laneZ={LANE_GENERAL}
        paused={paused}
        onSelect={onBeltSelect}
      />

      {/* Build belt (front) */}
      <BeltLane3D
        label="ビルド系雑多"
        cards={buildCards}
        supply={onlineSupply && { ...onlineSupply, offers: onlineSupply.offers.filter(offer => offer.lane === 'build') }}
        duration={16 / BELT_SPEED_MULTIPLIER}
        laneZ={LANE_BUILD}
        paused={paused}
        onSelect={onBeltSelect}
      />
    </>
  )
}
