import { mulberry32 } from './modelRandom'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BASE_NETA_COLOR } from './sushiMaterials'
import * as THREE from 'three'
import { NigiriTopping } from './SushiPrimitives'

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

export function NegitoroGunkan() {
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

export function TakowasaGunkan() {
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

export function EbiGunkan() {
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

export function KaniGunkan() {
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

export function SeafoodGunkan() {
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

// ツナは淡いピンクのほぐし身。薄く不揃いなフレークを重ねる。
export function TunaGunkan() {
  const { geometry, flakes } = useMemo(() => {
    const outline = new THREE.Shape()
    outline.moveTo(-0.09, -0.017)
    outline.lineTo(-0.063, -0.044)
    outline.lineTo(-0.019, -0.036)
    outline.lineTo(0.017, -0.052)
    outline.lineTo(0.063, -0.031)
    outline.lineTo(0.082, 0.003)
    outline.lineTo(0.052, 0.02)
    outline.lineTo(0.009, 0.046)
    outline.lineTo(-0.027, 0.023)
    outline.lineTo(-0.074, 0.032)
    outline.closePath()
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.02, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.007, bevelThickness: 0.006 })
    geometry.rotateX(-Math.PI / 2)
    // 紙片のような平面にせず、薄い身の端をゆるく折り曲げる。
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) + 0.018 * Math.sin(positions.getX(i) * 24) + 0.008 * Math.cos(positions.getZ(i) * 42))
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
    const rand = mulberry32(103)
    const flakes = Array.from({ length: 48 }, (_, i) => {
      const layer = Math.floor(i / 16)
      const radius = Math.sqrt(((i % 16) + 0.4) / 16)
      const angle = i * 2.399963
      const spread = 0.265 - layer * 0.055
      return {
        position: [Math.cos(angle) * radius * spread, 0.475 + layer * 0.067 + (1 - radius * radius) * 0.035 + rand() * 0.025, Math.sin(angle) * radius * spread] as [number, number, number],
        rotation: [(rand() - 0.5) * 1.2, rand() * Math.PI, (rand() - 0.5) * 0.95] as [number, number, number],
        scale: [0.8 + rand() * 0.45, 0.8 + rand() * 0.5, 0.8 + rand() * 0.45] as [number, number, number],
        color: ['#e4b094', '#dda286', '#edbfa3', '#d9977e'][i % 4],
      }
    })
    return { geometry, flakes }
  }, [])
  return <group scale={[1.45, 1, 0.85]}>
    <GunkanCup />
    {flakes.map(({ position, rotation, scale, color }, i) => (
      <mesh key={i} geometry={geometry} position={position} rotation={rotation} scale={scale}>
        <meshPhysicalMaterial color={color} roughness={0.52} clearcoat={0.15} clearcoatRoughness={0.55} />
      </mesh>
    ))}
  </group>
}

// とびこは細かな粒を、位置を崩した3層で盛る。螺旋や同心円の配列を使わない。
function TobikoTopping() {
  const grains = useRef<THREE.InstancedMesh>(null)
  const particles = useMemo(() => {
    const rand = mulberry32(53)
    const transform = new THREE.Object3D()
    const particles: { matrix: THREE.Matrix4; color: THREE.Color }[] = []
    const colors = ['#ed7510', '#ef7b10', '#f17f12', '#e9700c']
    for (let layer = 0; layer < 3; layer++) {
      // 一区画に一粒を置いてから大きくずらし、偏りと規則模様の両方を避ける。
      for (let row = -13; row <= 13; row++) {
        for (let column = -22; column <= 22; column++) {
          const worldX = (column + (rand() - 0.5) * 0.96) * 0.0195
          const worldZ = (row + (rand() - 0.5) * 0.96) * 0.0195
          const radial = (worldX / 0.427) ** 2 + (worldZ / 0.247) ** 2
          if (radial > 1) continue
          const y = 0.526 + 0.095 * (1 - radial) - layer * 0.018 + (rand() - 0.5) * 0.01
          transform.position.set(worldX / 1.45, y, worldZ / 0.85)
          const scale = 0.86 + rand() * 0.26
          transform.scale.set(scale / 1.45, scale, scale / 0.85)
          transform.updateMatrix()
          particles.push({ matrix: transform.matrix.clone(), color: new THREE.Color(colors[Math.floor(rand() * colors.length)]) })
        }
      }
    }
    return particles
  }, [])
  useLayoutEffect(() => {
    if (!grains.current) return
    particles.forEach(({ matrix, color }, i) => {
      grains.current!.setMatrixAt(i, matrix)
      grains.current!.setColorAt(i, color)
    })
    grains.current.instanceMatrix.needsUpdate = true
    if (grains.current.instanceColor) grains.current.instanceColor.needsUpdate = true
    grains.current.computeBoundingSphere()
  }, [particles])
  return <>
    <instancedMesh ref={grains} args={[undefined, undefined, particles.length]}>
      <sphereGeometry args={[0.011, 8, 6]} />
      <meshPhysicalMaterial color="#ffffff" roughness={0.48} metalness={0} clearcoat={0.12} clearcoatRoughness={0.5} />
    </instancedMesh>
  </>
}

// いくらは大きさに少しだけ差のある丸い粒を、海苔の縁に沿った山にする。
const IKURA_GRAINS = (() => {
  const rand = mulberry32(79)
  const top = Array.from({ length: 35 }, (_, i) => {
    const radius = Math.sqrt((i + 0.45) / 35)
    const angle = i * 2.399963 + (rand() - 0.5) * 0.08
    return {
      p: [Math.cos(angle) * radius * 0.284, 0.535 + 0.072 * (1 - radius * radius) + rand() * 0.008, Math.sin(angle) * radius * 0.268] as [number, number, number],
      r: 0.054 + rand() * 0.005,
      color: i % 4 === 0 ? '#ec6d20' : '#e75b16',
    }
  })
  const lower = Array.from({ length: 35 }, (_, i) => {
    const radius = Math.sqrt((i + 0.45) / 35)
    const angle = i * 2.399963 + 0.28
    return {
      p: [Math.cos(angle) * radius * 0.282, 0.422 + rand() * 0.006, Math.sin(angle) * radius * 0.266] as [number, number, number],
      r: 0.055 + rand() * 0.004, color: '#e75b16',
    }
  })
  const middle = Array.from({ length: 18 }, (_, i) => {
    const radius = Math.sqrt((i + 0.4) / 18)
    const angle = i * 2.399963 + 0.65
    return {
      p: [Math.cos(angle) * radius * 0.232, 0.484 + 0.027 * (1 - radius * radius), Math.sin(angle) * radius * 0.217] as [number, number, number],
      r: 0.055 + rand() * 0.004, color: '#ea631b',
    }
  })
  return [...lower, ...middle, ...top]
})()

function IkuraTopping() {
  const grains = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!grains.current) return
    const transform = new THREE.Object3D()
    IKURA_GRAINS.forEach(({ p, r, color }, i) => {
      transform.position.set(...p)
      transform.scale.set(r / 1.45, r, r / 0.85)
      transform.updateMatrix()
      grains.current!.setMatrixAt(i, transform.matrix)
      grains.current!.setColorAt(i, new THREE.Color(color))
    })
    grains.current.instanceMatrix.needsUpdate = true
    if (grains.current.instanceColor) grains.current.instanceColor.needsUpdate = true
    grains.current.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={grains} args={[undefined, undefined, IKURA_GRAINS.length]}>
    <sphereGeometry args={[1, 20, 14]} />
    <meshPhysicalMaterial color="#ffffff" roughness={0.22} metalness={0}
      clearcoat={0.42} clearcoatRoughness={0.3} transmission={0.1} thickness={0.11} ior={1.36}
      attenuationColor="#f88423" attenuationDistance={0.45} />
  </instancedMesh>
}

