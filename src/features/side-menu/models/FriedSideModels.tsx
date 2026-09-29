import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'


function useOwnedGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
  const activeGeometry = useRef<T | null>(null)
  useEffect(() => {
    activeGeometry.current = geometry
    return () => {
      activeGeometry.current = null
      // StrictMode の直後の再セットアップを待ち、使用が終わった GPU バッファだけ解放します。
      queueMicrotask(() => {
        if (activeGeometry.current !== geometry) geometry.dispose()
      })
    }
  }, [geometry])
  return geometry
}

// 衣・焼き色を頂点に焼き込み、細かい具材も結合して描画回数を抑えます。
const noise = (n: number) => {
  const value = Math.sin(n * 127.1 + 31.7) * 43758.5453
  return value - Math.floor(value)
}

function painted(geometry: THREE.BufferGeometry, color: string, variation = 0.14, seed = 0) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry
  if (result !== geometry) geometry.dispose()
  result.deleteAttribute('uv')
  const positions = result.getAttribute('position')
  const base = new THREE.Color(color)
  const colors = new Float32Array(positions.count * 3)
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    const amount = 1 + (Math.sin(x * 19 + y * 12 + z * 23 + seed) * 0.5 + Math.sin(x * 41 - z * 17) * 0.5) * variation
    colors[i * 3] = base.r * amount
    colors[i * 3 + 1] = base.g * amount
    colors[i * 3 + 2] = base.b * amount
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return result
}

function combine(geometries: THREE.BufferGeometry[]) {
  const result = mergeGeometries(geometries, false)!
  geometries.forEach((geometry) => geometry.dispose())
  return result
}

function crumbGeometry(seed: number, size: number, color: string) {
  const crumb = painted(new THREE.IcosahedronGeometry(size, 0), color, 0.2, seed)
  crumb.scale(0.7 + noise(seed) * 0.8, 0.5 + noise(seed + 2) * 0.7, 0.6 + noise(seed + 4) * 0.8)
  crumb.rotateX(noise(seed + 6) * 6)
  crumb.rotateZ(noise(seed + 7) * 6)
  return crumb
}

function ServingPlate({ dark = false, oval = 0.78 }: { dark?: boolean; oval?: number }) {
  const geometry = useOwnedGeometry(useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.075), new THREE.Vector2(0.77, 0.075),
    new THREE.Vector2(0.87, 0.09), new THREE.Vector2(1.035, 0.145),
    new THREE.Vector2(1.06, 0.17), new THREE.Vector2(1.045, 0.19),
    new THREE.Vector2(1.005, 0.195), new THREE.Vector2(0.855, 0.125),
    new THREE.Vector2(0.75, 0.115), new THREE.Vector2(0, 0.115),
  ], 64), []))
  return (
    <group scale={[1, 1, oval]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial color={dark ? '#26373a' : '#eee6d3'} roughness={dark ? 0.58 : 0.33} clearcoat={0.28} />
      </mesh>
      <mesh position={[0, 0.052, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.69, 0.66, 0.045, 48]} />
        <meshStandardMaterial color={dark ? '#213031' : '#d7c9af'} roughness={0.65} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <torusGeometry args={[1.035, 0.012, 6, 64]} />
        <meshStandardMaterial color={dark ? '#829388' : '#bda878'} roughness={0.5} />
      </mesh>
    </group>
  )
}

function LemonWedge() {
  const geometry = useOwnedGeometry(useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(0.33, 0)
    shape.absarc(0, 0, 0.33, 0, Math.PI * 0.63, false)
    shape.lineTo(0, 0)
    return new THREE.ExtrudeGeometry(shape, { depth: 0.085, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, steps: 1, curveSegments: 20 })
  }, []))
  return (
    <group position={[0.34, 0.15, 0.54]} rotation={[0, 0.4, 0.09]}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f2ce34" roughness={0.48} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.097, 0]}>
        <circleGeometry args={[0.303, 28, 0, Math.PI * 0.63]} />
        <meshStandardMaterial color="#fff1b0" roughness={0.45} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.099, 0]}>
          <ringGeometry args={[0.028, 0.28, 8, 1, i * 0.39 + 0.026, 0.335]} />
          <meshPhysicalMaterial color={i % 2 ? '#f9d844' : '#f3cf36'} roughness={0.28} clearcoat={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function Parsley({ position }: { position: [number, number, number] }) {
  const geometry = useOwnedGeometry(useMemo(() => {
    const leaves = Array.from({ length: 11 }, (_, i) => {
      const angle = i * 2.4
      const leaf = painted(new THREE.IcosahedronGeometry(0.095, 1), i % 3 ? '#3f7436' : '#609548', 0.13, i)
      leaf.scale(0.6, 0.22, 1)
      leaf.rotateY(angle)
      leaf.rotateZ((noise(i + 40) - 0.5) * 0.6)
      leaf.translate(Math.sin(angle) * 0.09, noise(i) * 0.055, Math.cos(angle) * 0.09)
      return leaf
    })
    return combine(leaves)
  }, []))
  return <mesh geometry={geometry} position={position} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.74} /></mesh>
}

