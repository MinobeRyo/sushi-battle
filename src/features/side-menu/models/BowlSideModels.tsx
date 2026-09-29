import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

type Point = [number, number, number]

function random(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Lathe({ points, color, roughness = 0.25 }: {
  points: [number, number][]; color: string; roughness?: number
}) {
  const profile = useMemo(() => points.map(([x, y]) => new THREE.Vector2(x, y)), [points])
  return <mesh castShadow receiveShadow>
    <latheGeometry args={[profile, 64]} />
    <meshPhysicalMaterial color={color} roughness={roughness} clearcoat={0.7} clearcoatRoughness={0.18} />
  </mesh>
}

function Ring({ radius, y, color, thickness = 0.018 }: {
  radius: number; y: number; color: string; thickness?: number
}) {
  return <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
    <torusGeometry args={[radius, thickness, 8, 64]} />
    <meshPhysicalMaterial color={color} roughness={0.25} clearcoat={0.5} />
  </mesh>
}

function FoodCurve({ points, color, radius = 0.018, closed = false }: {
  points: Point[]; color: string; radius?: number; closed?: boolean
}) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)), closed,
  ), [points, closed])
  return <mesh castShadow receiveShadow>
    <tubeGeometry args={[curve, Math.max(16, points.length * 3), radius, 6, closed]} />
    <meshPhysicalMaterial color={color} roughness={0.48} clearcoat={0.25} />
  </mesh>
}

function Scallion({ position, rotation = 0, scale = 1 }: { position: Point; rotation?: number; scale?: number }) {
  return <group position={position} rotation={[0.15, rotation, 0.12]} scale={scale}>
    <mesh castShadow rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.036, 0.012, 5, 9]} />
      <meshStandardMaterial color="#6eac38" roughness={0.72} />
    </mesh>
    <mesh position={[0, -0.007, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.025, 0.006, 5, 9]} />
      <meshStandardMaterial color="#d6e29b" roughness={0.65} />
    </mesh>
  </group>
}

const RAMEN_BOWL: [number, number][] = [
  [0, 0.04], [0.35, 0.04], [0.37, 0.075], [0.37, 0.13], [0.43, 0.16],
  [0.54, 0.23], [0.69, 0.37], [0.84, 0.57], [0.96, 0.81], [0.98, 0.89],
  [0.97, 0.915], [0.925, 0.915], [0.905, 0.83], [0.79, 0.6], [0.64, 0.4],
  [0.49, 0.27], [0, 0.23],
]

function Chashu({ position, rotation }: { position: Point; rotation: number }) {
  const spiral = useMemo(() => Array.from({ length: 50 }, (_, i): Point => {
    const a = i * 0.23
    const r = 0.014 + i * 0.0041
    return [Math.cos(a) * r, 0.034, Math.sin(a) * r * 0.77]
  }), [])
  return <group position={position} rotation={[0.12, rotation, -0.1]}>
    <mesh scale={[1, 1, 0.8]} castShadow receiveShadow>
      <cylinderGeometry args={[0.29, 0.285, 0.05, 40]} />
      <meshPhysicalMaterial color="#975132" roughness={0.48} clearcoat={0.28} />
    </mesh>
    <mesh position={[0, 0.018, 0]} scale={[1, 1, 0.8]} receiveShadow>
      <cylinderGeometry args={[0.258, 0.265, 0.025, 40]} />
      <meshPhysicalMaterial color="#d89576" roughness={0.6} clearcoat={0.3} />
    </mesh>
    <FoodCurve points={spiral} color="#f4d6b2" radius={0.025} />
  </group>
}

function EggHalf({ position, rotation }: { position: Point; rotation: number }) {
  return <group position={position} rotation={[0.15, rotation, -0.18]}>
    <mesh castShadow scale={[0.23, 0.085, 0.31]}>
      <sphereGeometry args={[1, 32, 20]} />
      <meshPhysicalMaterial color="#fff4d5" roughness={0.32} clearcoat={0.4} />
    </mesh>
    <mesh position={[0, 0.074, 0.024]} scale={[0.134, 0.035, 0.155]} castShadow>
      <sphereGeometry args={[1, 24, 12]} />
      <meshPhysicalMaterial color="#f7a322" roughness={0.4} clearcoat={0.6} />
    </mesh>
    <mesh position={[-0.02, 0.101, 0.024]} scale={[0.066, 0.01, 0.079]}>
      <sphereGeometry args={[1, 16, 10]} />
      <meshPhysicalMaterial color="#e77815" roughness={0.2} clearcoat={0.8} />
    </mesh>
  </group>
}

