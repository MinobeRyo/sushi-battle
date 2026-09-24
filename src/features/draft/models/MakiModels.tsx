import { BASE_NETA_COLOR } from './sushiMaterials'
import { useMemo } from 'react'
import { mulberry32 } from './modelRandom'
import * as THREE from 'three'

// 太巻き：細巻きより大きく、断面に具材数種
const FUTOMAKI_FILLS: Array<{ x: number; z: number; r: number; color: string }> = [
  { x: 0.1, z: 0, r: 0.09, color: '#f5c518' },    // たまご
  { x: -0.11, z: 0.08, r: 0.05, color: '#4a9a38' }, // きゅうり
  { x: -0.02, z: -0.12, r: 0.06, color: '#c8b478' }, // かんぴょう
  { x: -0.13, z: -0.05, r: 0.06, color: '#e87a90' }, // でんぶ
  { x: 0.02, z: 0.12, r: 0.05, color: '#d6404e' },  // まぐろ
]

export function FutomakiPlate() {
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

export function MakiPlate({ base, negitoro }: { base: string; negitoro?: boolean }) {
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

// 納豆巻き：断面に豆の粒＋ピース間の糸引き
const NATTO_BEANS: Array<[number, number]> = [
  [0.03, 0.02], [-0.03, 0.03], [0, -0.035], [0.045, -0.015], [-0.045, -0.02], [0.01, 0.045],
]

export function NattoMaki() {
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