export function KaraageModel() {
  const geometry = useOwnedGeometry(useMemo(() => {
    const pieces: THREE.BufferGeometry[] = []
    const placements = [
      [-0.45, 0.39, 0.2, 0.3], [0.02, 0.37, 0.25, -0.5],
      [-0.44, 0.38, -0.28, 0.8], [0.12, 0.43, -0.28, -0.2],
      [-0.15, 0.73, -0.035, 0.35],
    ]
    placements.forEach(([x, y, z, rotation], piece) => {
      const body = new THREE.SphereGeometry(1, 20, 14)
      const vertices = body.getAttribute('position')
      for (let i = 0; i < vertices.count; i++) {
        const vx = vertices.getX(i)
        const vy = vertices.getY(i)
        const vz = vertices.getZ(i)
        const lobe = 1 + Math.sin(vx * 7 + piece) * Math.cos(vz * 6 - piece) * 0.1 + Math.sin(vy * 9 + vx * 4) * 0.075
        vertices.setXYZ(i, vx * lobe, vy * lobe, vz * lobe)
      }
      body.computeVertexNormals()
      const colored = painted(body, piece % 2 ? '#c98b36' : '#b97729', 0.2, piece)
      colored.scale(0.31, 0.24, 0.29)
      colored.rotateY(rotation)
      colored.rotateZ(piece * 0.17)
      colored.translate(x, y, z)
      pieces.push(colored)
      for (let i = 0; i < 37; i++) {
        const seed = piece * 101 + i
        const angle = noise(seed + 13) * Math.PI * 2
        const height = noise(seed + 47) * 1.65 - 0.65
        const ring = Math.sqrt(Math.max(0, 1 - height * height))
        const crumb = crumbGeometry(seed, 0.035 + noise(seed + 20) * 0.02, i % 4 === 0 ? '#955421' : i % 3 === 0 ? '#e9b355' : '#d99842')
        crumb.translate(x + Math.cos(angle) * ring * 0.3, y + height * 0.235, z + Math.sin(angle) * ring * 0.285)
        pieces.push(crumb)
      }
    })
    return combine(pieces)
  }, []))
  return (
    <group>
      <ServingPlate />
      <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.79} /></mesh>
      <LemonWedge />
      <Parsley position={[0.47, 0.16, -0.37]} />
    </group>
  )
}

function KetchupCup() {
  const cup = useOwnedGeometry(useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0.19, 0.2),
    new THREE.Vector2(0.173, 0.205), new THREE.Vector2(0.139, 0.035), new THREE.Vector2(0, 0.035),
  ], 40), []))
  const swirl = useOwnedGeometry(useMemo(() => {
    const points = Array.from({ length: 41 }, (_, i) => {
      const t = i / 40
      return new THREE.Vector3(Math.cos(t * Math.PI * 3.7) * (0.1 - t * 0.085), 0.173 + t * 0.025, Math.sin(t * Math.PI * 3.7) * (0.1 - t * 0.085))
    })
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.02, 8, false)
  }, []))
  return (
    <group position={[0.64, 0.14, 0.4]}>
      <mesh geometry={cup} castShadow receiveShadow><meshPhysicalMaterial color="#f6ebd8" roughness={0.3} clearcoat={0.4} /></mesh>
      <mesh position={[0, 0.159, 0]} castShadow><cylinderGeometry args={[0.163, 0.15, 0.024, 40]} /><meshPhysicalMaterial color="#a52c1c" roughness={0.35} clearcoat={0.6} /></mesh>
      <mesh geometry={swirl} castShadow><meshPhysicalMaterial color="#c74027" roughness={0.33} clearcoat={0.55} /></mesh>
    </group>
  )
}

