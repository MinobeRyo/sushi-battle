export type SideMenuId = 'karaage' | 'fries' | 'tempura' | 'ramen' | 'miso' | 'chawanmushi'

export type SideMenuDisplay = {
  id: SideMenuId
  name: string
  english: string
  category: string
  description: string
  effect: string
  timing: string
  accent: string
}

// 合意済みの効果を紹介する表示用データ。バトルの判定処理とは独立させる。
export const SIDE_MENU_CATALOG: SideMenuDisplay[] = [
  {
    id: 'karaage', name: '唐揚げ', english: 'KARAAGE', category: '攻めの一皿',
    description: '香ばしい衣に、きゅっとレモン。勝負を動かす、揚げたての一皿。',
    effect: '自分と相手のお腹を、それぞれ15増やす。', timing: '1回使い切り', accent: '#ad572b',
  },
  {
    id: 'fries', name: 'ポテト', english: 'FRENCH FRIES', category: 'つなぐ一皿',
    description: 'こんがり黄金色の細切りポテト。次の一手も、もう一本も。',
    effect: '自分のターンに2枚目の寿司を出したとき、1枚ドローする。', timing: '各自分ターンに1回', accent: '#a27829',
  },
  {
    id: 'tempura', name: '天ぷら盛り合わせ', english: 'TEMPURA', category: '分け合う一皿',
    description: '海老と季節の野菜を、さくっと軽く。相手にも届く、気前のよい盛り合わせ。',
    effect: '双方が、それぞれのターンで最初に出す「えび系または肉寿司」1枚の攻撃を、そのターンだけ＋3。',
    timing: '双方に適用', accent: '#777342',
  },
  {
    id: 'ramen', name: 'ラーメン', english: 'RAMEN', category: 'もう一手の一杯',
    description: '麺、チャーシュー、煮卵。お腹に余裕があるうちに、もうひと勝負。',
    effect: '自分のお腹を5増やして、APを1回復する。使用するかは選べる。',
    timing: '出したターンを含む自分の3ターン・各ターンに1回', accent: '#ae493b',
  },
  {
    id: 'miso', name: 'あおさの味噌汁', english: 'AOSA MISO SOUP', category: '整える一杯',
    description: '磯の香りを、漆のお椀に。じっくり戦うための、ほっとする一杯。',
    effect: '自分の消化量を2増やす。', timing: 'フィールド効果', accent: '#557052',
  },
  {
    id: 'chawanmushi', name: '茶碗蒸し', english: 'CHAWANMUSHI', category: 'すっきりの一品',
    description: 'なめらかな卵と、三つ葉の緑。ひと息ついて、次の勝負へ。',
    effect: '自分のお腹を15減らし、消化停止を解除する。', timing: '1回使い切り', accent: '#628578',
  },
]
