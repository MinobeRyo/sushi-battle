import type { SideMenuState } from '../game/types'

export type SideMenuId = 'karaage' | 'fries' | 'tempura' | 'ramen' | 'miso' | 'chawanmushi' | 'inbound_don'

export const INBOUND_DON_ATTACK_BONUS = 2
export const INBOUND_DON_SACRIFICE_BONUS = 2

export type SideMenuDefinition = {
  id: SideMenuId
  name: string
  english: string
  category: string
  description: string
  effect: string
  summary: string
  timing: string
  accent: string
  price: number
}

// 各購入タイムで一品だけ選びます。寿司の20枚枠は使わず、共通の注文枠を1回消費します。
export const SIDE_MENUS: SideMenuDefinition[] = [
  {
    id: 'karaage', name: '唐揚げ', english: 'KARAAGE', category: '攻めの一皿', price: 300,
    description: '香ばしい衣に、きゅっとレモン。勝負を動かす、揚げたての一皿。',
    effect: '自分と相手のお腹を、それぞれ15増やす。同時に満腹になった場合は使用者が敗北する。',
    summary: '双方のお腹＋15',
    timing: '0AP・1回使い切り', accent: '#ad572b',
  },
  {
    id: 'fries', name: 'ポテト', english: 'FRENCH FRIES', category: 'つなぐ一皿', price: 300,
    description: 'こんがり黄金色の細切りポテト。次の一手も、もう一本も。',
    effect: '自分のターンに2枚目の寿司を出したとき、1枚ドローする。',
    summary: '2枚目の寿司で1枚ドロー',
    timing: '購入時から自動で設置・永続・各自分ターンに1回', accent: '#a27829',
  },
  {
    id: 'tempura', name: '天ぷら盛り合わせ', english: 'TEMPURA', category: '分け合う一皿', price: 300,
    description: '海老と季節の野菜を、さくっと軽く。相手にも届く、気前のよい盛り合わせ。',
    effect: '双方が、それぞれのターンで最初に出す「えび系または肉寿司」1枚の攻撃を、そのターンだけ＋3。効果は重複しない。',
    summary: '双方の最初のえび・肉寿司の攻撃＋3',
    timing: '購入時から自動で設置・永続・双方に適用', accent: '#777342',
  },
  {
    id: 'ramen', name: 'ラーメン', english: 'RAMEN', category: 'もう一手の一杯', price: 300,
    description: '麺、チャーシュー、煮卵。お腹に余裕があるうちに、もうひと勝負。',
    effect: '自分のお腹を5増やして、APを1回復する。使用は任意。APが満タンのときは使用できない。',
    summary: 'お腹＋5でAPを1回復',
    timing: '0AP・出したターンを含む自分の3ターン・各ターンに1回', accent: '#ae493b',
  },
  {
    id: 'miso', name: 'あおさの味噌汁', english: 'AOSA MISO SOUP', category: '整える一杯', price: 300,
    description: '磯の香りを、漆のお椀に。じっくり戦うための、ほっとする一杯。',
    effect: '自分の消化量を2増やす。消化停止中は追加分も停止する。',
    summary: '自分の消化＋2',
    timing: '購入時から自動で設置・永続', accent: '#557052',
  },
  {
    id: 'chawanmushi', name: '茶碗蒸し', english: 'CHAWANMUSHI', category: 'すっきりの一品', price: 300,
    description: 'なめらかな卵と、三つ葉の緑。ひと息ついて、次の勝負へ。',
    effect: '自分のお腹を15減らし、消化停止を解除する。このターン開始時に止められた消化も一度だけ取り戻す。',
    summary: 'お腹−15・消化停止を解除',
    timing: '0AP・1回使い切り', accent: '#628578',
  },
  {
    id: 'inbound_don', name: 'インバウン丼', english: 'INBOUND DON', category: '肉寿司を育てる一杯', price: 500,
    description: 'つややかな肉を敷き詰め、ウニをどっさり。生ハムまで強くなる、ご褒美の肉丼。',
    effect: `自分の生ハムの通常攻撃を＋${INBOUND_DON_ATTACK_BONUS}し、生贄1体につき、その寿司の攻撃をさらに＋${INBOUND_DON_SACRIFICE_BONUS}する。すでに場にいる生ハムと、以降に生成する生ハムが対象。肉祭りの追加ダメージは変わらない。`,
    summary: `生ハムの攻撃＋${INBOUND_DON_ATTACK_BONUS}・生贄1体につきさらに＋${INBOUND_DON_SACRIFICE_BONUS}`,
    timing: '購入時から自動で設置・永続・自分だけに適用', accent: '#b46d27',
  },
]

export const SIDE_MENU_BY_ID = Object.fromEntries(SIDE_MENUS.map(menu => [menu.id, menu])) as Record<SideMenuId, SideMenuDefinition>

export function isSideMenuId(value: unknown): value is SideMenuId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SIDE_MENU_BY_ID, value)
}

/** 未購入、または使い切りを使用済みなら後半にもう一品注文できます。 */
export function canReorderSideMenu(side: SideMenuState | null): boolean {
  return side === null || (side.status === 'used' && (side.purchaseCount ?? 1) < 2 && (side.id === 'karaage' || side.id === 'chawanmushi'))
}