export function FriesModel() {
  const geometry = useOwnedGeometry(useMemo(() => {
    const fries: THREE.BufferGeometry[] = []
    for (let i = 0; i < 30; i++) {
      const layer = Math.floor(i / 10)
      const length = 0.6 + noise(i + 22) * 0.42
      const fry = painted(new RoundedBoxGeometry(0.103, 0.106, length, 2, 0.017), i % 4 ? '#eabe54' : '#d9a443', 0.16, i)
      const parts = [fry]
      if (layer === 2) {
        for (let grainIndex = 0; grainIndex < 3; grainIndex++) {
          const grain = painted(new THREE.OctahedronGeometry(0.008, 0), '#fff0cd', 0)
          grain.translate((noise(i + grainIndex * 41) - 0.5) * 0.06, 0.055, (noise(i + grainIndex * 71) - 0.5) * length * 0.8)
          parts.push(grain)
        }
      }
      const saltedFry = combine(parts)
      saltedFry.rotateX((noise(i + 14) - 0.5) * (layer === 2 ? 0.5 : 0.2))
      saltedFry.rotateY((noise(i + 36) - 0.5) * 1.6 + (layer % 2 ? 0.62 : -0.15))
      saltedFry.rotateZ((noise(i + 92) - 0.5) * 0.25)
      saltedFry.translate((noise(i + 72) - 0.5) * 1.0 - 0.1, 0.245 + layer * 0.105, (noise(i + 93) - 0.5) * 0.55 - 0.04)
      fries.push(saltedFry)
    }
    return combine(fries)
  }, []))
  return (
    <group>
      <ServingPlate oval={0.76} />
      <mesh position={[-0.1, 0.137, 0]} rotation={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[1.35, 0.006, 1.12]} />
        <meshStandardMaterial color="#ede0c6" roughness={0.92} />
      </mesh>
      <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.64} /></mesh>
      <KetchupCup />
    </group>
  )
}

