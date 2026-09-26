import type { Card } from '../../../types'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { SushiGeometry } from '../models/SushiGeometry'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { PLATE_HIT_POSITION, PLATE_HIT_SIZE } from './plateHitArea'

// ─── Shinkansen arriving plate ────────────────────────────────────────────────
export function ShinkansenPlate3D({ plate, laneZ, onPickup }: {
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
    return () => { document.body.style.cursor = 'auto' }
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
          >
            <cylinderGeometry args={[0.72, 0.72, 0.12, 32]} />
            <meshStandardMaterial color="#fffbeb" emissive="#f59e0b" emissiveIntensity={0.2} roughness={0.2} metalness={0.2} />
          </mesh>
          <mesh
            position={PLATE_HIT_POSITION}
            onClick={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; onPickup() }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
            onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
          >
            <boxGeometry args={PLATE_HIT_SIZE} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
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
