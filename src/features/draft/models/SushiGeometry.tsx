import type { Card } from '../../../types'
import { MakiPlate, FutomakiPlate, NattoMaki } from './MakiModels'
import { NegitoroGunkan, TakowasaGunkan, SeafoodGunkan, GunkanSushi, EbiGunkan, KaniGunkan, TunaGunkan } from './GunkanModels'
import { ToroNigiri, TempuraNigiri, InariSushi, CheeseNigiri, NikuNigiri, EbiNigiri, TakoNigiri, TamagoNigiri, NigiriSushi } from './NigiriModels'
import { NamahamuModel } from './NamahamuModel'
import { AigamoModel } from './AigamoModel'
import { Shari, NigiriNeta } from './SushiPrimitives'
import { BASE_NETA_COLOR } from './sushiMaterials'
import { useStripeTexture, useHikariTexture, useNikuTexture } from './sushiTextures'

// ─── Sushi geometry ──────────────────────────────────────────────────────────

const GUNKAN_BASES = new Set(['うに', 'いくら', 'とびこ', 'コーン', '明太子', '納豆', 'うめ', 'アボカド'])

// 同じ base でも名前で色を変えたい握り
const NIGIRI_NAME_COLOR: Record<string, string> = {
  'ビントロ': '#e89f92',   // びんちょうの淡いピンク
  'づけマグロ': '#8a1220', // 漬けの濃い赤
}

export function SushiGeometry({ card }: { card: Card }) {
  if (card.variant === 'neta_missing') return <DroppedNetaSushi card={card} />
  if (card.variant === 'sideways' || card.variant === 'rare_corn') {
    return <group position={[0, 0.32, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
      <UprightSushiGeometry card={card} />
    </group>
  }
  return <UprightSushiGeometry card={card} />
}

// シャリだけの握りと、皿に落ちた平たいネタを別々に置く。
function DroppedNetaSushi({ card }: { card: Card }) {
  const color = BASE_NETA_COLOR[card.base] ?? '#b44d37'
  const fishTexture = useStripeTexture(card.base, color)
  const hikariTexture = useHikariTexture(card.archetype.includes('hikari') ? color : null)
  const meatTexture = useNikuTexture(card.base)
  return <group>
    <group position={[0.12, 0, -0.16]} scale={[0.9, 1, 0.88]}><Shari /></group>
    <group position={[-0.13, 0.19, 0.31]} rotation={[0, -0.24, 0]} scale={[0.88, 0.38, 0.75]}>
      <NigiriNeta color={color} roughness={0.6} metalness={0} map={card.archetype.includes('niku') ? meatTexture : fishTexture ?? hikariTexture} />
    </group>
  </group>
}

function UprightSushiGeometry({ card }: { card: Card }) {
  const archetype = card.archetype[0]
  const name = card.name.replace(/^(真横を向いた|ネタが落ちた)/, '')
  if (card.base === '生ハム') return <NamahamuModel />
  if (card.id === 'aigamo' || card.base === '合鴨') return <AigamoModel />
  // 専用モデル（名前ベースの判定を先に）
  if (name.includes('ネギトロ')) {
    if (name.includes('巻')) return <MakiPlate base={card.base} negitoro />
    return <NegitoroGunkan /> // ネギトロは軍艦仕立て（海苔付き）
  }
  if (name === '太巻き') return <FutomakiPlate />
  if (name === '納豆巻き') return <NattoMaki />
  if (name === 'たこわさ') return <TakowasaGunkan />
  if (card.base === 'シーフード') return <SeafoodGunkan />
  if (name === '中トロ' || name === '大トロ') return <ToroNigiri kind={name} />
  if (card.id === 'tuna_gunkan' || name === 'ツナ軍艦') return <TunaGunkan />
  if (name === 'えび軍艦') return <EbiGunkan />
  if (name === 'カニ軍艦') return <KaniGunkan />
  if (name.includes('天')) return <TempuraNigiri tail={card.base === 'えび'} />
  if (card.base === 'いなり') return <InariSushi />
  if (card.base === 'チーズ') return <CheeseNigiri />
  if (archetype === 'niku') return <NikuNigiri base={card.base} />
  if (card.id.includes('gunkan') || card.name.includes('軍艦') || card.variant === 'rare_corn') return <GunkanSushi base={card.base} mayo={card.topping === 'マヨ'} />
  // 鉄火巻きなど archetype が ['akami', 'makimono'] の複合カードも巻物として扱う
  if (card.archetype.includes('makimono') || name.includes('巻き')) return <MakiPlate base={card.base} />
  if (GUNKAN_BASES.has(card.base)) return <GunkanSushi base={card.base} mayo={card.topping === 'マヨ'} />
  if (card.base === 'えび') return <EbiNigiri topping={card.topping} />
  if (card.base === 'たこ') return <TakoNigiri />
  if (card.base === 'たまご') return <TamagoNigiri />
  return (
    <NigiriSushi
      archetype={archetype}
      base={card.base}
      topping={name === 'アジたたき' ? 'ネギ' : card.topping}
      colorOverride={NIGIRI_NAME_COLOR[name]}
      paleHikari={name === 'シメサバ'}
    />
  )
}
