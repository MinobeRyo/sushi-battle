import { Shari, NigiriNeta, NigiriTopping } from './SushiPrimitives'
import { NETA_MAT, BASE_NETA_COLOR } from './sushiMaterials'
import { useStripeTexture, useHikariTexture, useEbiTexture, useTakoTexture, useCheeseTexture, useToroTexture, TORO_CONF, useNikuTexture, NIKU_TEX_CONF } from './sushiTextures'
import { RoundedBox } from '@react-three/drei'

export function NigiriSushi({ archetype, base, topping, colorOverride, paleHikari }: {
  archetype: string; base: string; topping?: string | null; colorOverride?: string; paleHikari?: boolean
}) {
  const mat = NETA_MAT[archetype] ?? NETA_MAT.general
  const netaColor = colorOverride ?? BASE_NETA_COLOR[base] ?? mat.color
  const stripeTex = useStripeTexture(base, netaColor)
  const hikariTex = useHikariTexture(archetype === 'hikari' ? netaColor : null, paleHikari)
  return (
    <group>
      <Shari />
      {/* ネタ - シャリの上から両端に垂れ下がる曲面 */}
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={netaColor} roughness={mat.roughness} metalness={mat.metalness} map={stripeTex ?? hikariTex} />
      </group>
      <NigiriTopping topping={topping} />
    </group>
  )
}

// えび握り：縞模様の身＋扇状の尾
export function EbiNigiri({ topping }: { topping?: string | null }) {
  const tex = useEbiTexture()
  return (
    <group>
      <Shari />
      <NigiriTopping topping={topping} />
      <group position={[0, 0.53, 0]} scale={[0.96, 1, 0.92]}>
        <NigiriNeta color="#f7ecdc" roughness={0.5} metalness={0} map={tex} />
      </group>
      {/* 尾：ネタの端から水平に広がる平たい扇（先端がやや上向き） */}
      <group position={[0.46, 0.4, 0]} rotation={[0, 0, 0.18]}>
        {/* 付け根（ネタ端との接続部） */}
        <mesh position={[0.01, 0, 0]} scale={[1.6, 0.55, 0.6]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshPhysicalMaterial color="#e04a20" roughness={0.4} metalness={0} clearcoat={0.5} clearcoatRoughness={0.3} />
        </mesh>
        {/* 平たい尾びれ3枚 */}
        {[-0.55, 0, 0.55].map((a, i) => (
          <mesh
            key={i}
            position={[0.12 * Math.cos(a), 0.01, -0.12 * Math.sin(a)]}
            rotation={[0, a, 0.15]}
            scale={[1, 0.2, 0.42]}
          >
            <sphereGeometry args={[0.14, 14, 10]} />
            <meshPhysicalMaterial color="#e04a20" roughness={0.4} metalness={0} clearcoat={0.5} clearcoatRoughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// たこ握り：白い身＋赤紫の皮エッジ
export function TakoNigiri() {
  const tex = useTakoTexture()
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color="#f4ede6" roughness={0.35} metalness={0} map={tex} />
      </group>
    </group>
  )
}

export function CheeseNigiri() {
  const tex = useCheeseTexture()
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color="#f4dc94" roughness={0.35} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// 天ぷら握り：衣付きの太い揚げ物＋（えび天のみ）赤い尾
const TEMPURA_SEGS: Array<[number, number, number]> = [
  [-0.32, 0.6, 0], [-0.1, 0.63, 0], [0.13, 0.63, 0], [0.34, 0.6, 0],
]

const TEMPURA_BUMPS: Array<[number, number, number]> = [
  [-0.4, 0.66, 0.06], [-0.18, 0.71, -0.07], [0.03, 0.71, 0.08], [0.24, 0.69, -0.06],
  [0.44, 0.62, 0.05], [-0.28, 0.65, 0.12], [0.15, 0.67, 0.13], [0.35, 0.64, -0.11],
]

export function TempuraNigiri({ tail }: { tail: boolean }) {
  return (
    <group>
      <Shari />
      {/* 衣の本体 */}
      {TEMPURA_SEGS.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1.25, 0.8, 0.95]}>
          <sphereGeometry args={[0.17, 14, 10]} />
          <meshStandardMaterial color="#dfa042" roughness={0.78} metalness={0} />
        </mesh>
      ))}
      {/* 衣のサクサク感（小さな凹凸） */}
      {TEMPURA_BUMPS.map(([x, y, z], i) => (
        <mesh key={`b${i}`} position={[x, y, z]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#e9b45e" roughness={0.8} metalness={0} />
        </mesh>
      ))}
      {/* えび天の尾 */}
      {tail && (
        <group position={[0.5, 0.58, 0]} rotation={[0, 0, 0.45]}>
          <mesh position={[0.02, 0, 0]} scale={[1.3, 0.75, 0.85]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshPhysicalMaterial color="#de3a12" roughness={0.45} metalness={0} clearcoat={0.4} clearcoatRoughness={0.3} />
          </mesh>
          {[-0.4, 0, 0.4].map((a, i) => (
            <mesh key={i} position={[0.12, 0.04, 0]} rotation={[0, a, -Math.PI / 2 + 0.35]} scale={[0.32, 1, 1]}>
              <coneGeometry args={[0.09, 0.24, 10]} />
              <meshPhysicalMaterial color="#de3a12" roughness={0.45} metalness={0} clearcoat={0.4} clearcoatRoughness={0.3} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

// いなり：角丸の俵型ひとつ（参考画像準拠）
export function InariSushi() {
  return (
    <group rotation={[0, 0.18, 0]}>
      <RoundedBox args={[0.92, 0.38, 0.56]} radius={0.13} smoothness={4} position={[0, 0.33, 0]}>
        <meshPhysicalMaterial color="#b97a2e" roughness={0.55} metalness={0} clearcoat={0.35} clearcoatRoughness={0.5} />
      </RoundedBox>
    </group>
  )
}

export function ToroNigiri({ kind }: { kind: string }) {
  const tex = useToroTexture(kind)
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={TORO_CONF[kind]?.flesh ?? '#e05c48'} roughness={0.5} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// 肉寿司：サシ・炙り目・タレのツヤ
export function NikuNigiri({ base }: { base: string }) {
  const tex = useNikuTexture(base)
  const conf = NIKU_TEX_CONF[base]
  return (
    <group>
      <Shari />
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color={conf?.flesh ?? '#7c3014'} roughness={0.45} metalness={0} map={tex} />
      </group>
    </group>
  )
}

// たまご握り：従来の薄いネタ＋ぴったり巻き付く海苔帯
export function TamagoNigiri() {
  return (
    <group>
      <Shari />
      {/* たまごのネタ（垂れ下がる曲面） */}
      <group position={[0, 0.53, 0]}>
        <NigiriNeta color="#f5c518" roughness={0.5} metalness={0} />
      </group>
      {/* 海苔帯：ネタの上 */}
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[0.22, 0.016, 0.6]} />
        <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
      </mesh>
      {/* 海苔帯：両側面（ネタとシャリに沿って下りる） */}
      {[-0.3, 0.3].map((z) => (
        <mesh key={z} position={[0, 0.32, z]}>
          <boxGeometry args={[0.22, 0.46, 0.016]} />
          <meshStandardMaterial color="#1a2410" roughness={0.85} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