function Nori() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.43, 0.53, 12, 12)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i)
      p.setZ(i, Math.sin(x * 78) * 0.007 + Math.sin(y * 43 + x * 17) * 0.008)
    }
    g.computeVertexNormals()
    return g
  }, [])
  // geometryプロパティで渡す形状はR3Fの自動破棄対象外なので、所有側で解放します。
  // CPU側の頂点は残るため、StrictModeの再セットアップ後もGPUへ再転送できます。
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} position={[-0.47, 1.025, -0.47]} rotation={[-0.28, -0.45, -0.12]} castShadow>
    <meshStandardMaterial color="#233323" side={THREE.DoubleSide} roughness={0.86} />
  </mesh>
}

function Naruto() {
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    for (let i = 0; i <= 90; i++) {
      const a = i / 90 * Math.PI * 2
      const r = 0.14 + 0.009 * Math.cos(a * 12)
      if (!i) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    return s
  }, [])
  const spiral = useMemo(() => Array.from({ length: 28 }, (_, i): Point => {
    const a = i * 0.37, r = 0.007 + i * 0.003
    return [Math.cos(a) * r, 0.04, Math.sin(a) * r]
  }), [])
  return <group position={[0.34, 0.875, 0.29]} rotation={[0.02, 0.4, -0.05]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
      <extrudeGeometry args={[shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, steps: 1 }]} />
      <meshStandardMaterial color="#fff4e8" roughness={0.4} />
    </mesh>
    <FoodCurve points={spiral} color="#ec7092" radius={0.012} />
  </group>
}

export function RamenModel() {
  const noodles = useMemo(() => {
    const rand = random(183)
    return Array.from({ length: 15 }, (_, i) => {
      const centerX = (rand() - 0.5) * 0.45, centerZ = (rand() - 0.5) * 0.55
      const r = 0.21 + rand() * 0.17
      return Array.from({ length: 22 }, (_, j): Point => {
        const a = j / 21 * Math.PI * (1.7 + (i % 3) * 0.14) + i * 0.9
        return [centerX + Math.cos(a) * r, 0.841 + i * 0.002 + Math.sin(a * 4 + i) * 0.009, centerZ + Math.sin(a) * r * 0.75]
      })
    })
  }, [])
  return <group position={[0, -0.04, 0]}>
    <Lathe points={RAMEN_BOWL} color="#f4e5cc" />
    <Ring radius={0.949} y={0.916} color="#b3342a" thickness={0.024} />
    <Ring radius={0.89} y={0.692} color="#b3342a" thickness={0.011} />
    <Ring radius={0.372} y={0.084} color="#b3342a" thickness={0.014} />
    {Array.from({ length: 20 }, (_, i) => {
      const a = i / 20 * Math.PI * 2
      return <group key={i} position={[Math.sin(a) * 0.948, 0.82, Math.cos(a) * 0.948]} rotation={[0, a, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]} castShadow>
          <boxGeometry args={[0.045, 0.045, 0.01]} />
          <meshStandardMaterial color="#ae342b" roughness={0.34} />
        </mesh>
      </group>
    })}
    <mesh position={[0, 0.822, 0]} receiveShadow>
      <cylinderGeometry args={[0.906, 0.84, 0.04, 64]} />
      <meshPhysicalMaterial color="#b87b30" roughness={0.25} clearcoat={0.9} clearcoatRoughness={0.15} />
    </mesh>
    {noodles.map((points, i) => <FoodCurve key={i} points={points} color={i % 3 === 0 ? '#f3d694' : '#e8bf70'} radius={0.018} />)}
    <Nori />
    <Chashu position={[-0.37, 0.895, 0.15]} rotation={0.4} />
    <Chashu position={[-0.18, 0.888, -0.24]} rotation={-0.5} />
    <EggHalf position={[0.4, 0.875, -0.29]} rotation={0.6} />
    <Naruto />
    {Array.from({ length: 11 }, (_, i) => <Scallion key={i}
      position={[0.02 + Math.sin(i * 2.7) * 0.18, 0.91 + (i % 3) * 0.013, 0.34 + Math.cos(i * 2.1) * 0.13]}
      rotation={i * 0.8} scale={0.8 + (i % 3) * 0.13} />)}
    {Array.from({ length: 9 }, (_, i) => {
      const a = i * 2.4
      return <mesh key={i} position={[Math.sin(a) * 0.73, 0.846, Math.cos(a) * 0.66]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.016, 0.028, 12]} />
        <meshStandardMaterial color="#dca956" transparent opacity={0.6} roughness={0.25} />
      </mesh>
    })}
  </group>
}

const MISO_OUTER: [number, number][] = [
  [0, 0.04], [0.3, 0.04], [0.32, 0.065], [0.32, 0.14], [0.43, 0.18],
  [0.59, 0.29], [0.72, 0.46], [0.81, 0.67], [0.84, 0.84], [0.828, 0.87],
  [0.794, 0.87], [0.78, 0.7], [0.68, 0.47], [0.54, 0.31], [0, 0.23],
]
const MISO_INNER: [number, number][] = [
  [0.791, 0.866], [0.778, 0.705], [0.68, 0.475], [0.542, 0.315], [0, 0.24],
]

