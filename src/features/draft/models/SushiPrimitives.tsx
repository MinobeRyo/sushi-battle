import { useMemo } from 'react'
import * as THREE from 'three'

export function NigiriNeta({ color, roughness, metalness, map }: {
  color: string; roughness: number; metalness: number; map?: THREE.Texture | null
}) {
  const geometry = useMemo(() => {
    const segsX = 24, segsZ = 6
    const w = 1.00, d = 0.58, thickness = 0.08
    const halfW = w / 2
    const droopY = (x: number) => -0.15 * (x / halfW) ** 2

    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const addV = (x: number, y: number, z: number, u: number, v: number) => {
      pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1
    }

    // 上面・下面の頂点グリッド
    const top: number[][] = [], bot: number[][] = []
    for (let zi = 0; zi <= segsZ; zi++) {
      top.push([]); bot.push([])
      for (let xi = 0; xi <= segsX; xi++) {
        const x = (xi / segsX - 0.5) * w
        const z = (zi / segsZ - 0.5) * d
        const y = droopY(x)
        top[zi].push(addV(x, y, z, xi / segsX, zi / segsZ))
        bot[zi].push(addV(x, y - thickness, z, xi / segsX, zi / segsZ))
      }
    }

    // 上面ポリゴン（上向き法線）
    for (let zi = 0; zi < segsZ; zi++)
      for (let xi = 0; xi < segsX; xi++) {
        const [a, b, c, dd] = [top[zi][xi], top[zi][xi+1], top[zi+1][xi], top[zi+1][xi+1]]
        idx.push(a, c, b, b, c, dd)
      }

    // 下面ポリゴン（下向き法線）
    for (let zi = 0; zi < segsZ; zi++)
      for (let xi = 0; xi < segsX; xi++) {
        const [a, b, c, dd] = [bot[zi][xi], bot[zi][xi+1], bot[zi+1][xi], bot[zi+1][xi+1]]
        idx.push(a, b, c, b, dd, c)
      }

    // 前壁
    for (let xi = 0; xi < segsX; xi++) {
      idx.push(top[0][xi], top[0][xi+1], bot[0][xi], top[0][xi+1], bot[0][xi+1], bot[0][xi])
    }
    // 後壁
    for (let xi = 0; xi < segsX; xi++) {
      idx.push(top[segsZ][xi], bot[segsZ][xi], top[segsZ][xi+1], top[segsZ][xi+1], bot[segsZ][xi], bot[segsZ][xi+1])
    }
    // 左壁
    for (let zi = 0; zi < segsZ; zi++) {
      idx.push(top[zi][0], bot[zi][0], top[zi+1][0], top[zi+1][0], bot[zi][0], bot[zi+1][0])
    }
    // 右壁
    for (let zi = 0; zi < segsZ; zi++) {
      idx.push(top[zi][segsX], top[zi+1][segsX], bot[zi][segsX], top[zi+1][segsX], bot[zi+1][segsX], bot[zi][segsX])
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry}>
      {/* key でテクスチャ有無の切替時にマテリアルを作り直す（白くなる不具合対策） */}
      <meshPhysicalMaterial
        key={map ? map.uuid : 'plain'}
        color={map ? '#ffffff' : color}
        map={map ?? undefined}
        roughness={roughness}
        metalness={metalness}
        clearcoat={0.45}
        clearcoatRoughness={0.35}
      />
    </mesh>
  )
}

// シャリ - ふっくらした楕円（共通）
export function Shari() {
  return (
    <mesh position={[0, 0.29, 0]} scale={[1.52, 0.56, 0.88]}>
      <sphereGeometry args={[0.31, 28, 20]} />
      <meshStandardMaterial color="#f5f0e8" roughness={0.88} metalness={0} />
    </mesh>
  )
}

// マヨネーズの絞り（ジグザグの一本チューブ）
function MayoSqueeze() {
  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 6; i++) {
      const x = -0.2 + (i / 6) * 0.4
      const z = (i % 2 === 0 ? 1 : -1) * 0.075
      pts.push(new THREE.Vector3(x, 0.6 + (i % 2) * 0.005, z))
    }
    return new THREE.CatmullRomCurve3(pts)
  }, [])
  return (
    <mesh>
      <tubeGeometry args={[curve, 36, 0.022, 8, false]} />
      <meshPhysicalMaterial color="#f8f4e8" roughness={0.3} metalness={0} clearcoat={0.6} clearcoatRoughness={0.25} />
    </mesh>
  )
}

// 握りの薬味トッピング共通描画
export function NigiriTopping({ topping }: { topping?: string | null }) {
  if (topping === 'オニオン') {
    // 白い薄切りスライス
    return (
      <>
        {([
          [-0.15, 0.05, 0.3], [0.05, -0.08, -0.4], [0.18, 0.1, 0.9], [-0.02, 0.12, 1.8],
        ] as Array<[number, number, number]>).map(([x, z, ry], i) => (
          <mesh key={i} position={[x, 0.55, z]} rotation={[0, ry, 0]} scale={[1, 0.25, 0.35]}>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshPhysicalMaterial color="#f4f1e8" roughness={0.35} metalness={0} clearcoat={0.5} clearcoatRoughness={0.3} transparent opacity={0.92} />
          </mesh>
        ))}
      </>
    )
  }
  if (topping === '大葉') {
    // ネタの下・前後の縁からのぞく緑の葉
    // ネタは両端(x方向)で垂れ下がるため、x幅はネタ中央部に収めて貫通を防ぐ
    return (
      <mesh position={[0, 0.44, 0]} scale={[0.8, 0.035, 1.0]}>
        <sphereGeometry args={[0.36, 18, 12]} />
        <meshStandardMaterial color="#3f8f2f" roughness={0.6} metalness={0} />
      </mesh>
    )
  }
  if (topping === 'アボカド') {
    // 大きめのアボカドスライス＋マヨの絞り
    return (
      <>
        {([
          [-0.1, 0.555, 0.01, 0.2], [0.08, 0.56, -0.01, -0.25],
        ] as Array<[number, number, number, number]>).map(([x, y, z, ry], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, ry, 0]} scale={[1, 0.24, 0.62]}>
            <sphereGeometry args={[0.17, 14, 10]} />
            <meshPhysicalMaterial color="#8fba4f" roughness={0.45} metalness={0} clearcoat={0.3} clearcoatRoughness={0.4} />
          </mesh>
        ))}
        <MayoSqueeze />
      </>
    )
  }
  if (topping === '生姜') {
    // おろし生姜＋ねぎ
    return (
      <>
        <mesh position={[0, 0.565, 0]} scale={[1.3, 0.5, 1]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color="#e6c46a" roughness={0.75} metalness={0} />
        </mesh>
        {([[0.1, 0.555, 0.05], [-0.09, 0.55, -0.04]] as Array<[number, number, number]>).map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshStandardMaterial color="#54b435" roughness={0.6} metalness={0} />
          </mesh>
        ))}
      </>
    )
  }
  if (topping === 'ネギ') {
    // 刻みねぎを散らす
    return (
      <>
        {([
          [0, 0.555, 0], [0.14, 0.545, 0.06], [-0.13, 0.55, -0.05], [0.06, 0.55, -0.1], [-0.05, 0.545, 0.1],
        ] as Array<[number, number, number]>).map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.028, 8, 6]} />
            <meshStandardMaterial color="#54b435" roughness={0.6} metalness={0} />
          </mesh>
        ))}
      </>
    )
  }
  return null
}
