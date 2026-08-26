import { useRef, useReducer, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CARDS } from '../../data/cards'
import { SushiArt } from '../../components/SushiArt'
import { DraftScreenThree } from '../draft/DraftScreenThree'
import type { Card, Archetype } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldCard = Card & { fid: string; turnsLeft: number; kaisenPaired?: boolean }
type Phase = 'player' | 'animating' | 'cpu' | 'pass' | 'over' | 'reorder'
type FloatNum = { id: number; dmg: number; target: 'cpu' | 'player' }
type ComboAnim = { name: string; emoji: string; desc: string }
type Inspect = { card: Card; canPlay: boolean; remainingTurns?: number }

type S = {
  // Active player (always "p")
  pHand: Card[]; pField: FieldCard[]; pDeck: Card[]
  pBelly: number; pAP: number; pMaxAP: number
  pSummonedIds: string[]
  pSummonedArch: Record<string, number>
  pDrawBonus: number
  pAttackBuff: Record<string, number>
  pCombosFired: string[]
  pKiretaStack: number
  pThisTurnBases: string[]
  pThisTurnArch: Record<string, number>
  pDigestStopTurns: number
  pApNextBonus: number   // 次のターンだけのAPボーナス
  pNikuMatsuri: boolean  // このターン肉祭りが発動中か（終盤強化ボーナス×2）
  pKiretaSpent: boolean  // コハダで切れ味を使い切ったか（実際のリセットはターン終了時）
  // Opponent / CPU (always "c")
  cHand: Card[]; cField: FieldCard[]; cDeck: Card[]
  cBelly: number
  cSummonedIds: string[]
  cSummonedArch: Record<string, number>
  cDrawBonus: number
  cAttackBuff: Record<string, number>
  cCombosFired: string[]
  cKiretaStack: number
  cDigestStopTurns: number
  cApNextBonus: number
  cNikuMatsuri: boolean
  cKiretaSpent: boolean
  // Game
  activePlayer: 1 | 2
  turn: number; phase: Phase; winner: 'player' | 'cpu' | null
  log: string[]; flash: 'cpu' | 'player' | null
}

// ── 回転寿司カラーパレット ────────────────────────────────────────────────────

const C = {
  bgMain: 'linear-gradient(180deg,#faf6ef 0%,#f3ebe0 100%)',
  bgArea: 'rgba(255,255,255,0.55)',
  bgAreaCpu: 'rgba(240,248,255,0.35)',
  bgHand: 'linear-gradient(180deg,#ede4d6,#e4d8c4)',
  bgAction: '#ede6d8',
  counter: 'linear-gradient(180deg,#e8c98a,#d4a85c 50%,#e8c98a)',
  counterTop: '#f2db9a', counterBot: '#b8782e',
  txtPri: '#3d2b1f', txtSec: '#7c6248', txtMut: '#a8917a',
  instBg: 'linear-gradient(160deg,#fff7ed,#ffedd5)', instBorder: '#f97316', instGlow: 'rgba(249,115,22,0.25)', instCost: '#ea580c',
  persBg: 'linear-gradient(160deg,#f0fdf4,#dcfce7)', persBorder: '#16a34a', persGlow: 'rgba(22,163,74,0.25)', persCost: '#15803d',
  fieldBorder: 'rgba(0,0,0,0.07)', atk: '#dc2626', ap: '#d97706', apBorder: '#b45309', apEmpty: '#d4c4ae',
  gaugeTrack: '#e0d4c0',
  btnEnd: 'linear-gradient(135deg,#e07b1a,#c05a0e)', btnEndBorder: '#f4a050', btnEndGlow: 'rgba(224,123,26,0.5)',
  kireta: '#2563eb',
}

// ── レスポンシブスケール ──────────────────────────────────────────────────────

const R = {
  fw: 'clamp(72px, 6.5vw, 120px)', fh: 'clamp(98px, 8.8vw, 160px)',
  hw: 'clamp(84px, 7.5vw, 140px)', hh: 'clamp(126px, 11.5vw, 210px)',
  gap: 'clamp(6px, 0.65vw, 12px)',
  fe: 'clamp(28px, 2.9vw, 52px)', he: 'clamp(32px, 3.3vw, 60px)',
  f2xs: 'clamp(8px, 0.75vw, 11px)', fxs: 'clamp(9px, 0.9vw, 13px)',
  fsm: 'clamp(11px, 1.1vw, 16px)', fmd: 'clamp(13px, 1.3vw, 19px)',
  flg: 'clamp(16px, 1.6vw, 24px)', fxl: 'clamp(20px, 2.2vw, 32px)',
  dot: 'clamp(9px, 1vw, 15px)', gauge: 'clamp(10px, 1.1vh, 16px)',
  counter: 'clamp(46px, 5.5vh, 68px)', hand: 'clamp(152px, 15.5vw, 284px)',
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BELLY = 100
const HAND_LIMIT = 7
const FIELD_MAX = 8
const INIT_AP = 2
const DIGESTION_MAX = 5
const CHAIN_BONUS = 3
const DIGEST_BOOST = 2        // digest_boost_2: 机にいる間の消化量ボーナス
const MAKI_COMP_3 = 3         // 巻物コンプ①: 机に同時この枚数で以降ドロー+1（1試合1回）
const MAKI_COMP_5 = 5         // 巻物コンプ②: 机に同時この枚数の間、軍艦の攻撃1.5倍（状態継続）
const GUNKAN_BOOST = 1.5
const KAISEN_REATTACK = 0.5   // 海の幸三昧: 場の海鮮カードがこの倍率で再攻撃
const OBA_REQUIRED = 3        // 光り物三昧: 大葉トッピングの累計召喚数
const KIRETA_MULT = 3         // コハダ: 切れ味全消費 ×この倍率
const NIKU_REQUIRED = 2       // 肉祭り: 同ターンの肉寿司召喚数
const REORDER_BUDGET = 1500   // 追加注文タイムの軍資金
const REORDER_SECONDS = 45    // 追加注文タイムの制限時間

// 消化量：序盤は軽く、ターンが進むごとに増えて最大5で頭打ち
// （1ターン目終了時 -2 → 2T -3 → 3T -4 → 4T以降 -5）
function digestionAmount(round: number) {
  return Math.min(DIGESTION_MAX, 1 + round)
}

// 海鮮連鎖を起動するbase
const CHAIN_TRIGGER_BASES = new Set(['いか', 'たこ', 'えび'])

const CARD_EMOJI: Record<string, string> = {
  'マグロ': '🐟', 'サーモン': '🐠', 'えび': '🦐', 'いか': '🦑', 'たこ': '🐙',
  'たまご': '🥚', 'きゅうり': '🥒', 'かんぴょう': '🌿', 'サバ': '🐡',
  'アジ': '🐡', 'コハダ': '🐡', 'イワシ': '🐟', '和牛': '🥩', 'カルビ': '🥩',
  'うに': '🌟', 'いくら': '🔴', 'とびこ': '🟠', 'コーン': '🌽',
  'シーフード': '🦞', 'なす': '🍆', '明太子': '🔴', 'チーズ': '🧀',
  '納豆': '🫘', 'うめ': '🍑', 'アボカド': '🥑', 'かに': '🦀',
  'ネギトロ': '🐟', 'ローストビーフ': '🥩', '焼肉': '🥩', '牛タン': '🥩',
  'サンマ': '🐡', '太巻き': '🌀', 'あなご': '🐠',
  'いなり': '🍘', 'ツナサラダ': '🥗',
}

const EFFECT_FULL: Record<string, string> = {
  'self_digest_5': '召喚時、自分のお腹が -5（消化促進）',
  'digest_boost_2': '机にいる間、毎ターンの消化量 +2',
  'digest_stop_1t': '召喚時、相手の消化を 1ターン止める',
  'kireta_stack': '召喚時、切れ味スタック +1（コハダで全消費×3）',
  'kireta_consume_x3': '切れ味スタックを全消費し、スタック数×3のダメージ（消費はそのターンの攻撃が終わってから）',
  'kireta_consume_2_draw_2': '切れ味スタックを2消費して2枚ドロー（2未満なら不発）',
  'belly_boost_70': '相手お腹が70以上のとき 攻撃 +8',
  'belly_boost_60': '相手お腹が60以上のとき 攻撃 +5',
  'belly_boost_65': '相手お腹が65以上のとき 攻撃 +6',
  'belly_boost_persist_50': '机に居る間、相手お腹50以上で 攻撃 +2',
  'chain_on_kaisen_summon': '海鮮系カードを召喚するたびに連鎖追加攻撃',
  'draw_1': '召喚時、カードを1枚引く',
  'draw_2': '召喚時、カードを2枚引く',
  'ap_next_1': '次のターンだけ AP +1',
  'multi_base': 'base「マグロ」「えび」も兼ねる（赤身バフ・海鮮連鎖の対象）',
}

const ARCH_LABEL: Record<Archetype, string> = {
  akami: '🔴 赤身', makimono: '🌀 巻物', hikari: '✨ 光り物',
  kaisen: '🦞 海鮮', niku: '🥩 肉寿司', gunkan: '🍙 軍艦', general: '⭐ 汎用',
}

function cardEmoji(c: Card) { return CARD_EMOJI[c.base] ?? '🍣' }

const CARD_BY_ID: Record<string, Card> =
  Object.fromEntries(CARDS.map(c => [c.id, c]))

// digest_boost_2 を持つカードが机にいる枚数ぶん、毎ターンの消化量が増える
function digestBonus(field: FieldCard[]) {
  return field.filter(c => c.effect === 'digest_boost_2').length * DIGEST_BOOST
}

function makimonoCount(field: FieldCard[]) {
  return field.filter(c => c.archetype.includes('makimono')).length
}

// ── Combos ────────────────────────────────────────────────────────────────────

type ComboMeta = { id: string; name: string; emoji: string; desc: string }

// 発動タイミングの分類
//   1試合1回 : 永続効果を配るもの（赤身三種盛り / 巻物コンプ① / 光り物三昧）
//   都度発動 : 条件を満たすたび何度でも（海の幸三昧 / 肉祭り）
//   状態継続 : 条件を満たしている間ずっと有効（巻物コンプ②＝軍艦1.5倍）
// 実際の判定は applySummon と calcFieldDmg にある。ここは演出用のメタ情報だけ。
const COMBO_META: Record<string, ComboMeta> = {
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
    desc: 'このターン、肉寿司の終盤強化ボーナス×2',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let fidN = 0
const toField = (c: Card): FieldCard => ({
  ...c, fid: `${c.id}-${++fidN}`,
  turnsLeft: c.type === 'persist' ? Math.max(c.fullness, 2) : 1,
})

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type DmgOpts = {
  nikuMatsuri?: boolean   // 肉祭り: そのターンの終盤強化ボーナスを2倍
  gunkanBoost?: boolean   // 巻物コンプ②: 未指定なら渡された field から判定する
}

function calcFieldDmg(
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
    const base = c.attack + baseBuff
    const kiretaBonus = c.archetype.includes('hikari') ? kiretaStack : 0
    let effectBonus = 0
    switch (c.effect) {
      case 'belly_boost_60': if (enemyBelly >= 60) effectBonus = 5; break
      case 'belly_boost_70': if (enemyBelly >= 70) effectBonus = 8; break
      case 'belly_boost_65': if (enemyBelly >= 65) effectBonus = 6; break
      case 'belly_boost_persist_50': if (enemyBelly >= 50) effectBonus = 2; break
    }
    if (opts.nikuMatsuri) effectBonus *= 2
    let total = base + kiretaBonus + effectBonus
    if (gunkanBoost && c.archetype.includes('gunkan')) {
      total = Math.floor(total * GUNKAN_BOOST)
    }
    return sum + total
  }, 0)
}

