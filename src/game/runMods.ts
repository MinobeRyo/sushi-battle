import type { Card, CardBoost } from '../types'
import { canAburi, toAburi } from '../data/aburi'
import type { RegularSkillId, RelicId } from '../data/runRelics'

// 寿司はしご専用の試合補正。通常対戦・オンラインでは MatchPlayer.mods を持たないため何も変わらない。

export type PlayerMods = {
  relics?: readonly RelicId[]
  skill?: RegularSkillId
}

export const hasRelic = (mods: PlayerMods | undefined, id: RelicId) => Boolean(mods?.relics?.includes(id))
export const hasSkill = (mods: PlayerMods | undefined, id: RegularSkillId) => mods?.skill === id

/** 器・得意技のうち、1枚ごとの数値に落とせるものをカードへ書き込む。生成されたカードにも同じ処理を通す。 */
export function applyCardMods(card: Card, mods: PlayerMods | undefined): Card {
  if (!mods) return card
  let result = hasSkill(mods, 'aburi_zuki') && canAburi(card) ? toAburi(card) : card
  const boost: CardBoost = { ...result.boost }
  const isMaki = result.archetype.includes('makimono')
  if (hasRelic(mods, 'shichirin') && result.aburi && !boost.shichirin) {
    result = { ...result, attack: result.attack + 4 }
    boost.shichirin = true
  }
  if (hasRelic(mods, 'makisu') && isMaki && result.type === 'persist' && !result.boost) {
    result = { ...result, fullness: result.fullness + 2 }
  }
  if (hasRelic(mods, 'meiko_deba') && result.archetype.includes('hikari')) boost.kiretaMult = 2
  if (hasRelic(mods, 'gunkan_kata') && result.archetype.includes('gunkan')) boost.gunkanMult = 3
  if (hasRelic(mods, 'norikan') && isMaki) boost.norikan = true
  if (hasRelic(mods, 'tako_tsubo') && result.effect === 'chain_on_kaisen_summon') boost.chainExtra = 3
  if (hasRelic(mods, 'tairyo_bata') && result.archetype.includes('kaisen')) boost.fullReattack = true
  if (hasRelic(mods, 'amimoto_ami') && result.effect === 'chain_on_kaisen_summon') boost.noDecay = true
  if (hasSkill(mods, 'sarazumi')) boost.sarazumi = true
  // 何も付かないカードにも空の boost を付けて「処理済み」の印にする（巻きすの二重加算を防ぐ）。
  return { ...result, boost }
}