// コーン・納豆用：小粒を密に（中心+3重リング+2段目）
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
  squash: number
}> = {
  'コーン': { r: 0.058, color: '#fbd23c', roughness: 0.5, clearcoat: 0.15, squash: 0.78 },
  '納豆': { r: 0.058, color: '#a8823c', roughness: 0.28, clearcoat: 0.7, squash: 0.85 },
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

export function GunkanSushi({ base, mayo = false }: { base: string; mayo?: boolean }) {
  const toppingColor = BASE_NETA_COLOR[base] ?? '#f0a830'
  const dotConf = GUNKAN_DOT_CONF[base]
  const isUni = base === 'うに'
  return (
    <group scale={[1.45, 1, 0.85]}>
      <GunkanCup />
      {base === 'とびこ' ? <TobikoTopping /> : base === 'いくら' ? <IkuraTopping /> : isUni ? (
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
          {/* ネタ色の土台に粒を密着させ、白い隙間をなくす。 */}
          <mesh position={[0, 0.49, 0]} scale={[0.98, 0.43, 0.98]}>
            <sphereGeometry args={[0.29, 18, 12]} />
            <meshStandardMaterial color={dotConf.color} roughness={0.7} metalness={0} />
          </mesh>
          {/* 粒 */}
          {GUNKAN_DOTS_SMALL.map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]} scale={[0.94 + (i % 3) * 0.035, dotConf.squash, 1]}>
              <sphereGeometry args={[dotConf.r, 12, 10]} />
              <meshPhysicalMaterial
                color={dotConf.color}
                roughness={dotConf.roughness}
                metalness={0}
                clearcoat={dotConf.clearcoat}
                clearcoatRoughness={0.48}
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
      {mayo && <group position={[0, 0.075, 0]}><NigiriTopping topping="マヨ" /></group>}
    </group>
  )
}
