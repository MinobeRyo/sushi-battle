import { KaraageModel, FriesModel, TempuraModel } from './FriedSideModels'
import { RamenModel, MisoSoupModel, ChawanmushiModel } from './BowlSideModels'
import type { SideMenuId } from '../sideMenuCatalog'

/** 皿・器を含むモデル。底面 y=0、原点中心なのでゲームの机にもそのまま配置できる。 */
export function SideMenuModel({ id }: { id: SideMenuId }) {
  switch (id) {
    case 'karaage': return <KaraageModel />
    case 'fries': return <FriesModel />
    case 'tempura': return <TempuraModel />
    case 'ramen': return <RamenModel />
    case 'miso': return <MisoSoupModel />
    case 'chawanmushi': return <ChawanmushiModel />
  }
}
