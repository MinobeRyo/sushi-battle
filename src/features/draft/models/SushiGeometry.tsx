import type { Card } from '../../../types'
import { MakiPlate, FutomakiPlate, NattoMaki } from './MakiModels'
import { NegitoroGunkan, TakowasaGunkan, SeafoodGunkan, GunkanSushi, EbiGunkan, KaniGunkan } from './GunkanModels'
import { ToroNigiri, TempuraNigiri, InariSushi, CheeseNigiri, NikuNigiri, EbiNigiri, TakoNigiri, TamagoNigiri, NigiriSushi } from './NigiriModels'
import { NamahamuModel } from './NamahamuModel'

// ─── Sushi geometry ──────────────────────────────────────────────────────────

const GUNKAN_BASES = new Set(['うに', 'いくら', 'とびこ', 'コーン', '明太子', '納豆', 'うめ', 'アボカド'])

// 同じ base でも名前で色を変えたい握り
const NIGIRI_NAME_COLOR: Record<string, string> = {
  'ビントロ': '#e89f92',   // びんちょうの淡いピンク
  'づけマグロ': '#8a1220', // 漬けの濃い赤
}

export function SushiGeometry({ card }: { card: Card }) {
  const archetype = card.archetype[0]
  const name = card.name
  if (card.base === '生ハム') return <NamahamuModel />
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
  if (name === 'ツナ軍艦') return <GunkanSushi base="ツナサラダ" /> // マグロ色ではなくツナマヨ色に
  if (name === 'えび軍艦') return <EbiGunkan />
  if (name === 'カニ軍艦') return <KaniGunkan />
  if (name.includes('天')) return <TempuraNigiri tail={card.base === 'えび'} />
  if (card.base === 'いなり') return <InariSushi />
  if (card.base === 'チーズ') return <CheeseNigiri />
  if (archetype === 'niku') return <NikuNigiri base={card.base} />
  if (card.id.includes('gunkan') || card.name.includes('軍艦')) return <GunkanSushi base={card.base} />
  // 鉄火巻きなど archetype が ['akami', 'makimono'] の複合カードも巻物として扱う
  if (card.archetype.includes('makimono') || name.includes('巻き')) return <MakiPlate base={card.base} />
  if (GUNKAN_BASES.has(card.base)) return <GunkanSushi base={card.base} />
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