// ── 召喚処理（プレイヤー / CPU 共通の純関数） ────────────────────────────────

type SummonInput = {
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
  kiretaSpent: boolean
  enemyBelly: number
}

type SummonResult = Omit<SummonInput, 'card' | 'enemyBelly'> & {
  extraDmg: number
  stopOppDigest: boolean
  drawNow: number   // 召喚時ドロー枚数
  apNext: number    // 次のターンだけのAPボーナス
  fired: ComboMeta[]
  logs: string[]
}

function applySummon(input: SummonInput): SummonResult {
  const { card, enemyBelly } = input
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

  let field = [...input.field, toField(card)]

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

  // 肉祭り（同ターンに肉寿司2枚・そのターンに1回・ターンをまたげば何度でも）
  if (!nikuMatsuri && (thisTurnArch['niku'] ?? 0) >= NIKU_REQUIRED) {
    nikuMatsuri = true
    announce(COMBO_META.niku_matsuri)
  }

  // 巻物コンプ②（状態継続。効果は calcFieldDmg 側。ここは成立した瞬間の通知だけ）
  if (makimonoCount(input.field) < MAKI_COMP_5 && makimonoCount(field) >= MAKI_COMP_5) {
    announce(COMBO_META.maki_comp_5)
  }

  return {
    belly, kireta, field, summonedIds, summonedArch,
    thisTurnBases, thisTurnArch, combosFired, attackBuff, drawBonus, nikuMatsuri,
    kiretaSpent, extraDmg, stopOppDigest, drawNow, apNext, fired, logs,
  }
}

// ── CPU ───────────────────────────────────────────────────────────────────────

function getCpuDeck(): Card[] {
  const ids = ['tamago', 'salmon', 'ebi', 'mentaiko', 'cheese', 'inari', 'tuna_salad_gunkan', 'corn_gunkan', 'seafood_gunkan', 'botan_ebi']
  const found = ids.map(id => CARDS.find(c => c.id === id)).filter(Boolean) as Card[]
  const extra = CARDS.filter(c => c.lane === 'general' && !found.some(f => f.id === c.id))
  return shuffled([...found, ...extra]).slice(0, 15)
}

// 追加注文タイム用：CPUは¥1500相当をランダム購入
function getCpuReorderDeck(): Card[] {
  let budget = REORDER_BUDGET
  const picks: Card[] = []
  for (const c of shuffled(CARDS.filter(c => c.lane !== 'shinkansen'))) {
    if (picks.length >= 8) break
    if (c.price <= budget) { picks.push(c); budget -= c.price }
  }
  return picks
}

function cpuChoose(hand: Card[], ap: number): Card[] {
  const sorted = [...hand].sort((a, b) => b.attack - a.attack)
  const played: Card[] = []
  let rem = ap
  for (const c of sorted) {
    if (c.cost <= rem && played.length < FIELD_MAX) {
      played.push(c)
      rem -= c.cost
    }
  }
  return played
}

// ── Initial state ─────────────────────────────────────────────────────────────

function initState(deck: Card[], mode: 'cpu' | 'two_player', p2Deck?: Card[]): S {
  const pDeck = shuffled(deck.length > 0 ? deck : CARDS.filter(c => c.lane === 'general').slice(0, 10))
  const cDeckCards = mode === 'two_player'
    ? shuffled(p2Deck && p2Deck.length > 0 ? p2Deck : CARDS.filter(c => c.lane === 'general').slice(0, 10))
    : shuffled(getCpuDeck())
  return {
    pHand: pDeck.slice(0, 5), pField: [], pDeck: pDeck.slice(5),
    pBelly: 0, pAP: INIT_AP, pMaxAP: INIT_AP,
    pSummonedIds: [], pSummonedArch: {}, pDrawBonus: 0, pAttackBuff: {}, pCombosFired: [],
    pKiretaStack: 0, pThisTurnBases: [], pThisTurnArch: {}, pDigestStopTurns: 0, pApNextBonus: 0,
    pNikuMatsuri: false, pKiretaSpent: false,
    cHand: cDeckCards.slice(0, 5), cField: [], cDeck: cDeckCards.slice(5),
    cBelly: 0,
    cSummonedIds: [], cSummonedArch: {}, cDrawBonus: 0, cAttackBuff: {}, cCombosFired: [],
    cKiretaStack: 0, cDigestStopTurns: 0, cApNextBonus: 0, cNikuMatsuri: false, cKiretaSpent: false,
    activePlayer: 1,
    turn: 1, phase: 'player', winner: null,
    log: ['バトル開始！'], flash: null,
  }
}

// ── CardDetailSheet ──────────────────────────────────────────────────────────

