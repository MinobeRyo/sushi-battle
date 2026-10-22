import type { Card } from '../types'
import { NAMAHAM_CARD } from './cards'

// 寿司はしご専用の「炙り」。数値は企画書7章の仮の値。効果の変化は battleRules / matchEngine が card.aburi を見て反映する。

type AburiSpec = { attack: number; cost?: number; fullness?: number; text: string }

export const ABURI: Readonly<Record<string, AburiSpec>> = {
  // 汎用
  tamago: { attack: 6, text: '召喚時：自分のお腹−10' },
  salmon: { attack: 12, text: '召喚時：相手の持続型を2枚まで破壊（1枚は選び、もう1枚は攻撃の高いもの）' },
  inari: { attack: 3, text: '次の自分のターンAP＋2' },
  onion_salmon: { attack: 7, text: '次の自分のターンAP＋1／召喚時に1枚引く' },
  mentaiko: { attack: 10, text: '召喚時：3枚引く' },
  cheese: { attack: 5, text: '召喚時に防御を予約（切れ味不要）\n相手の寿司1体の攻撃を50%軽減' },
  tuna_salad_gunkan: { attack: 4, cost: 0, text: '0AP／召喚時：1枚引く' },
  corn_gunkan: { attack: 7, text: '炙りマヨの香ばしさで攻撃7' },
  seafood_gunkan: { attack: 10, text: 'いか・たこの連鎖を起こす' },
  tuna_gunkan: { attack: 9, text: '召喚時：手札・山札の赤身2枚のAPを1ずつ下げる' },
  takowasa: { attack: 7, text: 'いか・たこの連鎖を起こす' },
  // 海鮮
  ebi: { attack: 7, fullness: 3, text: '持続3／召喚時：山札の持続いか・たこを1枚引く\n海の幸三昧の再攻撃に＋12' },
  botan_ebi: { attack: 22, text: '机にいる間、海の幸三昧のたびにえび2枚を山札へ' },
  ebi_avocado: { attack: 7, text: '召喚時：2枚引く' },
  ika_instant: { attack: 11, text: '机にたこがいれば、支払い後にAP2回復' },
  ika: { attack: 5, fullness: 4, text: '持続4／えび・いか・たこの召喚で連鎖＋6' },
  tako: { attack: 5, fullness: 4, text: '持続4／えび・いか・たこの召喚で連鎖＋6' },
  // 赤身
  maguro: { attack: 18, text: '召喚時：山札の赤身を2枚引く' },
  chutoro: { attack: 24, text: '赤身三種盛り中：召喚時にお腹−15' },
  otoro: { attack: 35, text: '赤身三種盛り中：ビントロ2枚を山札へ・お腹−5・次AP＋1' },
  bintoro: { attack: 11, text: '赤身三種盛り中：2枚引き、お腹−8' },
  duke_maguro: { attack: 14, text: '相手の消化を2回止める（三種盛り中は3回）' },
  // 巻物・軍艦
  kappa_maki: { attack: 2, fullness: 5, text: '持続5／机にいる間、自分の消化＋4' },
  kanpyo_maki: { attack: 5, fullness: 5, text: '持続5' },
  natto_maki: { attack: 5, fullness: 6, text: '持続6' },
  ume_shiso_maki: { attack: 8, text: '召喚時：自分のお腹−10' },
  tekka_maki: { attack: 6, fullness: 5, text: '持続5／机にいる間、三種盛り前からターン開始時AP＋1' },
  negitoro_maki: { attack: 7, fullness: 4, text: '持続4' },
  salmon_maki: { attack: 5, fullness: 4, text: '持続4／召喚時：1枚引く' },
  avocado_maki: { attack: 3, fullness: 6, text: '持続6' },
  futomaki: { attack: 8, fullness: 4, text: '持続4／巻物コンプでは巻物2枚分に数える' },
  uni_gunkan: { attack: 26, text: '攻撃26' },
  ikura_gunkan: { attack: 16, text: '召喚時：1〜2APの巻物2枚を山札へ' },
  negitoro_gunkan: { attack: 23, text: '攻撃23' },
  tobiko_gunkan: { attack: 14, text: '召喚時：とびこ軍艦を手札へ複製（100→75→50→25%）' },
  ebi_gunkan: { attack: 17, text: '召喚時：山札の巻物を2枚引く' },
  kani_gunkan: { attack: 24, text: '召喚時：机の軍艦以外の巻物の攻撃をこのターン＋4' },
  // 光り物
  saba: { attack: 11, text: '防御の予約が無料（切れ味0）' },
  shime_saba: { attack: 14, text: '切れ味2を消費して3枚引く' },
  saba_ohba: { attack: 13, text: '切れ味＋2' },
  aji_ohba: { attack: 13, text: '切れ味＋2' },
  aji: { attack: 10, text: '切れ味＋2' },
  aji_tataki: { attack: 16, text: '切れ味＋2' },
  iwashi: { attack: 6, text: '切れ味＋2' },
  iwashi_shoga: { attack: 9, text: '切れ味1で防御を予約（選んだ1体を半減）' },
  kohada: { attack: 0, text: '切れ味を全部使い、×5の追加ダメージ' },
  // 肉寿司
  aigamo: { attack: 4, fullness: 5, text: '持続5／机にいる間、生ハムの攻撃＋4' },
  wagyu: { attack: 18, text: '生ハムを3体まで生贄に、1体につき攻撃＋6' },
  karubi: { attack: 14, text: '生ハムを2体まで生贄に、1体につき攻撃＋5' },
  roast_beef: { attack: 15, text: '召喚時：生ハムを3体生成' },
  yakiniku: { attack: 6, fullness: 4, text: '持続4／相手のお腹40以上で攻撃＋4\n自分のターン終了時、生ハム2枚を山札へ' },
  gyutan: { attack: 8, text: '召喚時：生ハムを2体生成' },
  ebi_ten: { attack: 13, text: '相手のお腹50以上で攻撃＋10' },
  ika_ten: { attack: 13, text: '相手のお腹50以上で攻撃＋10' },
  anago_ten: { attack: 18, text: '相手のお腹55以上で攻撃＋12' },
}

export function canAburi(card: Card): boolean {
  return !card.aburi && card.id !== NAMAHAM_CARD.id && card.variant === undefined && card.id in ABURI
}

/** 炙り版を作る。効果IDは元のまま残し、名前に「炙り」を付ける。 */
export function toAburi(card: Card): Card {
  const spec = ABURI[card.id]
  if (!spec || card.aburi) return card
  return {
    ...card, name: `炙り${card.name}`, attack: spec.attack,
    cost: spec.cost ?? card.cost, fullness: spec.fullness ?? card.fullness, aburi: true,
  }
}

export function aburiDescription(card: Card, variant: 'short' | 'full'): string | undefined {
  const text = card.aburi ? ABURI[card.id]?.text : undefined
  return text && variant === 'short' ? text.replace(/\n/g, '／') : text
}