function SeaweedPatch({ index, position, scale }: { index: number; position: Point; scale: number }) {
  const geometry = useMemo(() => {
    const rand = random(340 + index)
    // 丸みのある不揃いな輪郭で、汁にほどけた薄いあおさを表現します。
    const outline = Array.from({ length: 8 }, (_, i) => {
      const a = (i + (rand() - 0.5) * 0.28) / 8 * Math.PI * 2
      const radius = 0.12 * (0.8 + rand() * 0.32)
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius * 0.76, 0)
    })
    const edge = new THREE.CatmullRomCurve3(outline, true, 'centripetal')
    const shape = new THREE.Shape(edge.getPoints(40).map((p) => new THREE.Vector2(p.x, p.y)))
    const g = new THREE.ShapeGeometry(shape)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 23 + index) * Math.cos(p.getY(i) * 19) * 0.003)
    g.computeVertexNormals()
    return g
  }, [index])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} position={position} scale={scale} rotation={[-Math.PI / 2, 0, index * 1.2]} castShadow receiveShadow>
    <meshPhysicalMaterial color={['#536348', '#687451', '#3f543d'][index % 3]} side={THREE.DoubleSide} roughness={0.62} clearcoat={0.18} />
  </mesh>
}

export function MisoSoupModel() {
  return <group position={[0, -0.04, 0]}>
    <Lathe points={MISO_OUTER} color="#25201e" roughness={0.2} />
    <Lathe points={MISO_INNER} color="#9d3428" roughness={0.23} />
    <Ring radius={0.813} y={0.87} color="#be4931" thickness={0.023} />
    <Ring radius={0.312} y={0.063} color="#a64d31" thickness={0.012} />
    <Ring radius={0.735} y={0.5} color="#544032" thickness={0.007} />
    <mesh position={[0, 0.746, 0]} receiveShadow>
      <cylinderGeometry args={[0.785, 0.75, 0.035, 64]} />
      <meshPhysicalMaterial color="#b19763" roughness={0.33} clearcoat={0.75} clearcoatRoughness={0.25} />
    </mesh>
    {Array.from({ length: 14 }, (_, i) => {
      const a = i * 2.39996, r = 0.58 * Math.sqrt((i + 0.5) / 14)
      return <SeaweedPatch key={i} index={i} position={[Math.cos(a) * r, 0.767 + (i % 3) * 0.002, Math.sin(a) * r]} scale={0.8 + (i % 4) * 0.11} />
    })}
    {([[0.26, 0.787, 0.29], [-0.38, 0.791, -0.02], [0.16, 0.78, -0.39]] as Point[]).map((p, i) =>
      <mesh key={i} position={p} rotation={[0.03, i * 1.1 + 0.25, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[0.17, 0.075, 0.18]} />
        <meshStandardMaterial color="#f5eed3" roughness={0.63} />
      </mesh>)}
    {Array.from({ length: 7 }, (_, i) => <Scallion key={i} position={[Math.sin(i * 2.5) * 0.42, 0.815, Math.cos(i * 1.9) * 0.39]} rotation={i} scale={0.84} />)}
  </group>
}

const CUSTARD_CUP: [number, number][] = [
  [0, 0.04], [0.32, 0.04], [0.34, 0.09], [0.34, 0.14], [0.43, 0.16],
  [0.46, 0.28], [0.49, 0.65], [0.53, 1.02], [0.545, 1.07], [0.535, 1.095],
  [0.494, 1.095], [0.484, 1.045], [0.44, 0.66], [0.41, 0.3], [0, 0.22],
]
const CUSTARD_LID: [number, number][] = [
  [0, 0.045], [0.48, 0.045], [0.5, 0.07], [0.51, 0.11], [0.46, 0.145],
  [0.35, 0.2], [0.16, 0.235], [0.075, 0.24], [0.065, 0.3], [0.055, 0.32], [0, 0.32],
]

function MitsubaLeaf({ position, rotation, scale = 1 }: { position: Point; rotation: number; scale?: number }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, -0.1)
    s.bezierCurveTo(-0.09, -0.065, -0.12, 0.055, -0.05, 0.11)
    s.lineTo(-0.04, 0.14)
    s.lineTo(0, 0.17)
    s.lineTo(0.035, 0.13)
    s.bezierCurveTo(0.125, 0.075, 0.075, -0.065, 0, -0.1)
    return s
  }, [])
  return <group position={position} rotation={[0, rotation, 0]} scale={scale}>
    <mesh rotation={[-Math.PI / 2 + 0.1, 0, 0]} castShadow>
      <shapeGeometry args={[shape, 12]} />
      <meshStandardMaterial color="#3f8240" side={THREE.DoubleSide} roughness={0.6} />
    </mesh>
    <FoodCurve points={[[0, 0.005, 0.1], [0, 0.022, -0.04], [0, 0.028, -0.14]]} color="#82a955" radius={0.004} />
  </group>
}

