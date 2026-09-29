import type { Card } from '../types'
import { CARDS, NAMAHAM_CARD } from '../data/cards'
import type { FieldCard, RandomSource } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────
export const MAX_BELLY = 100

export const HAND_LIMIT = 7

export const FIELD_MAX = 8

export const INIT_AP = 2

export const INIT_GARI = 2

export const GARI_REDUCTION = 8

const DIGESTION_MAX = 5

const CHAIN_BONUS = 3

const DIGEST_BOOST = 2 // digest_boost_2: 机にいる間の消化量ボーナス

export const MAKI_COMP_3 = 3 // 巻物コンプ①: 机に同時この枚数で以降ドロー+1（1試合1回）

export const MAKI_COMP_5 = 5 // 巻物コンプ②: 机に同時この枚数の間、軍艦の攻撃1.5倍（状態継続）

export const GUNKAN_BOOST = 1.5

const KAISEN_REATTACK = 0.5 // 海の幸三昧: 場の海鮮カードがこの倍率で再攻撃

export const OBA_REQUIRED = 3 // 光り物三昧: 大葉トッピングの累計召喚数

const KIRETA_MULT = 3 // コハダ: 切れ味全消費 ×この倍率

const NIKU_REQUIRED = 2 // 肉祭り: 同ターンに生贄にした生ハムの累計
const NIKU_DAMAGE = 5

export const REORDER_BUDGET = 1500 // 追加注文タイムの軍資金

export const REORDER_SECONDS = 45 // 追加注文タイムの制限時間

// 消化量：序盤は軽く、ターンが進むごとに増えて最大5で頭打ち
// （1ターン目終了時 -2 → 2T -3 → 3T -4 → 4T以降 -5）
export function digestionAmount(round: number) {
  return Math.min(DIGESTION_MAX, 1 + round)
}

// 海鮮連鎖を起動するbase
const CHAIN_TRIGGER_BASES = new Set(['いか', 'たこ', 'えび'])

export const CARD_BY_ID: Record<string, Card> =
  Object.fromEntries(CARDS.map(c => [c.id, c]))

// digest_boost_2 を持つカードが机にいる枚数ぶん、毎ターンの消化量が増える
export function digestBonus(field: FieldCard[]) {
  return field.filter(c => c.effect === 'digest_boost_2').length * DIGEST_BOOST
}

export function makimonoCount(field: FieldCard[]) {
  return field.filter(c => c.archetype.includes('makimono')).length
}

// ── Combos ────────────────────────────────────────────────────────────────────
export type ComboMeta = { id: string; name: string; emoji: string; desc: string }