function ShrimpTempura({ position, angle, seed }: { position: [number, number, number]; angle: number; seed: number }) {
  const geometry = useOwnedGeometry(useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0.015, 0.035, -0.3),
      new THREE.Vector3(-0.012, 0.06, 0), new THREE.Vector3(0.01, 0.115, 0.3), new THREE.Vector3(0.025, 0.15, 0.44),
    ])
    const tube = new THREE.TubeGeometry(curve, 24, 0.132, 10, false)
    const vertices = tube.getAttribute('position')
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i)
      vertices.setXYZ(i, x + Math.sin(z * 38 + seed) * 0.012, y + Math.sin(z * 28 + x * 32) * 0.017, z)
    }
    tube.computeVertexNormals()
    const parts = [painted(tube, '#e7bd64', 0.12, seed)]
    for (const t of [0, 1]) {
      const end = curve.getPoint(t)
      const cap = painted(new THREE.SphereGeometry(0.132, 12, 8), '#e7bd64', 0.1, seed)
      cap.scale(1, 1, 0.55)
      cap.translate(end.x, end.y, end.z)
      parts.push(cap)
    }
    for (let i = 0; i < 80; i++) {
      const t = noise(i + seed * 81)
      const point = curve.getPoint(t)
      const theta = noise(i + seed + 99) * Math.PI * 2
      const crumb = crumbGeometry(i + seed, 0.022 + noise(i + 772) * 0.027, i % 5 ? '#efd08a' : '#d9a653')
      crumb.translate(point.x + Math.cos(theta) * 0.123, point.y + Math.sin(theta) * 0.13, point.z)
      parts.push(crumb)
    }
    return combine(parts)
  }, [seed]))
  const tail = useOwnedGeometry(useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.bezierCurveTo(-0.04, -0.03, -0.09, -0.15, -0.075, -0.25)
    shape.quadraticCurveTo(0, -0.28, 0.07, -0.24)
    shape.bezierCurveTo(0.08, -0.15, 0.04, -0.04, 0, 0)
    return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.006, bevelSegments: 2, steps: 1, curveSegments: 10 })
  }, []))
  return (
    <group position={position} rotation={[0, angle, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.78} /></mesh>
      <group position={[0.025, 0.15, 0.44]} rotation={[-0.15, 0, 0]}>
        {[-0.48, 0, 0.48].map((fan, i) => (
          <group key={fan} rotation={[0, fan, 0]}>
            <mesh geometry={tail} rotation={[-Math.PI / 2, 0, 0]} castShadow><meshPhysicalMaterial color={i === 1 ? '#e06b3b' : '#c94c2d'} roughness={0.5} clearcoat={0.2} side={THREE.DoubleSide} /></mesh>
            <mesh position={[0, 0.027, 0.17]} rotation={[-0.12, 0, 0]} castShadow><boxGeometry args={[0.012, 0.006, 0.13]} /><meshStandardMaterial color="#f09a5c" roughness={0.65} /></mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function PumpkinTempura() {
  const geometry = useOwnedGeometry(useMemo(() => {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, 0.35, 0, Math.PI, false)
    shape.lineTo(-0.19, 0)
    shape.absarc(0, 0, 0.19, Math.PI, 0, true)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.015, bevelSegments: 2, steps: 1, curveSegments: 24 })
  }, []))
  const crust = useOwnedGeometry(useMemo(() => {
    return combine(Array.from({ length: 22 }, (_, i) => {
      const angle = (i / 21) * Math.PI
      const bit = crumbGeometry(i + 380, 0.035, '#e2bd6e')
      bit.translate(Math.cos(angle) * 0.365, Math.sin(angle) * 0.365, 0.045)
      return bit
    }))
  }, []))
  return (
    <group position={[-0.48, 0.24, -0.45]} rotation={[-1.04, 0.06, -0.75]}>
      <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#43523b" roughness={0.75} /></mesh>
      <mesh geometry={geometry} position={[0, 0, 0.018]} scale={[0.93, 0.93, 1.1]} castShadow><meshStandardMaterial color="#e3a33c" roughness={0.63} /></mesh>
      <mesh geometry={crust} castShadow><meshStandardMaterial vertexColors roughness={0.8} /></mesh>
    </group>
  )
}

function PepperTempura() {
  const geometry = useOwnedGeometry(useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.29, 0, 0), new THREE.Vector3(-0.14, 0.01, 0.02),
      new THREE.Vector3(0.1, 0.04, 0), new THREE.Vector3(0.24, 0.06, -0.03),
    ])
    const tube = new THREE.TubeGeometry(curve, 16, 0.074, 7, false)
    const parts = [painted(tube, '#617d3a', 0.16)]
    for (const t of [0, 1]) {
      const end = curve.getPoint(t)
      const cap = painted(new THREE.SphereGeometry(0.074, 10, 8), '#617d3a', 0.1)
      cap.scale(0.7, 1, 1)
      cap.translate(end.x, end.y, end.z)
      parts.push(cap)
    }
    for (let i = 0; i < 20; i++) {
      const point = curve.getPoint(noise(i + 153))
      const crumb = crumbGeometry(i + 875, 0.025, '#e9c985')
      crumb.translate(point.x, point.y + 0.06, point.z + (noise(i + 74) - 0.5) * 0.1)
      parts.push(crumb)
    }
    return combine(parts)
  }, []))
  return (
    <group position={[0.4, 0.27, -0.38]} rotation={[0, -0.28, 0.1]}>
      <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.76} /></mesh>
      <mesh position={[0.28, 0.073, -0.035]} rotation={[0, 0, -1.14]} castShadow><cylinderGeometry args={[0.013, 0.017, 0.14, 6]} /><meshStandardMaterial color="#425b29" roughness={0.75} /></mesh>
    </group>
  )
}

export function TempuraModel() {
  return (
    <group>
      <ServingPlate dark oval={0.79} />
      <mesh position={[0, 0.138, 0]} rotation={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[1.38, 0.008, 1.09]} />
        <meshStandardMaterial color="#e4dfca" roughness={0.95} />
      </mesh>
      <PumpkinTempura />
      <PepperTempura />
      <ShrimpTempura position={[-0.27, 0.285, 0.02]} angle={-0.28} seed={7} />
      <ShrimpTempura position={[0.25, 0.33, -0.02]} angle={0.38} seed={19} />
    </group>
  )
}
