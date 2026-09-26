import type { Card } from '../../../types'
import { BeltLane3D } from './BeltLane3D'
import { ShinkansenPlate3D } from './ShinkansenPlate3D'
import { DraftCamera } from './DraftCamera'

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
  onBeltSelect: (card: Card, markSold: () => boolean, offerId: string) => void
  onShinkansenPickup: () => void
  paused?: boolean
}

export function Scene({ generalCards, buildCards, shinkansenPlate, onBeltSelect, onShinkansenPickup, paused = false }: SceneProps) {
  const LANE_SHINKANSEN = -2.6
  const LANE_GENERAL = 0
  const LANE_BUILD = 2.6

  return (
    <>
      <DraftCamera />
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
        paused={paused}
        onSelect={onBeltSelect}
      />

      {/* Build belt (front) */}
      <BeltLane3D
        label="ビルド系雑多"
        cards={buildCards}
        duration={16}
        laneZ={LANE_BUILD}
        paused={paused}
        onSelect={onBeltSelect}
      />
    </>
  )
}
