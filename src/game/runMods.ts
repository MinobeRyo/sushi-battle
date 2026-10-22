import type { Card, CardBoost } from '../types'
import type { RegularSkillId, RelicId } from '../data/runRelics'

/** ボスの専用ルール。osusumeEvery ターンごとに本日のおすすめ、tea なら締めのお茶。 */
export type BossRule = { name: string; osusumeEvery?: number | null; tea?: boolean }

// 寿司はしご専用の試合補正。通常対戦・オンラインでは MatchPlayer.mods を持たないため何も変わらない。

export type PlayerMods = {
  relics?: readonly RelicId[]
  skill?: RegularSkillId
  /** 敵デッキのうち炙り版にする割合（0〜1）。後半の大食い客ほど高い。 */
  aburiRate?: number
  /** 幕のボスの専用ルール（本日のおすすめ・締めのお茶）。 */
  boss?: BossRule
}

export const hasRelic = (mods: PlayerMods | undefined, id: RelicId) => Boolean(mods?.relics?.includes(id))
export const hasSkill = (mods: PlayerMods | undefined, id: RegularSkillId) => mods?.skill === id

/** 器・得意技のうち、1枚ごとの数値に落とせるものをカードへ書き込む。生成されたカードにも同じ処理を通す。 */
export function applyCardMods(card: Card, mods: PlayerMods | undefined): Card {
  if (!mods) return card
  // 炙り好き（得意技）はデッキの半分を炙る。割合での炙りは matchEngine の createMatch で行う。
  let result = card
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
  if (hasRelic(mods, 'gunkan_kata') && result.archetype.includes('gunkan')) boost.gunkanMult = 2
  if (hasRelic(mods, 'norikan') && isMaki) boost.norikan = true
  if (hasRelic(mods, 'tako_tsubo') && result.effect === 'chain_on_kaisen_summon') boost.chainExtra = 3
  if (hasRelic(mods, 'tairyo_bata') && result.archetype.includes('kaisen')) boost.fullReattack = true
  if (hasRelic(mods, 'amimoto_ami') && result.effect === 'chain_on_kaisen_summon') boost.noDecay = true
  if (hasSkill(mods, 'sarazumi')) boost.sarazumi = true
  // 何も付かないカードにも空の boost を付けて「処理済み」の印にする（巻きすの二重加算を防ぐ）。
  return { ...result, boost }
}