function CardDetailSheet({
  inspect, attackBuff, kiretaStack, onPlay, onClose,
}: {
  inspect: Inspect
  attackBuff: Record<string, number>
  kiretaStack: number
  onPlay: () => void
  onClose: () => void
}) {
  const { card, canPlay, remainingTurns } = inspect
  const isPersist = card.type === 'persist'
  const buff = attackBuff[card.base] ?? 0
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const isField = remainingTurns !== undefined
  const effectDesc = card.effect ? EFFECT_FULL[card.effect] : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 40,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'linear-gradient(180deg,#faf6ef,#f3ebe0)',
          borderRadius: 'clamp(16px, 2vw, 28px) clamp(16px, 2vw, 28px) 0 0',
          padding: 'clamp(16px, 2.5vh, 32px) clamp(16px, 3vw, 36px) clamp(20px, 3vh, 40px)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'clamp(12px, 2vh, 20px)' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: R.f2xs, fontWeight: 700, color: '#fff',
                background: isPersist ? C.persBorder : C.instBorder,
                borderRadius: 6, padding: '2px 8px',
              }}>
                {isPersist ? '🔄 持続型' : '⚡ 即時型'}
              </span>
              {card.archetype.map(a => (
                <span key={a} style={{
                  fontSize: R.f2xs, fontWeight: 600, color: C.txtSec,
                  background: 'rgba(0,0,0,0.07)', borderRadius: 6, padding: '2px 8px',
                }}>
                  {ARCH_LABEL[a]}
                </span>
              ))}
            </div>
            <p style={{ fontSize: R.fxl, fontWeight: 800, color: C.txtPri }}>{card.name}</p>
          </div>
          <button onClick={onClose} style={{
            fontSize: R.flg, color: C.txtMut, background: 'none', border: 'none',
            cursor: 'pointer', padding: '4px 8px', flexShrink: 0,
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 'clamp(16px, 3vw, 32px)', alignItems: 'center' }}>
          <div style={{
            flexShrink: 0,
            width: 'clamp(72px, 9vw, 140px)', height: 'clamp(72px, 9vw, 140px)',
            borderRadius: 'clamp(12px, 1.2vw, 20px)',
            background: isPersist ? C.persBg : C.instBg,
            border: `2px solid ${isPersist ? C.persBorder : C.instBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SushiArt card={card} size="86%" />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', marginBottom: 'clamp(8px, 1.5vh, 14px)', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>コスト</p>
                <p style={{
                  fontSize: R.flg, fontWeight: 800,
                  color: '#fff', background: isPersist ? C.persBorder : C.instBorder,
                  borderRadius: 8, padding: '2px 12px', display: 'inline-block',
                }}>{card.cost}</p>
              </div>
              <div>
                <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>攻撃力</p>
                <p style={{ fontSize: R.flg, fontWeight: 800, color: C.atk }}>
                  ⚔ {card.attack}
                  {buff > 0 && <span style={{ color: C.ap, fontSize: R.fsm }}> +{buff}</span>}
                  {kBonus > 0 && <span style={{ color: C.kireta, fontSize: R.fsm }}> +{kBonus}✂</span>}
                </p>
              </div>
              {isPersist && (
                <div>
                  <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>
                    {isField ? '残りターン' : '持続ターン'}
                  </p>
                  <p style={{ fontSize: R.flg, fontWeight: 800, color: C.persBorder }}>
                    {isField ? `${remainingTurns}T` : `${card.fullness}T`}
                  </p>
                </div>
              )}
              <div>
                <p style={{ fontSize: R.fxs, color: C.txtMut, marginBottom: 2 }}>ドラフト価格</p>
                <p style={{ fontSize: R.flg, fontWeight: 700, color: C.txtSec }}>¥{card.price}</p>
              </div>
            </div>

            <div style={{
              background: effectDesc ? 'rgba(251,191,36,0.14)' : 'transparent',
              borderRadius: 10, padding: effectDesc ? 'clamp(8px, 1vh, 14px)' : 0,
              border: effectDesc ? '1px solid rgba(217,119,6,0.25)' : 'none',
            }}>
              {effectDesc
                ? <p style={{ fontSize: R.fsm, color: '#78530a', fontWeight: 600, lineHeight: 1.5 }}>
                    ✦ {effectDesc}
                  </p>
                : <p style={{ fontSize: R.fsm, color: C.txtMut }}>効果なし</p>
              }
            </div>
          </div>
        </div>

        {!isField && (
          <div style={{ display: 'flex', gap: 12, marginTop: 'clamp(14px, 2.5vh, 24px)' }}>
            <button onClick={onClose}
              style={{
                flex: 1, padding: 'clamp(10px, 1.5vh, 18px)', borderRadius: 999,
                fontSize: R.fsm, fontWeight: 700, background: '#e8dfd0',
                color: C.txtSec, border: '1px solid #d4c4ae', cursor: 'pointer',
              }}>
              キャンセル
            </button>
            <motion.button
              onClick={canPlay ? onPlay : undefined}
              whileTap={canPlay ? { scale: 0.95 } : {}}
              whileHover={canPlay ? { scale: 1.02 } : {}}
              style={{
                flex: 2, padding: 'clamp(10px, 1.5vh, 18px)', borderRadius: 999,
                fontSize: R.fsm, fontWeight: 800,
                background: canPlay ? C.btnEnd : '#d4c4ae',
                color: canPlay ? '#fff' : C.txtMut,
                border: `1.5px solid ${canPlay ? C.btnEndBorder : '#c4b4a0'}`,
                cursor: canPlay ? 'pointer' : 'not-allowed',
                boxShadow: canPlay ? `0 0 20px ${C.btnEndGlow}` : 'none',
              }}
            >
              {canPlay ? `⚔ 召喚する（AP -${card.cost}）` : 'AP不足'}
            </motion.button>
          </div>
        )}
        {isField && (
          <div style={{ marginTop: 'clamp(14px, 2.5vh, 24px)' }}>
            <button onClick={onClose}
              style={{
                width: '100%', padding: 'clamp(10px, 1.5vh, 18px)', borderRadius: 999,
                fontSize: R.fsm, fontWeight: 700, background: '#e8dfd0',
                color: C.txtSec, border: '1px solid #d4c4ae', cursor: 'pointer',
              }}>
              閉じる
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── FieldSushi ────────────────────────────────────────────────────────────────

function FieldSushi({ card, isEnemy = false, onSelect }: {
  card: FieldCard; isEnemy?: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const maxT = isPersist ? Math.max(card.fullness, 2) : 1
  return (
    <motion.div
      layout
      initial={{ scale: 0, y: isEnemy ? -24 : 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      onClick={onSelect}
      whileHover={{ scale: 1.06, boxShadow: `0 6px 20px ${isPersist ? C.persGlow : C.instGlow}` }}
      whileTap={{ scale: 0.96 }}
      style={{
        flexShrink: 0, cursor: 'pointer',
        width: R.fw, height: R.fh,
        borderRadius: 'clamp(10px, 1vw, 16px)',
        background: isPersist ? C.persBg : C.instBg,
        border: `2px solid ${isPersist ? C.persBorder : C.instBorder}`,
        boxShadow: `0 4px 16px ${isPersist ? C.persGlow : C.instGlow}, 0 1px 3px rgba(0,0,0,0.12)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'clamp(5px, 0.6vw, 10px) clamp(3px, 0.4vw, 7px) clamp(4px, 0.5vw, 8px)',
        gap: 'clamp(2px, 0.3vw, 5px)', overflow: 'hidden',
      }}
    >
      <div style={{ width: '82%', display: 'flex', justifyContent: 'center' }}>
        <SushiArt card={card} size="100%" />
      </div>
      <p style={{ fontSize: R.fxs, color: C.txtPri, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: '90%' }}>
        {card.name.slice(0, 6)}
      </p>
      <div style={{ display: 'flex', gap: 'clamp(3px, 0.4vw, 6px)', alignItems: 'center' }}>
        <span style={{ fontSize: R.fxs, color: C.atk, fontWeight: 700 }}>⚔ {card.attack}</span>
        {isPersist && <span style={{ fontSize: R.fxs, color: C.persBorder, fontWeight: 700 }}>×{card.turnsLeft}</span>}
      </div>
      {isPersist && (
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: maxT }, (_, i) => (
            <div key={i} style={{
              width: R.dot, height: R.dot, maxWidth: 12, maxHeight: 12, borderRadius: '50%',
              background: i < card.turnsLeft ? '#16a34a' : C.apEmpty,
              border: `1px solid ${i < card.turnsLeft ? '#15803d' : '#c4b4a0'}`,
            }} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ── HandSushi ─────────────────────────────────────────────────────────────────

function HandSushi({
  card, canPlay, attackBuff, kiretaStack, isSelected, onSelect,
}: {
  card: Card; canPlay: boolean; attackBuff: Record<string, number>
  kiretaStack: number; isSelected: boolean; onSelect: () => void
}) {
  const isPersist = card.type === 'persist'
  const buff = attackBuff[card.base] ?? 0
  const kBonus = card.archetype.includes('hikari') ? kiretaStack : 0
  const effectLabel = card.effect
    ? (EFFECT_FULL[card.effect]?.slice(0, 14) + '…')
    : null

  const bgGrad = canPlay ? (isPersist ? C.persBg : C.instBg) : '#f0e8dc'
  const borderColor = isSelected
    ? '#1d4ed8'
    : canPlay ? (isPersist ? C.persBorder : C.instBorder) : '#d4c4ae'
  const glow = canPlay
    ? `0 8px 24px ${isPersist ? C.persGlow : C.instGlow}, 0 2px 6px rgba(0,0,0,0.1)`
    : '0 1px 4px rgba(0,0,0,0.08)'

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -20, scale: 1.06 }}
      whileTap={{ scale: 0.93, y: -6 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      style={{
        flexShrink: 0,
        width: R.hw, height: R.hh,
        borderRadius: 'clamp(12px, 1.2vw, 20px)',
        background: bgGrad, border: `2px solid ${borderColor}`,
        opacity: canPlay ? 1 : 0.45,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: isSelected ? `0 0 0 3px #3b82f6, ${glow}` : glow,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'clamp(5px, 0.6vw, 9px) clamp(6px, 0.7vw, 10px) 0' }}>
        <span style={{
          fontSize: R.fsm, fontWeight: 800, color: '#fff',
          background: isPersist ? C.persBorder : C.instBorder,
          borderRadius: 6, padding: '1px 6px', lineHeight: 1.4,
        }}>{card.cost}</span>
        <span style={{ fontSize: R.fxs }}>{isPersist ? '🔄' : '⚡'}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '0 4px' }}>
        <SushiArt card={card} size="88%" />
      </div>
      <p style={{ fontSize: R.fxs, color: C.txtPri, fontWeight: 700, textAlign: 'center', padding: '0 4px', lineHeight: 1.25 }}>
        {card.name.slice(0, 8)}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: 'clamp(2px, 0.3vw, 4px) 4px' }}>
        <span style={{ fontSize: R.fsm, color: C.atk, fontWeight: 800 }}>
          ⚔ {card.attack}
          {buff > 0 && <span style={{ color: C.ap, fontSize: R.fxs }}>+{buff}</span>}
          {kBonus > 0 && <span style={{ color: C.kireta, fontSize: R.fxs }}>+{kBonus}</span>}
        </span>
        {isPersist && <span style={{ fontSize: R.fxs, color: C.persBorder, fontWeight: 700 }}>{card.fullness}T</span>}
      </div>
      <p style={{
        fontSize: R.f2xs, color: effectLabel ? '#78530a' : 'transparent',
        textAlign: 'center', padding: 'clamp(1px, 0.2vw, 3px) 4px clamp(4px, 0.5vw, 8px)',
        lineHeight: 1.2, minHeight: 'clamp(14px, 1.4vw, 20px)',
        background: effectLabel ? 'rgba(251,191,36,0.18)' : 'transparent',
      }}>
        {effectLabel ?? '　'}
      </p>
    </motion.button>
  )
}

