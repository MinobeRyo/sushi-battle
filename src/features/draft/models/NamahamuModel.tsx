import { useMemo } from 'react'
import { CatmullRomCurve3, Color, DoubleSide, Vector3 } from 'three'
import { Shari } from './SushiPrimitives'

// 薄い生ハムの波打つ面。テクスチャを読み込まず、頂点色で筋と脂を描きます。
function hamPoint(u: number, v: number) {
  const edge = 1 + 0.035 * Math.sin(u * 19 + v * 8)
  return new Vector3(
    (u - 0.5) * 1.06,
    0.52 - 0.13 * (u * 2 - 1) ** 4 + 0.043 * Math.sin(v * Math.PI * 3 + u * 2),
    (v - 0.5) * 0.62 * edge,
  )
}

function HamSlice({ folded = false }: { folded?: boolean }) {
  const { positions, colors, normals, indices, edges } = useMemo(() => {
    const columns = 32, rows = 16
    const positions: number[] = [], colors: number[] = [], normals: number[] = [], indices: number[] = []
    const meat = new Color('#db9098'), fat = new Color('#f6d9c9'), shadow = new Color('#c87282')
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= columns; i++) {
        const u = i / columns, v = j / rows
        positions.push(...hamPoint(u, v).toArray())
        const du = hamPoint(Math.min(1, u + 0.002), v).sub(hamPoint(Math.max(0, u - 0.002), v))
        const dv = hamPoint(u, Math.min(1, v + 0.002)).sub(hamPoint(u, Math.max(0, v - 0.002)))
        normals.push(...dv.cross(du).normalize().toArray())
        const rim = Math.min(u, 1 - u, v, 1 - v)
        const grain = Math.sin(v * 61 + Math.sin(u * 5) * 2)
        const color = rim < 0.045 ? fat : meat.clone().lerp(shadow, Math.max(0, grain) * 0.32)
        colors.push(color.r, color.g, color.b)
        if (i < columns && j < rows) {
          const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1, d = c + 1
          indices.push(a, c, b, b, c, d)
        }
      }
    }
    const edges = [0.035, 0.965].map(v => new CatmullRomCurve3(
      Array.from({ length: 25 }, (_, i) => hamPoint(i / 24, v)),
    ))
    return {
      positions: new Float32Array(positions), colors: new Float32Array(colors),
      normals: new Float32Array(normals), indices: new Uint16Array(indices), edges,
    }
  }, [])

  return (
    <group position={folded ? [0.02, 0.24, 0] : [0, 0, 0]}
      rotation={folded ? [0.12, -0.14, -0.08] : [0, 0, 0]}
      scale={folded ? [0.75, 0.68, 0.72] : [1, 1, 1]}>
      <mesh castShadow receiveShadow>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
          <bufferAttribute attach="attributes-normal" args={[normals, 3]} />
          <bufferAttribute attach="index" args={[indices, 1]} />
        </bufferGeometry>
        <meshPhysicalMaterial vertexColors side={DoubleSide} roughness={0.48} clearcoat={0.18} />
      </mesh>
      {edges.map((curve, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[curve, 32, 0.012, 5, false]} />
          <meshStandardMaterial color="#f4d6c8" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

export function NamahamuModel() {
  return (
    <group>
      <Shari />
      <HamSlice />
      <HamSlice folded />
    </group>
  )
}
