import type { Archetype, Card } from '../../types'

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

export const EFFECT_FULL: Record<string, string> = {
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
  'generate_namahamu_1': '召喚時、生ハムを1体、場の空き枠に生成します。生ハムは攻撃1・3ターン持続。カルビ寿司や和牛にぎりの生贄にできます。',
  'generate_namahamu_2': '召喚時、生ハムを2体まで、場の空き枠に生成します。生ハムは攻撃1・3ターン持続。カルビ寿司や和牛にぎりの生贄にできます。',
  'sacrifice_namahamu_1_7': '召喚時、場の生ハムを1体まで生贄にできます。1体を消費すると、この寿司の攻撃が+7。生ハムを残して召喚することもできます。',
  'sacrifice_namahamu_2_8': '召喚時、場の生ハムを2体まで生贄にできます。1体につき、この寿司の攻撃が+8（最大+16）。生ハムを残して召喚することもできます。',
  'chain_on_kaisen_summon': '海鮮系カードを召喚するたびに連鎖追加攻撃',
  'draw_1': '召喚時、カードを1枚引く',
  'draw_2': '召喚時、カードを2枚引く',
  'ap_next_1': '次のターンだけ AP +1',
  'multi_base': 'base「マグロ」「えび」も兼ねる（赤身バフ・海鮮連鎖の対象）',
}

export const ARCH_LABEL: Record<Archetype, string> = {
  akami: '🔴 赤身', makimono: '🌀 巻物', hikari: '✨ 光り物',
  kaisen: '🦞 海鮮', niku: '🥩 肉寿司', gunkan: '🍙 軍艦', general: '⭐ 汎用',
}

export function cardEmoji(c: Card) { return CARD_EMOJI[c.base] ?? '🍣' }
