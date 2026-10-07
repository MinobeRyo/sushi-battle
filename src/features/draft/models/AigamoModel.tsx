import { useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { Shari } from './SushiPrimitives'

// スモーク合鴨の薄切り。片側だけに脂を残し、シャリの両端へ軽く沿わせます。
function slicePoint(u: number, v: number): [number, number, number] {
  const along = u * 2 - 1
  const width = 0.63 * Math.sqrt(Math.max(0.007, 1 - along * along))
  return [
    along * 0.55,
    0.515 - 0.108 * Math.abs(along) ** 3 + 0.011 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI),
    (v - 0.5) * width + 0.024 * Math.sin(u * Math.PI * 2),
  ]
}

function useDuckSlice() {
  return useMemo(() => {
    const columns = 34
    // 外周と脂の境目だけ密にし、焼き縁を細く、脂を一枚の帯にします。
    const rows = [0, 0.018, 0.09, 0.22, 0.36, 0.5, 0.63, 0.735, 0.755, 0.86, 0.965, 0.982, 1]
    const positions: number[] = [], colors: number[] = [], indices: number[] = []
    const meat = new Color('#c2a096'), meatShade = new Color('#ae8d86')
    const fat = new Color('#eedbc6'), crust = new Color('#956548')
    const sideFat = new Color('#d7bca1'), sideMeat = new Color('#ad8370')
    const top: number[][] = [], bottom: number[][] = []
    const vertex = (point: [number, number, number], color: Color) => {
      const index = positions.length / 3
      positions.push(...point); colors.push(color.r, color.g, color.b)
      return index
    }
    for (let r = 0; r < rows.length; r++) {
      const v = rows[r]
      top.push([]); bottom.push([])
      for (let c = 0; c <= columns; c++) {
        const u = c / columns
        const point = slicePoint(u, v)
        const edge = r === 0 || r === rows.length - 1 || c === 0 || c === columns
        const fatty = v >= 0.755
        const grain = (Math.sin(u * 34 + v * 12) + 1) * 0.055
        const color = edge ? crust : fatty ? fat : meat.clone().lerp(meatShade, grain)
        top[r].push(vertex(point, color))
        bottom[r].push(vertex([point[0], point[1] - 0.042, point[2]], fatty ? sideFat : sideMeat))
      }
    }
    for (let r = 0; r < rows.length - 1; r++) {
      for (let c = 0; c < columns; c++) {
        const a = top[r][c], b = top[r][c + 1], d = top[r + 1][c + 1], e = top[r + 1][c]
        indices.push(a, e, b, b, e, d)
        const aa = bottom[r][c], bb = bottom[r][c + 1], dd = bottom[r + 1][c + 1], ee = bottom[r + 1][c]
        indices.push(aa, bb, ee, bb, dd, ee)
      }
    }
    const wall = (a: number, b: number, aa: number, bb: number) => indices.push(a, b, aa, b, bb, aa)
    for (let c = 0; c < columns; c++) {
      wall(top[0][c], top[0][c + 1], bottom[0][c], bottom[0][c + 1])
      const last = rows.length - 1
      wall(top[last][c + 1], top[last][c], bottom[last][c + 1], bottom[last][c])
    }
    for (let r = 0; r < rows.length - 1; r++) {
      wall(top[r + 1][0], top[r][0], bottom[r + 1][0], bottom[r][0])
      wall(top[r][columns], top[r + 1][columns], bottom[r][columns], bottom[r + 1][columns])
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [])
}

// 小さな胡椒を身と脂の縁に散らし、粒の密集や強い光沢を避けます。
const PEPPER: readonly [number, number, number][] = [
  [0.12, 0.67, 0.0055], [0.18, 0.83, 0.006], [0.22, 0.31, 0.005],
  [0.28, 0.74, 0.0065], [0.33, 0.57, 0.0055], [0.37, 0.49, 0.007],
  [0.44, 0.88, 0.008], [0.48, 0.28, 0.0055], [0.53, 0.68, 0.006],
  [0.59, 0.45, 0.005], [0.64, 0.82, 0.006], [0.70, 0.61, 0.0065],
  [0.75, 0.41, 0.006], [0.85, 0.76, 0.007], [0.89, 0.53, 0.0055],
]

export function AigamoModel() {
  const geometry = useDuckSlice()
  return <group>
    <Shari />
    <group rotation={[0, -0.06, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial vertexColors roughness={0.72} metalness={0} clearcoat={0.1} clearcoatRoughness={0.6} />
      </mesh>
      {PEPPER.map(([u, v, size], index) => {
        const [x, y, z] = slicePoint(u, v)
        return <mesh key={index} position={[x, y + 0.004, z]} scale={[1, 0.35, 0.85]}>
          <sphereGeometry args={[size, 5, 4]} />
          <meshStandardMaterial color={index % 3 === 0 ? '#856446' : '#55412f'} roughness={1} />
        </mesh>
      })}
    </group>
  </group>
}