// 発動タイミングの分類
//   1試合1回 : 永続効果を配るもの（赤身三種盛り / 巻物コンプ① / 光り物三昧）
//   都度発動 : 条件を満たすたび何度でも（海の幸三昧 / 肉祭り）
//   状態継続 : 条件を満たしている間ずっと有効（巻物コンプ②＝軍艦1.5倍）
// 実際の判定は applySummon と calcFieldDmg にある。ここは演出用のメタ情報だけ。
export const COMBO_META: Record<string, ComboMeta> = {
  akami_mori: {
    id: 'akami_mori', name: '赤身三種盛り！！！', emoji: '🐟',
    desc: '即時+10ダメージ / 以降マグロ系の攻撃+2',
  },
  maki_comp_3: {
    id: 'maki_comp_3', name: '巻物コンプ！！！', emoji: '🌀',
    desc: '机に巻物3枚 — 以降ドロー+1',
  },
  maki_comp_5: {
    id: 'maki_comp_5', name: '巻物フルコンプ！！！', emoji: '🍙',
    desc: '机に巻物5枚 — 維持している間、軍艦の攻撃1.5倍',
  },
  hikari_zanmai: {
    id: 'hikari_zanmai', name: '光り物三昧！！！', emoji: '✨',
    desc: '大葉3枚 — 切れ味スタック+3',
  },
  umi_zanmai: {
    id: 'umi_zanmai', name: '海の幸三昧！！！', emoji: '🌊',
    desc: '場の海鮮カードが50%の威力で再攻撃',
  },
  niku_matsuri: {
    id: 'niku_matsuri', name: '肉祭り！！！', emoji: '🥩',
    desc: '同じターンに生ハムを累計2体生贄にすると、即時+5ダメージ（1ターンに1回）',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const toField = (c: Card, fid: string = c.id): FieldCard => ({
  ...c, fid,
  turnsLeft: c.type === 'persist' ? Math.max(c.fullness, 2) : 1,
})

export function shuffled<T>(arr: T[], random: RandomSource = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type DmgOpts = {
  nikuMatsuri?: boolean   // 既存表示APIとの互換用。肉祭りは召喚時の即時ダメージだけ。
  gunkanBoost?: boolean   // 巻物コンプ②: 未指定なら渡された field から判定する
}

export function calcFieldDmg(
  field: FieldCard[],
  buff: Record<string, number>,
  kiretaStack = 0,
  enemyBelly = 0,
  opts: DmgOpts = {},
) {
  const gunkanBoost = opts.gunkanBoost ?? (makimonoCount(field) >= MAKI_COMP_5)
  return field.reduce((sum, c) => {
    // 複数base（太巻きの subBases）を持つカードは、最も高い base バフを1つだけ受ける
    const baseBuff = [c.base, ...(c.subBases ?? [])]
      .reduce((mx, b) => Math.max(mx, buff[b] ?? 0), 0)
    const base = c.attack + baseBuff + (c.turnAttackBonus ?? 0)
    const kiretaBonus = c.archetype.includes('hikari') ? kiretaStack : 0
    let effectBonus = 0
    switch (c.effect) {
      case 'belly_boost_60': if (enemyBelly >= 60) effectBonus = 5; break
      case 'belly_boost_70': if (enemyBelly >= 70) effectBonus = 8; break
      case 'belly_boost_65': if (enemyBelly >= 65) effectBonus = 6; break
      case 'belly_boost_persist_50': if (enemyBelly >= 50) effectBonus = 2; break
    }
    let total = base + kiretaBonus + effectBonus
    if (gunkanBoost && c.archetype.includes('gunkan')) {
      total = Math.floor(total * GUNKAN_BOOST)
    }
    return sum + total
  }, 0)
}

// ── 召喚処理（プレイヤー / CPU 共通の純関数） ────────────────────────────────

export function getSacrificeLimit(card: Card): number {
  return card.effect === 'sacrifice_namahamu_1_7' ? 1 : card.effect === 'sacrifice_namahamu_2_8' ? 2 : 0
}

export function getSacrificeBonus(card: Card): number {
  return card.effect === 'sacrifice_namahamu_1_7' ? 7 : card.effect === 'sacrifice_namahamu_2_8' ? 8 : 0
}

export function countNamahamu(field: FieldCard[]): number {
  return field.filter(card => card.id === NAMAHAM_CARD.id).length
}

export function getSacrificeError(card: Card, field: FieldCard[], count: unknown = 0): string | undefined {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > getSacrificeLimit(card)) {
    return 'invalid_sacrifice_count'
  }
  if (count > countNamahamu(field)) return 'not_enough_namahamu'
  return undefined
}

type SummonInput = {
  fieldId?: string
  card: Card
  belly: number
  kireta: number
  field: FieldCard[]
  summonedIds: string[]
  summonedArch: Record<string, number>
  thisTurnBases: string[]
  thisTurnArch: Record<string, number>
  combosFired: string[]
  attackBuff: Record<string, number>
  drawBonus: number
  nikuMatsuri: boolean
  sacrificedThisTurn?: number
  sacrificeCount?: number
  kiretaSpent: boolean
  enemyBelly: number
  turnAttackBonus?: number
}

type SummonResult = Omit<SummonInput, 'card' | 'enemyBelly' | 'fieldId' | 'sacrificeCount'> & {
  sacrificedThisTurn: number
  extraDmg: number
  stopOppDigest: boolean
  drawNow: number   // 召喚時ドロー枚数
  apNext: number    // 次のターンだけのAPボーナス
  fired: ComboMeta[]
  logs: string[]
}

export function applySummon(input: SummonInput): SummonResult {
  const { card, enemyBelly } = input
  const sacrificeCount = input.sacrificeCount ?? 0
  const sacrificeError = getSacrificeError(card, input.field, input.sacrificeCount)
  if (sacrificeError) throw new RangeError(sacrificeError)
  const logs: string[] = []
  let extraDmg = 0
  let belly = input.belly
  let kireta = input.kireta
  let stopOppDigest = false
  let drawNow = 0
  let apNext = 0
  let kiretaSpent = input.kiretaSpent
  // コハダで使い切ったあとは、数値上スタックが残っていても消費には使えない
  const usableKireta = () => (kiretaSpent ? 0 : kireta)

  // ── カード効果（即時適用）
  switch (card.effect) {
    case 'draw_1':
      drawNow = 1
      logs.push('🎴 カードを1枚引いた！')
      break
    case 'draw_2':
      drawNow = 2
      logs.push('🎴 カードを2枚引いた！')
      break
    case 'ap_next_1':
      apNext = 1
      logs.push('⚡ 次のターン AP +1！')
      break
    case 'kireta_stack':
      kireta += 1
      logs.push(`✂ 切れ味スタック +1（計${kireta}）`)
      break
    case 'kireta_consume_x3': {
      // スタックは即座には0にしない。ターン終了時の攻撃が解決してから消える。
      // そのためコハダ自身も、同じターンに出した他の光り物も切れ味ボーナスを受けられる。
      const use = usableKireta()
      if (use > 0) {
        extraDmg += use * KIRETA_MULT
        kiretaSpent = true
        logs.push(`✂ 切れ味全消費！ スタック${use} × ${KIRETA_MULT} = +${use * KIRETA_MULT} ダメージ（今ターンの攻撃には乗る）`)
      } else if (kiretaSpent) {
        logs.push('✂ このターンはすでに切れ味を使い切っている')
      } else {
        logs.push('✂ 切れ味スタックが無いため不発')
      }
      break
    }
    case 'kireta_consume_2_draw_2': {
      // スタックが2未満なら発動しない（消費もしない）
      const use = usableKireta()
      if (use >= 2) {
        kireta -= 2
        drawNow += 2
        logs.push(`✂ 切れ味2を消費して2枚ドロー！（残り${kireta}）`)
      } else if (kiretaSpent) {
        logs.push('✂ このターンはすでに切れ味を使い切っている')
      } else {
        logs.push(`✂ 切れ味スタックが足りず不発（2必要・現在${use}）`)
      }
      break
    }
    case 'self_digest_5':
      belly = Math.max(0, belly - 5)
      logs.push('🫧 消化促進！ お腹 -5')
      break
    case 'digest_boost_2':
      logs.push(`🥒 机にいる間、毎ターンの消化 +${DIGEST_BOOST}`)
      break
    case 'digest_stop_1t':
      stopOppDigest = true
      logs.push('🚫 相手の消化を1ターン止めた！')
      break
  }

  // 机の配列順は生成された順。古い生ハムから取り除いて召喚枠を空ける。
  let remainingSacrifices = sacrificeCount
  const remainingField = input.field.filter(item => {
    if (remainingSacrifices > 0 && item.id === NAMAHAM_CARD.id) {
      remainingSacrifices -= 1
      return false
    }
    return true
  })
  const sacrificedThisTurn = (input.sacrificedThisTurn ?? 0) + sacrificeCount
  const summonedCard = toField(card, input.fieldId ?? `${card.id}:${input.summonedIds.length + 1}`)
  const attackBonus = (input.turnAttackBonus ?? 0) + sacrificeCount * getSacrificeBonus(card)
  if (attackBonus) summonedCard.turnAttackBonus = attackBonus
  if (sacrificeCount) logs.push(`生ハム${sacrificeCount}体を生贄にして、${card.name}の攻撃 +${sacrificeCount * getSacrificeBonus(card)}`)
  let field = [...remainingField, summonedCard]
  const generateCount = card.effect === 'generate_namahamu_1' ? 1 : card.effect === 'generate_namahamu_2' ? 2 : 0
  if (generateCount) {
    const actualCount = Math.min(generateCount, Math.max(0, FIELD_MAX - field.length))
    for (let index = 0; index < actualCount; index++) {
      field.push(toField(NAMAHAM_CARD, `${summonedCard.fid}:namahamu:${index + 1}`))
    }
    if (actualCount) logs.push(`生ハム${actualCount}体を机に生成（攻撃1・自分の3ターン）`)
    if (actualCount < generateCount) logs.push(`机の空き枠が足りず、生ハム${generateCount - actualCount}体を生成できませんでした`)
  }

  // このカードが名乗る base 一覧（太巻きは subBases も含む）
  const cardBases = [card.base, ...(card.subBases ?? [])]

  // ── 海鮮連鎖
  if (cardBases.some(b => CHAIN_TRIGGER_BASES.has(b))) {
    const chainCards = field.filter(c => c.effect === 'chain_on_kaisen_summon')
    if (chainCards.length > 0) {
      const chainDmg = chainCards.length * CHAIN_BONUS
      extraDmg += chainDmg
      logs.push(`🔗 連鎖攻撃！ ${chainCards.map(c => c.name).join('+')} → +${chainDmg}`)
    }
  }

  // ── 召喚履歴
  const summonedIds = [...input.summonedIds, card.id]
  const summonedArch = { ...input.summonedArch }
  const thisTurnBases = [...input.thisTurnBases, ...cardBases]
  const thisTurnArch = { ...input.thisTurnArch }
  for (const a of card.archetype) {
    summonedArch[a] = (summonedArch[a] ?? 0) + 1
    thisTurnArch[a] = (thisTurnArch[a] ?? 0) + 1
  }

  // ── コンボ判定
  let attackBuff = { ...input.attackBuff }
  let drawBonus = input.drawBonus
  let nikuMatsuri = input.nikuMatsuri
  const combosFired = [...input.combosFired]
  const fired: ComboMeta[] = []

  const announce = (meta: ComboMeta, detail?: string) => {
    fired.push(meta)
    logs.push(`🎉 コンボ発動: ${meta.name}！ ${detail ?? meta.desc}`)
  }

  // 赤身三種盛り（累積・1試合1回・永続バフ）
  if (!combosFired.includes('akami_mori') &&
      ['maguro', 'chutoro', 'otoro'].every(id => summonedIds.includes(id))) {
    combosFired.push('akami_mori')
    extraDmg += 10
    attackBuff = { ...attackBuff, 'マグロ': (attackBuff['マグロ'] ?? 0) + 2 }
    announce(COMBO_META.akami_mori)
  }

  // 巻物コンプ①（机に同時3枚・1試合1回・以降ドロー+1）
  if (!combosFired.includes('maki_comp_3') && makimonoCount(field) >= MAKI_COMP_3) {
    combosFired.push('maki_comp_3')
    drawBonus += 1
    announce(COMBO_META.maki_comp_3)
  }

  // 光り物三昧（大葉トッピングの累計3枚・1試合1回）
  const obaCount = summonedIds.filter(id => CARD_BY_ID[id]?.topping === '大葉').length
  if (!combosFired.includes('hikari_zanmai') && obaCount >= OBA_REQUIRED) {
    combosFired.push('hikari_zanmai')
    kireta += 3
    announce(COMBO_META.hikari_zanmai, `切れ味スタック +3（計${kireta}）`)
  }

  // 海の幸三昧（いか＋たこのペアを消費して発動・何度でも）
  // 発動したカードは kaisenPaired が立ち、以後ペアの相手には選ばれない。
  // 海鮮タグと連鎖効果は残るので、再攻撃の対象にも連鎖の起爆装置にもなり続ける。
  if (cardBases.includes('いか') || cardBases.includes('たこ')) {
    const self = field[field.length - 1]
    const want = cardBases.includes('いか') ? 'たこ' : 'いか'
    const idx = field.findIndex(c =>
      c !== self && !c.kaisenPaired && [c.base, ...(c.subBases ?? [])].includes(want))
    if (idx >= 0) {
      const partnerFid = field[idx].fid
      field = field.map(c =>
        (c.fid === partnerFid || c === self) ? { ...c, kaisenPaired: true } : c)
      const kaisenField = field.filter(c => c.archetype.includes('kaisen'))
      const reattack = Math.floor(
        calcFieldDmg(kaisenField, attackBuff, kireta, enemyBelly, {
          gunkanBoost: makimonoCount(field) >= MAKI_COMP_5,
          nikuMatsuri,
        }) * KAISEN_REATTACK)
      extraDmg += reattack
      announce(COMBO_META.umi_zanmai, `場の海鮮${kaisenField.length}枚が再攻撃 +${reattack}`)
    }
  }

  // 肉祭りは生贄の累計で判定し、通常攻撃への倍率は付けない。
  if (!nikuMatsuri && sacrificeCount > 0 && sacrificedThisTurn >= NIKU_REQUIRED) {
    nikuMatsuri = true
    extraDmg += NIKU_DAMAGE
    announce(COMBO_META.niku_matsuri)
  }

  // 巻物コンプ②（状態継続。効果は calcFieldDmg 側。ここは成立した瞬間の通知だけ）
  if (makimonoCount(input.field) < MAKI_COMP_5 && makimonoCount(field) >= MAKI_COMP_5) {
    announce(COMBO_META.maki_comp_5)
  }

  return {
    belly, kireta, field, summonedIds, summonedArch,
    thisTurnBases, thisTurnArch, combosFired, attackBuff, drawBonus, nikuMatsuri,
    kiretaSpent, sacrificedThisTurn, extraDmg, stopOppDigest, drawNow, apNext, fired, logs,
  }
}

// ── CPU ───────────────────────────────────────────────────────────────────────

export function getCpuDeck(random: RandomSource = Math.random): Card[] {
  const ids = ['tamago', 'salmon', 'ebi', 'mentaiko', 'cheese', 'inari', 'tuna_salad_gunkan', 'corn_gunkan', 'seafood_gunkan', 'botan_ebi']
  const found = ids.map(id => CARDS.find(c => c.id === id)).filter(Boolean) as Card[]
  const extra = CARDS.filter(c => c.lane === 'general' && !found.some(f => f.id === c.id))
  return shuffled([...found, ...extra], random).slice(0, 15)
}

// 追加注文タイム用：CPUは¥1500相当をランダム購入
export function getCpuReorderDeck(random: RandomSource = Math.random): Card[] {
  let budget = REORDER_BUDGET
  const picks: Card[] = []
  for (const c of shuffled(CARDS.filter(c => c.lane !== 'shinkansen'), random)) {
    if (picks.length >= 8) break
    if (c.price <= budget) { picks.push(c); budget -= c.price }
  }
  return picks
}

export function cpuChoose<T extends Card>(hand: T[], ap: number): T[] {
  const sorted = [...hand].sort((a, b) => b.attack - a.attack)
  const played: T[] = []
  let rem = ap
  for (const c of sorted) {
    if (c.cost <= rem && played.length < FIELD_MAX) {
      played.push(c)
      rem -= c.cost
    }
  }
  return played
}