// ── BellyGauge ────────────────────────────────────────────────────────────────

function BellyGauge({ value, label, flip = false }: { value: number; label: string; flip?: boolean }) {
  const pct = Math.min(value / MAX_BELLY, 1)
  const color = pct < 0.4 ? '#16a34a' : pct < 0.7 ? '#d97706' : '#dc2626'
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: R.fsm, color: C.txtSec, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: R.fsm, color, fontWeight: 700 }}>{value} / {MAX_BELLY}</span>
      </div>
      <div style={{ height: R.gauge, borderRadius: 999, overflow: 'hidden', background: C.gaugeTrack, transform: flip ? 'scaleX(-1)' : undefined }}>
        <motion.div animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.45 }}
          style={{ height: '100%', borderRadius: 999, background: color }} />
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function BattleScreen({
  deck,
  p2Deck,
  mode = 'cpu',
  onBack,
}: {
  deck: Card[]
  p2Deck?: Card[]
  mode?: 'cpu' | 'two_player'
  onBack?: () => void
}) {
  // 遅延初期化：initState はマウント時に1回だけ実行する
  const lazyRef = useRef<S | null>(null)
  if (lazyRef.current === null) lazyRef.current = initState(deck, mode, p2Deck)
  const ref = lazyRef as { current: S }
  const [, tick] = useReducer(n => n + 1, 0)
  const [showLog, setShowLog] = useState(false)
  const [comboAnim, setComboAnim] = useState<ComboAnim | null>(null)
  const [floats, setFloats] = useState<FloatNum[]>([])
  const [inspect, setInspect] = useState<Inspect | null>(null)
  // 追加注文タイム（二人対戦では p→c の順にドラフト）
  const [reorderStep, setReorderStep] = useState<'p' | 'c'>('p')
  const pendingReorder = useRef<Card[]>([])
  const floatId = useRef(0)
  const s = ref.current

  const set = (patch: Partial<S>) => { Object.assign(ref.current, patch); tick() }
  const addLog = (msg: string) => { ref.current.log = [msg, ...ref.current.log].slice(0, 40) }

  const addFloat = (dmg: number, target: 'cpu' | 'player') => {
    if (dmg <= 0) return
    const id = ++floatId.current
    setFloats(f => [...f, { id, dmg, target }])
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
  }

  const drawCards = (hand: Card[], dk: Card[], n: number): [Card[], Card[]] => {
    // 手札上限を超える分は引かずに山札に残す（引いたカードが消滅しないように）
    const take = Math.min(n, Math.max(0, HAND_LIMIT - hand.length))
    return [[...hand, ...dk.slice(0, take)], dk.slice(take)]
  }

  const checkWin = (pBelly: number, cBelly: number): boolean => {
    if (pBelly >= MAX_BELLY) { set({ winner: 'cpu', phase: 'over' }); return true }
    if (cBelly >= MAX_BELLY) { set({ winner: 'player', phase: 'over' }); return true }
    return false
  }

  const fireComboAnim = (combo: ComboMeta) => {
    setComboAnim({ name: combo.name, emoji: combo.emoji, desc: combo.desc })
    setTimeout(() => setComboAnim(null), 2800)
  }

  const playCard = (card: Card) => {
    const st = ref.current
    if (st.phase !== 'player' || st.pAP < card.cost || st.pField.length >= FIELD_MAX) return

    setInspect(null)
    addLog(`あなた ▶ ${cardEmoji(card)} ${card.name} 召喚`)

    const r = applySummon({
      card,
      belly: st.pBelly,
      kireta: st.pKiretaStack,
      field: st.pField,
      summonedIds: st.pSummonedIds,
      summonedArch: st.pSummonedArch,
      thisTurnBases: st.pThisTurnBases,
      thisTurnArch: st.pThisTurnArch,
      combosFired: st.pCombosFired,
      attackBuff: st.pAttackBuff,
      drawBonus: st.pDrawBonus,
      nikuMatsuri: st.pNikuMatsuri,
      kiretaSpent: st.pKiretaSpent,
      enemyBelly: st.cBelly,
    })
    for (const m of r.logs) addLog(m)
    for (const combo of r.fired) fireComboAnim(combo)

    const newCBelly = Math.min(MAX_BELLY, st.cBelly + r.extraDmg)
    if (r.extraDmg > 0) addFloat(r.extraDmg, 'cpu')

    // 同一カードを複数枚持っている場合でも1枚だけ取り除く
    const handIdx = st.pHand.indexOf(card)
    const handAfterPlay = st.pHand.filter((_, i) => i !== handIdx)
    // draw_1 効果：即時ドロー
    const [handDrawn, deckAfter] = drawCards(handAfterPlay, st.pDeck, r.drawNow)
    set({
      pField: r.field,
      pHand: handDrawn,
      pDeck: deckAfter,
      pAP: st.pAP - card.cost,
      pApNextBonus: st.pApNextBonus + r.apNext,
      pBelly: r.belly,
      pSummonedIds: r.summonedIds, pSummonedArch: r.summonedArch,
      pThisTurnBases: r.thisTurnBases, pThisTurnArch: r.thisTurnArch,
      pCombosFired: r.combosFired,
      pAttackBuff: r.attackBuff, pDrawBonus: r.drawBonus,
      pNikuMatsuri: r.nikuMatsuri,
      pKiretaSpent: r.kiretaSpent,
      pKiretaStack: r.kireta,
      cBelly: newCBelly,
      cDigestStopTurns: r.stopOppDigest ? 1 : st.cDigestStopTurns,
    })
    if (r.extraDmg > 0) checkWin(ref.current.pBelly, newCBelly)
  }

  // ── ターン終了（CPU モード） ───────────────────────────────────────────────
  const endTurnCpu = () => {
    if (ref.current.phase !== 'player') return
    setInspect(null)
    set({ phase: 'animating' })

    setTimeout(() => {
      const { pField, cBelly, pDeck, pHand, pDrawBonus, turn, pAttackBuff, pKiretaStack, pNikuMatsuri, pKiretaSpent } = ref.current

      // プレイヤー場が攻撃
      const totalDmg = calcFieldDmg(pField, pAttackBuff, pKiretaStack, cBelly, { nikuMatsuri: pNikuMatsuri })
      if (totalDmg > 0) { addLog(`あなたの攻撃: ${totalDmg} ダメージ！`); addFloat(totalDmg, 'cpu') }
      const newCBelly = Math.min(MAX_BELLY, cBelly + totalDmg)
      set({ flash: 'cpu', cBelly: newCBelly })
      setTimeout(() => set({ flash: null }), 500)
      if (checkWin(ref.current.pBelly, newCBelly)) return

      // プレイヤー場を更新・ドロー・このターンリセット
      const newPField = pField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
      const [h1, d1] = drawCards(pHand, pDeck, 1 + pDrawBonus)
      // コハダで使い切った切れ味は、攻撃が解決したここで初めて0になる
      if (pKiretaSpent) addLog('✂ 切れ味スタックを使い切った（0にリセット）')
      set({
        pField: newPField, pHand: h1, pDeck: d1,
        pThisTurnBases: [], pThisTurnArch: {}, pNikuMatsuri: false,
        pKiretaStack: pKiretaSpent ? 0 : pKiretaStack, pKiretaSpent: false,
        phase: 'cpu',
      })

      setTimeout(() => {
        const st = ref.current
        const newTurn = turn + 1
        // CPUの一時APボーナス（前のCPUターンに貯めた分）を消費
        const cpuMaxAP = Math.min(INIT_AP + newTurn - 1, 10) + st.cApNextBonus

        // CPU 消化
        const cpuAfterDigest = st.cDigestStopTurns > 0
          ? st.cBelly
          : Math.max(0, st.cBelly - (digestionAmount(turn) + digestBonus(st.cField)))
        if (st.cDigestStopTurns > 0) addLog('🚫 CPUの消化がスキップされた！')

        // CPU 行動（プレイヤーと同じ召喚ロジックで効果・コンボ・バフを適用）
        const slots = Math.max(0, FIELD_MAX - st.cField.length)
        const toPlay = cpuChoose(st.cHand, cpuMaxAP).slice(0, slots)

        let cs = {
          belly: cpuAfterDigest,
          kireta: st.cKiretaStack,
          field: st.cField,
          summonedIds: st.cSummonedIds,
          summonedArch: st.cSummonedArch,
          thisTurnBases: [] as string[],
          thisTurnArch: {} as Record<string, number>,
          combosFired: st.cCombosFired,
          attackBuff: st.cAttackBuff,
          drawBonus: st.cDrawBonus,
          nikuMatsuri: false,
          kiretaSpent: false,
        }
        let cpuExtraDmg = 0
        let stopPlayerDigest = false
        let cpuExtraDraw = 0
        let cpuApNext = 0

        for (const c of toPlay) {
          addLog(`CPU ▶ ${cardEmoji(c)} ${c.name} 召喚`)
          const r = applySummon({ card: c, ...cs, enemyBelly: ref.current.pBelly })
          for (const m of r.logs) addLog(`CPU: ${m}`)
          for (const combo of r.fired) fireComboAnim(combo)
          cpuExtraDmg += r.extraDmg
          cpuExtraDraw += r.drawNow
          cpuApNext += r.apNext
          if (r.stopOppDigest) stopPlayerDigest = true
          cs = {
            belly: r.belly, kireta: r.kireta, field: r.field,
            summonedIds: r.summonedIds, summonedArch: r.summonedArch,
            thisTurnBases: r.thisTurnBases, thisTurnArch: r.thisTurnArch,
            combosFired: r.combosFired, attackBuff: r.attackBuff, drawBonus: r.drawBonus,
            nikuMatsuri: r.nikuMatsuri, kiretaSpent: r.kiretaSpent,
          }
        }

        // 召喚したカードをまず机に表示（即時型も見えるように）
        const bellyAfterEffects = Math.min(MAX_BELLY, ref.current.pBelly + cpuExtraDmg)
        if (cpuExtraDmg > 0) addFloat(cpuExtraDmg, 'player')
        set({
          cField: cs.field,
          cHand: st.cHand.filter(c => !toPlay.includes(c)),
          cBelly: cs.belly,
          cKiretaStack: cs.kireta,
          cSummonedIds: cs.summonedIds, cSummonedArch: cs.summonedArch,
          cCombosFired: cs.combosFired, cAttackBuff: cs.attackBuff, cDrawBonus: cs.drawBonus,
          cNikuMatsuri: cs.nikuMatsuri, cKiretaSpent: cs.kiretaSpent,
          cApNextBonus: cpuApNext,  // 今ターンに貯めた分は次のCPUターンで消費
          pBelly: bellyAfterEffects,
          pDigestStopTurns: stopPlayerDigest ? 1 : st.pDigestStopTurns,
        })
        if (checkWin(bellyAfterEffects, cs.belly)) return

        // 少し見せてから CPU 場の攻撃
        setTimeout(() => {
          const st2 = ref.current

          // CPU 場が攻撃（バフ・切れ味スタックも反映）
          const cpuDmg = calcFieldDmg(st2.cField, st2.cAttackBuff, st2.cKiretaStack, st2.pBelly, { nikuMatsuri: st2.cNikuMatsuri })
          if (cpuDmg > 0) { addLog(`CPU攻撃: ${cpuDmg} ダメージ！`); addFloat(cpuDmg, 'player') }
          const newPBelly = Math.min(MAX_BELLY, st2.pBelly + cpuDmg)
          set({ flash: 'player', pBelly: newPBelly })
          setTimeout(() => set({ flash: null }), 500)
          if (checkWin(newPBelly, st2.cBelly)) return

          // CPU 場を更新・CPU ドロー
          const nextCField = st2.cField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
          const [nextCHand, nextCDeck] = drawCards(st2.cHand, st2.cDeck, 1 + st2.cDrawBonus + cpuExtraDraw)

          // プレイヤー消化
          const pAfterDigest = st2.pDigestStopTurns > 0
            ? newPBelly
            : Math.max(0, newPBelly - (digestionAmount(turn) + digestBonus(st2.pField)))
          if (st2.pDigestStopTurns > 0) addLog('🚫 あなたの消化がスキップされた！')

          // プレイヤーの一時APボーナスを消費（1ターン限り）
          const pApBonus = st2.pApNextBonus
          if (pApBonus > 0) addLog(`⚡ 一時APボーナス +${pApBonus}！`)
          const nextMaxAP = Math.min(INIT_AP + newTurn - 1, 10) + pApBonus

          // 両者の手札・山札が尽きたら追加注文タイム
          const allOut =
            st2.pHand.length === 0 && st2.pDeck.length === 0 &&
            nextCHand.length === 0 && nextCDeck.length === 0
          if (allOut) addLog('🍽 追加注文タイム！ 軍資金 ¥1500 で補充しよう')

          addLog(`── ターン ${newTurn} ──`)
          set({
            cField: nextCField, cHand: nextCHand, cDeck: nextCDeck,
            cNikuMatsuri: false,
            cKiretaStack: st2.cKiretaSpent ? 0 : st2.cKiretaStack, cKiretaSpent: false,
            cDigestStopTurns: Math.max(0, st.cDigestStopTurns - 1),
            pBelly: pAfterDigest,
            pDigestStopTurns: Math.max(0, st2.pDigestStopTurns - 1),
            pApNextBonus: 0,
            turn: newTurn, pAP: nextMaxAP, pMaxAP: nextMaxAP,
            phase: allOut ? 'reorder' : 'player',
          })
        }, 900)
      }, 700)
    }, 200)
  }

  // ── ターン終了（二人対戦モード） ──────────────────────────────────────────
  const endTurnTwoPlayer = () => {
    if (ref.current.phase !== 'player') return
    setInspect(null)
    set({ phase: 'animating' })

    setTimeout(() => {
      const { pField, cBelly, pDeck, pHand, pDrawBonus, pAttackBuff, pKiretaStack, pNikuMatsuri, pKiretaSpent } = ref.current

      // アクティブプレイヤー場が攻撃
      const totalDmg = calcFieldDmg(pField, pAttackBuff, pKiretaStack, cBelly, { nikuMatsuri: pNikuMatsuri })
      if (totalDmg > 0) { addLog(`P${s.activePlayer}の攻撃: ${totalDmg} ダメージ！`); addFloat(totalDmg, 'cpu') }
      const newCBelly = Math.min(MAX_BELLY, cBelly + totalDmg)
      set({ flash: 'cpu', cBelly: newCBelly })
      setTimeout(() => set({ flash: null }), 500)
      if (checkWin(ref.current.pBelly, newCBelly)) return

      // 場を更新・ドロー・このターンリセット
      const newPField = pField.map(c => ({ ...c, turnsLeft: c.turnsLeft - 1 })).filter(c => c.turnsLeft > 0)
      const [newPHand, newPDeck] = drawCards(pHand, pDeck, 1 + pDrawBonus)

      set({
        cBelly: newCBelly,
        pField: newPField, pHand: newPHand, pDeck: newPDeck,
        pThisTurnBases: [], pThisTurnArch: {}, pNikuMatsuri: false,
        pKiretaStack: pKiretaSpent ? 0 : pKiretaStack, pKiretaSpent: false,
        phase: 'pass',
      })
    }, 200)
  }

  const endTurn = mode === 'two_player' ? endTurnTwoPlayer : endTurnCpu

  // ── パス画面で「準備完了」タップ ─────────────────────────────────────────
  const handlePassReady = () => {
    const st = ref.current
    const newTurn = st.turn + 1
    // 2P モードはラウンド単位でAPが増える（2ターンで+1）
    // + 次にアクティブになる側（現c*）の一時APボーナスを消費
    if (st.cApNextBonus > 0) addLog(`⚡ 一時APボーナス +${st.cApNextBonus}！`)
    const nextMaxAP = Math.min(INIT_AP + Math.floor((newTurn - 1) / 2), 10) + st.cApNextBonus

    // ここでは待機側の攻撃・場の消耗・ドローを行わない。
    // それらは各プレイヤー自身のターン終了時（endTurnTwoPlayer）に1回だけ処理される。
    // パス画面は「手番の受け渡し」＋次のアクティブ側の消化・AP回復だけを担当する。

    // 次のアクティブ側（c*）の消化（2Pモードは2ターンで1ラウンド換算）
    const nextBelly = st.cDigestStopTurns > 0
      ? st.cBelly
      : Math.max(0, st.cBelly - (digestionAmount(Math.ceil(st.turn / 2)) + digestBonus(st.cField)))
    if (st.cDigestStopTurns > 0) addLog(`🚫 P${st.activePlayer === 1 ? 2 : 1}の消化がスキップされた！`)

    const nextPlayer: 1 | 2 = st.activePlayer === 1 ? 2 : 1

    // 両者の手札・山札が尽きたら追加注文タイム
    const allOut =
      st.cHand.length === 0 && st.cDeck.length === 0 &&
      st.pHand.length === 0 && st.pDeck.length === 0
    if (allOut) addLog('🍽 追加注文タイム！ 両者 ¥1500 で補充しよう')

    addLog(`── ターン ${newTurn}（P${nextPlayer}）──`)

    set({
      // 新アクティブ（旧 c*）
      pHand: st.cHand, pField: st.cField, pDeck: st.cDeck,
      pBelly: nextBelly,
      pAP: nextMaxAP, pMaxAP: nextMaxAP,
      pSummonedIds: st.cSummonedIds,
      pSummonedArch: st.cSummonedArch,
      pDrawBonus: st.cDrawBonus,
      pAttackBuff: st.cAttackBuff,
      pCombosFired: st.cCombosFired,
      pKiretaStack: st.cKiretaStack,
      pThisTurnBases: [], pThisTurnArch: {}, pNikuMatsuri: false, pKiretaSpent: false,
      pDigestStopTurns: Math.max(0, st.cDigestStopTurns - 1),
      pApNextBonus: 0,  // ボーナスは今消費した
      // 待機側（旧 p*）
      cHand: st.pHand, cField: st.pField, cDeck: st.pDeck,
      cBelly: st.pBelly,
      cSummonedIds: st.pSummonedIds,
      cSummonedArch: st.pSummonedArch,
      cDrawBonus: st.pDrawBonus,
      cAttackBuff: st.pAttackBuff,
      cCombosFired: st.pCombosFired,
      cKiretaStack: st.pKiretaStack,
      cDigestStopTurns: Math.max(0, st.pDigestStopTurns - 1),
      cNikuMatsuri: false, cKiretaSpent: false,
      cApNextBonus: st.pApNextBonus,  // 今ターン貯めた分は次の自分のターンで消費
      // ゲーム
      activePlayer: nextPlayer,
      turn: newTurn,
      phase: allOut ? 'reorder' : 'player',
    })
  }

  // ── 追加注文タイム完了 ────────────────────────────────────────────────────
  const handleReorderComplete = (cards: Card[]) => {
    if (mode === 'cpu') {
      const pd = shuffled(cards)
      const cd = shuffled(getCpuReorderDeck())
      addLog('🍽 追加注文完了！ バトル再開')
      set({
        pHand: pd.slice(0, 5), pDeck: pd.slice(5),
        cHand: cd.slice(0, 5), cDeck: cd.slice(5),
        phase: 'player',
      })
      return
    }
    // 二人対戦：アクティブ側（p）→ 相手側（c）の順にドラフト
    if (reorderStep === 'p') {
      pendingReorder.current = cards
      setReorderStep('c')
    } else {
      const pd = shuffled(pendingReorder.current)
      const cd = shuffled(cards)
      addLog('🍽 追加注文完了！ バトル再開')
      setReorderStep('p')
      set({
        pHand: pd.slice(0, 5), pDeck: pd.slice(5),
        cHand: cd.slice(0, 5), cDeck: cd.slice(5),
        phase: 'player',
      })
    }
  }

  // ── 表示用計算 ────────────────────────────────────────────────────────────
  const isPlayerTurn = s.phase === 'player'
  const previewDmg = calcFieldDmg(s.pField, s.pAttackBuff, s.pKiretaStack, s.cBelly, { nikuMatsuri: s.pNikuMatsuri })
  const akamiFired = s.pCombosFired.includes('akami_mori')
  const makiFired = s.pCombosFired.includes('maki_comp_3')
  const akamCount = ['maguro', 'chutoro', 'otoro'].filter(id => s.pSummonedIds.includes(id)).length
  const makiCount = makimonoCount(s.pField)   // 机の上の巻物枚数（同時判定）

  const phaseLabel = s.phase === 'player' ? 'あなたのターン'
    : s.phase === 'animating' ? '攻撃中…'
    : s.phase === 'pass' ? 'ターン終了'
    : s.phase === 'reorder' ? '追加注文中…'
    : 'CPU思考中…'

  const opponentLabel = mode === 'two_player'
    ? `P${s.activePlayer === 1 ? 2 : 1}`
    : 'CPU'
  const opponentEmoji = mode === 'two_player' ? '👤' : '💻'
  const activeLabel = mode === 'two_player' ? `P${s.activePlayer}` : 'あなた'

  const winnerLabel = mode === 'two_player'
    ? (s.winner === 'player' ? `P${s.activePlayer}の勝利！` : `P${s.activePlayer === 1 ? 2 : 1}の勝利！`)
    : (s.winner === 'player' ? '勝利！' : '敗北…')

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: C.bgMain, color: C.txtPri,
      overflow: 'hidden', userSelect: 'none', position: 'relative',
    }}>

      {/* ══ 相手エリア ══ */}
      <div style={{
        flex: '5 1 0', minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: 'clamp(10px, 1.5vh, 20px) clamp(12px, 2vw, 28px) clamp(8px, 1vh, 14px)',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.5vw, 20px)', marginBottom: 'clamp(8px, 1.2vh, 14px)' }}>
          <span style={{ fontSize: R.flg, flexShrink: 0 }}>{opponentEmoji}</span>
          <div style={{ flex: 1 }}><BellyGauge value={s.cBelly} label={`${opponentLabel} お腹`} flip /></div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <p style={{ fontSize: R.fxs, color: C.txtMut }}>手札 {s.cHand.length} 枚</p>
            <p style={{ fontSize: R.fxs, color: C.txtMut }}>山札 {s.cDeck.length} 枚</p>
          </div>
        </div>
        <div style={{
          flex: 1, background: C.bgAreaCpu, border: `1px solid ${C.fieldBorder}`,
          borderRadius: 'clamp(12px, 1.2vw, 18px)', padding: 'clamp(8px, 1vw, 16px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          gap: R.gap, flexWrap: 'wrap', position: 'relative',
          minHeight: 'clamp(90px, 10vh, 150px)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <span style={{ position: 'absolute', top: 'clamp(7px, 0.8vh, 11px)', left: 'clamp(12px, 1.2vw, 18px)', fontSize: R.fxs, color: C.txtMut, fontWeight: 700, letterSpacing: 1 }}>{opponentLabel} の机</span>
          <AnimatePresence>
            {s.cField.map(c => (
              <FieldSushi key={c.fid} card={c} isEnemy
                onSelect={() => setInspect({ card: c, canPlay: false, remainingTurns: c.turnsLeft })}
              />
            ))}
          </AnimatePresence>
          {s.cField.length === 0 && <span style={{ fontSize: R.fsm, color: C.apEmpty }}>空</span>}
        </div>
        <AnimatePresence>
          {floats.filter(f => f.target === 'cpu').map(f => (
            <motion.div key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: R.flg, fontWeight: 900, color: '#dc2626', textShadow: '0 0 24px rgba(220,38,38,0.7)', pointerEvents: 'none', zIndex: 20, letterSpacing: 1 }}
            >-{f.dmg}</motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {s.flash === 'cpu' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0] }} transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10, borderRadius: 12 }} />
          )}
        </AnimatePresence>
      </div>

      {/* ══ カウンター席 ══ */}
      <div style={{
        flexShrink: 0, height: R.counter, background: C.counter,
        borderTop: `2px solid ${C.counterTop}`, borderBottom: `2px solid ${C.counterBot}`,
        display: 'flex', alignItems: 'center', padding: '0 clamp(14px, 2vw, 30px)',
        position: 'relative', gap: 'clamp(8px, 1vw, 16px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25, backgroundImage: 'repeating-linear-gradient(90deg,transparent,transparent 80px,rgba(255,255,255,0.5) 80px,rgba(255,255,255,0.5) 82px)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 5, background: 'rgba(0,0,0,0.12)', transform: 'translateY(-50%)', borderRadius: 2 }} />
        <span style={{ fontSize: R.fsm, color: '#5c3a0a', fontWeight: 700, zIndex: 1, textShadow: '0 1px 2px rgba(255,255,255,0.4)' }}>🍵 カウンター席</span>
        <div style={{ flex: 1 }} />
        {/* 切れ味スタック表示 */}
        {s.pKiretaStack > 0 && (
          <motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }}
            style={{ zIndex: 1, fontSize: R.fsm, color: '#fff', fontWeight: 800, background: C.kireta, borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)', boxShadow: '0 2px 8px rgba(37,99,235,0.4)' }}>
            ✂ ×{s.pKiretaStack}
          </motion.span>
        )}
        {previewDmg > 0 && (
          <motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }}
            style={{ zIndex: 1, fontSize: R.fsm, color: '#fff', fontWeight: 800, background: '#dc2626', borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)', boxShadow: '0 2px 8px rgba(220,38,38,0.4)' }}>
            ⚔ {previewDmg}
          </motion.span>
        )}
        <span style={{ zIndex: 1, fontSize: R.fsm, color: '#5c3a0a', fontWeight: 800, background: 'rgba(255,255,255,0.45)', borderRadius: 8, padding: 'clamp(2px,0.3vh,5px) clamp(8px,1vw,14px)' }}>T{s.turn}</span>
        <span style={{ zIndex: 1, fontSize: R.fsm, fontWeight: 700, color: isPlayerTurn ? '#7c2d12' : '#a89070' }}>{phaseLabel}</span>
      </div>

      {/* ══ プレイヤーエリア ══ */}
      <div style={{
        flex: '5 1 0', minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: 'clamp(8px, 1vh, 14px) clamp(12px, 2vw, 28px) clamp(6px, 0.8vh, 12px)',
        position: 'relative',
      }}>
        <div style={{
          flex: 1, background: C.bgArea, border: `1px solid ${C.fieldBorder}`,
          borderRadius: 'clamp(12px, 1.2vw, 18px)', padding: 'clamp(8px, 1vw, 16px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          gap: R.gap, flexWrap: 'wrap', position: 'relative',
          minHeight: 'clamp(90px, 10vh, 150px)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <span style={{ position: 'absolute', top: 'clamp(7px, 0.8vh, 11px)', left: 'clamp(12px, 1.2vw, 18px)', fontSize: R.fxs, color: C.txtMut, fontWeight: 700, letterSpacing: 1 }}>
            {activeLabel} の机
          </span>
          <div style={{ position: 'absolute', top: 'clamp(6px, 0.7vh, 10px)', right: 'clamp(10px, 1.2vw, 18px)', display: 'flex', gap: 'clamp(8px, 1vw, 16px)', alignItems: 'center' }}>
            {akamiFired
              ? <span style={{ fontSize: R.fxs, color: '#b45309', fontWeight: 700 }}>🐟 ✓</span>
              : akamCount > 0 && <span style={{ fontSize: R.fxs, color: C.txtMut }}>🐟 {akamCount}/3</span>
            }
            {makiFired
              ? <span style={{ fontSize: R.fxs, color: '#15803d', fontWeight: 700 }}>🌀 ✓</span>
              : makiCount > 0 && <span style={{ fontSize: R.fxs, color: C.txtMut }}>🌀 {Math.min(makiCount, MAKI_COMP_3)}/{MAKI_COMP_3}</span>
            }
            {makiCount >= MAKI_COMP_5
              ? <span style={{ fontSize: R.fxs, color: '#b45309', fontWeight: 700 }}>🍙 軍艦×1.5</span>
              : makiFired && <span style={{ fontSize: R.fxs, color: C.txtMut }}>🍙 {makiCount}/{MAKI_COMP_5}</span>
            }
          </div>
          <AnimatePresence>
            {s.pField.map(c => (
              <FieldSushi key={c.fid} card={c}
                onSelect={() => setInspect({ card: c, canPlay: false, remainingTurns: c.turnsLeft })}
              />
            ))}
          </AnimatePresence>
          {s.pField.length === 0 && <span style={{ fontSize: R.fsm, color: C.apEmpty, paddingTop: 'clamp(8px, 1vh, 16px)' }}>空</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1.5vw, 20px)', marginTop: 'clamp(8px, 1.2vh, 14px)' }}>
          <span style={{ fontSize: R.flg, flexShrink: 0 }}>🍱</span>
          <div style={{ flex: 1 }}><BellyGauge value={s.pBelly} label={`${activeLabel} お腹`} /></div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', gap: 'clamp(3px, 0.4vw, 6px)', flexWrap: 'wrap', maxWidth: 'clamp(80px, 10vw, 160px)', justifyContent: 'flex-end' }}>
              {Array.from({ length: s.pMaxAP }, (_, i) => (
                <div key={i} style={{
                  width: R.dot, height: R.dot, maxWidth: 15, maxHeight: 15, borderRadius: '50%',
                  background: i < s.pAP ? C.ap : C.apEmpty,
                  border: `1px solid ${i < s.pAP ? C.apBorder : '#c4b4a0'}`,
                  boxShadow: i < s.pAP ? '0 0 6px rgba(217,119,6,0.6)' : 'none',
                }} />
              ))}
            </div>
            <span style={{ fontSize: R.fxs, color: C.txtSec, fontWeight: 600 }}>{s.pAP}/{s.pMaxAP} AP</span>
          </div>
        </div>
        <AnimatePresence>
          {floats.filter(f => f.target === 'player').map(f => (
            <motion.div key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: R.flg, fontWeight: 900, color: '#dc2626', textShadow: '0 0 24px rgba(220,38,38,0.7)', pointerEvents: 'none', zIndex: 20, letterSpacing: 1 }}
            >-{f.dmg}</motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {s.flash === 'player' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.3, 0] }} transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, background: '#ef4444', pointerEvents: 'none', zIndex: 10, borderRadius: 12 }} />
          )}
        </AnimatePresence>
      </div>

      {/* ══ アクションバー ══ */}
      <div style={{
        flexShrink: 0, background: C.bgAction, borderTop: '1px solid #d4c4ae',
        padding: 'clamp(5px, 0.8vh, 10px) clamp(12px, 2vw, 28px)',
        display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 16px)',
      }}>
        <button onClick={() => setShowLog(v => !v)}
          style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
          <p style={{ fontSize: R.fxs, color: C.txtSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📜 {s.log[0] ?? ''}
          </p>
        </button>
        <motion.button
          onClick={endTurn}
          disabled={!isPlayerTurn}
          whileTap={isPlayerTurn ? { scale: 0.91 } : {}}
          style={{
            flexShrink: 0, padding: 'clamp(9px, 1.2vh, 16px) clamp(18px, 2.5vw, 36px)',
            borderRadius: 999, fontSize: R.fsm, fontWeight: 800,
            background: isPlayerTurn ? C.btnEnd : '#d4c4ae',
            color: isPlayerTurn ? '#fff' : '#a89070',
            border: `1.5px solid ${isPlayerTurn ? C.btnEndBorder : '#c4b4a0'}`,
            cursor: isPlayerTurn ? 'pointer' : 'default',
            boxShadow: isPlayerTurn ? `0 0 20px ${C.btnEndGlow}` : 'none',
            outline: 'none',
          }}
        >
          {s.phase === 'animating' ? '攻撃中…' : s.phase === 'cpu' ? 'CPU思考中…' : 'ターン終了'}
        </motion.button>
      </div>

      {/* ══ 手札 ══ */}
      <div style={{
        flexShrink: 0, height: R.hand, background: C.bgHand, borderTop: '1px solid #ccc0a8',
        padding: 'clamp(10px, 1.2vh, 18px) clamp(12px, 2vw, 28px) clamp(14px, 2vh, 24px)',
        display: 'flex', gap: R.gap, overflowX: 'auto', alignItems: 'flex-end',
        justifyContent: 'center', boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.08)',
      }}>
        {s.pHand.length === 0
          ? <p style={{ fontSize: R.fmd, color: C.txtMut }}>手札がありません</p>
          : s.pHand.map((card, i) => (
            <HandSushi key={`${card.id}-${i}`} card={card}
              canPlay={isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX}
              attackBuff={s.pAttackBuff}
              kiretaStack={s.pKiretaStack}
              isSelected={inspect?.card === card}
              onSelect={() => setInspect({
                card,
                canPlay: isPlayerTurn && s.pAP >= card.cost && s.pField.length < FIELD_MAX,
              })}
            />
          ))
        }
      </div>

      {/* ══ バトルログ ══ */}
      <AnimatePresence>
        {showLog && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
              background: 'rgba(250,246,239,0.97)', borderTop: '1px solid #d4c4ae',
              padding: 'clamp(12px, 2vh, 20px) clamp(14px, 2vw, 24px)',
              overflowY: 'auto', zIndex: 30, boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: R.fmd, color: C.txtSec, fontWeight: 700 }}>バトルログ</span>
              <button onClick={() => setShowLog(false)} style={{ fontSize: R.flg, color: C.txtMut, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            {s.log.map((msg, i) => (
              <p key={i} style={{ fontSize: R.fsm, lineHeight: 1.8, color: msg.startsWith('──') ? C.apEmpty : msg.startsWith('🎉') ? '#b45309' : C.txtSec }}>{msg}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ カード詳細シート ══ */}
      <AnimatePresence>
        {inspect && (
          <CardDetailSheet
            inspect={inspect}
            attackBuff={s.pAttackBuff}
            kiretaStack={s.pKiretaStack}
            onPlay={() => playCard(inspect.card)}
            onClose={() => setInspect(null)}
          />
        )}
      </AnimatePresence>

      {/* ══ コンボ演出 ══ */}
      <AnimatePresence>
        {comboAnim && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <motion.div
              initial={{ scale: 0.2, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 1.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
              style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '3px solid #d97706', borderRadius: 'clamp(16px, 2vw, 28px)', padding: 'clamp(20px, 3vh, 40px) clamp(36px, 5vw, 72px)', textAlign: 'center', boxShadow: '0 8px 60px rgba(217,119,6,0.6)' }}
            >
              <motion.p animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 0.4, repeat: 2 }} style={{ fontSize: 'clamp(48px, 8vw, 96px)', marginBottom: 12 }}>{comboAnim.emoji}</motion.p>
              <p style={{ fontSize: 'clamp(18px, 3vw, 36px)', fontWeight: 900, color: '#78350f', letterSpacing: 2, marginBottom: 10 }}>{comboAnim.name}</p>
              <p style={{ fontSize: R.fmd, color: '#92400e' }}>{comboAnim.desc}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ パス画面（二人対戦） ══ */}
      <AnimatePresence>
        {s.phase === 'pass' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              background: 'rgba(0,0,0,0.88)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              style={{ textAlign: 'center' }}
            >
              <p style={{ fontSize: 'clamp(48px, 8vw, 80px)', marginBottom: 16 }}>🍣</p>
              <p style={{ fontSize: 'clamp(20px, 3.5vw, 32px)', fontWeight: 900, color: '#fde68a', marginBottom: 8 }}>
                P{s.activePlayer === 1 ? 2 : 1} の番です
              </p>
              <p style={{ fontSize: R.fmd, color: '#a8a29e', marginBottom: 32, lineHeight: 1.7 }}>
                デバイスを P{s.activePlayer === 1 ? 2 : 1} に渡してください
              </p>
              <motion.button
                onClick={handlePassReady}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  padding: 'clamp(12px, 2vh, 20px) clamp(32px, 5vw, 64px)',
                  background: C.btnEnd, border: `2px solid ${C.btnEndBorder}`,
                  borderRadius: 999, fontSize: R.fmd, fontWeight: 800,
                  color: '#fff', cursor: 'pointer',
                  boxShadow: `0 0 28px ${C.btnEndGlow}`,
                }}
              >
                準備完了 →
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ 追加注文タイム ══ */}
      {s.phase === 'reorder' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: '#1c0c04', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            flexShrink: 0, textAlign: 'center', padding: '8px 12px',
            background: 'linear-gradient(90deg,#7c2d12,#ea580c,#7c2d12)',
            color: '#fff', fontWeight: 800, fontSize: R.fsm,
          }}>
            🍽 追加注文タイム！ 軍資金 ¥{REORDER_BUDGET.toLocaleString()} で山札を補充
            {mode === 'two_player' && `（P${reorderStep === 'p' ? s.activePlayer : s.activePlayer === 1 ? 2 : 1} の番）`}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DraftScreenThree
              key={reorderStep}
              onComplete={handleReorderComplete}
              initialBudget={REORDER_BUDGET}
              seconds={REORDER_SECONDS}
              playerNum={mode === 'two_player'
                ? (reorderStep === 'p' ? s.activePlayer : (s.activePlayer === 1 ? 2 : 1))
                : undefined}
            />
          </div>
        </div>
      )}

      {/* ══ ゲームオーバー ══ */}
      <AnimatePresence>
        {s.winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div initial={{ scale: 0.4, y: 32 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 14, stiffness: 180 }} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(60px, 12vw, 120px)', marginBottom: 16 }}>{s.winner === 'player' ? '🎉' : '😔'}</p>
              <p style={{ fontSize: 'clamp(24px, 4.5vw, 56px)', fontWeight: 700, color: '#fff', marginBottom: 8 }}>{winnerLabel}</p>
              <p style={{ fontSize: R.fmd, color: '#a89070', marginBottom: 32 }}>{s.turn} ターンで決着</p>
              <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', justifyContent: 'center' }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={() => { ref.current = initState(deck, mode, p2Deck); tick() }}
                  style={{ padding: 'clamp(12px, 1.5vh, 20px) clamp(28px, 4vw, 56px)', borderRadius: 999, fontSize: R.fmd, fontWeight: 800, background: C.btnEnd, color: '#fff', border: `1.5px solid ${C.btnEndBorder}`, cursor: 'pointer', boxShadow: `0 0 24px ${C.btnEndGlow}` }}
                >もう一回</motion.button>
                {onBack && (
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onBack}
                    style={{ padding: 'clamp(12px, 1.5vh, 20px) clamp(28px, 4vw, 56px)', borderRadius: 999, fontSize: R.fmd, fontWeight: 700, background: 'rgba(255,255,255,0.12)', color: '#ccc', border: '1.5px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                  >タイトルへ</motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
