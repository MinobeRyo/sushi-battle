import type { Archetype } from '../types'

// 寿司はしご専用の「器」と、常連さんの「得意技」。数値は企画書8章・9-2の仮の値。

export type RelicGrade = 'nami' | 'jo' | 'tokujo'
export type RelicId =
  | 'wasabi_tsubo' | 'saku_bako' | 'ipponzuri'
  | 'makisu' | 'norikan' | 'gunkan_kata'
  | 'toishi' | 'togi_oke' | 'meiko_deba'
  | 'tako_tsubo' | 'tairyo_bata' | 'amimoto_ami'
  | 'teppan' | 'hiden_tare' | 'yakiami'
  | 'nairei_yunomi' | 'shichirin' | 'takekawa'

export type RelicDefinition = {
  id: RelicId
  name: string
  archetype: Exclude<Archetype, 'gunkan'>
  grade: RelicGrade
  text: string
}

export const RELIC_GRADE_LABEL: Readonly<Record<RelicGrade, string>> = { nami: '並', jo: '上', tokujo: '特上' }

export const RELICS: readonly RelicDefinition[] = [
  { id: 'wasabi_tsubo', name: 'わさび壺', archetype: 'akami', grade: 'nami', text: '赤身三種盛りが、マグロ・中トロ・大トロのうち2種で成立する' },
  { id: 'saku_bako', name: '本鮪の柵箱', archetype: 'akami', grade: 'jo', text: '赤身を出すと、そのターン手札の赤身のAPが1下がる' },
  { id: 'ipponzuri', name: '一本釣りの竿', archetype: 'akami', grade: 'tokujo', text: '赤身三種盛りの後、赤身を出すたびに10ダメージ' },
  { id: 'makisu', name: '巻きす', archetype: 'makimono', grade: 'nami', text: '持続型の巻物の持続＋2' },
  { id: 'norikan', name: '海苔缶', archetype: 'makimono', grade: 'jo', text: '巻物コンプの判定で、机の巻物を2枚多く数える' },
  { id: 'gunkan_kata', name: '軍艦の型枠', archetype: 'makimono', grade: 'tokujo', text: '巻物フルコンプ中、軍艦の攻撃が1.5倍ではなく3倍' },
  { id: 'toishi', name: '砥石', archetype: 'hikari', grade: 'nami', text: '試合開始時に切れ味＋3' },
  { id: 'togi_oke', name: '研ぎ桶', archetype: 'hikari', grade: 'jo', text: 'コハダで使った切れ味の半分が、ターン終了後に戻る' },
  { id: 'meiko_deba', name: '名工の出刃', archetype: 'hikari', grade: 'tokujo', text: '切れ味による攻撃強化が2倍' },
  { id: 'tako_tsubo', name: 'たこ壺', archetype: 'kaisen', grade: 'nami', text: 'いか・たこの連鎖＋3' },
  { id: 'tairyo_bata', name: '大漁旗', archetype: 'kaisen', grade: 'jo', text: '海の幸三昧の再攻撃が50%ではなく100%' },
  { id: 'amimoto_ami', name: '網元の網', archetype: 'kaisen', grade: 'tokujo', text: 'いか・たこの持続が減らない' },
  { id: 'teppan', name: '鉄板', archetype: 'niku', grade: 'nami', text: '生ハムを生成するたびにもう1体（1試合3回まで）' },
  { id: 'hiden_tare', name: '秘伝のタレ', archetype: 'niku', grade: 'jo', text: '生贄にした生ハムが山札に戻る' },
  { id: 'yakiami', name: '焼き網', archetype: 'niku', grade: 'tokujo', text: '肉祭りが1ターンに何度でも成立する' },
  { id: 'nairei_yunomi', name: '名入れ湯呑み', archetype: 'general', grade: 'nami', text: '毎試合ガリ＋1' },
  { id: 'shichirin', name: '七輪', archetype: 'general', grade: 'jo', text: '炙り済みの寿司の攻撃さらに＋4' },
  { id: 'takekawa', name: '竹皮の包み', archetype: 'general', grade: 'jo', text: 'おかわりのたびに2枚引き、AP＋2' },
]

export const RELIC_BY_ID: Readonly<Record<RelicId, RelicDefinition>> =
  Object.fromEntries(RELICS.map(relic => [relic.id, relic])) as Record<RelicId, RelicDefinition>

export const isRelicId = (value: unknown): value is RelicId => typeof value === 'string' && value in RELIC_BY_ID

export type RegularSkillId = 'hayagui' | 'sokonashi' | 'gari_yama' | 'sarazumi' | 'joren_tokken' | 'aburi_zuki'

export const REGULAR_SKILLS: ReadonlyArray<{ id: RegularSkillId; name: string; text: string }> = [
  { id: 'hayagui', name: '早食い', text: '毎ターンAP＋1' },
  { id: 'sokonashi', name: '底なし胃袋', text: '消化が2倍' },
  { id: 'gari_yama', name: 'ガリ山盛り', text: 'ガリ＋3' },
  { id: 'sarazumi', name: '皿積み', text: '机の寿司1枚につき、すべての攻撃＋1' },
  { id: 'joren_tokken', name: '常連特権', text: '最初の手札7枚' },
  { id: 'aburi_zuki', name: '炙り好き', text: 'デッキの半分が炙り版' },
]

export const REGULAR_SKILL_BY_ID: Readonly<Record<RegularSkillId, { id: RegularSkillId; name: string; text: string }>> =
  Object.fromEntries(REGULAR_SKILLS.map(skill => [skill.id, skill])) as Record<RegularSkillId, { id: RegularSkillId; name: string; text: string }>