function CustardShrimp() {
  return <group position={[0.12, 1.048, 0.1]} rotation={[0.08, -0.6, 0.05]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <torusGeometry args={[0.145, 0.065, 12, 24, Math.PI * 1.4]} />
      <meshPhysicalMaterial color="#f3b598" roughness={0.4} clearcoat={0.35} />
    </mesh>
    {Array.from({ length: 6 }, (_, i) => {
      const a = i * 0.68 + 0.18
      const pts = Array.from({ length: 9 }, (_, j): Point => {
        const b = j / 8 * Math.PI
        const r = 0.145 + Math.cos(b) * 0.064
        return [Math.cos(a) * r, Math.sin(b) * 0.065 + 0.002, -Math.sin(a) * r]
      })
      return <FoodCurve key={i} points={pts} color="#e66e48" radius={0.014} />
    })}
    <mesh position={[-0.025, 0.01, 0.17]} rotation={[0.08, 0.4, -0.2]} scale={[0.065, 0.027, 0.12]} castShadow>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color="#db6745" roughness={0.5} />
    </mesh>
    <mesh position={[-0.12, 0.01, 0.145]} rotation={[0.08, -0.5, 0.2]} scale={[0.065, 0.027, 0.12]} castShadow>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color="#e57952" roughness={0.5} />
    </mesh>
  </group>
}

function PorcelainPetals({ radius, y }: { radius: number; y: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => {
    const a = i / 7 * Math.PI * 2
    return <group key={i} position={[Math.sin(a) * radius, y, Math.cos(a) * radius]} rotation={[0, a, 0]}>
      {[-1, 0, 1].map((k) => <mesh key={k} position={[k * 0.029, Math.abs(k) * 0.024, 0]} rotation={[0, 0, k * -0.55]} scale={[0.017, 0.06, 0.008]}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial color="#3b6374" roughness={0.34} />
      </mesh>)}
    </group>
  })}</>
}

export function ChawanmushiModel() {
  return <group position={[-0.2, -0.04, 0]}>
    <Lathe points={CUSTARD_CUP} color="#e5e9d6" />
    <Ring radius={0.515} y={1.087} color="#597d83" thickness={0.013} />
    <Ring radius={0.442} y={0.23} color="#597d83" thickness={0.011} />
    <Ring radius={0.46} y={0.3} color="#597d83" thickness={0.007} />
    <PorcelainPetals radius={0.486} y={0.65} />
    <mesh position={[0, 1.015, 0]} receiveShadow>
      <cylinderGeometry args={[0.484, 0.465, 0.028, 64]} />
      <meshPhysicalMaterial color="#f4d98b" roughness={0.27} clearcoat={0.65} clearcoatRoughness={0.24} />
    </mesh>
    <CustardShrimp />
    <group position={[-0.22, 1.034, -0.15]} rotation={[0.08, -0.45, 0.2]}>
      <mesh scale={[0.17, 0.045, 0.15]} castShadow>
        <sphereGeometry args={[1, 24, 14]} />
        <meshStandardMaterial color="#71503a" roughness={0.65} />
      </mesh>
      <FoodCurve points={[[-0.1, 0.038, 0], [0, 0.048, 0], [0.1, 0.038, 0]]} color="#e8c894" radius={0.017} />
      <FoodCurve points={[[0, 0.04, -0.095], [0, 0.05, 0], [0, 0.04, 0.095]]} color="#e8c894" radius={0.015} />
    </group>
    <FoodCurve points={[[-0.12, 1.05, 0.12], [-0.07, 1.065, -0.04], [0.07, 1.076, -0.25]]} color="#668e41" radius={0.01} />
    <MitsubaLeaf position={[-0.02, 1.076, -0.24]} rotation={-0.9} scale={0.76} />
    <MitsubaLeaf position={[0.12, 1.077, -0.24]} rotation={0.7} scale={0.77} />
    <MitsubaLeaf position={[0.06, 1.07, -0.1]} rotation={2} scale={0.65} />
    <group position={[0.9, 0, 0.15]} scale={0.85}>
      <Lathe points={CUSTARD_LID} color="#e5e9d6" />
      <Ring radius={0.492} y={0.102} color="#597d83" thickness={0.012} />
      <Ring radius={0.26} y={0.218} color="#597d83" thickness={0.008} />
      <Ring radius={0.062} y={0.292} color="#597d83" thickness={0.009} />
    </group>
  </group>
}
