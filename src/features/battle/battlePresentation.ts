import type { Archetype, Card } from '../../types'
import { NAMAHAM_CARD } from '../../data/cards'

// ── 回転寿司カラーパレット ────────────────────────────────────────────────────
export const C = {
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
export const R = {
  fw: 'clamp(72px, 6.5vw, 120px)', fh: 'clamp(98px, 8.8vw, 160px)',
  hw: 'clamp(84px, 7.5vw, 140px)', hh: 'clamp(126px, 11.5vw, 210px)',
  gap: 'clamp(6px, 0.65vw, 12px)',
  fe: 'clamp(28px, 2.9vw, 52px)', he: 'clamp(32px, 3.3vw, 60px)',
  f2xs: 'clamp(12px, 0.75vw, 14px)', fxs: 'clamp(13px, 0.9vw, 15px)',
  fsm: 'clamp(14px, 1.1vw, 17px)', fmd: 'clamp(16px, 1.3vw, 20px)',
  flg: 'clamp(18px, 1.6vw, 24px)', fxl: 'clamp(22px, 2.2vw, 32px)',
  dot: 'clamp(9px, 1vw, 15px)', gauge: 'clamp(10px, 1.1vh, 16px)',
  counter: 'clamp(46px, 5.5vh, 68px)', hand: 'clamp(152px, 15.5vw, 284px)',
}

const CARD_EMOJI: Record<string, string> = {
  'マグロ': '🐟', 'サーモン': '🐠', 'えび': '🦐', 'いか': '🦑', 'たこ': '🐙',
  'たまご': '🥚', 'きゅうり': '🥒', 'かんぴょう': '🌿', 'サバ': '🐡',
  'アジ': '🐡', 'コハダ': '🐡', 'イワシ': '🐟', '和牛': '🥩', 'カルビ': '🥩',
  'うに': '🌟', 'いくら': '🔴', 'とびこ': '🟠', 'コーン': '🌽',
  'シーフード': '🦞', 'なす': '🍆', '明太子': '🔴', 'チーズ': '🧀',
  '納豆': '🫘', 'うめ': '🍑', 'アボカド': '🥑', 'かに': '🦀',
  'ネギトロ': '🐟', 'ローストビーフ': '🥩', '焼肉': '🥩', '牛タン': '🥩',
  '生ハム': '🥩',
  'サンマ': '🐡', '太巻き': '🌀', 'あなご': '🐠',
  'いなり': '🍘', 'ツナサラダ': '🥗',
}

export type EffectTextPart = { text: string; combo?: 'akami_mori' }

// 表示文と条件節を一元化し、図鑑などの通常の文字列説明にも同じ文を使う。
export const COMBO_EFFECT_PARTS: Record<string, { full: EffectTextPart[]; short: EffectTextPart[] }> = {
  akami_digest_10: {
    full: [
      { text: '赤身三種盛り中：召喚時、自分の満腹度を10回復', combo: 'akami_mori' },
      { text: '初めて三種が揃う召喚では発動しない' },
    ],
    short: [{ text: '赤身三種中・召喚時に満腹度10回復', combo: 'akami_mori' }],
  },
  akami_generate_bintoro_deck_1: {
    full: [
      { text: '赤身三種盛り中：召喚時、ビントロ1枚を山札のランダムな位置へ', combo: 'akami_mori' },
      { text: '赤身三種盛り中：召喚時、自分の満腹度を5回復', combo: 'akami_mori' },
      { text: '赤身三種盛り中：次の自分の開始時、回復後AP・上限＋1', combo: 'akami_mori' },
      { text: '次APは1回だけ有効／重複可能' },
      { text: '初めて三種が揃う召喚では発動しない' },
    ],
    short: [{ text: '赤身三種中・ビントロ1枚／回復5／次AP+1', combo: 'akami_mori' }],
  },
  akami_ap_each_turn_1: {
    full: [
      { text: '赤身三種盛り成立後：自分の開始時、回復後AP＋1（1枚ごと）', combo: 'akami_mori' },
      { text: '机にいる間：当ターンのAP上限も同じだけ増加', combo: 'akami_mori' },
    ],
    short: [{ text: '赤身三種後・開始時AP +1', combo: 'akami_mori' }],
  },
  akami_draw_2_digest_3: {
    full: [
      { text: '赤身三種盛り成立後：召喚時、2枚ドロー', combo: 'akami_mori' },
      { text: '赤身三種盛り成立後：召喚時、自分のお腹－3', combo: 'akami_mori' },
    ],
    short: [{ text: '赤身三種後・2枚引き腹 −3', combo: 'akami_mori' }],
  },
  digest_stop_akami_1_or_2: {
    full: [
      { text: '召喚時：相手の開始時の消化を1回停止' },
      { text: '赤身三種盛り成立後：2回停止に強化', combo: 'akami_mori' },
      { text: '再付与：残り回数は長い方を維持' },
      { text: '茶碗蒸しで解除可能' },
    ],
    short: [
      { text: '消化停止1回・' },
      { text: '赤身三種後2回', combo: 'akami_mori' },
    ],
  },
}

const effectLines = (...lines: string[]) => lines.join('\n')
const MEAT_FESTIVAL_DESCRIPTION = effectLines(
  '肉祭り：同ターンに生ハム2体を生贄（1ターン1回）',
  '相手に5ダメージ（ガリ不可）',
  '生ハム1枚を自分の山札のランダムな位置へ',
  '自分の生ハムの攻撃＋1（対戦中・累積）',
)

export const EFFECT_FULL: Record<string, string> = {
  generate_tobiko_hand_50: '召喚時：50%で通常のとびこ軍艦1枚を手札に追加（手札7枚まで）',
  akami_digest_10: COMBO_EFFECT_PARTS.akami_digest_10.full.map(part => part.text).join('\n'),
  akami_generate_bintoro_deck_1: COMBO_EFFECT_PARTS.akami_generate_bintoro_deck_1.full.map(part => part.text).join('\n'),
  self_digest_5: '召喚時：自分のお腹－5',
  refund_ap_1_if_tako: effectLines(
    '召喚後、自分の机にたこ系がいる：AP1回復',
    'たこわさ・兼用ネタも対象／複数でも回復1',
    '召喚には先に2AP必要／回復はAP上限まで',
  ),
  buff_current_makimono_2: effectLines(
    '召喚時：机にいる自分の非軍艦巻物すべての攻撃＋2',
    'このターンだけ有効／複数回分を加算可能',
    '後から召喚した巻物は対象外',
  ),
  draw_random_akami_1: effectLines(
    '召喚時：山札の赤身からランダムに1枚ドロー',
    '手札7枚まで',
  ),
  digest_stop_akami_1_or_2: COMBO_EFFECT_PARTS.digest_stop_akami_1_or_2.full.map(part => part.text).join('\n'),
  reduce_random_akami_cost_1: effectLines(
    '召喚時：手札・山札の赤身（消費AP1以上）から1枚をランダムにAP－1',
    '選ばれた1枚だけ対戦中有効（累積・下限0）',
  ),
  destroy_enemy_persist_1: effectLines(
    '召喚時：相手の机の持続カード1枚を選んで破壊',
    '生ハムも対象／対象なしでも召喚可能',
    '破壊にガリは使用不可',
  ),
  digest_boost_2: effectLines(
    '机にいる間：自分の開始時の消化量＋2',
    '消化停止中は無効',
  ),
  digest_stop_1t: effectLines(
    '召喚時：相手の次の消化を1回停止',
    '茶碗蒸しで解除可能',
  ),
  kireta_stack: effectLines(
    '召喚時：切れ味＋1',
    '切れ味の数だけ、自分の光り物の攻撃が上昇',
  ),
  kireta_consume_x3: effectLines(
    '召喚時：切れ味を全消費して、数×3ダメージ（ガリ不可）',
    '当ターンの攻撃には切れ味が残り、攻撃後に0',
    '消費済みの切れ味は同ターンに再使用不可',
  ),
  kireta_consume_2_draw_2: effectLines(
    '召喚時：切れ味2を消費して2枚ドロー',
    '切れ味2未満・消費済みなら不発／手札7枚まで',
  ),
  belly_boost_70: '相手のお腹70以上：攻撃＋8',
  belly_boost_60: '相手のお腹60以上：攻撃＋5',
  belly_boost_65: '相手のお腹65以上：攻撃＋6',
  belly_boost_persist_50: '相手のお腹50以上：攻撃＋2',
  belly_boost_persist_50_namahamu_deck_1: effectLines(
    '相手のお腹50以上：攻撃＋2',
    '自分の終了時：生ハム1枚を山札のランダムな位置へ',
    '召喚ターン・最後のターンも発動（最大3枚）',
  ),
  generate_namahamu_1: effectLines(
    '召喚時：机の空き枠に生ハム1体を生成',
    '生ハムは肉祭りの強化対象・生贄に使用可能',
  ),
  generate_namahamu_2: effectLines(
    '召喚時：机の空き枠に生ハムを最大2体生成',
    '生ハムは肉祭りの強化対象・生贄に使用可能',
  ),
  sacrifice_namahamu_1_4: effectLines('召喚時：生ハムを0～1体生贄にして、1体につき攻撃＋4（当ターン）', MEAT_FESTIVAL_DESCRIPTION),
  sacrifice_namahamu_2_4: effectLines('召喚時：生ハムを0～2体生贄にして、1体につき攻撃＋4（当ターン）', MEAT_FESTIVAL_DESCRIPTION),
  sacrifice_namahamu_1_7: effectLines('召喚時：生ハムを0～1体生贄にして、1体につき攻撃＋7（当ターン）', MEAT_FESTIVAL_DESCRIPTION),
  sacrifice_namahamu_2_8: effectLines('召喚時：生ハムを0～2体生贄にして、1体につき攻撃＋8（当ターン）', MEAT_FESTIVAL_DESCRIPTION),
  chain_on_kaisen_summon: effectLines(
    'いか・たこ・えび召喚時：この効果1枚につき3ダメージ',
    '自身の召喚・兼用ネタも対象／ガリ不可',
  ),
  draw_1: '召喚時：山札から1枚ドロー（手札7枚まで）',
  draw_2: '召喚時：山札から2枚ドロー（手札7枚まで）',
  draw_persist_ika_tako_1: effectLines(
    '召喚時：山札の持続いか・たこからランダム1枚ドロー',
    '海の幸三昧：50%の再攻撃に、えび1枚ごとに＋7',
  ),
  akami_ap_each_turn_1: COMBO_EFFECT_PARTS.akami_ap_each_turn_1.full.map(part => part.text).join('\n'),
  akami_draw_2_digest_3: COMBO_EFFECT_PARTS.akami_draw_2_digest_3.full.map(part => part.text).join('\n'),
  ap_next_1: '次の自分のターン：AP・AP上限＋1（重複可能）',
  multi_base: effectLines(
    'ネタ「マグロ」「えび」も兼ねる',
    '赤身三種盛り後の攻撃強化・海鮮連鎖の対象',
    '赤身三種盛りの「マグロ」の代わりにはならない',
  ),
}

export const EFFECT_SHORT: Record<string, string> = {
  generate_tobiko_hand_50: '召喚時50%で手札にとびこ1枚',
  akami_digest_10: COMBO_EFFECT_PARTS.akami_digest_10.short.map(part => part.text).join(''),
  akami_generate_bintoro_deck_1: COMBO_EFFECT_PARTS.akami_generate_bintoro_deck_1.short.map(part => part.text).join(''),
  self_digest_5: '自分のお腹 −5',
  refund_ap_1_if_tako: '机にたこ系がいれば召喚後AP1回復',
  buff_current_makimono_2: '場の非軍艦巻物を当ターン攻撃+2',
  draw_random_akami_1: '山札の赤身1枚をランダムに引く',
  destroy_enemy_persist_1: '相手の持続1枚を選んで破壊',
  reduce_random_akami_cost_1: '手札・山札の赤身1枚をランダムにAP−1',
  digest_boost_2: '自分の開始時の消化 +2',
  digest_stop_1t: '相手の消化を1ターン停止',
  kireta_stack: '切れ味 +1',
  kireta_consume_x3: '切れ味全消費 ×3即時ダメージ',
  kireta_consume_2_draw_2: '切れ味2で2枚引く',
  belly_boost_70: '相手お腹70以上で攻撃 +8',
  belly_boost_60: '相手お腹60以上で攻撃 +5',
  belly_boost_65: '相手お腹65以上で攻撃 +6',
  belly_boost_persist_50: '相手腹50以上で攻撃+2',
  belly_boost_persist_50_namahamu_deck_1: '相手腹50以上で+2／終了時に山札へ生ハム',
  generate_namahamu_1: '机に生ハムを1体生成',
  generate_namahamu_2: '机に生ハムを最大2体生成',
  sacrifice_namahamu_1_4: '生ハム1体で攻撃 +4',
  sacrifice_namahamu_2_4: '生ハム2体まで・各 +4',
  sacrifice_namahamu_1_7: '生ハム1体で攻撃 +7',
  sacrifice_namahamu_2_8: '生ハム2体まで・各 +8',
  chain_on_kaisen_summon: 'いか・たこ・えび召喚で連鎖+3',
  draw_1: '召喚時に1枚引く',
  draw_2: '召喚時に2枚引く',
  draw_persist_ika_tako_1: '持続いか・たこ1枚ドロー／再攻撃+7',
  akami_ap_each_turn_1: COMBO_EFFECT_PARTS.akami_ap_each_turn_1.short.map(part => part.text).join(''),
  akami_draw_2_digest_3: COMBO_EFFECT_PARTS.akami_draw_2_digest_3.short.map(part => part.text).join(''),
  digest_stop_akami_1_or_2: COMBO_EFFECT_PARTS.digest_stop_akami_1_or_2.short.map(part => part.text).join(''),
  ap_next_1: '次のターン AP +1',
  multi_base: 'マグロ・えびも兼ねる',
}

const NAMAHAM_DESCRIPTION = effectLines(
  '牛タン・ローストビーフ：机に生成',
  '焼肉・肉祭り：山札のランダムな位置へ1枚追加',
  'カルビ・和牛の生贄に使用可能',
  '肉祭り：自分の生ハムの攻撃＋1（対戦中・累積）',
  '生成専用：購入・デッキ編成不可',
)

export function getCardEffectDescription(card: Card, variant: 'short' | 'full' = 'full'): string {
  if (card.id === NAMAHAM_CARD.id) return variant === 'short' ? '0AP・生成専用・生贄にできる' : NAMAHAM_DESCRIPTION
  if (!card.effect) return '特殊効果なし'
  return (variant === 'short' ? EFFECT_SHORT : EFFECT_FULL)[card.effect]
    ?? (variant === 'short' ? '特殊効果あり・詳細を確認' : '効果の説明は準備中です')
}

export const ARCH_LABEL: Record<Archetype, string> = {
  akami: '🔴 赤身', makimono: '🌀 巻物', hikari: '✨ 光り物',
  kaisen: '🦞 海鮮', niku: '🥩 肉寿司', gunkan: '🍙 軍艦', general: '⭐ 汎用',
}

export function cardEmoji(c: Card) { return CARD_EMOJI[c.base] ?? '🍣' }
