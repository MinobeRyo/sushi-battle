import { BASE_NETA_COLOR } from './sushiMaterials'

// 側面と端を海苔で閉じ、白い面は切り口だけに置く。
// 円筒・断面の分割数も統一し、端の輪郭のずれから白い点が見えるのを防ぐ。
const MAKI_SEGMENTS = 32

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
            <cylinderGeometry args={[rNori, rNori, h, MAKI_SEGMENTS]} />
            <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
          </mesh>
          {/* 切り口（両端のリング） */}
          {[h / 2, -h / 2].map((y, j) => (
            <group key={j} position={[0, y, 0]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
              <mesh position={[0, 0, 0.002]}>
                <circleGeometry args={[rRice, MAKI_SEGMENTS]} />
                <meshStandardMaterial color="#f0ece0" roughness={0.85} />
              </mesh>
              {FUTOMAKI_FILLS.map((f, k) => (
                <mesh key={k} position={[f.x, y > 0 ? -f.z : f.z, 0.004]}>
                  <circleGeometry args={[f.r, 16]} />
                  <meshStandardMaterial color={f.color} roughness={0.6} />
                </mesh>
              ))}
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
            <cylinderGeometry args={[rNori, rNori, h, MAKI_SEGMENTS]} />
            <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
          </mesh>
          {/* 切り口（両端） */}
          {[h / 2, -h / 2].map((y, j) => (
            <group key={j} position={[0, y, 0]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
              <mesh position={[0, 0, 0.002]}>
                <circleGeometry args={[rRice, MAKI_SEGMENTS]} />
                <meshStandardMaterial color="#f0ece0" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.004]}>
                <circleGeometry args={[rFill, 16]} />
                <meshStandardMaterial color={fillColor} roughness={0.6} />
              </mesh>
              {/* ネギトロのネギ（切り口の緑） */}
              {negitoro && ([[0.03, 0.03], [-0.04, -0.02], [0.01, -0.05]] as Array<[number, number]>).map(([dx, dy], k) => (
                <mesh key={`g${k}`} position={[dx, dy, 0.006]}>
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

// 納豆巻き：断面に豆の粒を見せる。
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
  return (
    <group>
      {pieces.map((p, i) => (
        <group key={i} position={[p.x, 0.38, 0]} rotation={[Math.PI / 2, p.rotY, 0]}>
          {/* 海苔 */}
          <mesh>
            <cylinderGeometry args={[rNori, rNori, h, MAKI_SEGMENTS]} />
            <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
          </mesh>
          {/* 切り口（両端） */}
          {[h / 2, -h / 2].map((y, j) => (
            <group key={j} position={[0, y, 0]} rotation={[y > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
              <mesh position={[0, 0, 0.002]}>
                <circleGeometry args={[rRice, MAKI_SEGMENTS]} />
                <meshStandardMaterial color="#f0ece0" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, 0.004]}>
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
    </group>
  )
}
